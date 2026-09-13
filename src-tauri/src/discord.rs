//! Discord IPC client: connects to Discord's named pipe and sends
//! activity (Rich Presence). Direct implementation of the documented
//! protocol, without heavyweight dependencies.
//!
//! Protocol: handshake (`{"v":1,"client_id":…}`), then op:1 FRAME
//! messages containing SET_ACTIVITY with a nonce. The pipe exists under
//! several numbers (Discord, Discord Canary, Discord PTB).

use serde_json::{json, Value};
use std::io::{Read, Write};

#[cfg(windows)]
use std::fs::OpenOptions;

/// Connects to the first available Discord pipe.
#[cfg(windows)]
fn connect_pipe() -> std::io::Result<std::fs::File> {
    for i in 0..10 {
        let path = format!(r"\\.\pipe\discord-ipc-{i}");
        let f = OpenOptions::new().read(true).write(true).open(&path);
        if f.is_ok() {
            return f;
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "no Discord pipe found (is Discord running?)",
    ))
}

#[cfg(not(windows))]
fn connect_pipe() -> std::io::Result<std::fs::File> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "Discord IPC supported on Windows only",
    ))
}

/// Returns the path of the first available Discord pipe.
pub fn pipe_available() -> Result<String, String> {
    for i in 0..10 {
        let path = format!(r"\\.\pipe\discord-ipc-{i}");
        if OpenOptions::new().read(true).write(true).open(&path).is_ok() {
            return Ok(path);
        }
    }
    Err("no Discord pipe found (is Discord running?)".into())
}

/// Writes a frame: 4 little-endian bytes (op) + JSON.
fn write_frame(stream: &mut std::fs::File, op: u32, payload: &Value) -> std::io::Result<()> {
    let body = serde_json::to_vec(payload)?;
    let mut buf = Vec::with_capacity(8 + body.len());
    buf.extend_from_slice(&op.to_le_bytes());
    buf.extend_from_slice(&(body.len() as u32).to_le_bytes());
    buf.extend_from_slice(&body);
    stream.write_all(&buf)?;
    stream.flush()
}

/// Reads a frame; returns (op, payload).
fn read_frame(stream: &mut std::fs::File) -> std::io::Result<(u32, Value)> {
    let mut header = [0u8; 8];
    stream.read_exact(&mut header)?;
    let op = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
    let len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    let len = len.min(1024 * 1024); // sanity bound
    let mut body = vec![0u8; len];
    stream.read_exact(&mut body)?;
    let payload = serde_json::from_slice(&body).unwrap_or(Value::Null);
    Ok((op, payload))
}

fn nonce() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("crp-{n}")
}

/// Environment-provided client id fallback (`DISCORD_CLIENT_ID`).
fn client_id_from_env() -> Option<String> {
    std::env::var("DISCORD_CLIENT_ID").ok().filter(|s| !s.trim().is_empty())
}

/// Reads the answer and returns Err on a Discord-side error event.
fn check_error(resp: &Value, what: &str) -> Result<(), String> {
    if resp.get("evt").and_then(Value::as_str) == Some("Error") {
        return Err(format!(
            "Discord rejected {what}: {}",
            resp["data"]["message"].as_str().unwrap_or("unknown reason")
        ));
    }
    Ok(())
}

/// Sends the activity to Discord. `client_id`: Discord application ID
/// (the app provides its own ID when None/empty).
///
/// Returns `Ok(descr)` on success (descr = readable message),
/// `Err(reason)` otherwise. Never panics.
pub fn set_activity(
    client_id: &str,
    details: &str,
    state: &str,
    large_image: &str,
    large_text: &str,
    small_image: &str,
    start_ms: Option<u64>,
    end_ms: Option<u64>,
    button_label: &str,
    button_url: &str,
) -> Result<String, String> {
    let id = if client_id.trim().is_empty() {
        client_id_from_env().ok_or("no Discord client_id configured".to_string())?
    } else {
        client_id.trim().to_string()
    };
    let mut stream = connect_pipe().map_err(|e| format!("connect: {e}"))?;

    write_frame(&mut stream, 0, &json!({ "v": 1, "client_id": id }))
        .map_err(|e| format!("handshake: {e}"))?;
    let (op, payload) = read_frame(&mut stream).map_err(|e| format!("handshake read: {e}"))?;
    if op == 1 && payload.get("evt").and_then(Value::as_str) == Some("Error") {
        return Err(format!("handshake rejected: {payload}"));
    }

    let mut activity = json!({});
    if !details.is_empty() {
        activity["details"] = json!(details);
    }
    if !state.is_empty() {
        activity["state"] = json!(state);
    }
    let mut timestamps = json!({});
    if let Some(ms) = start_ms {
        timestamps["start"] = json!(ms);
    }
    if let Some(ms) = end_ms {
        timestamps["end"] = json!(ms);
    }
    if timestamps.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
        activity["timestamps"] = timestamps;
    }
    let mut assets = json!({});
    if !large_image.is_empty() {
        assets["large_image"] = json!(large_image);
    }
    if !large_text.is_empty() {
        assets["large_text"] = json!(large_text);
    }
    if !small_image.is_empty() {
        assets["small_image"] = json!(small_image);
    }
    if assets.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
        activity["assets"] = assets;
    }
    if !button_label.is_empty() && !button_url.is_empty() {
        activity["buttons"] = json!([{ "label": button_label, "url": button_url }]);
    }

    let frame = json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": activity },
        "nonce": nonce()
    });
    write_frame(&mut stream, 1, &frame).map_err(|e| format!("send: {e}"))?;
    let (_, resp) = read_frame(&mut stream).map_err(|e| format!("read response: {e}"))?;
    check_error(&resp, "the activity")?;
    Ok("activity updated".to_string())
}

/// Clears the activity (SET_ACTIVITY without activity).
pub fn clear_activity(client_id: &str) -> Result<String, String> {
    let id = if client_id.trim().is_empty() {
        client_id_from_env().ok_or("no Discord client_id configured".to_string())?
    } else {
        client_id.trim().to_string()
    };
    let mut stream = connect_pipe().map_err(|e| format!("connect: {e}"))?;
    write_frame(&mut stream, 0, &json!({ "v": 1, "client_id": id }))
        .map_err(|e| format!("handshake: {e}"))?;
    let _ = read_frame(&mut stream);
    let frame = json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": null },
        "nonce": nonce()
    });
    write_frame(&mut stream, 1, &frame).map_err(|e| format!("send: {e}"))?;
    let (_, resp) = read_frame(&mut stream).map_err(|e| format!("read response: {e}"))?;
    check_error(&resp, "the clear")?;
    Ok("activity cleared".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nonce_is_prefixed_and_unique_enough() {
        let a = nonce();
        let b = nonce();
        assert!(a.starts_with("crp-") && b.starts_with("crp-"));
        assert_ne!(a, b);
    }

    #[test]
    fn check_error_passes_non_error_events() {
        let ok = serde_json::json!({ "evt": null, "data": {} });
        assert!(check_error(&ok, "x").is_ok());
        let bad = serde_json::json!({ "evt": "Error", "data": { "message": "nope" } });
        let err = check_error(&bad, "x").unwrap_err();
        assert!(err.contains("nope"));
    }
}

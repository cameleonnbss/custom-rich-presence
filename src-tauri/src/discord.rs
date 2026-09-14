//! Discord IPC client: connection to Discord's named pipe and activity
//! (Rich Presence) pushing. Implements the documented protocol directly.
//!
//! Architecture: one background actor thread owns the persistent
//! connection (one handshake, reused for every push, automatic
//! reconnect when the pipe dies or the client ID changes). Callers send
//! commands and wait with a bounded timeout, so a jammed Discord client
//! can never hang the app.

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::sync::mpsc;
use std::sync::OnceLock;
use std::time::Duration;

use std::fs::OpenOptions;

fn now_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

fn nonce() -> String {
    format!("crp-{}-{}", std::process::id(), now_nanos())
}

/// Environment-provided client id fallback (`DISCORD_CLIENT_ID`).
fn client_id_from_env() -> Option<String> {
    std::env::var("DISCORD_CLIENT_ID")
        .ok()
        .filter(|s| !s.trim().is_empty())
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

fn write_frame(stream: &mut std::fs::File, op: u32, payload: &Value) -> std::io::Result<()> {
    let body = serde_json::to_vec(payload)?;
    let mut buf = Vec::with_capacity(8 + body.len());
    buf.extend_from_slice(&op.to_le_bytes());
    buf.extend_from_slice(&(body.len() as u32).to_le_bytes());
    buf.extend_from_slice(&body);
    stream.write_all(&buf)?;
    stream.flush()
}

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

fn resolve_client_id(client_id: &str) -> Result<String, String> {
    let t = client_id.trim();
    if t.is_empty() {
        client_id_from_env().ok_or_else(|| "no Discord client_id configured".to_string())
    } else {
        Ok(t.to_string())
    }
}

/// Persistent connection to a Discord client.
pub struct Ipc {
    stream: Option<std::fs::File>,
    handshaked_id: Option<String>,
}

impl Default for Ipc {
    fn default() -> Self {
        Self { stream: None, handshaked_id: None }
    }
}

impl Ipc {
    /// Reconnect + handshake unless already connected with this ID.
    fn ensure_connected(&mut self, client_id: &str) -> Result<(), String> {
        let id = resolve_client_id(client_id)?;
        if self.stream.is_some() && self.handshaked_id.as_deref() == Some(id.as_str()) {
            return Ok(());
        }
        self.drop_connection();
        let mut stream = connect_pipe().map_err(|e| format!("connect: {e}"))?;
        write_frame(&mut stream, 0, &json!({ "v": 1, "client_id": id }))
            .map_err(|e| format!("handshake write: {e}"))?;
        let (op, payload) =
            read_frame(&mut stream).map_err(|e| format!("handshake read: {e}"))?;
        if op != 2 || payload.get("evt").and_then(Value::as_str) != Some("READY") {
            let detail = payload["data"]["message"]
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| payload.to_string());
            if detail.contains("Invalid Client ID") || detail.contains("Invalid OAuth") {
                return Err("invalid application ID — paste your own in the setup section".into());
            }
            return Err(format!("handshake rejected: {detail}"));
        }
        self.stream = Some(stream);
        self.handshaked_id = Some(id);
        Ok(())
    }

    fn drop_connection(&mut self) {
        self.stream = None;
        self.handshaked_id = None;
    }

    /// Sends the activity. One automatic retry after a dropped connection.
    #[allow(clippy::too_many_arguments)]
    pub fn set_activity(
        &mut self,
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
        let mut attempt = 0;
        loop {
            attempt += 1;
            self.ensure_connected(client_id)?;
            let frame = build_set_frame(details, state, large_image, large_text, small_image, start_ms, end_ms, button_label, button_url);
            match self.round_trip(&frame) {
                Ok(msg) => return Ok(msg),
                Err(e) => {
                    self.drop_connection();
                    if attempt >= 2 || e.contains("invalid application ID") || e.contains("rejected") {
                        return Err(e);
                    }
                    // Transient (dead pipe): retry once with a fresh connection.
                }
            }
        }
    }

    /// Clears the activity.
    pub fn clear_activity(&mut self, client_id: &str) -> Result<String, String> {
        self.ensure_connected(client_id)?;
        let frame = json!({
            "cmd": "SET_ACTIVITY",
            "args": { "pid": std::process::id(), "activity": null },
            "nonce": nonce()
        });
        self.round_trip(&frame)
    }

    fn round_trip(&mut self, frame: &Value) -> Result<String, String> {
        let Some(stream) = self.stream.as_mut() else {
            return Err("not connected".into());
        };
        if let Err(e) = write_frame(stream, 1, frame) {
            self.drop_connection();
            return Err(format!("send: {e}"));
        }
        let read_result = read_frame(stream);
        if let Err(e) = read_result {
            self.drop_connection();
            return Err(format!("read response: {e}"));
        }
        let (_, resp) = read_result.unwrap();
        check_error(&resp, "the activity")?;
        Ok("activity updated".to_string())
    }
}

fn build_set_frame(
    details: &str,
    state: &str,
    large_image: &str,
    large_text: &str,
    small_image: &str,
    start_ms: Option<u64>,
    end_ms: Option<u64>,
    button_label: &str,
    button_url: &str,
) -> Value {
    let mut activity = json!({});
    if !details.is_empty() {
        activity["details"] = json!(details);
    }
    if !state.is_empty() {
        activity["state"] = json!(state);
    }
    let mut timestamps = json!({});
    if let Some(ms) = start_ms {
        if ms >= 1 {
            timestamps["start"] = json!(ms);
        }
    }
    if let Some(ms) = end_ms {
        if ms >= 1 {
            timestamps["end"] = json!(ms);
        }
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

    json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": activity },
        "nonce": nonce()
    })
}

/// Validates an ID shape (digits only, sane length) for UI feedback.
pub fn plausible_client_id(s: &str) -> bool {
    let t = s.trim();
    t.len() >= 16 && t.len() <= 20 && t.chars().all(|c| c.is_ascii_digit())
}

/// One-shot handshake probe used by the setup UI: does Discord accept
/// this Application ID right now? Runs on its own short-lived connection
/// so it never disturbs the persistent actor connection.
pub fn validate_client_id(id: &str) -> Result<String, String> {
    let id = resolve_client_id(id)?;
    let mut stream = connect_pipe().map_err(|e| format!("connect: {e}"))?;
    write_frame(&mut stream, 0, &json!({ "v": 1, "client_id": id }))
        .map_err(|e| format!("handshake write: {e}"))?;
    let (op, payload) =
        read_frame(&mut stream).map_err(|e| format!("handshake read: {e}"))?;
    if op == 2 && payload.get("evt").and_then(Value::as_str) == Some("READY") {
        Ok("Discord accepted this ID — you're connected".into())
    } else {
        let detail = payload["data"]["message"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| payload.to_string());
        if detail.contains("Invalid Client ID") {
            Err("Discord rejected this ID — copy the Application ID number from the General page".into())
        } else {
            Err(format!("handshake rejected: {detail}"))
        }
    }
}

/* ---------- IPC actor: one thread owns the persistent connection ---------- */

struct SetArgs {
    client_id: String,
    details: String,
    state: String,
    large_image: String,
    large_text: String,
    small_image: String,
    start_ms: Option<u64>,
    end_ms: Option<u64>,
    button_label: String,
    button_url: String,
}

enum Cmd {
    Set(Box<SetArgs>),
    Clear { client_id: String },
}

type ReplyTx = mpsc::Sender<Result<String, String>>;

static CMD: OnceLock<mpsc::Sender<(Cmd, ReplyTx)>> = OnceLock::new();

/// Spawns the actor thread. Idempotent.
pub fn start_ipc_actor() {
    let (tx, rx) = mpsc::channel::<(Cmd, ReplyTx)>();
    if CMD.set(tx).is_err() {
        return; // already running
    }
    std::thread::Builder::new()
        .name("discord-ipc".into())
        .spawn(move || {
            let mut ipc = Ipc::default();
            for (cmd, reply) in rx {
                let result = match cmd {
                    Cmd::Set(a) => ipc.set_activity(
                        &a.client_id,
                        &a.details,
                        &a.state,
                        &a.large_image,
                        &a.large_text,
                        &a.small_image,
                        a.start_ms,
                        a.end_ms,
                        &a.button_label,
                        &a.button_url,
                    ),
                    Cmd::Clear { client_id } => ipc.clear_activity(&client_id),
                };
                let _ = reply.send(result);
            }
        })
        .expect("spawn discord ipc actor");
}

fn request(cmd: Cmd, timeout: Duration) -> Result<String, String> {
    let tx = CMD.get().ok_or_else(|| "ipc actor not running".to_string())?;
    let (rtx, rrx) = mpsc::channel();
    tx.send((cmd, rtx))
        .map_err(|_| "ipc actor stopped".to_string())?;
    rrx.recv_timeout(timeout)
        .unwrap_or_else(|_| Err("Discord did not answer".into()))
}

/// Sends the activity through the actor (bounded wait).
#[allow(clippy::too_many_arguments)]
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
    let args = SetArgs {
        client_id: client_id.to_string(),
        details: details.to_string(),
        state: state.to_string(),
        large_image: large_image.to_string(),
        large_text: large_text.to_string(),
        small_image: small_image.to_string(),
        start_ms,
        end_ms,
        button_label: button_label.to_string(),
        button_url: button_url.to_string(),
    };
    request(Cmd::Set(Box::new(args)), Duration::from_secs(8))
}

/// Clears the activity through the actor (bounded wait).
pub fn clear_activity(client_id: &str) -> Result<String, String> {
    request(Cmd::Clear { client_id: client_id.to_string() }, Duration::from_secs(5))
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

    #[test]
    fn zero_timestamps_are_omitted() {
        let f = build_set_frame("d", "", "", "", "", Some(0), Some(0), "", "");
        let ts = &f["args"]["activity"]["timestamps"];
        assert!(ts.get("start").is_none() && ts.get("end").is_none());
        let f2 = build_set_frame("d", "", "", "", "", Some(12345), None, "", "");
        assert_eq!(f2["args"]["activity"]["timestamps"]["start"], 12345);
    }

    #[test]
    fn plausible_client_id_shape() {
        assert!(plausible_client_id("123456789012345678"));
        assert!(plausible_client_id("  123456789012345678 "));
        assert!(!plausible_client_id("12345"));
        assert!(!plausible_client_id("abc456789012345678"));
        assert!(!plausible_client_id(""));
    }

    #[test]
    fn build_set_frame_omits_empty_sections() {
        let f = build_set_frame("hello", "", "", "", "", None, None, "", "");
        let act = &f["args"]["activity"];
        assert_eq!(act["details"], "hello");
        assert!(act.get("state").is_none());
        assert!(act.get("assets").is_none());
        assert!(act.get("timestamps").is_none());
        assert!(act.get("buttons").is_none());
    }
}

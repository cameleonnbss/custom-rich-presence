//! Client Discord IPC : connexion au pipe nommé de Discord et envoi
//! de l'activité (Rich Presence). Implémentation directe du protocole
//! documenté de Discord, sans dépendance lourde.
//!
//! Protocole : handshake (`{"v":1,"client_id":…}`), puis trames
//! op:1 FRAME contenant SET_ACTIVITY avec nonce. Le pipe existe sous
//! plusieurs numéros (Discord, Discord Canary, Discord PTB).

use serde_json::{json, Value};
use std::io::{Read, Write};

#[cfg(windows)]
use std::fs::OpenOptions;

/// Connexion au premier pipe Discord disponible.
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
        "aucun pipe Discord trouvé (Discord est-il lancé ?)",
    ))
}

#[cfg(not(windows))]
fn connect_pipe() -> std::io::Result<std::fs::File> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "IPC Discord pris en charge uniquement sous Windows",
    ))
}

/// Renvoie le chemin du premier pipe Discord disponible.
pub fn pipe_available() -> Result<String, String> {
    for i in 0..10 {
        let path = format!(r"\\.\pipe\discord-ipc-{i}");
        if OpenOptions::new().read(true).write(true).open(&path).is_ok() {
            return Ok(path);
        }
    }
    Err("aucun pipe Discord trouvé (Discord est-il lancé ?)".into())
}

/// Écrit une trame : 4 octets little-endian (op) + JSON.
fn write_frame(stream: &mut std::fs::File, op: u32, payload: &Value) -> std::io::Result<()> {
    let body = serde_json::to_vec(payload)?;
    let mut buf = Vec::with_capacity(8 + body.len());
    buf.extend_from_slice(&op.to_le_bytes());
    buf.extend_from_slice(&(body.len() as u32).to_le_bytes());
    buf.extend_from_slice(&body);
    stream.write_all(&buf)?;
    stream.flush()
}

/// Lit une trame et renvoie (op, payload).
fn read_frame(stream: &mut std::fs::File) -> std::io::Result<(u32, Value)> {
    let mut header = [0u8; 8];
    stream.read_exact(&mut header)?;
    let op = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
    let len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    let mut body = vec![0u8; len];
    stream.read_exact(&mut body)?;
    let payload = serde_json::from_slice(&body).unwrap_or(Value::Null);
    Ok((op, payload))
}

fn nonce() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("crp-{t}")
}

fn client_id_from_env() -> Option<String> {
    std::env::var("CRP_DISCORD_CLIENT_ID").ok().filter(|s| !s.is_empty())
}

/// Envoie l'activité à Discord. `client_id` : identifiant d'application
/// Discord (l'app fournit son identifiant par défaut si None/vide).
///
/// Retourne `Ok(descr)` en cas de succès (descr = message lisible),
/// `Err(message)` sinon — jamais de panique, l'envoi est best-effort.
pub fn set_activity(
    client_id: &str,
    details: &str,
    state: &str,
    large_image: &str,
    large_text: &str,
    start_ms: Option<u64>,
    end_ms: Option<u64>,
) -> Result<String, String> {
    let id = if client_id.trim().is_empty() {
        client_id_from_env().ok_or("aucun client_id Discord configuré".to_string())?
    } else {
        client_id.trim().to_string()
    };    let mut stream = connect_pipe().map_err(|e| format!("connexion : {e}"))?;

    write_frame(&mut stream, 0, &json!({ "v": 1, "client_id": id }))
        .map_err(|e| format!("handshake : {e}"))?;
    let (op, payload) = read_frame(&mut stream).map_err(|e| format!("lecture handshake : {e}"))?;
    if op == 1 && payload.get("evt").and_then(Value::as_str) == Some("Error") {
        return Err(format!("handshake refusé : {payload}"));
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
    if assets.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
        activity["assets"] = assets;
    }

    let frame = json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": activity },
        "nonce": nonce()
    });
    write_frame(&mut stream, 1, &frame).map_err(|e| format!("envoi : {e}"))?;
    let (_, resp) = read_frame(&mut stream).map_err(|e| format!("lecture réponse : {e}"))?;
    if resp.get("evt").and_then(Value::as_str) == Some("Error") {
        return Err(format!(
            "Discord a refusé l'activité : {}",
            resp["data"]["message"].as_str().unwrap_or("raison inconnue")
        ));
    }
    Ok("activité mise à jour".to_string())
}

/// Efface l'activité (SET_ACTIVITY sans activity).
pub fn clear_activity(client_id: &str) -> Result<String, String> {
    let id = if client_id.trim().is_empty() {
        client_id_from_env().ok_or("aucun client_id Discord configuré".to_string())?
    } else {
        client_id.trim().to_string()
    };
    let mut stream = connect_pipe().map_err(|e| format!("connexion : {e}"))?;
    write_frame(&mut stream, 0, &json!({ "v": 1, "client_id": id }))
        .map_err(|e| format!("handshake : {e}"))?;
    let _ = read_frame(&mut stream);
    let frame = json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": null },
        "nonce": nonce()
    });
    write_frame(&mut stream, 1, &frame).map_err(|e| format!("envoi : {e}"))?;
    let (_, resp) = read_frame(&mut stream).map_err(|e| format!("lecture réponse : {e}"))?;
    if resp.get("evt").and_then(Value::as_str) == Some("Error") {
        return Err("Discord a refusé l'effacement".into());
    }
    Ok("activité effacée".to_string())
}

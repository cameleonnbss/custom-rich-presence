//! Mode YouTube : extraction de l'identifiant de vidéo + oEmbed public.
//! Aucune clé API requise ; l'architecture permet d'ajouter une API
//! dédiée plus tard (voir README, section « Intégrations »).

use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeInfo {
    pub video_id: String,
    pub title: Option<String>,
    pub author: Option<String>,
    pub thumbnail_url: String,
}

/// Extrait l'identifiant d'une URL YouTube (watch, youtu.be, shorts,
/// embed, live) ou accepte un identifiant brut.
pub fn extract_video_id(url: &str) -> Option<String> {
    let u = url.trim();
    if u.is_empty() {
        return None;
    }
    let id_from = |s: &str| -> Option<String> {
        let end = s.find(['&', '?', '#', '/']).unwrap_or(s.len());
        let id = &s[..end];
        let valid = (5..=20).contains(&id.len())
            && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
        if valid { Some(id.to_string()) } else { None }
    };
    for pat in ["youtu.be/", "shorts/", "embed/", "live/", "watch?v=", "v="] {
        if let Some(idx) = u.find(pat) {
            if let Some(id) = id_from(&u[idx + pat.len()..]) {
                return Some(id);
            }
        }
    }
    id_from(u)
}

pub fn thumbnail_url(id: &str) -> String {
    format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", id)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| format!("client HTTP : {e}"))
}

/// Titre + auteur via oEmbed (gratuit, sans clé). En cas d'échec réseau,
/// renvoie quand même l'identifiant et la miniature : la carte reste
/// utilisable hors ligne avec un titre personnalisé.
pub async fn fetch_info(url: &str) -> Result<YoutubeInfo, String> {
    let id = extract_video_id(url).ok_or_else(|| "URL YouTube non reconnue".to_string())?;
    let info = YoutubeInfo {
        video_id: id.clone(),
        title: None,
        author: None,
        thumbnail_url: thumbnail_url(&id),
    };
    let client = client()?;
    let resp = client
        .get("https://www.youtube.com/oembed")
        .query(&[
            ("url", format!("https://www.youtube.com/watch?v={id}")),
            ("format", "json".to_string()),
        ])
        .send()
        .await
        .map_err(|e| format!("réseau : {e}"))?;
    if !resp.status().is_success() {
        return Ok(info);
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("réponse : {e}"))?;
    Ok(YoutubeInfo {
        title: json["title"].as_str().map(String::from),
        author: json["author_name"].as_str().map(String::from),
        ..info
    })
}

/// Télécharge la miniature et la renvoie en data URL pour persistance
/// hors ligne dans la configuration.
pub async fn thumbnail_data(url: &str) -> Result<String, String> {
    let id = extract_video_id(url).ok_or_else(|| "URL YouTube non reconnue".to_string())?;
    let client = client()?;
    let resp = client
        .get(thumbnail_url(&id))
        .send()
        .await
        .map_err(|e| format!("réseau : {e}"))?;
    if !resp.status().is_success() {
        return Err("miniature indisponible".into());
    }
    let bytes = resp.bytes().await.map_err(|e| format!("téléchargement : {e}"))?;
    use base64::Engine as _;
    Ok(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}

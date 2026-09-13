//! YouTube mode: video ID extraction + public oEmbed lookup.
//! No API key required; the architecture allows adding a dedicated API
//! later (see the README "Integrations" section).

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

/// Extracts the video ID from a YouTube URL (watch, youtu.be, shorts,
/// embed, live) or accepts a raw ID.
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
        .map_err(|e| format!("http client: {e}"))
}

/// Title + author via oEmbed (free, keyless). On network failure,
/// still returns the ID and thumbnail URL: the card remains usable
/// offline with a custom title.
pub async fn fetch_info(url: &str) -> Result<YoutubeInfo, String> {
    let id = extract_video_id(url).ok_or_else(|| "YouTube URL not recognized".to_string())?;
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
        .map_err(|e| format!("network: {e}"))?;
    if !resp.status().is_success() {
        return Ok(info);
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("response: {e}"))?;
    Ok(YoutubeInfo {
        title: json["title"].as_str().map(String::from),
        author: json["author_name"].as_str().map(String::from),
        ..info
    })
}

/// Downloads the thumbnail and returns it as a data URL for offline
/// persistence in the configuration.
pub async fn thumbnail_data(url: &str) -> Result<String, String> {
    let id = extract_video_id(url).ok_or_else(|| "YouTube URL not recognized".to_string())?;
    let client = client()?;
    let resp = client
        .get(thumbnail_url(&id))
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;
    if !resp.status().is_success() {
        return Err("thumbnail unavailable".into());
    }
    let bytes = resp.bytes().await.map_err(|e| format!("download: {e}"))?;
    use base64::Engine as _;
    Ok(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_id_from_watch_urls() {
        assert_eq!(
            extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".into())
        );
        assert_eq!(
            extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"),
            Some("dQw4w9WgXcQ".into())
        );
    }

    #[test]
    fn extracts_id_from_short_and_embedded_forms() {
        assert_eq!(extract_video_id("https://youtu.be/dQw4w9WgXcQ"), Some("dQw4w9WgXcQ".into()));
        assert_eq!(
            extract_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".into())
        );
        assert_eq!(
            extract_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".into())
        );
    }

    #[test]
    fn accepts_a_raw_id() {
        assert_eq!(extract_video_id("dQw4w9WgXcQ"), Some("dQw4w9WgXcQ".into()));
    }

    #[test]
    fn rejects_garbage() {
        assert_eq!(extract_video_id(""), None);
        assert_eq!(extract_video_id("   "), None);
        assert_eq!(extract_video_id("https://example.com/nothing"), None);
    }

    #[test]
    fn thumbnail_url_shape() {
        assert_eq!(
            thumbnail_url("abc123"),
            "https://i.ytimg.com/vi/abc123/hqdefault.jpg"
        );
    }
}

//! Intégration Windows : System Media Transport Controls (SMTC).
//! Récupère les métadonnées de n'importe quelle application compatible
//! (Spotify, navigateurs, lecteurs système, jeux, etc.).

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::Serialize;
use std::time::SystemTime;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Storage::Streams::DataReader;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaStatus {
    pub available: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub app_id: String,
    pub playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub cover_data_url: String,
}

impl MediaStatus {
    pub fn unavailable() -> Self {
        Self {
            available: false,
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            app_id: String::new(),
            playing: false,
            position_ms: 0,
            duration_ms: 0,
            cover_data_url: String::new(),
        }
    }
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn datetime_to_unix_ms(universal_time: i64) -> u64 {
    // Ticks 100 ns depuis 1601-01-01 → ms depuis 1970-01-01.
    let ms = universal_time / 10_000 - 11_644_473_600_000;
    if ms < 0 { 0 } else { ms as u64 }
}

/// Point d'entrée appelé depuis un thread bloquant : ne jamais paniquer,
/// renvoyer simplement un statut indisponible en cas d'erreur.
pub fn read_smtc_blocking() -> MediaStatus {
    read_smtc_inner().unwrap_or_else(|_| MediaStatus::unavailable())
}

fn read_smtc_inner() -> windows::core::Result<MediaStatus> {
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?;
    let sessions = manager.GetSessions()?;
    let count = sessions.Size()?;
    if count == 0 {
        return Ok(MediaStatus::unavailable());
    }

    // Préférer une session en lecture, sinon la première.
    let mut chosen: Option<GlobalSystemMediaTransportControlsSession> = None;
    for i in 0..count {
        let s = sessions.GetAt(i)?;
        let playing = s.GetPlaybackInfo()?.PlaybackStatus()?
            == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
        if playing {
            chosen = Some(s);
            break;
        }
        if chosen.is_none() {
            chosen = Some(s);
        }
    }
    let Some(session) = chosen else {
        return Ok(MediaStatus::unavailable());
    };

    let playing = session.GetPlaybackInfo()?.PlaybackStatus()?
        == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

    // Position + durée, extrapolée si lecture en cours.
    let timeline = session.GetTimelineProperties()?;
    let pos_ms = (timeline.Position()?.Duration / 10_000).max(0) as u64;
    let dur_ms = (timeline.EndTime()?.Duration / 10_000).max(0) as u64;
    let last_ms = datetime_to_unix_ms(timeline.LastUpdatedTime()?.UniversalTime);
    let mut position_ms = if playing {
        pos_ms.saturating_add(now_unix_ms().saturating_sub(last_ms))
    } else {
        pos_ms
    };
    if dur_ms > 0 {
        position_ms = position_ms.min(dur_ms);
    }

    // Métadonnées.
    let props = session.TryGetMediaPropertiesAsync()?.get()?;
    let title = props.Title().map(|h| h.to_string_lossy()).unwrap_or_default();
    let artist = props.Artist().map(|h| h.to_string_lossy()).unwrap_or_default();
    let album = props.AlbumTitle().map(|h| h.to_string_lossy()).unwrap_or_default();
    let app_id = session
        .SourceAppUserModelId()
        .map(|h| h.to_string_lossy())
        .unwrap_or_default();
    let cover_data_url = props
        .Thumbnail()
        .ok()
        .and_then(|thumb| stream_to_data_url(&thumb).ok())
        .unwrap_or_default();

    Ok(MediaStatus {
        available: true,
        title,
        artist,
        album,
        app_id,
        playing,
        position_ms,
        duration_ms: dur_ms,
        cover_data_url,
    })
}

/// Lit un flux WinRT (pochette) et le convertit en data URL base64.
fn stream_to_data_url(
    reference: &windows::Storage::Streams::IRandomAccessStreamReference,
) -> windows::core::Result<String> {
    let stream = reference.OpenReadAsync()?.get()?;
    let size = stream.Size()?; // u64
    if size == 0 {
        return Ok(String::new());
    }
    let reader = DataReader::CreateDataReader(&stream)?;
    reader.LoadAsync(size.min(u32::MAX as u64) as u32)?.get()?;
    let len = reader.UnconsumedBufferLength()? as usize;
    let mut bytes = vec![0u8; len];
    reader.ReadBytes(&mut bytes)?;
    let mime = stream.ContentType()?.to_string_lossy();
    let mime = if mime.is_empty() { "image/png".to_string() } else { mime };
    Ok(format!("data:{};base64,{}", mime, STANDARD.encode(&bytes)))
}

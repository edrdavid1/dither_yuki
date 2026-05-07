// dyproj:// custom URI scheme protocol handler.
//
// URL format: dyproj://asset/<asset_id>
//
// Supports HTTP Range requests so the browser video element can seek without
// buffering the entire file. Returns 206 Partial Content when a Range header
// is present, or 200 with the full file otherwise.

use crate::project::state::SharedProjectState;
use std::fs;
use tauri::UriSchemeResponder;

/// Parse a "Range: bytes=start-end" header value.
/// Returns (start, Option<end>) or None if the header is malformed / not a byte-range.
fn parse_byte_range(range: &str) -> Option<(u64, Option<u64>)> {
    let range = range.strip_prefix("bytes=")?;
    let mut parts = range.splitn(2, '-');
    let start: u64 = parts.next()?.parse().ok()?;
    let end: Option<u64> = parts.next().and_then(|s| {
        if s.is_empty() {
            None
        } else {
            s.parse().ok()
        }
    });
    Some((start, end))
}

pub fn handle_dyproj_request(
    request: tauri::http::Request<Vec<u8>>,
    state: SharedProjectState,
    responder: UriSchemeResponder,
) {
    let uri = request.uri();
    let path_str = uri.path(); // e.g. "/asset/some-uuid"

    // Strip leading "/asset/" prefix
    let asset_id = path_str
        .strip_prefix("/asset/")
        .unwrap_or(path_str)
        .trim_start_matches('/');

    // Resolve asset path from shared state
    let file_path = {
        let guard = state.lock().unwrap();
        guard.asset_map.get(asset_id).cloned()
    };

    let Some(file_path) = file_path else {
        responder.respond(
            tauri::http::Response::builder()
                .status(404)
                .body(b"Asset not found".to_vec())
                .unwrap(),
        );
        return;
    };

    let data = match fs::read(&file_path) {
        Ok(d) => d,
        Err(e) => {
            responder.respond(
                tauri::http::Response::builder()
                    .status(500)
                    .body(format!("read error: {e}").into_bytes())
                    .unwrap(),
            );
            return;
        }
    };

    let total_len = data.len() as u64;

    // Detect MIME type from extension
    let mime = mime_from_path(&file_path);

    // Handle Range request
    if let Some(range_header) = request.headers().get("range").and_then(|v| v.to_str().ok()) {
        if let Some((start, end_opt)) = parse_byte_range(range_header) {
            let end = end_opt.unwrap_or(total_len - 1).min(total_len - 1);
            if start > end || start >= total_len {
                responder.respond(
                    tauri::http::Response::builder()
                        .status(416) // Range Not Satisfiable
                        .header("Content-Range", format!("bytes */{total_len}"))
                        .body(vec![])
                        .unwrap(),
                );
                return;
            }
            let chunk = data[start as usize..=end as usize].to_vec();
            let len = chunk.len();
            responder.respond(
                tauri::http::Response::builder()
                    .status(206)
                    .header("Content-Type", mime)
                    .header("Content-Range", format!("bytes {start}-{end}/{total_len}"))
                    .header("Content-Length", len.to_string())
                    .header("Accept-Ranges", "bytes")
                    .body(chunk)
                    .unwrap(),
            );
            return;
        }
    }

    // Full response
    responder.respond(
        tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime)
            .header("Content-Length", total_len.to_string())
            .header("Accept-Ranges", "bytes")
            .body(data)
            .unwrap(),
    );
}

fn mime_from_path(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("avi") => "video/x-msvideo",
        Some("mkv") => "video/x-matroska",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
}

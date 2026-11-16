// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

//! The pipette: lets the user pick a colour anywhere on the screen.
//!
//! WebKit, which shows the page on macOS, has no EyeDropper API, so the page
//! asks for the system's own colour sampler (the magnifier of the colour
//! panel) instead. Elsewhere the page uses EyeDropper (WebView2 on Windows)
//! or its own in-page pipette.

use tauri::{AppHandle, Runtime};

/// Shows the system's colour sampler and returns the picked colour as
/// `#RRGGBB`, or `None` when the user cancels (Échap).
#[cfg(target_os = "macos")]
pub async fn pick<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    use objc2_app_kit::{NSColor, NSColorSampler};
    use std::cell::Cell;
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel::<Option<String>>();
    app.run_on_main_thread(move || {
        let tx = Cell::new(Some(tx));
        let handler = block2::RcBlock::new(move |color: *mut NSColor| {
            if let Some(tx) = tx.take() {
                // SAFETY: AppKit passes a valid colour, or nil when cancelled.
                let _ = tx.send(unsafe { color.as_ref() }.and_then(to_hex));
            }
        });
        // AppKit keeps the sampler alive until the user has picked or cancelled.
        let sampler = NSColorSampler::new();
        // SAFETY: called on the main thread, with a block of the expected signature.
        unsafe { sampler.showSamplerWithSelectionHandler(&handler) };
    })
    .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
pub async fn pick<R: Runtime>(_app: AppHandle<R>) -> Result<Option<String>, String> {
    Err("unsupported".into())
}

#[cfg(target_os = "macos")]
fn to_hex(color: &objc2_app_kit::NSColor) -> Option<String> {
    use objc2_app_kit::NSColorSpace;
    let srgb = color.colorUsingColorSpace(&NSColorSpace::sRGBColorSpace())?;
    Some(hex(
        srgb.redComponent(),
        srgb.greenComponent(),
        srgb.blueComponent(),
    ))
}

/// `#RRGGBB` from components between 0 and 1.
#[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
fn hex(r: f64, g: f64, b: f64) -> String {
    let byte = |v: f64| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{:02X}{:02X}{:02X}", byte(r), byte(g), byte(b))
}

#[cfg(test)]
mod tests {
    use super::hex;

    #[test]
    fn formats_components_as_hex() {
        assert_eq!(hex(1.0, 0.0, 0.5), "#FF0080");
        assert_eq!(hex(-0.2, 1.4, 0.184), "#00FF2F");
    }
}

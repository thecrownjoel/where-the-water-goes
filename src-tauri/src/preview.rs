//! Windows Screen Saver Settings preview (`/p <hwnd>`).
//!
//! Windows asks the screensaver to draw into a small child window of the settings dialog.
//! Embedding WebView2 in a foreign HWND is heavy and fragile, so the preview is a static
//! thumbnail of the visualization (no data is presented), drawn with GDI. The process ends
//! when Windows destroys the parent window.
//!
//! The BMP reader and crop maths are platform-neutral so they are unit-tested on every OS.
#![cfg_attr(not(windows), allow(dead_code))]

/// Parsed 24- or 32-bit uncompressed BMP, borrowed from the embedded bytes.
#[derive(Debug, PartialEq)]
pub struct Bmp<'a> {
    pub width: i32,
    /// Negative = top-down rows (as written by most tools), positive = bottom-up.
    pub height: i32,
    pub bpp: u16,
    pub pixels: &'a [u8],
}

/// Minimal BMP reader: validates the header fields the GDI call depends on.
pub fn parse_bmp(b: &[u8]) -> Option<Bmp<'_>> {
    let u32_at = |o: usize| b.get(o..o + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]));
    let i32_at = |o: usize| u32_at(o).map(|v| v as i32);
    let u16_at = |o: usize| b.get(o..o + 2).map(|s| u16::from_le_bytes([s[0], s[1]]));
    if b.get(0..2)? != b"BM" {
        return None;
    }
    let offset = u32_at(10)? as usize;
    let header = u32_at(14)?;
    let width = i32_at(18)?;
    let height = i32_at(22)?;
    let bpp = u16_at(28)?;
    let compression = u32_at(30)?;
    if header < 40 || width <= 0 || height == 0 || !(bpp == 24 || bpp == 32) || compression != 0 {
        return None;
    }
    let stride = (width as usize * bpp as usize).div_ceil(32) * 4;
    let len = stride * height.unsigned_abs() as usize;
    let pixels = b.get(offset..offset.checked_add(len)?)?;
    Some(Bmp { width, height, bpp, pixels })
}

/// Largest source rectangle with the destination's aspect ratio, centred ("cover" fit).
pub fn cover(src_w: i32, src_h: i32, dst_w: i32, dst_h: i32) -> (i32, i32, i32, i32) {
    if dst_w <= 0 || dst_h <= 0 {
        return (0, 0, src_w, src_h);
    }
    // Compare aspect ratios without floating point: src_w/src_h vs dst_w/dst_h.
    if (src_w as i64) * (dst_h as i64) > (dst_w as i64) * (src_h as i64) {
        let w = ((src_h as i64 * dst_w as i64) / dst_h as i64) as i32;
        ((src_w - w) / 2, 0, w, src_h)
    } else {
        let h = ((src_w as i64 * dst_h as i64) / dst_w as i64) as i32;
        (0, (src_h - h) / 2, src_w, h)
    }
}

#[cfg(windows)]
pub fn run(parent: isize) {
    win::run(parent)
}

#[cfg(not(windows))]
pub fn run(_parent: isize) {}

#[cfg(windows)]
mod win {
    use super::{cover, parse_bmp};
    use std::mem::{size_of, zeroed};
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows_sys::Win32::Graphics::Gdi::{
        BeginPaint, EndPaint, GetStockObject, SetStretchBltMode, StretchDIBits, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, BLACK_BRUSH, DIB_RGB_COLORS, HALFTONE, HBRUSH, PAINTSTRUCT, SRCCOPY,
    };
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetClientRect, GetMessageW, PostQuitMessage,
        RegisterClassW, TranslateMessage, CS_HREDRAW, CS_VREDRAW, MSG, WM_DESTROY, WM_PAINT, WNDCLASSW,
        WS_CHILD, WS_VISIBLE,
    };

    static THUMB: &[u8] = include_bytes!("../assets/preview.bmp");

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn run(parent: isize) {
        let parent = parent as HWND;
        unsafe {
            let hinst = GetModuleHandleW(null());
            let class = wide("WhereTheWaterGoesPreview");
            let mut wc: WNDCLASSW = zeroed();
            wc.style = CS_HREDRAW | CS_VREDRAW;
            wc.lpfnWndProc = Some(wndproc);
            wc.hInstance = hinst;
            wc.lpszClassName = class.as_ptr();
            wc.hbrBackground = GetStockObject(BLACK_BRUSH) as HBRUSH;
            if RegisterClassW(&wc) == 0 {
                return;
            }
            let mut rc: RECT = zeroed();
            if GetClientRect(parent, &mut rc) == 0 {
                return;
            }
            let hwnd = CreateWindowExW(
                0,
                class.as_ptr(),
                null(),
                WS_CHILD | WS_VISIBLE,
                0,
                0,
                rc.right - rc.left,
                rc.bottom - rc.top,
                parent,
                null_mut(),
                hinst,
                null(),
            );
            if hwnd.is_null() {
                return;
            }
            let mut msg: MSG = zeroed();
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }

    unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match msg {
            WM_PAINT => {
                let mut ps: PAINTSTRUCT = zeroed();
                let hdc = BeginPaint(hwnd, &mut ps);
                let mut rc: RECT = zeroed();
                GetClientRect(hwnd, &mut rc);
                if let Some(bmp) = parse_bmp(THUMB) {
                    let mut bi: BITMAPINFO = zeroed();
                    bi.bmiHeader = BITMAPINFOHEADER {
                        biSize: size_of::<BITMAPINFOHEADER>() as u32,
                        biWidth: bmp.width,
                        biHeight: bmp.height,
                        biPlanes: 1,
                        biBitCount: bmp.bpp,
                        biCompression: BI_RGB,
                        ..zeroed()
                    };
                    let (dw, dh) = (rc.right - rc.left, rc.bottom - rc.top);
                    let (sx, sy, sw, sh) = cover(bmp.width, bmp.height.abs(), dw, dh);
                    SetStretchBltMode(hdc, HALFTONE);
                    // StretchDIBits measures ySrc from the bottom row for bottom-up and from
                    // the top row for top-down bitmaps; a centred crop is symmetric either way.
                    StretchDIBits(
                        hdc, 0, 0, dw, dh, sx, sy, sw, sh,
                        bmp.pixels.as_ptr().cast(), &bi, DIB_RGB_COLORS, SRCCOPY,
                    );
                }
                EndPaint(hwnd, &ps);
                0
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                0
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_thumbnail_is_a_valid_bmp() {
        let b = parse_bmp(include_bytes!("../assets/preview.bmp")).expect("valid bmp");
        assert_eq!((b.width, b.height.abs(), b.bpp), (200, 150, 24));
    }

    #[test]
    fn rejects_truncated_or_foreign_data() {
        assert!(parse_bmp(b"PNG").is_none());
        let full = include_bytes!("../assets/preview.bmp");
        assert!(parse_bmp(&full[..full.len() - 1]).is_none());
    }

    #[test]
    fn cover_crops_to_destination_aspect() {
        // 200x150 source into the classic 152x112 preview: nearly the same aspect.
        let (x, y, w, h) = cover(200, 150, 152, 112);
        assert_eq!((x, w, h), (0, 200, 147));
        assert_eq!(y, 1);
        // Wide destination crops height.
        assert_eq!(cover(200, 150, 400, 100), (0, 50, 200, 50));
        // Tall destination crops width.
        assert_eq!(cover(200, 150, 100, 300), (75, 0, 50, 150));
        assert_eq!(cover(200, 150, 0, 0), (0, 0, 200, 150));
    }
}

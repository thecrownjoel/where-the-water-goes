//! Seconds since the user last touched the keyboard or mouse, per platform.
//! Returns `None` where the platform gives no reliable answer (e.g. GNOME on Wayland).

#[cfg(target_os = "macos")]
pub fn seconds() -> Option<f64> {
    // CoreGraphics: CGEventSourceSecondsSinceLastEventType(kCGEventSourceStateCombinedSessionState,
    // kCGAnyInputEventType). Documented public API; no permissions required.
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }
    const COMBINED_SESSION_STATE: i32 = 0;
    const ANY_INPUT_EVENT_TYPE: u32 = !0;
    let s = unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT_TYPE) };
    s.is_finite().then_some(s)
}

#[cfg(target_os = "windows")]
pub fn seconds() -> Option<f64> {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    let ok = unsafe { GetLastInputInfo(&mut info) };
    if ok == 0 {
        return None;
    }
    let now = unsafe { GetTickCount() };
    Some(now.wrapping_sub(info.dwTime) as f64 / 1000.0)
}

#[cfg(target_os = "linux")]
pub fn seconds() -> Option<f64> {
    // X11 via XScreenSaver extension, or D-Bus where supported. Untested in CI as of v0.1.
    user_idle::UserIdle::get_time().ok().map(|t| t.as_seconds() as f64)
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn seconds() -> Option<f64> {
    None
}

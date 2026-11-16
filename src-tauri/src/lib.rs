//! Native shell for Where the Water Goes.
//!
//! Responsibilities (kept deliberately small — all visualization and data logic is in the
//! shared web frontend):
//!   * pick a launch mode from the command line (explorer, saver, settings, idle tray)
//!   * open one borderless, always-on-top saver window per monitor and close them on input
//!   * idle detection for the tray "idle fullscreen" mode on macOS/Linux (and Windows)
//!   * report battery state so the frontend can reduce work on battery
//!   * open https links in the system browser
//!   * read-only status from a local BOINC client (volunteer computing is done by BOINC)

mod boinc;
mod idle;
mod launch;
mod preview;

use launch::Launch;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
struct AppState {
    /// True when launched as a one-shot saver (`/s`): exiting the saver quits the app.
    one_shot: AtomicBool,
    /// Idle-tray mode: activation paused by the user.
    paused: AtomicBool,
    /// Idle threshold in minutes (idle mode).
    idle_minutes: AtomicU32,
    /// Saver windows currently open.
    saver_open: AtomicBool,
}

const SAVER_PREFIX: &str = "saver-";

fn open_explorer(app: &AppHandle, query: &str) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window("main") {
        w.show()?;
        w.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App(format!("index.html{query}").into()))
        .title("Where the Water Goes")
        .inner_size(1280.0, 800.0)
        .min_inner_size(640.0, 420.0)
        .build()?;
    Ok(())
}

fn open_saver(app: &AppHandle) -> tauri::Result<()> {
    let state = app.state::<Arc<AppState>>();
    if state.saver_open.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let monitors = app.available_monitors()?;
    for (i, m) in monitors.iter().enumerate() {
        let scale = m.scale_factor();
        let pos = m.position().to_logical::<f64>(scale);
        let size = m.size().to_logical::<f64>(scale);
        // Only the first monitor plays the full scene; others get the same scene too, but a
        // future option could dim them to save power.
        let w = WebviewWindowBuilder::new(app, format!("{SAVER_PREFIX}{i}"), WebviewUrl::App("index.html?mode=saver".into()))
            .title("Where the Water Goes")
            .decorations(false)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .position(pos.x, pos.y)
            .inner_size(size.width, size.height)
            .focused(i == 0)
            .build()?;
        raise_above_menu_bar(&w);
    }
    Ok(())
}

/// On macOS a normal always-on-top window still sits below the menu bar and Dock. Raise it
/// to the screensaver window level so it covers the whole display without creating a new
/// fullscreen Space (which would animate).
#[cfg(target_os = "macos")]
fn raise_above_menu_bar(w: &tauri::WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    const NS_SCREEN_SAVER_WINDOW_LEVEL: isize = 1000;
    if let Ok(ptr) = w.ns_window() {
        let ns_window = ptr as *mut AnyObject;
        if !ns_window.is_null() {
            unsafe {
                let _: () = msg_send![ns_window, setLevel: NS_SCREEN_SAVER_WINDOW_LEVEL];
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn raise_above_menu_bar(w: &tauri::WebviewWindow) {
    let _ = w.set_fullscreen(true);
}

fn close_savers(app: &AppHandle) {
    for (label, w) in app.webview_windows() {
        if label.starts_with(SAVER_PREFIX) {
            let _ = w.close();
        }
    }
    app.state::<Arc<AppState>>().saver_open.store(false, Ordering::SeqCst);
}

#[tauri::command]
fn exit_saver(app: AppHandle) {
    close_savers(&app);
    if app.state::<Arc<AppState>>().one_shot.load(Ordering::SeqCst) {
        app.exit(0);
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PowerState {
    on_battery: Option<bool>,
}

#[tauri::command]
fn power_state() -> PowerState {
    let on_battery = (|| {
        let manager = starship_battery::Manager::new().ok()?;
        let mut any = false;
        for b in manager.batteries().ok()?.flatten() {
            any = true;
            if b.state() == starship_battery::State::Discharging {
                return Some(true);
            }
        }
        any.then_some(false)
    })();
    PowerState { on_battery }
}

/// Diagnostics sink: the frontend reports renderer/frame-rate/data status here. Printed only
/// when WTRSHD_DIAG=1, so users can share it in bug reports. Never sent anywhere.
#[tauri::command]
fn diag(msg: String) {
    if std::env::var("WTRSHD_DIAG").as_deref() == Ok("1") {
        eprintln!("[wtrshd] {}", msg.chars().take(2000).collect::<String>());
    }
}

/// Status of a locally running BOINC client. Read-only; see boinc.rs.
#[tauri::command]
async fn boinc_status() -> boinc::Status {
    tauri::async_runtime::spawn_blocking(boinc::status)
        .await
        .unwrap_or(boinc::Status::Unavailable { reason: "status check failed".into() })
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    // Only plain https links; never file://, javascript:, custom schemes.
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" {
        return Err("only https links are allowed".into());
    }
    app.opener().open_url(parsed.as_str(), None::<&str>).map_err(|e| e.to_string())
}

fn start_idle_watcher(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(5));
        let state = app.state::<Arc<AppState>>();
        if state.paused.load(Ordering::SeqCst) || state.saver_open.load(Ordering::SeqCst) {
            continue;
        }
        let threshold = state.idle_minutes.load(Ordering::SeqCst) as f64 * 60.0;
        if idle::seconds().is_some_and(|idle| idle >= threshold) {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                let _ = open_saver(&handle);
            });
        }
    });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let start = MenuItem::with_id(app, "start", "Start now", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause idle activation", true, None::<&str>)?;
    let explore = MenuItem::with_id(app, "explore", "Open explorer", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&start, &pause, &explore, &PredefinedMenuItem::separator(app)?, &quit])?;
    let pause_item = pause.clone();
    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().cloned().expect("bundle icon"))
        .tooltip("Where the Water Goes")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "start" => {
                let _ = open_saver(app);
            }
            "pause" => {
                let state = app.state::<Arc<AppState>>();
                let now_paused = !state.paused.load(Ordering::SeqCst);
                state.paused.store(now_paused, Ordering::SeqCst);
                let _ = pause_item.set_text(if now_paused { "Resume idle activation" } else { "Pause idle activation" });
            }
            "explore" => {
                let _ = open_explorer(app, "");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let launch = launch::parse(std::env::args().skip(1));
    if let Launch::Preview(parent) = launch {
        // Windows Screen Saver Settings thumbnail: a static image drawn natively (see preview.rs).
        // Without a parent window handle there is nothing to draw into.
        if let Some(hwnd) = parent {
            preview::run(hwnd);
        }
        return;
    }
    let state = Arc::new(AppState::default());
    state.idle_minutes.store(launch::DEFAULT_IDLE_MINUTES, Ordering::SeqCst);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second launch is forwarded here. The OS screensaver host (e.g. Windows running the
            // .scr with /s while the idle tray is up) must still get the saver, not the explorer.
            match launch::parse(args.into_iter().skip(1)) {
                Launch::Saver => {
                    let _ = open_saver(app);
                }
                Launch::Settings => {
                    let _ = open_explorer(app, "?panel=settings");
                }
                Launch::Preview(_) => {}
                _ => {
                    let _ = open_explorer(app, "");
                }
            }
        }))
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![exit_saver, power_state, open_external, diag, boinc_status])
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
            }
            let handle = app.handle().clone();
            match launch {
                Launch::Explore => open_explorer(&handle, "")?,
                Launch::Settings => open_explorer(&handle, "?panel=settings")?,
                Launch::Saver => {
                    state.one_shot.store(true, Ordering::SeqCst);
                    open_saver(&handle)?;
                }
                Launch::Idle { minutes } => {
                    state.idle_minutes.store(minutes, Ordering::SeqCst);
                    #[cfg(target_os = "macos")]
                    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                    build_tray(&handle)?;
                    start_idle_watcher(handle.clone());
                }
                Launch::Preview(_) => unreachable!(),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // In idle-tray mode, closing the last window must not quit the app.
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                let state = app.state::<Arc<AppState>>();
                let idle_mode = app.tray_by_id("tray").is_some();
                if idle_mode && code.is_none() && !state.one_shot.load(Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
        });
}

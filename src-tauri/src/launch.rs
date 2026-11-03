//! Command-line launch modes.
//!
//! Windows screensaver hosts invoke `.scr` files with `/s` (run), `/c[:hwnd]` (configure) or
//! `/p <hwnd>` / `/p:<hwnd>` (preview inside the Control Panel thumbnail). Flags may be upper
//! or lower case and may use `-` instead of `/`. We also accept long options for the idle
//! mode used on macOS and Linux.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Launch {
    /// Normal desktop app (explorer window).
    Explore,
    /// Fullscreen saver on every monitor; exit on input.
    Saver,
    /// Settings dialog (Windows `/c`).
    Settings,
    /// Windows preview thumbnail. Not supported in v0.1: we exit immediately.
    Preview(Option<isize>),
    /// Stay in the tray and start the saver after `minutes` of user inactivity.
    Idle { minutes: u32 },
}

pub const DEFAULT_IDLE_MINUTES: u32 = 10;

pub fn parse<I: IntoIterator<Item = String>>(args: I) -> Launch {
    let args: Vec<String> = args.into_iter().collect();
    let mut i = 0;
    while i < args.len() {
        let raw = args[i].trim();
        let lower = raw.to_ascii_lowercase();
        // Split "/p:1234", "/c:1234" or "--idle=5" into flag and value.
        let (flag, inline) = match lower.split_once([':', '=']) {
            Some((f, v)) => (f.to_string(), Some(v.to_string())),
            None => (lower.clone(), None),
        };
        let flag = flag.trim_start_matches(['/', '-']);
        match flag {
            "s" | "saver" => return Launch::Saver,
            "c" | "settings" => return Launch::Settings,
            "p" | "preview" => {
                let v = inline.or_else(|| args.get(i + 1).cloned());
                return Launch::Preview(v.and_then(|s| s.trim().parse::<isize>().ok()));
            }
            "idle" => {
                let minutes = inline
                    .or_else(|| args.get(i + 1).cloned())
                    .and_then(|s| s.trim().parse::<u32>().ok())
                    .filter(|m| (1..=240).contains(m))
                    .unwrap_or(DEFAULT_IDLE_MINUTES);
                return Launch::Idle { minutes };
            }
            _ => {}
        }
        i += 1;
    }
    // Windows runs a .scr with no arguments to mean "configure".
    if cfg!(windows) && is_scr_executable() {
        return Launch::Settings;
    }
    Launch::Explore
}

fn is_scr_executable() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.extension().map(|e| e.eq_ignore_ascii_case("scr")))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn p(a: &[&str]) -> Launch {
        parse(a.iter().map(|s| s.to_string()))
    }

    #[test]
    fn windows_screensaver_flags() {
        assert_eq!(p(&["/s"]), Launch::Saver);
        assert_eq!(p(&["/S"]), Launch::Saver);
        assert_eq!(p(&["-s"]), Launch::Saver);
        assert_eq!(p(&["/c"]), Launch::Settings);
        assert_eq!(p(&["/c:1234"]), Launch::Settings);
        assert_eq!(p(&["/p", "5678"]), Launch::Preview(Some(5678)));
        assert_eq!(p(&["/P:5678"]), Launch::Preview(Some(5678)));
        assert_eq!(p(&["/p"]), Launch::Preview(None));
    }

    #[test]
    fn long_options() {
        assert_eq!(p(&["--saver"]), Launch::Saver);
        assert_eq!(p(&["--idle"]), Launch::Idle { minutes: DEFAULT_IDLE_MINUTES });
        assert_eq!(p(&["--idle", "5"]), Launch::Idle { minutes: 5 });
        assert_eq!(p(&["--idle=0"]), Launch::Idle { minutes: DEFAULT_IDLE_MINUTES });
        assert_eq!(p(&["--idle", "9999"]), Launch::Idle { minutes: DEFAULT_IDLE_MINUTES });
    }

    #[test]
    fn default_is_explore() {
        assert_eq!(p(&[]), Launch::Explore);
        assert_eq!(p(&["--unknown"]), Launch::Explore);
    }
}

//! Native backstop for "exit the screensaver on input".
//!
//! The web page already exits on input (src/platform/index.ts), but only if one of its windows
//! receives the event. On Windows a keyboard press goes only to the focused window, and a process
//! started by the screensaver host isn't guaranteed focus. So the shell also watches the OS:
//! `idle::seconds()` (GetLastInputInfo / CoreGraphics) says *whether* there was input, and the
//! cursor position says whether it was the mouse.
//!
//! Rules (same as the page): ignore the first second; exit on a key, click or wheel, or on a
//! mouse movement of more than a few pixels from where the pointer started. A small mouse jitter
//! (the pointer moved, but not far) is ignored, so a desk bump doesn't dismiss the saver.

/// How far the pointer may drift before it counts as deliberate (physical pixels).
pub const MOVE_THRESHOLD_PX: f64 = 16.0;
/// Input this soon after the saver opens is ignored (usually the launch itself).
pub const GRACE_SECS: f64 = 1.0;
/// How often the shell polls.
pub const POLL_SECS: f64 = 0.2;

#[derive(Debug, Default)]
pub struct Watch {
    origin: Option<(f64, f64)>,
    last: Option<(f64, f64)>,
    last_elapsed: Option<f64>,
}

impl Watch {
    /// One poll. `elapsed` = seconds since the saver opened; `idle` = seconds since the last
    /// input anywhere on the system; `cursor` = pointer position, if the OS reports it.
    /// Returns true when the saver should close.
    pub fn poll(&mut self, elapsed: f64, idle: Option<f64>, cursor: Option<(f64, f64)>) -> bool {
        if let Some(c) = cursor {
            if self.origin.is_none() {
                self.origin = Some(c);
            }
        }
        let moved_since_last = match (cursor, self.last) {
            (Some(c), Some(l)) => dist(c, l) > 0.5,
            _ => false,
        };
        let moved_far = match (cursor, self.origin) {
            (Some(c), Some(o)) => dist(c, o) > MOVE_THRESHOLD_PX,
            _ => false,
        };
        self.last = cursor.or(self.last);
        let since_last_poll = self.last_elapsed.map_or(0.0, |t| elapsed - t);
        self.last_elapsed = Some(elapsed);
        if elapsed < GRACE_SECS {
            // Keep re-anchoring during the grace period so launch-time movement is forgiven.
            self.origin = cursor.or(self.origin);
            return false;
        }
        if moved_far {
            return true;
        }
        // Input since the previous poll that didn't move the pointer: a key, click or wheel.
        // (Input that did move the pointer, but not far, is jitter and is ignored.)
        let fresh_input = idle.is_some_and(|i| i < since_last_poll && i < elapsed - GRACE_SECS);
        fresh_input && !moved_since_last
    }
}

fn dist(a: (f64, f64), b: (f64, f64)) -> f64 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Run a sequence of (elapsed, idle, cursor) polls; return the elapsed time of the first exit.
    fn run(steps: &[(f64, Option<f64>, Option<(f64, f64)>)]) -> Option<f64> {
        let mut w = Watch::default();
        steps.iter().find(|(t, i, c)| w.poll(*t, *i, *c)).map(|s| s.0)
    }

    #[test]
    fn ignores_everything_during_the_grace_period() {
        assert_eq!(run(&[(0.2, Some(0.0), Some((0.0, 0.0))), (0.6, Some(0.0), Some((300.0, 0.0)))]), None);
    }

    #[test]
    fn a_key_press_exits_even_without_pointer_movement() {
        let still = Some((500.0, 500.0));
        assert_eq!(run(&[(0.2, Some(0.2), still), (1.2, Some(1.2), still), (1.4, Some(0.05), still)]), Some(1.4));
    }

    #[test]
    fn a_deliberate_mouse_move_exits() {
        assert_eq!(run(&[(1.2, Some(1.2), Some((0.0, 0.0))), (1.4, Some(0.1), Some((40.0, 0.0)))]), Some(1.4));
    }

    #[test]
    fn small_jitter_is_ignored() {
        let steps = [
            (1.2, Some(1.2), Some((100.0, 100.0))),
            (1.4, Some(0.05), Some((103.0, 101.0))),
            (1.6, Some(0.05), Some((101.0, 104.0))),
            (1.8, Some(0.25), Some((101.0, 104.0))),
            (5.0, Some(3.4), Some((101.0, 104.0))),
        ];
        assert_eq!(run(&steps), None);
    }

    #[test]
    fn launch_time_movement_is_forgiven() {
        // The pointer moved a lot during launch, then stayed put: no exit.
        let steps = [(0.2, Some(0.0), Some((0.0, 0.0))), (0.8, Some(0.0), Some((400.0, 300.0))), (1.2, Some(0.6), Some((400.0, 300.0))), (3.0, Some(2.4), Some((400.0, 300.0)))];
        assert_eq!(run(&steps), None);
    }

    #[test]
    fn no_idle_information_means_mouse_only() {
        // Wayland without an idle API: keys are left to the page; movement still exits.
        assert_eq!(run(&[(1.2, None, Some((0.0, 0.0))), (1.4, None, Some((0.0, 0.0)))]), None);
        assert_eq!(run(&[(1.2, None, Some((0.0, 0.0))), (1.4, None, Some((50.0, 0.0)))]), Some(1.4));
    }
}

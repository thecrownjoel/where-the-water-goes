// Platform integration. The web build runs unchanged in a browser; inside Tauri these calls
// reach native commands defined in src-tauri/src/lib.rs.

export type LaunchMode = 'explore' | 'saver' | 'settings';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function launchMode(): LaunchMode {
  const m = new URLSearchParams(location.search).get('mode');
  return m === 'saver' || m === 'settings' ? m : 'explore';
}

/**
 * Set when the page runs inside the native macOS `.saver` bundle (`?host=macos-saver`).
 * There the system screensaver host owns input and dismissal, so the page never exits itself.
 */
export function embeddedHost(): 'macos-saver' | null {
  return new URLSearchParams(location.search).get('host') === 'macos-saver' ? 'macos-saver' : null;
}

/** The small thumbnail pane in macOS System Settings (`?preview=1`): globe only, no text. */
export function isPreviewPane(): boolean {
  return embeddedHost() !== null && new URLSearchParams(location.search).get('preview') === '1';
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** Leave screensaver mode. Native: closes every saver window. Browser: exits fullscreen. */
export async function exitSaver(): Promise<void> {
  if (isTauri()) {
    await invoke('exit_saver');
  } else if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined);
  }
}

export interface PowerState { onBattery: boolean | null; }

export async function powerState(): Promise<PowerState> {
  return (await invoke<PowerState>('power_state')) ?? { onBattery: null };
}

export async function openExternal(url: string): Promise<void> {
  if (!/^https:\/\//.test(url)) return;
  if (isTauri()) {
    await invoke('open_external', { url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Exit the saver on deliberate input. Small mouse jitter (< 12 px) is ignored, as native
 * screensavers do, so a desk bump doesn't dismiss it.
 */
export interface SaverExitDeps {
  target?: Pick<EventTarget, 'addEventListener'>;
  now?: () => number;
}

/**
 * Exit the screensaver on real user input: a key, click, touch, wheel, or a mouse movement
 * of more than 12 px from where the pointer was first seen. Input in the first 800 ms is
 * ignored (it is usually the launch itself). Calls onExit at most once.
 */
export function armSaverExit(onExit: () => void, deps: SaverExitDeps = {}) {
  const target = deps.target ?? window;
  const now = deps.now ?? (() => performance.now());
  let origin: { x: number; y: number } | null = null;
  let done = false;
  const armedAt = now();
  const exit = () => {
    if (done || now() - armedAt < 800) return;
    done = true;
    onExit();
  };
  target.addEventListener('mousemove', (e) => {
    const m = e as MouseEvent;
    if (!origin) { origin = { x: m.clientX, y: m.clientY }; return; }
    if (Math.hypot(m.clientX - origin.x, m.clientY - origin.y) > 12) exit();
  });
  for (const ev of ['mousedown', 'keydown', 'touchstart', 'wheel']) target.addEventListener(ev, exit);
}

/** Send a diagnostic line to the native shell (printed only when WTRSHD_DIAG=1). */
export async function diag(msg: string): Promise<void> {
  if (isTauri()) await invoke('diag', { msg }).catch(() => undefined);
  else console.info('[wtrshd]', msg);
}

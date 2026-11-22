// Volunteer computing through BOINC (https://boinc.berkeley.edu).
//
// This app computes nothing itself. The user installs BOINC and attaches it to a research
// project; BOINC runs that project's tasks while the computer is idle, which is when the
// screensaver is showing. The native shell reads BOINC's local status (read-only, no password;
// see src-tauri/src/boinc.rs) and we show it here, with no inflated "impact" numbers.

import { escapeHtml } from '../ui/format.ts';

export interface BoincProject {
  name: string;
  masterUrl: string;
  hostTotalCredit: number;
  hostExpavgCredit: number;
  suspended: boolean;
  tasksRunning: number;
  tasksQueued: number;
}

export type BoincStatus =
  | { state: 'notRunning' }
  | { state: 'unavailable'; reason: string }
  | { state: 'running'; version: string | null; taskMode: string | null; suspendReason: number | null; projects: BoincProject[] }
  /** Browser build or macOS .saver: no native shell to ask. */
  | { state: 'unsupported' };

export const LINKS = {
  boinc: 'https://boinc.berkeley.edu/download.php',
  projects: 'https://boinc.berkeley.edu/projects.php',
  cpdn: 'https://main.cpdn.org/',
  /** Run by the BOINC team at UC Berkeley: you pick science areas, it assigns projects. */
  scienceUnited: 'https://scienceunited.org/su_join.php',
} as const;
/** What the user types into BOINC Manager → Add project. */
export const CPDN_MASTER_URL = 'https://climateprediction.net/';

const n = (v: number) => Math.round(v).toLocaleString('en-US');
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** Validate the untyped IPC reply so a malformed message can't break the overlay. */
export function parseStatus(raw: unknown): BoincStatus {
  if (typeof raw !== 'object' || raw === null) return { state: 'unsupported' };
  const r = raw as Record<string, unknown>;
  if (r.state === 'notRunning') return { state: 'notRunning' };
  if (r.state === 'unavailable') return { state: 'unavailable', reason: String(r.reason ?? '') };
  if (r.state !== 'running' || !Array.isArray(r.projects)) return { state: 'unsupported' };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const projects = r.projects.filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null).map((p) => ({
    name: String(p.name ?? '') || String(p.masterUrl ?? ''),
    masterUrl: String(p.masterUrl ?? ''),
    hostTotalCredit: num(p.hostTotalCredit),
    hostExpavgCredit: num(p.hostExpavgCredit),
    suspended: p.suspended === true,
    tasksRunning: num(p.tasksRunning),
    tasksQueued: num(p.tasksQueued),
  }));
  return {
    state: 'running',
    version: typeof r.version === 'string' ? r.version : null,
    taskMode: typeof r.taskMode === 'string' ? r.taskMode : null,
    suspendReason: typeof r.suspendReason === 'number' ? r.suspendReason : null,
    projects,
  };
}

/**
 * One short line for the saver's status bar, or null when there is nothing true to say
 * (BOINC not running, or not attached to any active project).
 */
export function contributionLine(s: BoincStatus): string | null {
  if (s.state !== 'running') return null;
  const active = s.projects.filter((p) => !p.suspended);
  if (!active.length) return null;
  const running = active.reduce((a, p) => a + p.tasksRunning, 0);
  const queued = active.reduce((a, p) => a + p.tasksQueued, 0);
  const credit = active.reduce((a, p) => a + p.hostTotalCredit, 0);
  const names = active.length <= 2 ? active.map((p) => p.name).join(' & ') : `${active.length} projects`;
  const work = running > 0 ? `computing ${plural(running, 'task')}`
    : queued > 0 ? `${plural(queued, 'task')} waiting` : 'no tasks right now';
  return `BOINC · ${names} · ${work} · ${n(credit)} credit from this computer`;
}

/**
 * BOINC's own reason codes for pausing work (SUSPEND_REASON_* in BOINC's common_defs.h).
 * Only the common ones are worded; anything else is reported by number.
 */
const SUSPEND_REASONS: Record<number, string> = {
  1: 'the computer is on battery power',
  2: 'the computer is in use (BOINC waits until it is idle, which is when the screensaver runs)',
  4: 'it was paused in BOINC Manager',
  8: 'of the time-of-day limits in its preferences',
  16: 'it is running benchmarks',
  32: 'of disk-space limits',
  128: 'there has been no recent input',
  256: 'it has only just started',
  512: 'a program listed as exclusive is running',
  1024: 'other programs are using the CPU',
};

export function suspendText(reason: number | null): string {
  if (!reason) return '';
  return `BOINC has paused work because ${SUSPEND_REASONS[reason] ?? `of reason code ${reason}`}.`;
}

function modeText(mode: string | null): string {
  switch (mode) {
    case 'auto': return 'BOINC is set to compute according to its preferences (by default, while the computer is idle).';
    case 'always': return 'BOINC is set to compute always.';
    case 'never': return 'BOINC computing is suspended (set to never). Resume it in BOINC Manager.';
    default: return '';
  }
}

const link = (href: string, text: string) => `<a data-ext href="${escapeHtml(href)}">${escapeHtml(text)} ↗</a>`;

const HOW_TO = `
  <ol class="small steps">
    <li>${link(LINKS.boinc, 'Install BOINC')}, the free, open-source platform from UC Berkeley behind SETI@home.</li>
    <li>Choose what to support:
      <ul>
        <li><strong>Climate research:</strong> in BOINC Manager choose <em>Add project</em> and enter <code>${CPDN_MASTER_URL}</code> for ${link(LINKS.cpdn, 'climateprediction.net')} (University of Oxford climate models). It has the most work for 64-bit Linux; Mac and Windows computers may get tasks only some of the time.</li>
        <li><strong>Always have work:</strong> ${link(LINKS.scienceUnited, 'join Science United')}, run by the BOINC team at UC Berkeley. You pick science areas (environmental science among them) and it assigns your computer to projects, so it stays busy even when one project has nothing for it.</li>
      </ul>
    </li>
    <li>Leave this screensaver on. BOINC computes while your computer is idle, and this panel and the saver show what it is doing.</li>
  </ol>
  <p class="small">${link(LINKS.projects, 'Every BOINC project')} works with this panel.</p>`;

/** HTML for the Settings → Volunteer computing panel. All dynamic text is escaped. */
export function panelHtml(s: BoincStatus): string {
  const intro = '<p class="small">Where the Water Goes does not run computations itself. You can donate idle computer time to research through <strong>BOINC</strong>, which runs alongside this screensaver.</p>';
  switch (s.state) {
    case 'unsupported':
      return `${intro}<p class="small">BOINC status is shown in the desktop app.</p>${HOW_TO}`;
    case 'notRunning':
      return `${intro}<p class="small"><strong>BOINC is not running on this computer.</strong></p>${HOW_TO}`;
    case 'unavailable':
      return `${intro}<p class="small">BOINC answered but its status couldn't be read (${escapeHtml(s.reason)}). Open BOINC Manager to see what it is doing.</p>`;
    case 'running': {
      if (!s.projects.length) {
        return `${intro}<p class="small"><strong>BOINC${s.version ? ` ${escapeHtml(s.version)}` : ''} is running but is not attached to a project.</strong> In BOINC Manager choose <em>Add project</em> and enter <code>${CPDN_MASTER_URL}</code> for ${link(LINKS.cpdn, 'climateprediction.net')}, or ${link(LINKS.scienceUnited, 'join Science United')} to have projects picked for you.</p>`;
      }
      const idle = s.projects.every((p) => p.suspended || (p.tasksRunning === 0 && p.tasksQueued === 0));
      const rows = s.projects.map((p) => `
        <li><strong>${escapeHtml(p.name)}</strong>${p.suspended ? ' <span class="muted">(suspended)</span>' : ''}<br>
          <span class="small">${p.tasksRunning} running · ${p.tasksQueued} waiting · ${n(p.hostTotalCredit)} credit from this computer (recent average ${n(p.hostExpavgCredit)}/day)</span></li>`).join('');
      return `${intro}
        <p class="small"><strong>BOINC${s.version ? ` ${escapeHtml(s.version)}` : ''} is running.</strong> ${escapeHtml(modeText(s.taskMode))} ${escapeHtml(suspendText(s.suspendReason))}</p>
        <ul class="boinc-projects">${rows}</ul>
        ${idle ? `<p class="small">No tasks right now. Projects send work in batches, and some have little for Mac or Windows; ${link(LINKS.scienceUnited, 'Science United')} spreads your computer across projects that have work.</p>` : ''}
        <p class="small">Credit is BOINC's measure of validated work, granted by each project. Results belong to the projects; this app only reports what BOINC says.</p>`;
    }
  }
}

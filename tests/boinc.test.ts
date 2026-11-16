import { describe, expect, it } from 'vitest';
import { contributionLine, panelHtml, parseStatus, type BoincStatus } from '../src/volunteer/boinc.ts';

const running = (projects: Partial<Extract<BoincStatus, { state: 'running' }>['projects'][number]>[]): BoincStatus => ({
  state: 'running', version: '8.0.4', taskMode: 'auto', suspendReason: 0,
  projects: projects.map((p) => ({ name: 'climateprediction.net', masterUrl: 'https://climateprediction.net/', hostTotalCredit: 0, hostExpavgCredit: 0, suspended: false, tasksRunning: 0, tasksQueued: 0, ...p })),
});

describe('parseStatus', () => {
  it('accepts the native shape', () => {
    const s = parseStatus({ state: 'running', version: '8.0.4', taskMode: 'auto', suspendReason: 0, projects: [{ name: 'CPDN', masterUrl: 'u', hostTotalCredit: 5, hostExpavgCredit: 1, suspended: false, tasksRunning: 1, tasksQueued: 2 }] });
    expect(s.state).toBe('running');
    if (s.state === 'running') expect(s.projects[0]).toMatchObject({ name: 'CPDN', tasksRunning: 1, hostTotalCredit: 5 });
  });
  it('treats garbage as unsupported', () => {
    expect(parseStatus(null).state).toBe('unsupported');
    expect(parseStatus({ state: 'running', projects: 'x' }).state).toBe('unsupported');
    expect(parseStatus({ state: 'notRunning' }).state).toBe('notRunning');
  });
  it('coerces bad numbers to zero', () => {
    const s = parseStatus({ state: 'running', projects: [{ name: 'a', masterUrl: 'u', hostTotalCredit: 'lots', tasksRunning: NaN }] });
    if (s.state !== 'running') throw new Error('expected running');
    expect(s.projects[0].hostTotalCredit).toBe(0);
    expect(s.projects[0].tasksRunning).toBe(0);
  });
});

describe('contributionLine', () => {
  it('is null unless BOINC runs an active project', () => {
    expect(contributionLine({ state: 'notRunning' })).toBeNull();
    expect(contributionLine(running([]))).toBeNull();
    expect(contributionLine(running([{ suspended: true, tasksRunning: 1 }]))).toBeNull();
  });
  it('summarizes running work and credit', () => {
    expect(contributionLine(running([{ tasksRunning: 2, hostTotalCredit: 12345.6 }])))
      .toBe('BOINC · climateprediction.net · computing 2 tasks · 12,346 credit from this computer');
  });
  it('says when tasks are only waiting', () => {
    expect(contributionLine(running([{ tasksQueued: 1 }]))).toContain('1 task waiting');
  });
});

describe('panelHtml', () => {
  it('escapes project names', () => {
    expect(panelHtml(running([{ name: '<img src=x onerror=alert(1)>' }]))).not.toContain('<img');
  });
  it('explains how to start when BOINC is absent', () => {
    const html = panelHtml({ state: 'notRunning' });
    expect(html).toContain('not running');
    expect(html).toContain('https://boinc.berkeley.edu/download.php');
  });
});

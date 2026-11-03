import { describe, it, expect, afterEach, vi } from 'vitest';
import { embeddedHost, isPreviewPane, launchMode } from '../src/platform/index.ts';

const at = (search: string) => vi.stubGlobal('location', { search });

describe('native macOS .saver host flags', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('recognises the .saver host and its preview pane', () => {
    at('?mode=saver&host=macos-saver&preview=1');
    expect(launchMode()).toBe('saver');
    expect(embeddedHost()).toBe('macos-saver');
    expect(isPreviewPane()).toBe(true);
  });

  it('full-size .saver is not the preview pane', () => {
    at('?mode=saver&host=macos-saver');
    expect(isPreviewPane()).toBe(false);
  });

  it('ignores unknown hosts, and preview=1 outside the .saver', () => {
    at('?mode=saver&host=other&preview=1');
    expect(embeddedHost()).toBeNull();
    expect(isPreviewPane()).toBe(false);
  });
});

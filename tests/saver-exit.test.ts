import { describe, it, expect } from 'vitest';
import { armSaverExit } from '../src/platform/index.ts';

function harness() {
  const target = new EventTarget();
  let t = 0;
  let exits = 0;
  armSaverExit(() => exits++, { target, now: () => t });
  const move = (x: number, y: number) => {
    const e = new Event('mousemove') as Event & { clientX: number; clientY: number };
    Object.assign(e, { clientX: x, clientY: y });
    target.dispatchEvent(e);
  };
  return {
    advance: (ms: number) => { t += ms; },
    move,
    fire: (type: string) => target.dispatchEvent(new Event(type)),
    get exits() { return exits; },
  };
}

describe('armSaverExit', () => {
  it('ignores input during the first 800 ms', () => {
    const h = harness();
    h.fire('keydown');
    h.move(0, 0); h.move(100, 100);
    expect(h.exits).toBe(0);
    h.advance(801);
    h.fire('keydown');
    expect(h.exits).toBe(1);
  });

  it('ignores small mouse jitter but exits on a real movement', () => {
    const h = harness();
    h.advance(1000);
    h.move(500, 500);
    h.move(505, 508); // 9.4 px
    expect(h.exits).toBe(0);
    h.move(520, 500);
    expect(h.exits).toBe(1);
  });

  it.each(['mousedown', 'keydown', 'touchstart', 'wheel'])('exits on %s', (type) => {
    const h = harness();
    h.advance(1000);
    h.fire(type);
    expect(h.exits).toBe(1);
  });

  it('calls onExit only once', () => {
    const h = harness();
    h.advance(1000);
    h.fire('keydown'); h.fire('mousedown'); h.move(0, 0); h.move(50, 50);
    expect(h.exits).toBe(1);
  });
});

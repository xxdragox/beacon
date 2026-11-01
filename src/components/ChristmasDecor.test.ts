import { describe, it, expect } from 'vitest';
import { lightString } from './ChristmasDecor';

describe('lightString', () => {
  const W = 700, H = 230, INSET = 18;
  const { path, bulbs } = lightString(W, H);

  it('draws one closed loop around the box, starting at the top-left anchor', () => {
    expect(path.startsWith(`M${INSET} ${INSET}`)).toBe(true);
    expect(path.trim().endsWith(`${INSET} ${INSET}`)).toBe(true);
  });

  it('puts about one bulb every 72 px of wire', () => {
    const perimeter = 2 * (W - 2 * INSET) + 2 * (H - 2 * INSET);
    expect(bulbs.length).toBeGreaterThan(perimeter / 72 - 4);
    expect(bulbs.length).toBeLessThan(perimeter / 72 + 4);
  });

  it('hangs every bulb outside the anchor line, pointing away from the content', () => {
    for (const b of bulbs) {
      const outside = b.y < INSET || b.y > H - INSET || b.x < INSET || b.x > W - INSET;
      expect(outside).toBe(true);
    }
    const top = bulbs.filter((b) => b.y < INSET);
    const bottom = bulbs.filter((b) => b.y > H - INSET);
    expect(top.every((b) => Math.abs(Math.abs(b.angle) - 180) < 1e-9)).toBe(true); // hanging up
    expect(bottom.every((b) => Math.abs(b.angle) < 1e-9)).toBe(true); // hanging down
  });

  it('never puts two bulbs of the same colour side by side', () => {
    for (let i = 1; i < bulbs.length; i++) expect(bulbs[i].color).not.toBe(bulbs[i - 1].color);
  });

  it('still makes a loop for a tiny box', () => {
    const tiny = lightString(40, 40);
    expect(tiny.bulbs.length).toBe(4);
  });
});

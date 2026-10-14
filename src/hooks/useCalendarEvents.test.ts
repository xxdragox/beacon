import { describe, it, expect } from 'vitest';
import { mapWithLimit } from './useCalendarEvents';

describe('mapWithLimit', () => {
  it('never runs more than the limit at once and keeps input order', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n * 3));
      inFlight--;
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([50, 10, 40, 20, 30, 60, 70]);
  });

  it('handles fewer items than the limit, and none', async () => {
    expect(await mapWithLimit([1], 3, async (n) => n + 1)).toEqual([2]);
    expect(await mapWithLimit([], 3, async (n: number) => n)).toEqual([]);
  });
});

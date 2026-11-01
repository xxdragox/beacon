import { describe, it, expect } from 'vitest';
import { christmasPhase, nextChristmasYear } from './christmas-countdown';

describe('nextChristmasYear', () => {
  it('is this year up to and including Christmas Day', () => {
    expect(nextChristmasYear(new Date(2026, 0, 1))).toBe(2026);
    expect(nextChristmasYear(new Date(2026, 10, 1))).toBe(2026);
    expect(nextChristmasYear(new Date(2026, 11, 25, 23, 59))).toBe(2026);
  });

  it('is next year from 26 December', () => {
    expect(nextChristmasYear(new Date(2026, 11, 26))).toBe(2027);
    expect(nextChristmasYear(new Date(2026, 11, 31, 23, 59))).toBe(2027);
  });
});

describe('christmasPhase', () => {
  it('is off when no year is set', () => {
    expect(christmasPhase(new Date(2026, 10, 1), 0)).toEqual({ kind: 'off' });
    expect(christmasPhase(new Date(2026, 10, 1), undefined)).toEqual({ kind: 'off' });
  });

  it('splits the remaining time into days, hours, minutes and seconds', () => {
    expect(christmasPhase(new Date(2026, 11, 23, 13, 29, 15), 2026)).toEqual({
      kind: 'countdown', days: 1, hours: 10, minutes: 30, seconds: 45,
    });
  });

  it('counts a whole day exactly', () => {
    expect(christmasPhase(new Date(2026, 11, 24), 2026)).toEqual({
      kind: 'countdown', days: 1, hours: 0, minutes: 0, seconds: 0,
    });
  });

  it('rounds a partial second up, so it never shows zero before midnight', () => {
    const almost = new Date(new Date(2026, 11, 25).getTime() - 400);
    expect(christmasPhase(almost, 2026)).toEqual({
      kind: 'countdown', days: 0, hours: 0, minutes: 0, seconds: 1,
    });
  });

  it('shows the greeting all of Christmas Day', () => {
    expect(christmasPhase(new Date(2026, 11, 25), 2026)).toEqual({ kind: 'christmas' });
    expect(christmasPhase(new Date(2026, 11, 25, 23, 59, 59), 2026)).toEqual({ kind: 'christmas' });
  });

  it('turns off from 26 December', () => {
    expect(christmasPhase(new Date(2026, 11, 26), 2026)).toEqual({ kind: 'off' });
    expect(christmasPhase(new Date(2027, 5, 1), 2026)).toEqual({ kind: 'off' });
  });

  it('counts down across a whole year when set for next Christmas', () => {
    const phase = christmasPhase(new Date(2026, 11, 26), 2027);
    expect(phase.kind).toBe('countdown');
    if (phase.kind === 'countdown') expect(phase.days).toBe(364);
  });

  it('stays consistent across the end of daylight saving time', () => {
    // Elapsed time, not wall-clock: one real second later is one second less.
    const a = new Date(2026, 10, 1, 12, 0, 0);
    const b = new Date(a.getTime() + 1000);
    const pa = christmasPhase(a, 2026);
    const pb = christmasPhase(b, 2026);
    const secs = (p: typeof pa) =>
      p.kind === 'countdown' ? p.days * 86_400 + p.hours * 3_600 + p.minutes * 60 + p.seconds : NaN;
    expect(secs(pa) - secs(pb)).toBe(1);
  });
});

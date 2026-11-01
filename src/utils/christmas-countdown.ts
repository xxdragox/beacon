/**
 * Christmas countdown for the screen saver.
 *
 * The countdown is tied to one Christmas (`year`): it counts down to midnight
 * local time on 25 December of that year, shows a greeting all of Christmas
 * Day, and is "off" from 26 December onward, so the screen saver goes back to
 * the normal clock until someone turns the countdown on again.
 *
 * All maths uses absolute milliseconds, so a daylight-saving change between
 * now and Christmas doesn't shift the hours.
 */

export type ChristmasPhase =
  | { kind: 'countdown'; days: number; hours: number; minutes: number; seconds: number }
  | { kind: 'christmas' }
  | { kind: 'off' };

/** The year of the next Christmas Day that hasn't ended yet (today counts on the 25th). */
export function nextChristmasYear(now: Date): number {
  const pastChristmas = now.getMonth() === 11 && now.getDate() > 25;
  return now.getFullYear() + (pastChristmas ? 1 : 0);
}

/** Where `now` is relative to Christmas `year`. `year` 0 (or missing) means the countdown is off. */
export function christmasPhase(now: Date, year: number | undefined): ChristmasPhase {
  if (!year) return { kind: 'off' };
  const start = new Date(year, 11, 25).getTime(); // local midnight, 25 Dec
  const end = new Date(year, 11, 26).getTime(); // local midnight, 26 Dec
  const t = now.getTime();
  if (t >= end) return { kind: 'off' };
  if (t >= start) return { kind: 'christmas' };

  // Round up so the display reaches 0:00:00:00 exactly at midnight, not a second early.
  const total = Math.ceil((start - t) / 1000);
  return {
    kind: 'countdown',
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

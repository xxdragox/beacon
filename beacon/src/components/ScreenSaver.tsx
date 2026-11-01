import { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { useTranslation } from '../i18n';
import { christmasPhase } from '../utils/christmas-countdown';

const POSITION_INTERVAL = 30_000; // move clock every 30s

type Phase = 'awake' | 'dim' | 'screensaver';

interface ScreenSaverProps {
  enabled?: boolean;
  dimTimeoutMin?: number;
  screenSaverTimeoutMin?: number;
  /** Christmas this countdown runs to; 0 shows the normal clock. */
  christmasCountdownYear?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function ScreenSaver({
  enabled = true,
  dimTimeoutMin = 5,
  screenSaverTimeoutMin = 10,
  christmasCountdownYear = 0,
}: ScreenSaverProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('awake');
  const [now, setNow] = useState(new Date());
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const lastActivityRef = useRef(Date.now());

  const dimAfterMs = dimTimeoutMin * 60 * 1000;
  const screenSaverAfterMs = screenSaverTimeoutMin * 60 * 1000;

  const wake = useCallback(() => {
    lastActivityRef.current = Date.now();
    setPhase('awake');
  }, []);

  // Listen for user interaction globally
  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [wake]);

  // Idle timer — check every 10 seconds
  useEffect(() => {
    if (!enabled) {
      setPhase('awake');
      return;
    }

    const check = () => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= screenSaverAfterMs) {
        setPhase('screensaver');
      } else if (idle >= dimAfterMs) {
        setPhase('dim');
      }
    };

    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, [enabled, dimAfterMs, screenSaverAfterMs]);

  // Clock tick for screensaver
  useEffect(() => {
    if (phase !== 'screensaver') return;
    setNow(new Date()); // don't show a stale time (or countdown) for the first second
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Move screensaver clock position periodically to prevent burn-in
  useEffect(() => {
    if (phase !== 'screensaver') return;

    const move = () => {
      // The countdown is wider (up to ~55vw), so it stays nearer the middle.
      const wide = christmasPhase(new Date(), christmasCountdownYear).kind !== 'off';
      setPosition(wide ? {
        x: 32 + Math.random() * 36, // 32%–68%
        y: 28 + Math.random() * 44, // 28%–72%
      } : {
        x: 15 + Math.random() * 70, // 15%–85%
        y: 15 + Math.random() * 70,
      });
    };

    move(); // initial position
    const interval = setInterval(move, POSITION_INTERVAL);
    return () => clearInterval(interval);
  }, [phase, christmasCountdownYear]);

  if (!enabled || phase === 'awake') return null;

  if (phase === 'dim') {
    return <div className="screensaver-dim" onClick={wake} />;
  }

  const xmas = christmasPhase(now, christmasCountdownYear);

  return (
    <div className="screensaver-overlay" onClick={wake}>
      <div
        className="screensaver-clock"
        style={{ left: `${position.x}%`, top: `${position.y}%` }}
      >
        {xmas.kind === 'countdown' ? (
          <>
            <div className="screensaver-countdown" role="timer">
              {([
                [xmas.days, 'screenSaver.countdown.days'],
                [xmas.hours, 'screenSaver.countdown.hours'],
                [xmas.minutes, 'screenSaver.countdown.minutes'],
                [xmas.seconds, 'screenSaver.countdown.seconds'],
              ] as const).map(([value, label], i) => (
                <div key={label} className="screensaver-countdown-group">
                  {i > 0 && <span className="screensaver-countdown-sep">:</span>}
                  <div className="screensaver-countdown-unit">
                    <div className="screensaver-countdown-value">{i === 0 ? value : pad(value)}</div>
                    <div className="screensaver-countdown-label">{t(label)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="screensaver-date">
              {t('screenSaver.countdown.untilChristmas')} · {format(now, 'h:mm a')}
            </div>
          </>
        ) : xmas.kind === 'christmas' ? (
          <>
            <div className="screensaver-greeting">{t('screenSaver.countdown.merryChristmas')} 🎄</div>
            <div className="screensaver-date">{format(now, 'h:mm a · EEEE, MMMM d')}</div>
          </>
        ) : (
          <>
            <div className="screensaver-time">{format(now, 'h:mm')}</div>
            <div className="screensaver-date">{format(now, 'EEEE, MMMM d')}</div>
          </>
        )}
      </div>
    </div>
  );
}

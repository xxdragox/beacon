import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { useTranslation } from '../i18n';
import { christmasPhase } from '../utils/christmas-countdown';
import { ChristmasLights, Snowfall } from './ChristmasDecor';
import { BirthdayCake, Streamers, useNameList } from './BirthdayDecor';
import { birthdaysOn } from '../utils/birthdays';
import type { FamilyMember } from '../types/family';

const POSITION_INTERVAL = 30_000; // move clock every 30s

type Phase = 'awake' | 'dim' | 'screensaver';

interface ScreenSaverProps {
  enabled?: boolean;
  dimTimeoutMin?: number;
  screenSaverTimeoutMin?: number;
  /** Christmas this countdown runs to; 0 shows the normal clock. */
  christmasCountdownYear?: number;
  /** Family members; on someone's birthday the screen saver celebrates it (over Christmas). */
  members?: FamilyMember[];
}

const NO_MEMBERS: FamilyMember[] = [];

const pad = (n: number) => String(n).padStart(2, '0');

export function ScreenSaver({
  enabled = true,
  dimTimeoutMin = 5,
  screenSaverTimeoutMin = 10,
  christmasCountdownYear = 0,
  members = NO_MEMBERS,
}: ScreenSaverProps) {
  const { t } = useTranslation();
  const nameList = useNameList();
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
      // The countdown with its lights and two lines below is up to ~63vw wide and ~400px
      // tall, and the birthday cake + greeting is similar, so they stay nearer the middle.
      const today = new Date();
      const wide = birthdaysOn(today, members).length > 0
        || christmasPhase(today, christmasCountdownYear).kind !== 'off';
      setPosition(wide ? {
        x: 33 + Math.random() * 34, // 33%–67%
        y: 33 + Math.random() * 34, // 33%–67%
      } : {
        x: 15 + Math.random() * 70, // 15%–85%
        y: 15 + Math.random() * 70,
      });
    };

    move(); // initial position
    const interval = setInterval(move, POSITION_INTERVAL);
    return () => clearInterval(interval);
  }, [phase, christmasCountdownYear, members]);

  if (!enabled || phase === 'awake') return null;

  if (phase === 'dim') {
    return <div className="screensaver-dim" onClick={wake} />;
  }

  const birthdays = birthdaysOn(now, members);
  // A birthday takes over from the Christmas countdown for the day.
  const xmas = birthdays.length > 0 ? { kind: 'off' as const } : christmasPhase(now, christmasCountdownYear);

  return (
    <div className="screensaver-overlay" onClick={wake}>
      {xmas.kind !== 'off' && <Snowfall />}
      {birthdays.length > 0 && (
        <Streamers className="screensaver-bday-streamers" ribbons={7} length={170} flags={30} confetti={10} />
      )}
      <div
        className="screensaver-clock"
        style={{ left: `${position.x}%`, top: `${position.y}%` }}
      >
        {birthdays.length > 0 ? (
          <div className="screensaver-bday" style={{ '--bday-color': birthdays[0].color } as CSSProperties}>
            <BirthdayCake color={birthdays[0].color} />
            <div className="screensaver-bday-greeting">
              {t('birthday.happyBirthday', { name: nameList(birthdays) })} 🎉
            </div>
            <div className="screensaver-xmas-caption">{format(now, 'EEEE, MMMM d')}</div>
            <div className="screensaver-xmas-time">{format(now, 'h:mm a')}</div>
          </div>
        ) : xmas.kind === 'countdown' ? (
          <>
            <ChristmasLights>
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
                      <div className="screensaver-countdown-value">
                        {/* One fixed-width slot per digit: the font ignores tabular-nums, so
                            otherwise the row (and the lights around it) resizes every second. */}
                        {pad(value).split('').map((d, j) => (
                          <span key={j} className="screensaver-countdown-digit">{d}</span>
                        ))}
                      </div>
                      <div className="screensaver-countdown-label">{t(label)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ChristmasLights>
            <div className="screensaver-xmas-caption">{t('screenSaver.countdown.untilChristmas')}</div>
            <div className="screensaver-xmas-time">{format(now, 'h:mm a')}</div>
          </>
        ) : xmas.kind === 'christmas' ? (
          <>
            <ChristmasLights>
              <div className="screensaver-greeting">{t('screenSaver.countdown.merryChristmas')} 🎄</div>
            </ChristmasLights>
            <div className="screensaver-xmas-caption">{format(now, 'EEEE, MMMM d')}</div>
            <div className="screensaver-xmas-time">{format(now, 'h:mm a')}</div>
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

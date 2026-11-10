import { memo, type CSSProperties } from 'react';
import type { FamilyMember } from '../types/family';
import { useTranslation } from '../i18n';

/*
 * Birthday decorations: a cake with three flickering candles, party bunting,
 * hanging streamers and confetti.
 *
 * Wall tablets can have weak GPUs (see ChristmasDecor.tsx), so the SVG art is
 * static and only `opacity`/`transform` are animated, on HTML elements with
 * their own compositor layers. `prefers-reduced-motion` stops all of it
 * (birthday.css).
 */

export const PARTY_COLORS = ['#ff5c8a', '#ffc94a', '#4fd1a5', '#5aa9ff', '#b57bff', '#ff8f4a'];

/** Candle x positions on the cake's 64-unit-wide viewBox. */
const CANDLES = [
  { x: 22, stripe: '#ff5c8a' },
  { x: 32, stripe: '#5aa9ff' },
  { x: 42, stripe: '#4fd1a5' },
];

interface BirthdayCakeProps {
  /** Width and height in px (or any CSS length); leave out to size it from CSS. */
  size?: number | string;
  /** Sponge color, usually the birthday person's color. */
  color?: string;
  className?: string;
  title?: string;
}

/** A two-tier cake with three candles whose flames flicker. */
export const BirthdayCake = memo(function BirthdayCake({ size, color = '#ff8fb1', className, title }: BirthdayCakeProps) {
  return (
    <span
      className={`bday-cake ${className ?? ''}`}
      style={size === undefined ? undefined : { width: size, height: size }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
        {/* plate */}
        <ellipse cx="32" cy="58.5" rx="29" ry="3.5" fill="#e6e1ea" />
        <ellipse cx="32" cy="57.5" rx="29" ry="3" fill="#ffffff" />
        {/* bottom tier */}
        <rect x="8" y="39" width="48" height="18" rx="3" fill={color} />
        <rect x="8" y="39" width="48" height="18" rx="3" fill="#000" opacity="0.08" />
        <path
          d="M8 42c0-2 1.3-3 3-3h42c1.7 0 3 1 3 3v2c-2 0-2 3-4 3s-2-3-4-3-2 4-4 4-2-4-4-4-2 3-4 3-2-3-4-3-2 4-4 4-2-4-4-4-2 3-4 3-2-3-4-3-2 2-3 2z"
          fill="#fff8fb"
        />
        {/* top tier */}
        <rect x="16" y="25" width="32" height="15" rx="3" fill={color} />
        <rect x="16" y="25" width="32" height="15" rx="3" fill="#fff" opacity="0.18" />
        <path
          d="M16 28c0-2 1.3-3 3-3h26c1.7 0 3 1 3 3v1.5c-1.6 0-1.6 2.5-3.2 2.5s-1.6-2.5-3.2-2.5-1.6 3-3.2 3-1.6-3-3.2-3-1.6 2.5-3.2 2.5-1.6-2.5-3.2-2.5-1.6 3-3.2 3-1.6-3-3.2-3c-1 0-1.6 1-2.4 1z"
          fill="#fff8fb"
        />
        {/* sprinkles */}
        <g strokeWidth="1.4" strokeLinecap="round">
          <path d="M14 51l2-1" stroke="#ffc94a" />
          <path d="M22 53l1.6 1" stroke="#5aa9ff" />
          <path d="M31 50.5l2 .4" stroke="#4fd1a5" />
          <path d="M40 53.5l1.5-1.2" stroke="#ffc94a" />
          <path d="M49 51l1.8.8" stroke="#b57bff" />
          <path d="M22 36l1.8-.6" stroke="#ffc94a" />
          <path d="M31 37.5l1.4 1" stroke="#b57bff" />
          <path d="M40 35.5l1.8.4" stroke="#5aa9ff" />
        </g>
        {/* candles */}
        {CANDLES.map((c) => (
          <g key={c.x}>
            <rect x={c.x - 1.8} y="13" width="3.6" height="13" rx="1" fill="#fffdf6" />
            <path
              d={`M${c.x - 1.8} 16.5l3.6-2M${c.x - 1.8} 20.5l3.6-2M${c.x - 1.8} 24.5l3.6-2`}
              stroke={c.stripe}
              strokeWidth="1.3"
            />
            <path d={`M${c.x} 13v-2`} stroke="#5b4a3a" strokeWidth="0.8" strokeLinecap="round" />
          </g>
        ))}
      </svg>
      {CANDLES.map((c, i) => (
        <span
          key={c.x}
          className="bday-flame"
          style={{ left: `${(c.x / 64) * 100}%`, animationDelay: `${-i * 0.37}s` }}
        >
          <span className="bday-flame-glow" style={{ animationDelay: `${-i * 0.53}s` }} />
          <span className="bday-flame-core" />
        </span>
      ))}
    </span>
  );
});

/** A string of little pennant flags that swing gently, for the top edge of a cell or header. */
export const Bunting = memo(function Bunting({ flags = 7, className }: { flags?: number; className?: string }) {
  return (
    <span className={`bday-bunting ${className ?? ''}`} aria-hidden="true">
      {Array.from({ length: flags }, (_, i) => (
        <span
          key={i}
          className="bday-pennant"
          style={{
            background: PARTY_COLORS[i % PARTY_COLORS.length],
            animationDelay: `${-((i * 7) % 5) * 0.4}s`,
          }}
        />
      ))}
    </span>
  );
});

/** One curly ribbon, drawn once; the wrapper sways it. */
function Ribbon({ color, height }: { color: string; height: number }) {
  // A zig-zag of curves down a 20-unit-wide strip.
  const loops = Math.max(3, Math.round(height / 22));
  const step = height / loops;
  let d = 'M10 0';
  for (let i = 0; i < loops; i++) {
    const y = i * step;
    const side = i % 2 === 0 ? 18 : 2;
    d += ` Q${side} ${y + step / 2} 10 ${y + step}`;
  }
  return (
    <svg viewBox={`0 0 20 ${height}`} width="20" height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

interface StreamersProps {
  /** Number of hanging ribbons spread across the width. */
  ribbons?: number;
  /** Ribbon length in px; each one varies a little around this. */
  length?: number;
  /** Bunting flags along the top. */
  flags?: number;
  /** Confetti pieces drifting down. */
  confetti?: number;
  className?: string;
}

/** Party streamers along the top of a box: bunting, hanging curly ribbons and drifting confetti. */
export const Streamers = memo(function Streamers({ ribbons = 8, length = 90, flags = 18, confetti = 14, className }: StreamersProps) {
  return (
    <div className={`bday-streamers ${className ?? ''}`} aria-hidden="true">
      {Array.from({ length: ribbons }, (_, i) => {
        const h = Math.round(length * (0.65 + ((i * 37) % 10) / 20));
        return (
          <span
            key={i}
            className="bday-ribbon"
            style={{
              left: `${((i + 0.5) / ribbons) * 100}%`,
              animationDuration: `${3.2 + ((i * 3) % 4) * 0.45}s`,
              animationDelay: `${-((i * 11) % 7) * 0.5}s`,
            }}
          >
            <Ribbon color={PARTY_COLORS[(i * 2) % PARTY_COLORS.length]} height={h} />
          </span>
        );
      })}
      <Bunting flags={flags} className="bday-streamers-bunting" />
      {Array.from({ length: confetti }, (_, i) => (
        <span
          key={i}
          className={`bday-confetti ${i % 3 === 0 ? 'bday-confetti--round' : ''}`}
          style={{
            left: `${(((i * 53) % 97) + 1.5)}%`,
            background: PARTY_COLORS[i % PARTY_COLORS.length],
            animationDuration: `${6 + ((i * 7) % 6)}s`,
            animationDelay: `${-((i * 13) % 12)}s`,
            '--confetti-spin': `${i % 2 ? 1 : -1}`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
});

type ListFormatCtor = new (
  locale: string,
  options: { style: 'long'; type: 'conjunction' },
) => { format: (items: string[]) => string };

/** "Ava", "Ava and Ben", "Ava, Ben and Cal" in the current language. */
export function useNameList(): (members: readonly FamilyMember[]) => string {
  const { lang } = useTranslation();
  return (members) => {
    const names = members.map((m) => m.name);
    // Intl.ListFormat is ES2021, newer than the TS lib this project targets.
    const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;
    try {
      if (ListFormat) return new ListFormat(lang, { style: 'long', type: 'conjunction' }).format(names);
    } catch {
      /* unsupported locale: fall through */
    }
    return names.join(', ');
  };
}

interface BirthdayBannerProps {
  members: readonly FamilyMember[];
  onDismiss?: () => void;
}

/** The "Happy Birthday" celebration strip shown above the calendar and dashboard on the day. */
export function BirthdayBanner({ members, onDismiss }: BirthdayBannerProps) {
  const { t } = useTranslation();
  const nameList = useNameList();
  if (members.length === 0) return null;
  const color = members[0].color;
  return (
    <div className="bday-banner" role="status" style={{ '--bday-color': color } as CSSProperties}>
      <Streamers ribbons={10} length={34} flags={24} confetti={16} />
      <div className="bday-banner-content">
        <BirthdayCake color={color} />
        <div className="bday-banner-text">
          <div className="bday-banner-title">
            {t('birthday.happyBirthday', { name: nameList(members) })} 🎉
          </div>
          <div className="bday-banner-avatars">
            {members.map((m) => (
              <span key={m.id} className="bday-banner-avatar" style={{ borderColor: m.color }}>
                {m.avatar}
              </span>
            ))}
          </div>
        </div>
      </div>
      {onDismiss && (
        <button type="button" className="bday-banner-close" onClick={onDismiss} aria-label={t('common.close')}>
          ×
        </button>
      )}
    </div>
  );
}

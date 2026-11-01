import { memo, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/*
 * Decorations for the Christmas countdown screen saver.
 *
 * Wall tablets can have weak GPUs, so everything that moves animates `opacity` only, on
 * its own composited layer (no SVG repaints, no blur filters). Snowflakes jump to a new
 * spot and size while invisible, which also helps against burn-in.
 */

// ---------------------------------------------------------------------------
// Snow
// ---------------------------------------------------------------------------

const FLAKE_COUNT = 22;

interface Flake {
  x: number; // % of screen
  y: number;
  size: number; // px
  rotate: number; // deg
  peak: number; // max opacity
}

function randomFlake(): Flake {
  const r = Math.random();
  return {
    x: 2 + Math.random() * 96,
    y: 2 + Math.random() * 96,
    size: Math.round(10 + r * r * 46), // mostly small, a few large (10–56 px)
    rotate: Math.round(Math.random() * 60),
    peak: 0.25 + Math.random() * 0.45,
  };
}

/** Six arms with two pairs of branches each, drawn on a 24×24 grid. */
function SnowflakeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none">
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <g key={a} transform={`rotate(${a} 12 12)`}>
            <path d="M12 12V2.5M12 5.5L9.6 3.2M12 5.5l2.4-2.3M12 8.6l-1.9-1.8M12 8.6l1.9-1.8" />
          </g>
        ))}
      </g>
    </svg>
  );
}

function Snowflake() {
  // Each flake keeps its own rhythm; it moves only at the end of a cycle, when it is invisible.
  const [timing] = useState(() => ({ duration: 6 + Math.random() * 8, delay: -Math.random() * 14 }));
  const [flake, setFlake] = useState(randomFlake);
  const style = {
    left: `${flake.x}%`,
    top: `${flake.y}%`,
    width: flake.size,
    height: flake.size,
    transform: `translate(-50%, -50%) rotate(${flake.rotate}deg)`,
    animationDuration: `${timing.duration}s`,
    animationDelay: `${timing.delay}s`,
    '--flake-peak': flake.peak,
  } as CSSProperties;
  return (
    <div className="ss-flake" style={style} onAnimationIteration={() => setFlake(randomFlake())}>
      <SnowflakeIcon />
    </div>
  );
}

/** Twinkling snowflakes across the whole screen, behind the countdown. */
export const Snowfall = memo(function Snowfall() {
  return (
    <div className="ss-snow" aria-hidden="true">
      {Array.from({ length: FLAKE_COUNT }, (_, i) => <Snowflake key={i} />)}
    </div>
  );
});

// ---------------------------------------------------------------------------
// String of lights
// ---------------------------------------------------------------------------

const BULB_COLORS = ['#ff3b3b', '#ffd23f', '#3fd16b', '#3fa8ff', '#ff8c2e'];
const SCALLOP = 72; // target px between anchor points
const SAG = 11; // px the wire droops outward between anchors
const INSET = 18; // px from the wrapper edge to the wire's anchor line

interface Bulb { x: number; y: number; angle: number; color: string; dur: number; delay: number }

/** The wire (an SVG path) and bulb positions for a box of w×h px, going clockwise. */
export function lightString(w: number, h: number): { path: string; bulbs: Bulb[] } {
  const x0 = INSET, y0 = INSET, x1 = w - INSET, y1 = h - INSET;
  // Each side: start, end, and the outward normal.
  const sides: [number, number, number, number, number, number][] = [
    [x0, y0, x1, y0, 0, -1], // top
    [x1, y0, x1, y1, 1, 0], // right
    [x1, y1, x0, y1, 0, 1], // bottom
    [x0, y1, x0, y0, -1, 0], // left
  ];
  let path = `M${x0} ${y0}`;
  const bulbs: Bulb[] = [];
  for (const [ax, ay, bx, by, nx, ny] of sides) {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / SCALLOP));
    for (let i = 0; i < n; i++) {
      const sx = ax + ((bx - ax) * i) / n, sy = ay + ((by - ay) * i) / n;
      const ex = ax + ((bx - ax) * (i + 1)) / n, ey = ay + ((by - ay) * (i + 1)) / n;
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      // A quadratic curve reaches half its control offset at t = 0.5.
      path += ` Q${mx + nx * SAG * 2} ${my + ny * SAG * 2} ${ex} ${ey}`;
      const k = bulbs.length;
      bulbs.push({
        x: mx + nx * SAG,
        y: my + ny * SAG,
        angle: (Math.atan2(ny, nx) * 180) / Math.PI - 90, // bulbs hang outward
        color: BULB_COLORS[k % BULB_COLORS.length],
        dur: 1.6 + ((k * 7) % 5) * 0.35,
        delay: -((k * 13) % 11) * 0.3,
      });
    }
  }
  return { path, bulbs };
}

/** Puts a string of twinkling Christmas lights around its children. */
export function ChristmasLights({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lights = box ? lightString(box.w, box.h) : null;

  return (
    <div className="ss-lights" ref={ref}>
      {lights && (
        <>
          <svg className="ss-lights-wire" width={box!.w} height={box!.h} aria-hidden="true">
            <path d={lights.path} />
          </svg>
          {lights.bulbs.map((b, i) => (
            <div
              key={i}
              className="ss-bulb"
              aria-hidden="true"
              style={{
                left: b.x,
                top: b.y,
                transform: `rotate(${b.angle}deg)`,
                '--bulb-color': b.color,
              } as CSSProperties}
            >
              <span className="ss-bulb-cap" />
              <span className="ss-bulb-lit" style={{ animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}>
                <span className="ss-bulb-glow" />
                <span className="ss-bulb-glass" />
              </span>
            </div>
          ))}
        </>
      )}
      <div className="ss-lights-content">{children}</div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './icons.jsx';
import { LogoMark } from './Logo.jsx';
import { cx } from './ui.jsx';

/** Deterministic pseudo-random so the skyline is identical on every render. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildSkyline(seed, { base, from, to, minH, maxH, minW, maxW }) {
  const rand = rng(seed);
  const buildings = [];
  const windows = [];
  let x = from;
  while (x < to) {
    const w = minW + rand() * (maxW - minW);
    const h = minH + rand() * (maxH - minH);
    buildings.push({ x, y: base - h, w, h });
    for (let wy = base - h + 8; wy < base - 8; wy += 9) {
      for (let wx = x + 5; wx < x + w - 6; wx += 8) {
        if (rand() > 0.62) windows.push({ x: wx, y: wy, hue: rand() > 0.55 ? '#7dd3fc' : '#c4b5fd' });
      }
    }
    x += w + 2 + rand() * 4;
  }
  return { buildings, windows };
}

function Skyline() {
  const far = useMemo(() => buildSkyline(7, { base: 300, from: 0, to: 900, minH: 60, maxH: 150, minW: 22, maxW: 46 }), []);
  const near = useMemo(() => buildSkyline(21, { base: 300, from: 470, to: 900, minH: 90, maxH: 210, minW: 30, maxW: 58 }), []);
  return (
    <g>
      {far.buildings.map((b, i) => <rect key={`f${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#150f3a" opacity="0.85" />)}
      {far.windows.map((w, i) => <rect key={`fw${i}`} x={w.x} y={w.y} width="3" height="4" fill={w.hue} opacity="0.35" />)}
      {near.buildings.map((b, i) => <rect key={`n${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#0b0a2b" stroke="#2c2a7a" strokeWidth="0.6" />)}
      {near.windows.map((w, i) => <rect key={`nw${i}`} x={w.x} y={w.y} width="3" height="4" fill={w.hue} opacity="0.75" />)}
    </g>
  );
}

function Capitol({ x = 250 }) {
  return (
    <g transform={`translate(${x} 0)`} opacity="0.95">
      <rect x="-110" y="236" width="220" height="64" fill="#1b1850" />
      <g fill="#2a2670">
        {Array.from({ length: 9 }, (_, i) => <rect key={i} x={-98 + i * 24} y="242" width="8" height="58" />)}
      </g>
      <rect x="-120" y="228" width="240" height="10" fill="#3a3590" />
      <rect x="-48" y="196" width="96" height="34" fill="#232063" />
      <path d="M-40 196 a40 40 0 0 1 80 0z" fill="#5b54c9" />
      <rect x="-3" y="140" width="6" height="18" fill="#a5b4fc" />
      <circle cx="0" cy="136" r="4" fill="#fde68a" />
      <path d="M-30 196 a30 30 0 0 1 60 0" stroke="#9aa5ff" strokeWidth="1" fill="none" opacity="0.6" />
    </g>
  );
}

function BallotBox({ x = 690, y = 120, scale = 1, label = true }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="168" rx="120" ry="16" fill="#1d6bff" opacity="0.35" filter="url(#dv-blur)" />
      {/* paper */}
      <g transform="translate(-14 -52) rotate(-12)">
        <rect x="0" y="0" width="72" height="48" rx="4" fill="#e8f0ff" />
        <path d="M18 26 l9 9 l20 -20" stroke="#2563eb" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      {/* box */}
      <path d="M-86 24 L0 0 L86 24 L86 150 L0 176 L-86 150 Z" fill="url(#dv-box)" stroke="#6aa8ff" strokeWidth="2" />
      <path d="M-86 24 L0 48 L86 24" stroke="#9cc4ff" strokeWidth="2" fill="none" />
      <path d="M0 48 L0 176" stroke="#6aa8ff" strokeWidth="1.5" opacity="0.7" />
      <path d="M-26 20 L26 20 L26 30 L-26 30 Z" fill="#050a2a" opacity="0.7" transform="translate(0 -4) skewY(10)" />
      {label && (
        <g transform="translate(-60 74)">
          <rect x="0" y="0" width="34" height="34" rx="7" fill="none" stroke="#e8f0ff" strokeWidth="3" />
          <path d="M7 18 l8 8 l20 -22" stroke="#e8f0ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <text x="44" y="26" fill="#f1f5ff" fontSize="22" fontWeight="700" fontFamily="Inter, sans-serif">DigiVote</text>
        </g>
      )}
    </g>
  );
}

function GlassTag({ x, y, w = 150, rotate = 0, text, accent = '#22d3ee', icon }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x="0" y="0" width={w} height="40" rx="8" fill="#0c1a4d" fillOpacity="0.72" stroke={accent} strokeOpacity="0.8" />
      {icon === 'qr' && (
        <g fill="none" stroke={accent} strokeWidth="2">
          <rect x="10" y="10" width="8" height="8" /><rect x="22" y="10" width="8" height="8" /><rect x="10" y="22" width="8" height="8" />
        </g>
      )}
      {icon === 'doc' && <rect x="10" y="9" width="16" height="22" rx="2" fill="none" stroke={accent} strokeWidth="2" />}
      <text x={icon ? 38 : 14} y="26" fill={accent} fontSize="13" fontWeight="700" letterSpacing="1" fontFamily="Inter, sans-serif">{text}</text>
    </g>
  );
}

function Shield({ x = 540, y = 40 }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 L70 22 L70 90 Q70 140 0 168 Q-70 140 -70 90 L-70 22 Z" fill="#0b1a55" fillOpacity="0.75" stroke="#38bdf8" strokeWidth="3" />
      <rect x="-22" y="66" width="44" height="40" rx="6" fill="none" stroke="#7dd3fc" strokeWidth="4" />
      <path d="M-12 66 v-14 a12 12 0 0 1 24 0 v14" stroke="#7dd3fc" strokeWidth="4" fill="none" />
    </g>
  );
}

function Podium({ x = 640 }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x="-60" y="216" width="120" height="84" fill="#1a1560" stroke="#6366f1" strokeOpacity="0.6" />
      <rect x="-3" y="150" width="6" height="66" fill="#94a3b8" />
      <ellipse cx="0" cy="146" rx="9" ry="14" fill="#cbd5e1" />
      <g transform="translate(-130 120) rotate(-8)"><rect width="84" height="46" rx="3" fill="#312e81" stroke="#818cf8" /><text x="42" y="30" textAnchor="middle" fill="#c7d2fe" fontSize="15" fontWeight="800" fontFamily="Inter, sans-serif">IDEAS</text></g>
      <g transform="translate(90 112) rotate(7)"><rect width="92" height="46" rx="3" fill="#4c1d95" stroke="#c084fc" /><text x="46" y="30" textAnchor="middle" fill="#e9d5ff" fontSize="15" fontWeight="800" fontFamily="Inter, sans-serif">PEOPLE</text></g>
      <g transform="translate(176 150) rotate(-6)"><rect width="100" height="46" rx="3" fill="#831843" stroke="#f472b6" /><text x="50" y="30" textAnchor="middle" fill="#fbcfe8" fontSize="15" fontWeight="800" fontFamily="Inter, sans-serif">CHANGE</text></g>
    </g>
  );
}

function VoterPanels() {
  return (
    <g>
      <g transform="translate(470 22) rotate(-6)">
        <rect width="170" height="104" rx="10" fill="#101c58" fillOpacity="0.8" stroke="#60a5fa" strokeOpacity="0.8" />
        <path d="M28 70 l44 -34 l44 34 z M40 70 h64 v18 h-64 z" fill="#93c5fd" opacity="0.8" />
      </g>
      <g transform="translate(690 30) rotate(5)">
        <rect width="170" height="110" rx="10" fill="#101c58" fillOpacity="0.8" stroke="#a78bfa" strokeOpacity="0.8" />
        {Array.from({ length: 5 }, (_, i) => <rect key={i} x={20 + i * 26} y={30 + (i % 2) * 8} width="16" height={60 - (i % 2) * 8} fill="#a5b4fc" opacity="0.8" />)}
      </g>
      <g transform="translate(560 130)">
        <rect width="150" height="104" rx="10" fill="#e8f0ff" fillOpacity="0.92" transform="rotate(-8 75 52)" />
        <path d="M42 56 l22 22 l44 -48" stroke="#2563eb" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" transform="rotate(-8 75 52)" />
      </g>
      <path d="M430 250 C 560 190, 760 280, 880 200" stroke="#38bdf8" strokeWidth="3" fill="none" opacity="0.8" filter="url(#dv-blur2)" />
    </g>
  );
}

/** Decorative illustration only: no data. Variants map to the four portal designs. */
export function HeroArt({ variant = 'ballot' }) {
  return (
    <svg viewBox="0 0 900 300" preserveAspectRatio="xMaxYMax meet" className="absolute inset-0 h-full w-full"
      style={{ WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 22%)', maskImage: 'linear-gradient(to right, transparent 0%, #000 22%)' }}
      aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#050824" />
          <stop offset="0.6" stopColor="#1a1156" />
          <stop offset="1" stopColor="#3b1a78" />
        </linearGradient>
        <linearGradient id="dv-box" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e50ff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#4f2bff" stopOpacity="0.55" />
        </linearGradient>
        <filter id="dv-blur"><feGaussianBlur stdDeviation="9" /></filter>
        <filter id="dv-blur2"><feGaussianBlur stdDeviation="2.5" /></filter>
        <radialGradient id="dv-glow" cx="0.75" cy="0.55" r="0.55">
          <stop offset="0" stopColor="#2f6bff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="900" height="300" fill="url(#dv-sky)" />
      <rect width="900" height="300" fill="url(#dv-glow)" />
      {Array.from({ length: 40 }, (_, i) => (
        <circle key={i} cx={(i * 137) % 900} cy={(i * 53) % 150} r={i % 5 === 0 ? 1.4 : 0.8} fill="#c7d2fe" opacity="0.55" />
      ))}
      <Skyline />
      <Capitol x={variant === 'voter' ? 330 : 290} />
      {variant === 'ballot' && <BallotBox />}
      {variant === 'voter' && <VoterPanels />}
      {variant === 'candidate' && <Podium />}
      {variant === 'auditor' && (
        <g>
          <Shield x={560} y={44} />
          <BallotBox x={705} y={92} scale={0.8} />
          <GlassTag x={730} y={26} w={150} rotate={-8} text="VERIFIED" icon="qr" accent="#22d3ee" />
          <GlassTag x={744} y={78} w={140} rotate={-5} text="VALID QR" accent="#a78bfa" />
          <GlassTag x={720} y={130} w={170} rotate={-3} text="AUDIT TRAIL SECURE" icon="doc" accent="#38bdf8" />
        </g>
      )}
    </svg>
  );
}

/**
 * Artwork slot: shows `/images/<name>.png` when that file exists in `public/images`, otherwise the drawn fallback.
 * Drop the design's images into frontend/public/images with the names listed in its README to replace the drawings.
 */
export function ArtImage({ name, fallback = null, className = 'absolute inset-0 h-full w-full object-cover object-right' }) {
  const [failed, setFailed] = useState(false);
  if (failed || !name) return fallback;
  return (
    <>
      <img src={`/images/${name}.png`} alt="" aria-hidden="true" className={className} onError={() => setFailed(true)} />
    </>
  );
}

/**
 * Hero banner at the top of each dashboard: copy on the left, artwork on the right.
 * `image` names the optional picture in public/images; `aside` is text pinned to the top right.
 */
export function HeroBanner({ variant, image, children, aside, className }) {
  return (
    <section className={cx('glow-card relative isolate overflow-hidden rounded-2xl', className)}>
      <ArtImage name={image} fallback={<HeroArt variant={variant} />} />
      <div className="absolute inset-0 bg-gradient-to-r from-[#050824] via-[#050824]/80 to-transparent" aria-hidden="true" />
      <div className="relative z-10 flex min-h-[230px] flex-wrap items-center justify-between gap-6 px-6 py-8 sm:px-9">
        <div className="max-w-xl">{children}</div>
        {aside && <div className="hidden self-start text-right text-sm font-medium leading-7 text-slate-800 [text-shadow:0_1px_8px_#000] xl:block">{aside}</div>}
      </div>
    </section>
  );
}

/** Small illustration for the sidebar promo card. */
function PromoArt({ role }) {
  if (role === 'AUDITOR') {
    return (
      <svg viewBox="0 0 200 110" className="h-full w-full" aria-hidden="true" focusable="false">
        <defs><radialGradient id="pa-g" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stopColor="#2f6bff" stopOpacity="0.55" /><stop offset="1" stopColor="#2f6bff" stopOpacity="0" /></radialGradient></defs>
        <rect width="200" height="110" fill="url(#pa-g)" />
        <path d="M100 8 L148 24 L148 62 Q148 92 100 108 Q52 92 52 62 L52 24 Z" fill="#0b1a55" stroke="#38bdf8" strokeWidth="2.5" />
        <rect x="84" y="50" width="32" height="28" rx="5" fill="none" stroke="#7dd3fc" strokeWidth="3" />
        <path d="M91 50 v-9 a9 9 0 0 1 18 0 v9" stroke="#7dd3fc" strokeWidth="3" fill="none" />
      </svg>
    );
  }
  if (role === 'CANDIDATE') {
    return (
      <svg viewBox="0 0 200 110" className="h-full w-full" aria-hidden="true" focusable="false">
        <rect width="200" height="110" fill="#1a1156" opacity="0.6" />
        <rect x="70" y="62" width="60" height="48" fill="#2a2670" />
        <circle cx="100" cy="30" r="12" fill="#c7d2fe" />
        <path d="M80 62 q20 -26 40 0z" fill="#818cf8" />
        <rect x="98" y="46" width="4" height="16" fill="#94a3b8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 110" className="h-full w-full" aria-hidden="true" focusable="false">
      <defs><linearGradient id="pa-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1e50ff" /><stop offset="1" stopColor="#6d28d9" /></linearGradient></defs>
      <circle cx="100" cy="70" r="70" fill="#1d4ed8" opacity="0.25" />
      <path d="M56 40 L100 28 L144 40 L144 92 L100 106 L56 92 Z" fill="url(#pa-b)" stroke="#93c5fd" strokeWidth="1.5" />
      <path d="M56 40 L100 52 L144 40" stroke="#bfdbfe" strokeWidth="1.5" fill="none" />
      <g transform="translate(86 62)"><rect width="28" height="28" rx="5" fill="none" stroke="#fff" strokeWidth="3" /><path d="M6 14 l6 6 l14 -16" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></g>
    </svg>
  );
}

/** Rounded promo card pinned to the bottom of the sidebar. */
export function PromoCard({ role, promo }) {
  if (!promo) return null;
  const from = promo.accentFrom ?? promo.lines.length;
  return (
    <div className="glow-card relative overflow-hidden rounded-2xl">
      <div className="relative h-28">
        <ArtImage name={`promo-${String(role).toLowerCase().replace('_', '-')}`} fallback={<PromoArt role={role} />} className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="relative px-4 pb-4 pt-1">
        <p className="text-base font-bold leading-tight text-white">
          {promo.lines.map((line, i) => (
            <span key={line} className={cx('block', i >= from && 'text-neon-blue')}>{line}</span>
          ))}
        </p>
        {promo.tail && <p className="text-sm font-medium text-slate-700">{promo.tail}</p>}
        {promo.caption && <p className="mt-2 text-xs leading-snug text-slate-600">{promo.caption}</p>}
        <Link to="/about" aria-label="About DigiVote"
          className="mt-3 grid h-9 w-9 place-items-center rounded-full border border-brand-hover/60 text-neon-blue hover:bg-panel-2">
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export { LogoMark };

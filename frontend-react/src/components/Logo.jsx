import { Link } from 'react-router-dom';

/** Gradient check-box mark used in the header, sidebar and favicon. */
export function LogoMark({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="dv-mark" x1="4" y1="38" x2="38" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1f7bff" />
          <stop offset="0.55" stopColor="#5b5bff" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path d="M30 17v11a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5V14a5 5 0 0 1 5-5h12" stroke="url(#dv-mark)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M13 19.5l6.2 6.3L34 7" stroke="url(#dv-mark)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** `subtitle` is the portal name shown under the wordmark in the sidebar ("Organizer Panel"). */
export default function Logo({ to = '/', compact, subtitle }) {
  return (
    <Link to={to} className="inline-flex items-center gap-3" aria-label="DigiVote home">
      <LogoMark className={compact ? 'h-9 w-9' : 'h-11 w-11'} />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-2xl font-bold tracking-tight text-white">DigiVote</span>
          {subtitle && <span className="block text-sm font-medium text-neon-blue">{subtitle}</span>}
        </span>
      )}
    </Link>
  );
}

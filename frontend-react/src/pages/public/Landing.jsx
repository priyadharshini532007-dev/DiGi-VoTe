import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from '../../components/icons.jsx';
import { HeroArt } from '../../components/Hero.jsx';
import { IconTile } from '../../components/ui.jsx';

const PILLARS = [
  ['shield', 'Secure', 'Voting'],
  ['document', 'Independent', 'Verification'],
  ['chart', 'Transparent', 'Results'],
  ['users', 'Inclusive', 'Participation'],
];

const AUDIENCES = [
  ['building', 'blue', 'Government Elections', 'National, state and local elections with high security and scalability.'],
  ['archive', 'purple', 'Educational Institutions', 'Elections for colleges, universities, schools and academic councils.'],
  ['dashboard', 'blue', 'Organizations & Corporates', 'Board elections, employee representatives and professional associations.'],
  ['users', 'purple', 'Communities & Societies', 'Elections for residential societies, clubs, NGOs and community groups.'],
];

const CAPABILITIES = [
  'Create and configure elections',
  'Manage candidates and voter eligibility',
  'Monitor voting progress in real time',
  'Verify votes with audit trails',
  'Publish results and generate reports',
];

const JOURNEY = [
  ['document', 'blue', 'Setup', 'Create and configure election with custom rules.'],
  ['users', 'purple', 'Register', 'Candidates and eligible voters register and get verified.'],
  ['ballot', 'pink', 'Vote', 'Eligible voters cast their anonymous votes securely.'],
  ['shield', 'orange', 'Verify', 'Votes are recorded with verifiable receipts and audit trails.'],
  ['chart', 'cyan', 'Results', 'Final results are published and auditable.'],
];

const TRUST = [
  ['building', '500+', 'Organizations'],
  ['users', '1M+', 'Voters Enabled'],
  ['ballot', '5K+', 'Elections Conducted'],
  ['clock', '99.9%', 'System Uptime'],
];

function PrimaryLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 font-semibold text-white shadow-[0_8px_24px_-8px_rgba(59,91,255,0.8)] hover:brightness-110">
      {children} <Icon name="arrowRight" className="h-4 w-4" />
    </Link>
  );
}

function OutlineLink({ to, children, icon }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-white hover:bg-white/5">
      {icon && <Icon name={icon} className="h-5 w-5" />}{children}
    </Link>
  );
}

export default function Landing() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <>
      <section id="home" className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10"><HeroArt variant="ballot" /></div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#040716] via-[#040716]/85 to-[#040716]/20" aria-hidden="true" />
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
          <p className="inline-block rounded-md border border-line bg-panel/70 px-3 py-1 text-xs font-semibold tracking-widest text-slate-700">
            SECURE &bull; TRANSPARENT &bull; INCLUSIVE &bull; FOR EVERYONE
          </p>
          <h1 className="mt-5 max-w-2xl text-5xl font-extrabold leading-[1.05] text-white sm:text-6xl">
            <span className="block">Every Vote.</span>{' '}
            <span className="block">Every Voice.</span>{' '}
            <span className="block text-gradient">A Stronger Tomorrow.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-slate-800">
            DigiVote is a secure, transparent and adaptable digital election platform for governments, institutions,
            organizations and communities.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryLink to="/register">Get Started</PrimaryLink>
            <OutlineLink to="/guide" icon="playCircle">Watch Video</OutlineLink>
          </div>
          <ul className="mt-12 flex flex-wrap gap-x-10 gap-y-4">
            {PILLARS.map(([icon, a, b]) => (
              <li key={a} className="flex items-center gap-3 text-sm leading-tight text-slate-800">
                <Icon name={icon} className="h-8 w-8 text-neon-blue" />
                <span>{a}<br />{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="everyone" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-3xl font-bold text-white">Built for <span className="text-neon-blue">Every Type of Election</span></h2>
          <p className="max-w-md text-sm text-slate-700">
            From national, state and local elections to educational institutions, organizations and communities,
            DigiVote adapts to your needs.
          </p>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map(([icon, accent, title, text]) => (
            <article key={title} className="glow-card overflow-hidden rounded-2xl">
              <div className="h-32" style={{ backgroundImage: `linear-gradient(135deg, ${accent === 'purple' ? '#4c1d95, #1e1b4b' : '#1e3a8a, #0f172a'})` }} aria-hidden="true" />
              <div className="relative px-5 pb-5">
                <div className="-mt-7"><IconTile icon={icon} accent={accent} /></div>
                <h3 className="mt-3 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm text-slate-600">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="glow-card rounded-2xl p-5" aria-hidden="true">
          <div className="grid grid-cols-3 gap-3">
            {['Total Elections', 'Active Elections', 'Eligible Voters'].map((t, i) => (
              <div key={t} className="rounded-xl border border-line bg-panel-2 p-3">
                <p className="text-xs text-slate-600">{t}</p>
                <div className="mt-2 h-6 w-12 rounded bg-gradient-to-r from-blue-500/60 to-violet-500/60" style={{ width: `${40 + i * 12}%` }} />
              </div>
            ))}
          </div>
          <svg viewBox="0 0 400 120" className="mt-4 h-32 w-full">
            <defs>
              <linearGradient id="ln" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b82f6" stopOpacity="0.5" /><stop offset="1" stopColor="#3b82f6" stopOpacity="0" /></linearGradient>
            </defs>
            <path d="M0 100 C60 90 90 60 140 70 S230 30 280 40 S360 15 400 10 V120 H0Z" fill="url(#ln)" />
            <path d="M0 100 C60 90 90 60 140 70 S230 30 280 40 S360 15 400 10" fill="none" stroke="#3b82f6" strokeWidth="3" />
          </svg>
          <p className="mt-1 text-center text-xs text-slate-500">Illustration of the organizer dashboard</p>
        </div>
        <div>
          <p className="inline-block rounded-md border border-line px-3 py-1 text-xs font-semibold tracking-widest text-neon-blue">POWERFUL &bull; SIMPLE &bull; RELIABLE</p>
          <h2 className="mt-4 text-4xl font-bold leading-tight text-white">Manage Elections <span className="text-neon-blue">with Confidence.</span></h2>
          <p className="mt-3 text-sm text-slate-700">A complete platform to create, manage and conduct elections with security, transparency and ease.</p>
          <ul className="mt-5 space-y-3">
            {CAPABILITIES.map((c) => (
              <li key={c} className="flex items-center gap-3 text-slate-800">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-white"><Icon name="check" className="h-4 w-4" /></span>
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-7"><PrimaryLink to="/security">Explore the Platform</PrimaryLink></div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="text-3xl font-bold text-white">A Simple and Secure <span className="text-neon-blue">Election Journey</span></h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {JOURNEY.map(([icon, accent, title, text], i) => (
            <li key={title} className="text-center">
              <div className="flex justify-center"><IconTile icon={icon} accent={accent} /></div>
              <h3 className="mt-3 font-semibold text-white">{i + 1}. {title}</h3>
              <p className="mx-auto mt-1 max-w-[14rem] text-sm text-slate-600">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="glow-card rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-white">Trusted by Organizations Worldwide</h2>
            <ul className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
              {TRUST.map(([icon, value, label]) => (
                <li key={label} className="flex items-center gap-3">
                  <IconTile icon={icon} accent="blue" size="sm" />
                  <span><span className="block text-xl font-bold text-white">{value}</span><span className="text-xs text-slate-600">{label}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <figure className="glow-card rounded-2xl p-6">
            <blockquote className="text-sm text-slate-800">
              “DigiVote has made our election process more transparent, secure and inclusive. It's easy to use and works perfectly for our community.”
            </blockquote>
            <figcaption className="mt-4 flex items-center justify-between text-sm">
              <span><span className="block font-semibold text-white">Anita Sharma</span><span className="text-xs text-slate-500">Election Administrator</span></span>
              <span className="text-amber-700" aria-label="5 out of 5 stars">★★★★★</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="relative isolate mx-auto my-10 max-w-7xl overflow-hidden rounded-2xl px-4 py-14 text-center sm:px-6">
        <div className="absolute inset-0 -z-10"><HeroArt variant="voter" /></div>
        <div className="absolute inset-0 -z-10 bg-[#040716]/70" aria-hidden="true" />
        <h2 className="text-3xl font-bold text-white">Be a Part of <span className="block text-neon-blue">More Transparent Elections</span></h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-slate-800">
          Join governments, institutions, organizations and communities that trust DigiVote for secure and inclusive elections.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <PrimaryLink to="/register">Get Started</PrimaryLink>
          <OutlineLink to="/about">Contact Us</OutlineLink>
        </div>
      </section>
    </>
  );
}

import { LogoMark } from '../../components/Logo.jsx';

/** Sign-in style card: logo mark, title and form on a glowing panel, matching the dashboard design. */
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="glow-card rounded-2xl p-7">
        <LogoMark className="h-12 w-12" />
        <h1 className="mt-4 text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-700">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
    </div>
  );
}

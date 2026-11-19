import { Link, useParams } from 'react-router-dom';
import { COMING_SOON } from '../../components/navigation.js';
import { IconTile } from '../../components/ui.jsx';

/** Destination for design items whose feature the platform does not provide. Never shows invented data. */
export default function ComingSoon() {
  const { feature } = useParams();
  const info = COMING_SOON[feature] ?? { title: 'Not available yet', icon: 'dashboard', text: 'This area is not available yet.' };
  return (
    <div className="glow-card mx-auto mt-10 max-w-xl rounded-2xl px-8 py-12 text-center">
      <div className="flex justify-center"><IconTile icon={info.icon} accent="purple" /></div>
      <h1 className="mt-5 text-2xl font-bold text-navy-900">{info.title}</h1>
      <p className="mt-1 text-sm font-medium text-neon-blue">Not available yet</p>
      <p className="mt-3 text-sm text-slate-600">{info.text}</p>
      <Link to="/app" className="mt-6 inline-block rounded-lg border border-brand-hover/60 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-panel-2">
        Back to your dashboard
      </Link>
    </div>
  );
}

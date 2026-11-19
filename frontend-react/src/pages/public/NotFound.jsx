import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold text-navy-900">Page not found</h1>
      <p className="mt-2 text-slate-600">The page you are looking for does not exist.</p>
      <Link to="/" className="mt-6 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
        Back to DigiVote
      </Link>
    </div>
  );
}

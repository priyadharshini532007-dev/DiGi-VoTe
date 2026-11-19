import { useEffect, useState } from 'react';
import { Candidates } from '../api/endpoints.js';

/** Loads a protected media URL with the session token and shows it via an object URL. */
export default function AuthImage({ src, alt, className }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    Candidates.mediaBlob(src).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  if (!url) return <div className={`${className} bg-slate-100`} aria-label={alt} />;
  return <img src={url} alt={alt} className={className} />;
}

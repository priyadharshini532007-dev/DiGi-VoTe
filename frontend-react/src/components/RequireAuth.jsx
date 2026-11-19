import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

/** Client-side guard for convenience only; the API enforces every permission. */
export default function RequireAuth({ children, permission, roles }) {
  const { isAuthenticated, active, can } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (permission && !can(permission)) return <Navigate to="/app" replace />;
  if (roles && !roles.includes(active?.role)) return <Navigate to="/app" replace />;
  return children;
}

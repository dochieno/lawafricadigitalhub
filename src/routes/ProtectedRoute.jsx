// src/routes/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getToken, isTokenExpired } from "../auth/auth";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  const token = getToken();
  const expired = isTokenExpired();

  // ✅ While auth is initializing, don't redirect yet
  if (loading) return null;

  // ✅ If no token (or token expired), force login
  if (!token || expired) {
    return <Navigate to="/login" replace />;
  }

  /**
   * ✅ Token exists and is valid, but user is not ready yet (timing / refreshUser).
   * Don't bounce to /login — just wait briefly.
   */
  if (!user) return null;

  return children;
}

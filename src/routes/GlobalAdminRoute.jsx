import { Navigate, Outlet } from "react-router-dom";
import { isGlobalAdmin } from "../auth/auth";

export default function GlobalAdminRoute() {
  if (!isGlobalAdmin()) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

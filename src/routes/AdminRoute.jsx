import { Navigate, Outlet } from "react-router-dom";
import { isAdminRole } from "../auth/auth";

export default function AdminRoute() {
  if (!isAdminRole()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

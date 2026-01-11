import { Navigate, Outlet } from "react-router-dom";
import { canSeeApprovals } from "../auth/auth";

export default function AdminOrInstitutionAdminRoute() {
  const allowed = canSeeApprovals();

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

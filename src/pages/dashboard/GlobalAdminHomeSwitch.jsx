import Home from "./Home";
import AdminDashboardHome from "./admin/AdminDashboardHome";
import { isGlobalAdmin } from "../../auth/auth";

export default function GlobalAdminHomeSwitch() {
  // Only TRUE Global Admin gets the analytics dashboard
  if (isGlobalAdmin()) return <AdminDashboardHome />;
  return <Home />;
}

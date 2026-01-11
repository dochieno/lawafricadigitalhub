import { useAuth } from "../auth/AuthContext";
import UserProfileMenu from "../components/UserProfileMenu";
import "../styles/dashboardHeader.css";

export default function DashboardHeader() {
  const { user, logout } = useAuth();

  if (!user) return null; // safety

  return (
    <header className="dashboard-header">
      <div className="dashboard-header-left">
        {/* Reserved for breadcrumbs / page title later */}
      </div>

      <div className="dashboard-header-right">
        <UserProfileMenu user={user} onLogout={logout} />
      </div>
    </header>
  );
}

import { useAuth } from "../auth/AuthContext";
import UserProfileMenu from "../components/UserProfileMenu";
import "../styles/dashboardHeader.css";

export default function DashboardHeader() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <header className="dashboard-header">
      <div className="dashboard-header-left">
        <a href="/dashboard" className="la-brand" aria-label="LawAfrica Dashboard">
          <img
            src="/logo.png"
            alt="LawAfrica"
            className="la-brand-logo"
            loading="eager"
            decoding="async"
            draggable="false"
          />
        </a>
      </div>

      <div className="dashboard-header-right">
        <UserProfileMenu user={user} onLogout={logout} />
      </div>
    </header>
  );
}
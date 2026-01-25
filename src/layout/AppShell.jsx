// src/layout/AppShell.jsx
import { Outlet, NavLink, useLocation, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import UserProfileMenu from "../components/UserProfileMenu";
import {
  canSeeApprovals,
  isAdminRole,

  isInstitutionAdminWithInstitution,
} from "../auth/auth";
import { useMemo, useState } from "react";
import "../styles/appshell.css";
import "../styles/lawAfricaLanding.css";
import "../styles/lawAfricaBrand.css";

function Chevron({ open }) {
  return <span className={`nav-chevron ${open ? "open" : ""}`}>▸</span>;
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isInApprovals = useMemo(
    () => location.pathname.startsWith("/dashboard/approvals"),
    [location.pathname]
  );

  const isInAdmin = useMemo(
    () => location.pathname.startsWith("/dashboard/admin"),
    [location.pathname]
  );

  const isInFinance = useMemo(
    () => location.pathname.startsWith("/dashboard/admin/finance"),
    [location.pathname]
  );

  // Manual toggles (only matter when you're NOT currently inside that section)
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);

  // ✅ Route is the source of truth for auto-open (no effects, no warnings)
  const approvalsOpenFinal = isInApprovals ? true : approvalsOpen;
  const adminOpenFinal = isInAdmin ? true : adminOpen;
  const financeOpenFinal = isInFinance ? true : financeOpen;

  function confirmLogout() {
    setShowLogoutConfirm(true);
  }

  function cancelLogout() {
    setShowLogoutConfirm(false);
  }

  function handleLogout() {
    setShowLogoutConfirm(false);
    logout();
  }

  const meIsAdminRole = isAdminRole();
  const meIsInstitutionAdmin = isInstitutionAdminWithInstitution();

  return (
    <div className="app-container">
      {/* ================= SIDEBAR ================= */}
      <aside className="sidebar la-sidebar">
        <div className="sidebar-top">
          {/* ✅ Brand block */}
          <Link to="/dashboard" className="la-sidebar-brand" aria-label="LawAfrica Dashboard">
            <img
              src="/logo.png"
              alt="LawAfrica"
              className="la-sidebar-logo"
              loading="eager"
              decoding="async"
              draggable="false"
            />
            <div className="la-sidebar-wordmark">
              Law<span className="la-a">A</span>frica
            </div>
          </Link>

          <nav className="nav la-nav">
            <NavLink to="/dashboard" end className="nav-link">
              Home
            </NavLink>

            <NavLink to="/dashboard/explore" className="nav-link">
              Explore
            </NavLink>

            <NavLink to="/dashboard/library" className="nav-link">
              Library
            </NavLink>

            <NavLink to="/dashboard/law-reports" className="nav-link">
              Law Reports
            </NavLink>

            <NavLink to="/dashboard/ai-test" className="nav-link nav-child">
              AI Summary Test
            </NavLink>

            <NavLink to="/dashboard/security" className="nav-link">
              Security
            </NavLink>

            {/* ================= APPROVALS (collapsible) ================= */}
            {canSeeApprovals() && (
              <div className="nav-group-wrap">
                <button
                  type="button"
                  className={`nav-link nav-group-toggle ${isInApprovals ? "active" : ""}`}
                  onClick={() => setApprovalsOpen((v) => !v)}
                  aria-expanded={approvalsOpenFinal}
                  aria-controls="nav-approvals"
                >
                  <Chevron open={approvalsOpenFinal} />
                  <span>Approvals</span>
                </button>

                {approvalsOpenFinal && (
                  <div id="nav-approvals" className="nav-group">
                    <NavLink to="/dashboard/approvals" className="nav-link nav-child">
                      Dashboard
                    </NavLink>

                    {meIsInstitutionAdmin && (
                      <NavLink to="/dashboard/approvals/members" className="nav-link nav-child">
                        Members
                      </NavLink>
                    )}

                    {meIsAdminRole && (
                      <NavLink
                        to="/dashboard/approvals/subscription-requests"
                        className="nav-link nav-child"
                      >
                        Approval Requests
                      </NavLink>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ================= FINANCE (collapsible, Admin-only) ================= */}
            {meIsAdminRole && (
              <div className="nav-group-wrap">
                <button
                  type="button"
                  className={`nav-link nav-group-toggle ${isInFinance ? "active" : ""}`}
                  onClick={() => setFinanceOpen((v) => !v)}
                  aria-expanded={financeOpenFinal}
                  aria-controls="nav-finance"
                >
                  <Chevron open={financeOpenFinal} />
                  <span>Finance</span>
                </button>

                {financeOpenFinal && (
                  <div id="nav-finance" className="nav-group">
                    <NavLink to="/dashboard/admin/finance/invoices" className="nav-link nav-child">
                      Invoices
                    </NavLink>

                    <NavLink to="/dashboard/admin/finance/payments" className="nav-link nav-child">
                      Payments
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/finance/invoice-settings"
                      className="nav-link nav-child"
                    >
                      Invoice Settings
                    </NavLink>

                    <NavLink to="/dashboard/admin/finance/vat-rates" className="nav-link nav-child">
                      VAT Setup
                    </NavLink>
                  </div>
                )}
              </div>
            )}

            {/* ================= ADMIN (collapsible) ================= */}
            {meIsAdminRole && (
              <div className="nav-group-wrap">
                <button
                  type="button"
                  className={`nav-link nav-group-toggle ${isInAdmin ? "active" : ""}`}
                  onClick={() => setAdminOpen((v) => !v)}
                  aria-expanded={adminOpenFinal}
                  aria-controls="nav-admin"
                >
                  <Chevron open={adminOpenFinal} />
                  <span>Admin</span>
                </button>

                {adminOpenFinal && (
                  <div id="nav-admin" className="nav-group">
                    <NavLink to="/dashboard/admin/institutions" className="nav-link nav-child">
                      Institutions
                    </NavLink>

                    <NavLink to="/dashboard/admin/content-products" className="nav-link nav-child">
                      Products
                    </NavLink>

                    <NavLink to="/dashboard/admin/documents" className="nav-link nav-child">
                      Books
                    </NavLink>

                    <NavLink to="/dashboard/admin/llr-services" className="nav-link nav-child">
                      LLR Services
                    </NavLink>

                    <NavLink to="/dashboard/admin/llr-services/import" className="nav-link nav-child">
                      Import Cases
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/institution-subscriptions"
                      className="nav-link nav-child"
                    >
                      Subscriptions
                    </NavLink>

                    <NavLink to="/dashboard/admin/trials" className="nav-link nav-child">
                      Trials
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/institution-bundle-subscriptions"
                      className="nav-link nav-child"
                    >
                      Bundle
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/institution-admins"
                      className="nav-link nav-child"
                    >
                      Institution Admins
                    </NavLink>

                    <NavLink to="/dashboard/admin/users" className="nav-link nav-child">
                      Users
                    </NavLink>
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>
      </aside>

      {/* ================= MAIN CONTENT ================= */}
      <main className="content">
        <div className="content-topbar">
          <div className="topbar-right">
            <button className="topbar-logout-btn" onClick={confirmLogout}>
              Logout
            </button>

            {user && (
              <UserProfileMenu
                user={{
                  name: user.name,
                  email: user.email,
                  avatarUrl: user.avatarUrl,
                }}
                onLogout={confirmLogout}
              />
            )}
          </div>
        </div>

        <Outlet />
      </main>

      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Confirm Logout</h3>
            <p>Are you sure you want to log out?</p>

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={cancelLogout}>
                Cancel
              </button>

              <button className="modal-btn danger" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
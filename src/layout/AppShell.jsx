// src/layout/AppShell.jsx
import { Outlet, NavLink, useLocation, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import UserProfileMenu from "../components/UserProfileMenu";
import { canSeeApprovals, isAdminRole, isInstitutionAdminWithInstitution } from "../auth/auth";
import { useMemo, useState, useEffect, useRef } from "react";
import "../styles/appshell.css";
import "../styles/lawAfricaLanding.css";
import "../styles/lawAfricaBrand.css";

function Chevron({ open }) {
  return <span className={`nav-chevron ${open ? "open" : ""}`}>▸</span>;
}

function navLinkClass({ isActive }) {
  return `topnav-link ${isActive ? "active" : ""}`;
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const meIsAdminRole = isAdminRole();
  const meIsInstitutionAdmin = isInstitutionAdminWithInstitution();

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

  // Dropdown state (route stays source of truth)
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);

  const approvalsOpenFinal = isInApprovals ? true : approvalsOpen;
  const adminOpenFinal = isInAdmin ? true : adminOpen;
  const financeOpenFinal = isInFinance ? true : financeOpen;

  const approvalsRef = useRef(null);
  const adminRef = useRef(null);
  const financeRef = useRef(null);

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

  // Close dropdowns on outside click + Escape
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setApprovalsOpen(false);
        setAdminOpen(false);
        setFinanceOpen(false);
      }
    }

    function onPointerDown(e) {
      const a = approvalsRef.current;
      const ad = adminRef.current;
      const f = financeRef.current;

      if (a && !a.contains(e.target)) setApprovalsOpen(false);
      if (ad && !ad.contains(e.target)) setAdminOpen(false);
      if (f && !f.contains(e.target)) setFinanceOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <div className="app-shell">
      {/* ================= TOP NAV ================= */}
      <header className="topnav">
        <div className="topnav-inner">
          {/* Left: Brand */}
          <Link to="/dashboard" className="topnav-brand" aria-label="LawAfrica Dashboard">
            <img
              src="/logo.png"
              alt="LawAfrica"
              className="topnav-logo"
              loading="eager"
              decoding="async"
              draggable="false"
            />
            <div className="topnav-wordmark">
              Law<span className="la-a">A</span>frica
            </div>
          </Link>

          {/* Center: Main links (horizontal) */}
          <nav className="topnav-links" aria-label="Main navigation">
            <NavLink to="/dashboard" end className={navLinkClass}>
              Home
            </NavLink>

            <NavLink to="/dashboard/explore" className={navLinkClass}>
              Explore
            </NavLink>

            <NavLink to="/dashboard/library" className={navLinkClass}>
              Library
            </NavLink>

            <NavLink to="/dashboard/law-reports" className={navLinkClass}>
              Law Reports
            </NavLink>

            <NavLink to="/dashboard/trials" className={navLinkClass}>
              Trials
            </NavLink>

            <NavLink to="/dashboard/law-reports/subscribe" className={navLinkClass}>
              Subscriptions
            </NavLink>

            {import.meta.env.DEV && (
              <NavLink to="/dashboard/content-blocks" className={({ isActive }) => `topnav-link dev ${isActive ? "active" : ""}`}>
                🧪 Content Blocks Tester
              </NavLink>
            )}

            <NavLink to="/dashboard/security" className={navLinkClass}>
              Security
            </NavLink>

            {/* ================= APPROVALS (dropdown) ================= */}
            {canSeeApprovals() && (
              <div className="topnav-dd" ref={approvalsRef}>
                <button
                  type="button"
                  className={`topnav-link dd-toggle ${isInApprovals ? "active" : ""}`}
                  onClick={() => setApprovalsOpen((v) => !v)}
                  aria-expanded={approvalsOpenFinal}
                  aria-haspopup="menu"
                >
                  <Chevron open={approvalsOpenFinal} />
                  Approvals
                </button>

                {approvalsOpenFinal ? (
                  <div className="dd-menu" role="menu" aria-label="Approvals menu">
                    <NavLink to="/dashboard/approvals" className="dd-item" role="menuitem">
                      Dashboard
                    </NavLink>

                    {meIsInstitutionAdmin && (
                      <NavLink to="/dashboard/approvals/members" className="dd-item" role="menuitem">
                        Members
                      </NavLink>
                    )}

                    {meIsAdminRole && (
                      <NavLink to="/dashboard/approvals/subscription-requests" className="dd-item" role="menuitem">
                        Approval Requests
                      </NavLink>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* ================= FINANCE (dropdown, Admin-only) ================= */}
            {meIsAdminRole && (
              <div className="topnav-dd" ref={financeRef}>
                <button
                  type="button"
                  className={`topnav-link dd-toggle ${isInFinance ? "active" : ""}`}
                  onClick={() => setFinanceOpen((v) => !v)}
                  aria-expanded={financeOpenFinal}
                  aria-haspopup="menu"
                >
                  <Chevron open={financeOpenFinal} />
                  Finance
                </button>

                {financeOpenFinal ? (
                  <div className="dd-menu" role="menu" aria-label="Finance menu">
                    <NavLink to="/dashboard/admin/finance/invoices" className="dd-item" role="menuitem">
                      Invoices
                    </NavLink>
                    <NavLink to="/dashboard/admin/finance/payments" className="dd-item" role="menuitem">
                      Payments
                    </NavLink>
                    <NavLink to="/dashboard/admin/finance/invoice-settings" className="dd-item" role="menuitem">
                      Invoice Settings
                    </NavLink>
                    <NavLink to="/dashboard/admin/finance/vat-rates" className="dd-item" role="menuitem">
                      VAT Setup
                    </NavLink>
                  </div>
                ) : null}
              </div>
            )}

            {/* ================= ADMIN (dropdown) ================= */}
            {meIsAdminRole && (
              <div className="topnav-dd" ref={adminRef}>
                <button
                  type="button"
                  className={`topnav-link dd-toggle ${isInAdmin ? "active" : ""}`}
                  onClick={() => setAdminOpen((v) => !v)}
                  aria-expanded={adminOpenFinal}
                  aria-haspopup="menu"
                >
                  <Chevron open={adminOpenFinal} />
                  Admin
                </button>

                {adminOpenFinal ? (
                  <div className="dd-menu" role="menu" aria-label="Admin menu">
                    <NavLink to="/dashboard/admin/institutions" className="dd-item" role="menuitem">
                      Institutions
                    </NavLink>

                    <NavLink to="/dashboard/admin/content-products" className="dd-item" role="menuitem">
                      Products
                    </NavLink>

                    <NavLink to="/dashboard/admin/content-product-prices" className="dd-item" role="menuitem">
                      Product Prices
                    </NavLink>

                    <NavLink to="/dashboard/admin/documents" className="dd-item" role="menuitem">
                      Books
                    </NavLink>

                    <NavLink to="/dashboard/admin/toc-test" className="dd-item" role="menuitem">
                      Table of Contents (Test)
                    </NavLink>

                    <NavLink to="/dashboard/admin/llr-services" className="dd-item" role="menuitem">
                      LLR Services
                    </NavLink>

                    <NavLink to="/dashboard/admin/courts" className="dd-item" role="menuitem">
                      Courts
                    </NavLink>

                    <NavLink to="/dashboard/admin/llr-services/import" className="dd-item" role="menuitem">
                      Import Cases
                    </NavLink>

                    <NavLink to="/dashboard/admin/institution-subscriptions" className="dd-item" role="menuitem">
                      Subscriptions
                    </NavLink>

                    <NavLink to="/dashboard/admin/user-subscriptions" className="dd-item" role="menuitem">
                      Public Subscriptions
                    </NavLink>

                    <NavLink to="/dashboard/admin/trials" className="dd-item" role="menuitem">
                      Trials
                    </NavLink>

                    <NavLink to="/dashboard/admin/institution-bundle-subscriptions" className="dd-item" role="menuitem">
                      Bundle
                    </NavLink>

                    <NavLink to="/dashboard/admin/institution-admins" className="dd-item" role="menuitem">
                      Institution Admins
                    </NavLink>

                    <NavLink to="/dashboard/admin/users" className="dd-item" role="menuitem">
                      Users
                    </NavLink>
                  </div>
                ) : null}
              </div>
            )}
          </nav>

          {/* Right: profile menu (logout lives inside it) */}
          <div className="topnav-right">
            {user ? (
              <UserProfileMenu
                user={{
                  name: user.name,
                  email: user.email,
                  avatarUrl: user.avatarUrl,
                  profileImageUrl: user.profileImageUrl,
                  ProfileImageUrl: user.ProfileImageUrl,
                }}
                onLogout={confirmLogout}
              />
            ) : null}
          </div>
        </div>
      </header>

      {/* ================= MAIN CONTENT ================= */}
      <main className="app-main">
        <Outlet />
      </main>

      {/* Logout confirm */}
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

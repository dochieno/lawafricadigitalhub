// src/layout/AppShell.jsx
import { Outlet, NavLink, useLocation, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import UserProfileMenu from "../components/UserProfileMenu";
import {
  canSeeApprovals,
  isAdminRole,
  isInstitutionAdminWithInstitution,
} from "../auth/auth";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import "../styles/appshell.css";
import "../styles/lawAfricaLanding.css";
import "../styles/lawAfricaBrand.css";

function Chevron({ open }) {
  return <span className={`nav-chevron ${open ? "open" : ""}`}>▸</span>;
}

function navLinkClass({ isActive }) {
  return `topnav-link ${isActive ? "active" : ""}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
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

  // ✅ Single dropdown controller
  const [openDd, setOpenDd] = useState(null); // "approvals" | "finance" | "admin" | null
  const closeTimerRef = useRef(null);

  const approvalsRef = useRef(null);
  const adminRef = useRef(null);
  const financeRef = useRef(null);

  // ✅ Fixed-position menu placement (like profile menu)
  const [menuPos, setMenuPos] = useState({
    approvals: null,
    finance: null,
    admin: null,
  });

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpenDd(null), 180);
  }, []);

  const computeAndSetMenuPos = useCallback((key) => {
    const map = {
      approvals: approvalsRef.current,
      finance: financeRef.current,
      admin: adminRef.current,
    };
    const wrap = map[key];
    const btn = wrap?.querySelector?.("button.dd-toggle");
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const gap = 10;

    const width = Math.max(240, Math.round(r.width));
    const maxLeft = window.innerWidth - width - 10;

    const left = clamp(Math.round(r.left), 10, Math.max(10, maxLeft));
    const top = Math.round(r.bottom + gap);

    setMenuPos((p) => ({
      ...p,
      [key]: { top, left, width },
    }));
  }, []);

  const openNow = useCallback(
    (key) => {
      clearCloseTimer();
      setOpenDd(key);
      // place menu on open (next tick so DOM is stable)
      requestAnimationFrame(() => computeAndSetMenuPos(key));
    },
    [computeAndSetMenuPos]
  );

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
      if (e.key === "Escape") setOpenDd(null);
    }

    function onPointerDown(e) {
      const a = approvalsRef.current;
      const ad = adminRef.current;
      const f = financeRef.current;

      const insideA = a && a.contains(e.target);
      const insideAD = ad && ad.contains(e.target);
      const insideF = f && f.contains(e.target);

      // Also allow clicks inside the floating menus
      const insideFloatingMenu = !!e.target?.closest?.(".dd-menu");

      if (!insideA && !insideAD && !insideF && !insideFloatingMenu) {
        setOpenDd(null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  // Keep menu aligned on scroll/resize while open
  useEffect(() => {
    if (!openDd) return;

    const onReflow = () => computeAndSetMenuPos(openDd);

    window.addEventListener("resize", onReflow);
    // capture scrolls from any container
    window.addEventListener("scroll", onReflow, true);

    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [openDd, computeAndSetMenuPos]);

  const approvalsOpenFinal = isInApprovals ? true : openDd === "approvals";
  const financeOpenFinal = isInFinance ? true : openDd === "finance";
  const adminOpenFinal = isInAdmin ? true : openDd === "admin";

  return (
    <div className="app-shell">
      {/* ================= TOP NAV ================= */}
      <header className="topnav">
        <div className="topnav-inner">
          {/* Left: Brand */}
          <Link
            to="/dashboard"
            className="topnav-brand"
            aria-label="LawAfrica Dashboard"
          >
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

            <NavLink
              to="/dashboard/law-reports/subscribe"
              className={navLinkClass}
            >
              Subscriptions
            </NavLink>

            {import.meta.env.DEV && (
              <NavLink
                to="/dashboard/content-blocks"
                className={({ isActive }) =>
                  `topnav-link dev ${isActive ? "active" : ""}`
                }
              >
                🧪 Content Blocks Tester
              </NavLink>
            )}

            <NavLink to="/dashboard/security" className={navLinkClass}>
              Security
            </NavLink>

            {/* ================= APPROVALS (hover dropdown) ================= */}
            {canSeeApprovals() && (
              <div
                className="topnav-dd"
                ref={approvalsRef}
                onMouseEnter={() => openNow("approvals")}
                onMouseLeave={scheduleClose}
              >
                <button
                  type="button"
                  className={`topnav-link dd-toggle ${
                    isInApprovals ? "active" : ""
                  }`}
                  aria-expanded={approvalsOpenFinal}
                  aria-haspopup="menu"
                  onClick={() =>
                    setOpenDd((cur) => {
                      const next = cur === "approvals" ? null : "approvals";
                      if (next) requestAnimationFrame(() => computeAndSetMenuPos("approvals"));
                      return next;
                    })
                  }
                >
                  <Chevron open={approvalsOpenFinal} />
                  Approvals
                </button>

                {approvalsOpenFinal ? (
                  <div
                    className="dd-menu"
                    role="menu"
                    aria-label="Approvals menu"
                    style={{
                      position: "fixed",
                      top: menuPos.approvals?.top ?? 0,
                      left: menuPos.approvals?.left ?? 0,
                      minWidth: menuPos.approvals?.width ?? 240,
                    }}
                    onMouseEnter={() => openNow("approvals")}
                    onMouseLeave={scheduleClose}
                  >
                    <NavLink
                      to="/dashboard/approvals"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Dashboard
                    </NavLink>

                    {meIsInstitutionAdmin && (
                      <NavLink
                        to="/dashboard/approvals/members"
                        className="dd-item"
                        role="menuitem"
                        onClick={() => setOpenDd(null)}
                      >
                        Members
                      </NavLink>
                    )}

                    {meIsAdminRole && (
                      <NavLink
                        to="/dashboard/approvals/subscription-requests"
                        className="dd-item"
                        role="menuitem"
                        onClick={() => setOpenDd(null)}
                      >
                        Approval Requests
                      </NavLink>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* ================= FINANCE (hover dropdown) ================= */}
            {meIsAdminRole && (
              <div
                className="topnav-dd"
                ref={financeRef}
                onMouseEnter={() => openNow("finance")}
                onMouseLeave={scheduleClose}
              >
                <button
                  type="button"
                  className={`topnav-link dd-toggle ${
                    isInFinance ? "active" : ""
                  }`}
                  aria-expanded={financeOpenFinal}
                  aria-haspopup="menu"
                  onClick={() =>
                    setOpenDd((cur) => {
                      const next = cur === "finance" ? null : "finance";
                      if (next) requestAnimationFrame(() => computeAndSetMenuPos("finance"));
                      return next;
                    })
                  }
                >
                  <Chevron open={financeOpenFinal} />
                  Finance
                </button>

                {financeOpenFinal ? (
                  <div
                    className="dd-menu"
                    role="menu"
                    aria-label="Finance menu"
                    style={{
                      position: "fixed",
                      top: menuPos.finance?.top ?? 0,
                      left: menuPos.finance?.left ?? 0,
                      minWidth: menuPos.finance?.width ?? 240,
                    }}
                    onMouseEnter={() => openNow("finance")}
                    onMouseLeave={scheduleClose}
                  >
                    <NavLink
                      to="/dashboard/admin/finance/invoices"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Invoices
                    </NavLink>
                    <NavLink
                      to="/dashboard/admin/finance/payments"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Payments
                    </NavLink>
                    <NavLink
                      to="/dashboard/admin/finance/invoice-settings"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Invoice Settings
                    </NavLink>
                    <NavLink
                      to="/dashboard/admin/finance/vat-rates"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      VAT Setup
                    </NavLink>
                  </div>
                ) : null}
              </div>
            )}

            {/* ================= ADMIN (hover dropdown) ================= */}
            {meIsAdminRole && (
              <div
                className="topnav-dd"
                ref={adminRef}
                onMouseEnter={() => openNow("admin")}
                onMouseLeave={scheduleClose}
              >
                <button
                  type="button"
                  className={`topnav-link dd-toggle ${
                    isInAdmin ? "active" : ""
                  }`}
                  aria-expanded={adminOpenFinal}
                  aria-haspopup="menu"
                  onClick={() =>
                    setOpenDd((cur) => {
                      const next = cur === "admin" ? null : "admin";
                      if (next) requestAnimationFrame(() => computeAndSetMenuPos("admin"));
                      return next;
                    })
                  }
                >
                  <Chevron open={adminOpenFinal} />
                  Admin
                </button>

                {adminOpenFinal ? (
                  <div
                    className="dd-menu"
                    role="menu"
                    aria-label="Admin menu"
                    style={{
                      position: "fixed",
                      top: menuPos.admin?.top ?? 0,
                      left: menuPos.admin?.left ?? 0,
                      minWidth: menuPos.admin?.width ?? 240,
                    }}
                    onMouseEnter={() => openNow("admin")}
                    onMouseLeave={scheduleClose}
                  >
                    <NavLink
                      to="/dashboard/admin/institutions"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Institutions
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/content-products"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Products
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/content-product-prices"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Product Prices
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/documents"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Books
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/toc-test"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Table of Contents (Test)
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/llr-services"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      LLR Services
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/courts"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Courts
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/llr-services/import"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Import Cases
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/institution-subscriptions"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Subscriptions
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/user-subscriptions"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Public Subscriptions
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/trials"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Trials
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/institution-bundle-subscriptions"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Bundle
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/institution-admins"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Institution Admins
                    </NavLink>

                    <NavLink
                      to="/dashboard/admin/users"
                      className="dd-item"
                      role="menuitem"
                      onClick={() => setOpenDd(null)}
                    >
                      Users
                    </NavLink>
                  </div>
                ) : null}
              </div>
            )}
          </nav>

          {/* Right: profile menu */}
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

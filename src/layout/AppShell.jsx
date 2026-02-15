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

  // ✅ Profile menu wrapper (so we can close it without editing UserProfileMenu)
  const profileWrapRef = useRef(null);

  // ✅ Fixed-position menu placement
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

  // Close a specific menu, but only if that same menu is still open
  const scheduleCloseFor = useCallback((key) => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpenDd((cur) => (cur === key ? null : cur));
    }, 140);
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

    // ✅ Standard dropdown width (premium + consistent)
    const width = 320;
    const maxLeft = window.innerWidth - width - 12;

    const left = clamp(Math.round(r.left), 12, Math.max(12, maxLeft));
    const top = Math.round(r.bottom + gap);

    setMenuPos((p) => ({
      ...p,
      [key]: { top, left, width },
    }));
  }, []);

  // ✅ Open immediately switches menus (so Admin collapses when moving to Finance/Approvals)
  // Also closes profile menu (by simulating outside click via state logic)
  const openNow = useCallback(
    (key) => {
      clearCloseTimer();
      setOpenDd(key);
      requestAnimationFrame(() => computeAndSetMenuPos(key));

      // ✅ Collapse profile menu when opening any dropdown
      // (UserProfileMenu usually closes on outside click)
      // We trigger a "synthetic outside click" by focusing body.
      if (document.activeElement) document.activeElement.blur?.();
      document.body.focus?.();
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
  // Also: close profile menu when clicking outside it (works if UserProfileMenu relies on outside click)
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpenDd(null);
        // let profile menu close too (most implementations listen to Escape; but ensure blur)
        if (document.activeElement) document.activeElement.blur?.();
      }
    }

    function onPointerDown(e) {
      const a = approvalsRef.current;
      const ad = adminRef.current;
      const f = financeRef.current;
      const p = profileWrapRef.current;

      const insideA = a && a.contains(e.target);
      const insideAD = ad && ad.contains(e.target);
      const insideF = f && f.contains(e.target);

      const insideFloatingMenu = !!e.target?.closest?.(".dd-menu");
      const insideProfile = p && p.contains(e.target);

      // If click is not on any top dropdown or its menu -> close dropdown
      if (!insideA && !insideAD && !insideF && !insideFloatingMenu) {
        setOpenDd(null);
      }

      // If click is not inside profile -> blur to encourage profile menu closing
      if (!insideProfile) {
        if (document.activeElement) document.activeElement.blur?.();
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
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [openDd, computeAndSetMenuPos]);

  // ✅ IMPORTANT: we keep "active section highlights" but do NOT force menu open.
  // Otherwise menus will stick open whenever you are inside /dashboard/admin/*
  // This is why you saw "Admin not collapsing".
  const approvalsOpenFinal = openDd === "approvals";
  const financeOpenFinal = openDd === "finance";
  const adminOpenFinal = openDd === "admin";

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

          {/* Center: Main links */}
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

            {/* ================= APPROVALS ================= */}
            {canSeeApprovals() && (
              <div
                className="topnav-dd"
                ref={approvalsRef}
                onMouseEnter={() => openNow("approvals")}
                onMouseLeave={() => scheduleCloseFor("approvals")}
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
                      if (next) {
                        requestAnimationFrame(() =>
                          computeAndSetMenuPos("approvals")
                        );
                      }
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
                      width: menuPos.approvals?.width ?? 320,
                    }}
                    onMouseEnter={() => openNow("approvals")}
                    onMouseLeave={() => scheduleCloseFor("approvals")}
                  >
                    <div className="dd-scroll">
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
                  </div>
                ) : null}
              </div>
            )}

            {/* ================= FINANCE ================= */}
            {meIsAdminRole && (
              <div
                className="topnav-dd"
                ref={financeRef}
                onMouseEnter={() => openNow("finance")}
                onMouseLeave={() => scheduleCloseFor("finance")}
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
                      if (next) {
                        requestAnimationFrame(() =>
                          computeAndSetMenuPos("finance")
                        );
                      }
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
                      width: menuPos.finance?.width ?? 320,
                    }}
                    onMouseEnter={() => openNow("finance")}
                    onMouseLeave={() => scheduleCloseFor("finance")}
                  >
                    <div className="dd-scroll">
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
                  </div>
                ) : null}
              </div>
            )}

            {/* ================= ADMIN ================= */}
            {meIsAdminRole && (
              <div
                className="topnav-dd"
                ref={adminRef}
                onMouseEnter={() => openNow("admin")}
                onMouseLeave={() => scheduleCloseFor("admin")}
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
                      if (next) {
                        requestAnimationFrame(() =>
                          computeAndSetMenuPos("admin")
                        );
                      }
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
                      width: menuPos.admin?.width ?? 320,
                    }}
                    onMouseEnter={() => openNow("admin")}
                    onMouseLeave={() => scheduleCloseFor("admin")}
                  >
                    <div className="dd-scroll">
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
                  </div>
                ) : null}
              </div>
            )}
          </nav>

          {/* Right: profile menu */}
          <div className="topnav-right" ref={profileWrapRef}>
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

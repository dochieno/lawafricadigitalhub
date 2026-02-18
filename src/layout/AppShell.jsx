// src/layout/AppShell.jsx
import { Outlet, NavLink, useLocation, Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
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

/* ----------------------------
   Tiny inline icons (no deps)
----------------------------- */
function Ic({ children }) {
  return (
    <span className="dd-ic" aria-hidden="true">
      {children}
    </span>
  );
}

function IcSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2l1.2 5.2L18 9l-4.8 1.8L12 16l-1.2-5.2L6 9l4.8-1.8L12 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M19 14l.7 3 2.3.8-2.3.8-.7 3-.7-3-2.3-.8 2.3-.8.7-3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function IcUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M4 20a8 8 0 0 1 16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IcCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcReceipt() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1-2 1V3Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9 7h6M9 11h6M9 15h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IcCard() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16v10H4V7Z" stroke="currentColor" strokeWidth="2" />
      <path d="M4 10h16" stroke="currentColor" strokeWidth="2" />
      <path
        d="M7 14h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IcSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 15a8.6 8.6 0 0 0 .1-6l-2.1-.5a7.3 7.3 0 0 0-1.3-1.3l.5-2.1a8.6 8.6 0 0 0-6-.1l-.5 2.1c-.5.3-1 .7-1.3 1.3l-2.1-.5a8.6 8.6 0 0 0-.1 6l2.1.5c.3.5.7 1 1.3 1.3l-.5 2.1a8.6 8.6 0 0 0 6 .1l.5-2.1c.5-.3 1-.7 1.3-1.3l2.1.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcBook() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M7 20h12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IcUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 8l5-5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M5 21h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IcLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IcShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2 20 6v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9 12l2 2 4-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuHeader({ title, subtitle }) {
  return (
    <div className="dd-head" aria-hidden="true">
      <div className="dd-head-top">
        <span className="dd-head-dot" />
        <div className="dd-head-title">{title}</div>
      </div>
      {subtitle ? <div className="dd-head-sub">{subtitle}</div> : null}
    </div>
  );
}

function DdItem({ to, label, icon, onClick }) {
  return (
    <NavLink to={to} className="dd-item" role="menuitem" onClick={onClick}>
      {icon ? <Ic>{icon}</Ic> : null}
      <span className="dd-label">{label}</span>
    </NavLink>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  // ✅ Profile menu wrapper
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

    const width = 320;
    const maxLeft = window.innerWidth - width - 12;

    const left = clamp(Math.round(r.left), 12, Math.max(12, maxLeft));
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
      requestAnimationFrame(() => computeAndSetMenuPos(key));

      // collapse profile menu (best-effort)
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

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpenDd(null);
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

      if (!insideA && !insideAD && !insideF && !insideFloatingMenu) {
        setOpenDd(null);
      }

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

  const approvalsOpenFinal = openDd === "approvals";
  const financeOpenFinal = openDd === "finance";
  const adminOpenFinal = openDd === "admin";

  return (
    <div className="app-shell">
      <header className="topnav">
        <div className="topnav-inner">
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

            <NavLink
              to="/dashboard/ai/commentary"
              className={({ isActive }) => `topnav-link ${isActive ? "active" : ""} ai-tab`}
            >
              ✨ Ask AI
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
                      if (next)
                        requestAnimationFrame(() =>
                          computeAndSetMenuPos("approvals")
                        );
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
                      ["--arrow-left"]: "22px",
                    }}
                    onMouseEnter={() => openNow("approvals")}
                    onMouseLeave={() => scheduleCloseFor("approvals")}
                  >
                    <MenuHeader
                      title="Approvals"
                      subtitle="Review and manage approvals"
                    />
                    <div className="dd-scroll">
                      <DdItem
                        to="/dashboard/approvals"
                        label="Dashboard"
                        icon={<IcGrid />}
                        onClick={() => setOpenDd(null)}
                      />
                      {meIsInstitutionAdmin && (
                        <DdItem
                          to="/dashboard/approvals/members"
                          label="Members"
                          icon={<IcUsers />}
                          onClick={() => setOpenDd(null)}
                        />
                      )}
                      {meIsAdminRole && (
                        <DdItem
                          to="/dashboard/approvals/subscription-requests"
                          label="Approval Requests"
                          icon={<IcCheck />}
                          onClick={() => setOpenDd(null)}
                        />
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
                      if (next)
                        requestAnimationFrame(() =>
                          computeAndSetMenuPos("finance")
                        );
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
                      ["--arrow-left"]: "22px",
                    }}
                    onMouseEnter={() => openNow("finance")}
                    onMouseLeave={() => scheduleCloseFor("finance")}
                  >
                    <MenuHeader
                      title="Finance"
                      subtitle="Invoices, payments and tax setup"
                    />
                    <div className="dd-scroll">
                      <DdItem
                        to="/dashboard/admin/finance/invoices"
                        label="Invoices"
                        icon={<IcReceipt />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/finance/payments"
                        label="Payments"
                        icon={<IcCard />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/finance/invoice-settings"
                        label="Invoice Settings"
                        icon={<IcSettings />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/finance/vat-rates"
                        label="VAT Setup"
                        icon={<IcSettings />}
                        onClick={() => setOpenDd(null)}
                      />
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
                      if (next)
                        requestAnimationFrame(() =>
                          computeAndSetMenuPos("admin")
                        );
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
                      ["--arrow-left"]: "22px",
                    }}
                    onMouseEnter={() => openNow("admin")}
                    onMouseLeave={() => scheduleCloseFor("admin")}
                  >
                    <MenuHeader
                      title="Admin"
                      subtitle="Manage platform configuration"
                    />
                    <div className="dd-scroll">
                      <DdItem
                        to="/dashboard/admin/institutions"
                        label="Institutions"
                        icon={<IcUsers />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/content-products"
                        label="Products"
                        icon={<IcGrid />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/content-product-prices"
                        label="Product Prices"
                        icon={<IcReceipt />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/documents"
                        label="Books"
                        icon={<IcBook />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/toc-test"
                        label="Table of Contents (Test)"
                        icon={<IcLink />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/llr-services"
                        label="LLR Services"
                        icon={<IcSettings />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/courts"
                        label="Courts"
                        icon={<IcGrid />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/llr-services/import"
                        label="Import Cases"
                        icon={<IcUpload />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/institution-subscriptions"
                        label="Subscriptions"
                        icon={<IcShield />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/user-subscriptions"
                        label="Public Subscriptions"
                        icon={<IcUsers />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/trials"
                        label="Trials"
                        icon={<IcCheck />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/institution-bundle-subscriptions"
                        label="Bundle"
                        icon={<IcLink />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/institution-admins"
                        label="Institution Admins"
                        icon={<IcUsers />}
                        onClick={() => setOpenDd(null)}
                      />
                      <DdItem
                        to="/dashboard/admin/users"
                        label="Users"
                        icon={<IcUsers />}
                        onClick={() => setOpenDd(null)}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </nav>

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

      <main className="app-main">
        <Outlet />
      </main>

      {/* ✅ Always-visible floating Ask AI button (portal to <body> to avoid z-index/transform issues) */}
      {createPortal(
        <button
          type="button"
          className="ai-fab"
          title="Ask AI"
          onClick={() => navigate("/dashboard/ai/commentary")}
        >
          <span className="ai-fab-ic" aria-hidden="true">
            <IcSpark />
          </span>
          <span className="ai-fab-txt">Ask AI</span>
        </button>,
        document.body
      )}

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

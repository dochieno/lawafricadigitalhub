// src/pages/ResetPassword.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/login.css"; // ✅ reuse existing look

// ✅ Use env if provided, otherwise fallback:
// - local dev: VITE_API_BASE_URL=http://localhost:7033
// - production: VITE_API_BASE_URL=https://lawafricaapi.onrender.com
const API_BASE = (import.meta?.env?.VITE_API_BASE_URL || "http://localhost:7033").replace(/\/$/, "");
const API = `${API_BASE}/api`;

function getTokenFromQuery(search) {
  return new URLSearchParams(search).get("token") || "";
}

function isStrongEnough(pw) {
  return (pw || "").length >= 8;
}

function strengthLabel(pw) {
  const p = pw || "";
  if (!p) return { label: "—", ok: false };
  if (p.length < 8) return { label: "Too short", ok: false };
  // lightweight heuristic (no heavy rules; can tighten later)
  const hasUpper = /[A-Z]/.test(p);
  const hasLower = /[a-z]/.test(p);
  const hasNum = /\d/.test(p);
  const hasSym = /[^A-Za-z0-9]/.test(p);
  const score = [hasUpper, hasLower, hasNum, hasSym].filter(Boolean).length;

  if (p.length >= 12 && score >= 3) return { label: "Strong", ok: true };
  if (score >= 2) return { label: "Good", ok: true };
  return { label: "Okay", ok: true };
}

function IconEye({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 5c5.5 0 9.9 4 11 7-1.1 3-5.5 7-11 7S2.1 15 1 12c1.1-3 5.5-7 11-7Zm0 2C7.7 7 4.3 10 3.2 12 4.3 14 7.7 17 12 17s7.7-3 8.8-5C19.7 10 16.3 7 12 7Zm0 2.5A2.5 2.5 0 1 1 12 15a2.5 2.5 0 0 1 0-5Z"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.3 4.3a1 1 0 0 1 1.4 0l16 16a1 1 0 1 1-1.4 1.4l-2.3-2.3c-1.2.4-2.5.6-4 .6-5.5 0-9.9-4-11-7 .7-1.8 2.5-4 5-5.5L2.3 5.7a1 1 0 0 1 0-1.4Zm5.4 5.4c-2.1 1.2-3.6 2.9-4.4 4.3 1.1 2 4.5 5 8.7 5 .9 0 1.8-.1 2.6-.3l-1.7-1.7a4.5 4.5 0 0 1-5.2-5.2L7.7 9.7ZM12 7c4.2 0 7.6 3 8.8 5-.4.7-1 1.6-1.8 2.4a1 1 0 0 1-1.4-1.4c.4-.4.7-.8 1-1.2C17.7 10 14.3 7 12 7c-.5 0-1 .1-1.5.2a1 1 0 0 1-.5-1.9c.7-.2 1.3-.3 2-.3Zm0 4a1.5 1.5 0 0 0-1.5 1.5c0 .3.1.6.2.8l2.1 2.1c.2-.2.2-.5.2-.8A1.5 1.5 0 0 0 12 11Z"
      />
    </svg>
  );
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const token = useMemo(() => getTokenFromQuery(location.search).trim(), [location.search]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const pwStrength = useMemo(() => strengthLabel(newPassword), [newPassword]);

  const matches = newPassword && confirmPassword && newPassword === confirmPassword;

  const canSubmit =
    !!token && isStrongEnough(newPassword) && newPassword === confirmPassword && !loading;

  useEffect(() => {
    // clear messages when token changes (new link)
    setError("");
    setInfo("");
  }, [token]);

  useEffect(() => {
    // clear error as the user types (feels less "sticky")
    if (error) setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPassword, confirmPassword]);

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!token) {
      setError("This reset link is missing or invalid. Please request a new password reset email.");
      return;
    }

    if (!isStrongEnough(newPassword)) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/Auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const text = await res.text();
      let raw;
      try {
        raw = text ? JSON.parse(text) : null;
      } catch {
        raw = text;
      }
      const data = raw?.data ?? raw;

      if (!res.ok) {
        // keep backend message if present
        setError(typeof data === "string" ? data : data?.message || "Invalid or expired reset link.");
        return;
      }

      setInfo("Password reset successful. Redirecting to sign in…");
      setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-layout">
      {/* LEFT PANEL (reuse login brand) */}
      <div className="login-info-panel">
        <div className="li-left-wrap">
          <a className="li-brand" href="/" aria-label="Go to home">
            <img src="/logo.png" alt="LawAfrica" className="login-brand-logo" />
          </a>

          <h1 className="li-title">Reset password</h1>
          <p className="tagline">Choose a new password for your account.</p>

          <div className="li-what-card" style={{ marginTop: 18 }}>
            <div className="li-what-title">Tips</div>

            <div className="li-item" style={{ paddingTop: 8 }}>
              <span className="li-icoWrap" aria-hidden="true">
                <span style={{ fontWeight: 950, color: "rgba(255,255,255,0.85)" }}>✓</span>
              </span>
              <div className="li-itemText">
                <div className="li-itemName">Use a long passphrase</div>
                <div className="li-itemDesc">At least 8 characters. Longer is better.</div>
              </div>
            </div>

            <div className="li-item" style={{ paddingTop: 6 }}>
              <span className="li-icoWrap" aria-hidden="true">
                <span style={{ fontWeight: 950, color: "rgba(255,255,255,0.85)" }}>✓</span>
              </span>
              <div className="li-itemText">
                <div className="li-itemName">Avoid reusing old passwords</div>
                <div className="li-itemDesc">Use something unique to LawAfrica.</div>
              </div>
            </div>

            <div className="li-what-divider" />
            <div className="li-trustline">Secure • Trusted • Authoritative</div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-top-accent" />
          <h2>Set a new password</h2>
          <p className="subtitle">Enter and confirm your new password.</p>

          {!token && (
            <div className="error-box">
              This reset link is missing or invalid. Please request a new password reset email.
            </div>
          )}

          {error && <div className="error-box">{error}</div>}
          {info && <div className="success-box">{info}</div>}

          <form onSubmit={handleReset}>
            {/* New password */}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <input
                type={showNew ? "text" : "password"}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={!token || loading}
                autoComplete="new-password"
                style={{ marginBottom: 0, paddingRight: 44 }}
              />
              <button
                type="button"
                className="link-button"
                onClick={() => setShowNew((v) => !v)}
                disabled={!token || loading}
                aria-label={showNew ? "Hide password" : "Show password"}
                title={showNew ? "Hide" : "Show"}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 34,
                  height: 34,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "#ffffff",
                  textDecoration: "none",
                }}
              >
                <IconEye open={showNew} />
              </button>
            </div>

            {/* Confirm password */}
            <div style={{ position: "relative", marginBottom: 8 }}>
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={!token || loading}
                autoComplete="new-password"
                style={{ marginBottom: 0, paddingRight: 44 }}
              />
              <button
                type="button"
                className="link-button"
                onClick={() => setShowConfirm((v) => !v)}
                disabled={!token || loading}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                title={showConfirm ? "Hide" : "Show"}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 34,
                  height: 34,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "#ffffff",
                  textDecoration: "none",
                }}
              >
                <IconEye open={showConfirm} />
              </button>
            </div>

            {/* Small inline status row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                marginTop: 10,
                fontSize: 12,
                color: "#6b7280",
                textAlign: "left",
              }}
            >
              <div>
                Min <b>8 characters</b> • Strength: <b>{pwStrength.label}</b>
              </div>

              {confirmPassword ? (
                <div style={{ fontWeight: 800, color: matches ? "#067647" : "#8b1c1c" }}>
                  {matches ? "Match" : "No match"}
                </div>
              ) : (
                <div style={{ opacity: 0.75 }}> </div>
              )}
            </div>

            <button type="submit" disabled={!canSubmit} style={{ marginTop: 14 }}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>

            {/* Secondary actions (clean + compact) */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                marginTop: 12,
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              <span className="linkish" onClick={() => navigate("/login")}>
                Back to login
              </span>

              <span
                className="linkish"
                onClick={() => navigate("/login", { state: { openForgotPassword: true } })}
              >
                Request new reset link
              </span>
            </div>
          </form>

          <div className="footer-text">Secure • Trusted • Authoritative</div>
        </div>
      </div>
    </div>
  );
}

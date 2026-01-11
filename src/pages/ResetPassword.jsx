// src/pages/ResetPassword.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/login.css"; // ✅ reuse existing look

function getTokenFromQuery(search) {
  return new URLSearchParams(search).get("token") || "";
}

function isStrongEnough(pw) {
  // Keep rules aligned with backend (min 8). You can tighten later.
  return (pw || "").length >= 8;
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const token = useMemo(() => getTokenFromQuery(location.search).trim(), [location.search]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit =
    token &&
    isStrongEnough(newPassword) &&
    newPassword === confirmPassword &&
    !loading;

  useEffect(() => {
    // Clear messages when token/password changes
    setError("");
    setInfo("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!token) {
      setError("Reset link is missing a token. Please request a new password reset link.");
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
      const res = await fetch("https://localhost:7033/api/Auth/reset-password", {
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
        setError(typeof data === "string" ? data : data?.message || "Invalid or expired reset token.");
        return;
      }

      setInfo("Password reset successful. Redirecting to sign in…");

      // Small delay so user sees success message
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1200);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-layout">
      {/* LEFT PANEL (same branding as login) */}
      <div className="login-info-panel">
        <img src="/logo.png" alt="LawAfrica" className="login-brand-logo" />

        <h1>LawAfrica Digital Platform</h1>
        <p className="tagline">Trusted legal knowledge. Anywhere. Anytime.</p>

        <ul className="login-benefits">
          <li>✔ Authoritative legal publications</li>
          <li>✔ Secure access with two-factor authentication</li>
          <li>✔ Read, track progress & manage your library</li>
          <li>✔ Designed for professionals & institutions</li>
        </ul>

        <div className="trust-note">
          Used by courts, law firms, universities, and public institutions.
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="login-form-panel">
        <div className="login-card">
          <h2>Reset your password</h2>
          <p className="subtitle">
            Choose a new password for your LawAfrica account.
          </p>

          {!token && (
            <div className="error-box">
              This reset link is missing or invalid. Please request a new password reset link.
            </div>
          )}

          {error && <div className="error-box">{error}</div>}

          {info && (
            <div
              style={{
                background: "#ECFDF3",
                border: "1px solid #ABEFC6",
                color: "#067647",
                padding: "10px 12px",
                borderRadius: 10,
                marginBottom: 12,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {info}
            </div>
          )}

          <form onSubmit={handleReset}>
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={!token || loading}
              autoComplete="new-password"
            />

            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={!token || loading}
              autoComplete="new-password"
            />

            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              Password must be at least <b>8 characters</b>.
            </div>

            <button type="submit" disabled={!canSubmit} style={{ marginTop: 12 }}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>

          {/* Secondary actions */}
          <div style={{ marginTop: 14, fontSize: 13, color: "#6b7280" }}>
            Remembered your password?{" "}
            <span
              style={{ color: "#8b1c1c", fontWeight: 700, cursor: "pointer" }}
              onClick={() => navigate("/login")}
            >
              Sign in
            </span>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "#6b7280" }}>
            Need a new reset link?{" "}
            <span
              style={{ color: "#8b1c1c", fontWeight: 700, cursor: "pointer" }}
              onClick={() => navigate("/login", { state: { openForgotPassword: true } })}
            >
              Request password reset
            </span>
          </div>

          <div className="footer-text">Secure • Trusted • Authoritative</div>
        </div>
      </div>
    </div>
  );
}

// src/pages/TwoFactorSetup.jsx
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import api from "../api/client.js";
import "../styles/twofactor.css"; // reuse existing auth styles

// ✅ Must match Register.jsx
const LS_REG_USERNAME = "la_reg_username";
const LS_REG_PASSWORD = "la_reg_password";

export default function TwoFactorSetup() {
  const nav = useNavigate();
  const location = useLocation();

  const initialUsername = location.state?.username || "";
  const initialPassword = location.state?.password || "";

  // ✅ Fallback after Paystack redirect (React state lost)
  const storedUsername = (() => {
    try {
      return localStorage.getItem(LS_REG_USERNAME) || "";
    } catch {
      return "";
    }
  })();

  const storedPassword = (() => {
    try {
      return localStorage.getItem(LS_REG_PASSWORD) || "";
    } catch {
      return "";
    }
  })();

  const [username, setUsername] = useState(initialUsername || storedUsername || "");
  const [password, setPassword] = useState(initialPassword || storedPassword || "");

  const [setupToken, setSetupToken] = useState("");
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const canResend = useMemo(() => username.trim() && password, [username, password]);

  // ✅ Keep localStorage in sync if user edits (best-effort)
  useEffect(() => {
    try {
      if (username?.trim()) localStorage.setItem(LS_REG_USERNAME, username.trim());
      if (password) localStorage.setItem(LS_REG_PASSWORD, password);
    } catch {
      // ignore
    }
  }, [username, password]);

  function clearStoredCreds() {
    try {
      localStorage.removeItem(LS_REG_USERNAME);
      localStorage.removeItem(LS_REG_PASSWORD);
    } catch {
      // ignore
    }
  }

  async function resendSetupEmail() {
    setError("");
    setInfo("");

    if (!canResend) {
      setError("Enter username and password to resend your setup email.");
      return;
    }

    setResendLoading(true);
    try {
      const res = await api.post("/security/resend-2fa-setup", {
        username: username.trim(),
        password,
      });

      const data = res.data?.data ?? res.data;

      // In dev you might get setupToken back
      if (data?.setupToken) {
        setSetupToken(data.setupToken);
        setInfo("Setup email resent. (Dev) Setup token has been filled automatically.");
      } else {
        setInfo("If the account exists and credentials are correct, a new 2FA setup email has been sent.");
      }
    } catch (err) {
      setError(err?.response?.data || err?.message || "Failed to resend setup email.");
    } finally {
      setResendLoading(false);
    }
  }

  async function verifySetup(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!setupToken.trim()) {
      setError("Paste your setup token from the email (or dev response) first.");
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setError("Enter a valid 6-digit code from your Authenticator app.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/security/verify-2fa-setup", {
        setupToken: setupToken.trim(),
        code,
      });

      // ✅ Cleanup temporary Paystack/signup creds once user completes 2FA
      clearStoredCreds();

      setInfo("2FA enabled successfully. You can now sign in.");
      setTimeout(() => nav("/login", { replace: true }), 900);
    } catch (err) {
      setError(err?.response?.data || err?.message || "Invalid/expired setup token or invalid code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-content">
        <div className="twofactor-card">
          <div className="brand-header">
            <img src="/logo.png" alt="LawAfrica Logo" className="brand-logo" />
            <p className="brand-tagline">Know. Do. Be More.</p>
          </div>

          <h2>Set up Two-Factor Authentication</h2>
          <p className="subtitle">
            Check your email for the QR / setup instructions, add LawAfrica to your Authenticator app,
            then verify using the setup token and 6-digit code.
          </p>

          {error && <div className="error-box">{String(error)}</div>}
          {info && (
            <div
              className="success-box"
              style={{
                background: "#e9fff3",
                border: "1px solid #a7f3d0",
                color: "#065f46",
                padding: 12,
                borderRadius: 8,
                marginBottom: 14,
              }}
            >
              {String(info)}
            </div>
          )}

          <div style={{ textAlign: "left", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
              Didn’t receive the email? Resend it:
            </div>

            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={resendLoading || loading}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={resendLoading || loading}
            />

            <button
              type="button"
              onClick={resendSetupEmail}
              disabled={resendLoading || loading}
              style={{ marginTop: 10 }}
            >
              {resendLoading ? "Resending..." : "Resend setup email"}
            </button>
          </div>

          <form onSubmit={verifySetup}>
            <input
              type="text"
              placeholder="Setup token (from email)"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              disabled={loading || resendLoading}
            />

            <input
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              disabled={loading || resendLoading}
            />

            <button type="submit" disabled={loading || resendLoading}>
              {loading ? "Verifying..." : "Enable 2FA"}
            </button>
          </form>

          <div className="footer-text" style={{ marginTop: 14 }}>
            <span
              style={{ cursor: "pointer", color: "#8b1c1c", fontWeight: 700 }}
              onClick={() => nav("/login")}
            >
              Back to sign in
            </span>
          </div>
        </div>
      </div>

      <footer className="auth-footer">
        <div className="auth-footer-inner">
          <h4 className="auth-footer-title">
            <span className="lock-icon" aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            Secure. Trusted. Authoritative.
          </h4>

          <p>
            LawAfrica protects your legal research with industry-grade security
            while giving you access to Africa’s most authoritative legal knowledge.
          </p>
        </div>
      </footer>
    </div>
  );
}

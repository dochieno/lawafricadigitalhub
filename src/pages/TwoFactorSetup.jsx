// src/pages/TwoFactorSetup.jsx
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client.js";
import "../styles/twofactor.css";

// ✅ Must match Register.jsx
const LS_REG_USERNAME = "la_reg_username";
const LS_REG_PASSWORD = "la_reg_password";

// ✅ From Login.jsx
const LS_LOGIN_USERNAME = "la_login_username";
const LS_LOGIN_PASSWORD = "la_login_password";

// ✅ NEW: store setup token so refresh still auto-populates
const LS_2FA_SETUP_TOKEN = "la_2fa_setup_token";

// ✅ Small helper: avoid [object Object]
function getApiErrorMessage(err, fallback = "Request failed.") {
  const data = err?.response?.data;

  // If API returns { message: "..." }
  if (data && typeof data === "object" && typeof data.message === "string") {
    return data.message;
  }

  // If API returns plain string
  if (typeof data === "string") return data;

  // Axios generic
  if (typeof err?.message === "string") return err.message;

  return fallback;
}

export default function TwoFactorSetup() {
  const nav = useNavigate();
  const location = useLocation();

  // ✅ NEW: only auto-fetch when coming from Register flow
  const autoFetchSetupToken = !!location.state?.autoFetchSetupToken;

  const initialUsername = location.state?.username || "";
  const initialPassword = location.state?.password || "";

  // ✅ NEW: initial token can come from navigation state OR storage
  const initialSetupToken =
    (location.state?.setupToken || "").trim() ||
    (() => {
      try {
        return (localStorage.getItem(LS_2FA_SETUP_TOKEN) || "").trim();
      } catch {
        return "";
      }
    })();

  // ✅ Fallback after Paystack redirect OR login refresh
  const storedUsername = (() => {
    try {
      return (
        localStorage.getItem(LS_REG_USERNAME) ||
        localStorage.getItem(LS_LOGIN_USERNAME) ||
        ""
      );
    } catch {
      return "";
    }
  })();

  const storedPassword = (() => {
    try {
      return (
        localStorage.getItem(LS_REG_PASSWORD) ||
        localStorage.getItem(LS_LOGIN_PASSWORD) ||
        ""
      );
    } catch {
      return "";
    }
  })();

  const [username, setUsername] = useState(
    initialUsername || storedUsername || ""
  );
  const [password, setPassword] = useState(
    initialPassword || storedPassword || ""
  );

  const [setupToken, setSetupToken] = useState(initialSetupToken);
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const canResend = useMemo(
    () => username.trim() && password,
    [username, password]
  );

  const autoFetchRanRef = useRef(false);

  // ✅ Keep localStorage in sync if user edits (best-effort)
  useEffect(() => {
    try {
      const u = username?.trim();
      if (u) {
        localStorage.setItem(LS_REG_USERNAME, u);
        localStorage.setItem(LS_LOGIN_USERNAME, u);
      }
      if (password) {
        localStorage.setItem(LS_REG_PASSWORD, password);
        localStorage.setItem(LS_LOGIN_PASSWORD, password);
      }
    } catch {
      // ignore
    }
  }, [username, password]);

  // ✅ NEW: persist setup token so refresh keeps it
  useEffect(() => {
    try {
      const t = (setupToken || "").trim();
      if (t) localStorage.setItem(LS_2FA_SETUP_TOKEN, t);
    } catch {
      // ignore
    }
  }, [setupToken]);

  function clearStoredCreds() {
    try {
      localStorage.removeItem(LS_REG_USERNAME);
      localStorage.removeItem(LS_REG_PASSWORD);
      localStorage.removeItem(LS_LOGIN_USERNAME);
      localStorage.removeItem(LS_LOGIN_PASSWORD);
    } catch {
      // ignore
    }
  }

  function clearStoredSetupToken() {
    try {
      localStorage.removeItem(LS_2FA_SETUP_TOKEN);
    } catch {
      // ignore
    }
  }

  async function resendSetupEmail({ silent = false } = {}) {
    if (!silent) {
      setError("");
      setInfo("");
    }

    if (!canResend) {
      if (!silent) setError("Enter username and password to resend your setup email.");
      return "";
    }

    if (resendLoading || loading) return "";

    setResendLoading(true);
    try {
      const res = await api.post("/Security/resend-2fa-setup", {
        username: username.trim(),
        password,
      });

      const data = res.data?.data ?? res.data;

      // In dev you might get setupToken back
      if (data?.setupToken) {
        setSetupToken(data.setupToken);
        if (!silent) setInfo("Setup token has been filled automatically.");
        return data.setupToken;
      } else {
        if (!silent) {
          setInfo(
            "A new 2FA setup email has been sent. If your API doesn’t return a token in production, use the token from the email."
          );
        }
        return "";
      }
    } catch (err) {
      if (!silent) setError(getApiErrorMessage(err, "Failed to resend setup email."));
      return "";
    } finally {
      setResendLoading(false);
    }
  }

  // ✅ NEW: auto-fetch token ONCE when coming from Register and token is empty
  useEffect(() => {
    if (!autoFetchSetupToken) return;
    if (autoFetchRanRef.current) return;
    if (setupToken.trim()) return;
    if (!canResend) return;

    autoFetchRanRef.current = true;

    (async () => {
      setInfo("Preparing your 2FA setup…");
      const t = await resendSetupEmail({ silent: true });
      if (t) {
        setInfo("Setup token has been filled automatically. Enter your 6-digit code to continue.");
      } else {
        // fallback message
        setInfo("Check your email for the setup token. If it didn’t auto-fill, click “Resend setup email”.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchSetupToken, canResend, setupToken]);

  async function verifySetup(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!setupToken.trim()) {
      setError("Setup token is missing. Click “Resend setup email” to auto-fill it.");
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setError("Enter a valid 6-digit code from your Authenticator app.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/Security/verify-2fa-setup", {
        setupToken: setupToken.trim(),
        code: code.trim(),
      });

      // ✅ Cleanup temporary creds once user completes 2FA setup
      clearStoredCreds();
      clearStoredSetupToken();

      setInfo("2FA enabled successfully. You can now sign in.");
      setTimeout(() => nav("/login", { replace: true }), 900);
    } catch (err) {
      setError(
        getApiErrorMessage(err, "Invalid/expired setup token or invalid code.")
      );
    } finally {
      setLoading(false);
    }
  }

  const actionDisabled = resendLoading || loading;

  const linkStyleBase = {
    display: "inline-block",
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: "0.1px",
    color: actionDisabled ? "#9ca3af" : "#8b1c1c",
    cursor: actionDisabled ? "not-allowed" : "pointer",
    userSelect: "none",
    marginTop: 10,
    padding: "6px 2px",
  };

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
            Check your email for the QR / setup instructions, add LawAfrica to
            your Authenticator app, then verify using the setup token and
            6-digit code.
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
              disabled={actionDisabled}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={actionDisabled}
            />

            <span
              role="button"
              tabIndex={0}
              onClick={() => !actionDisabled && resendSetupEmail()}
              onKeyDown={(e) => {
                if (actionDisabled) return;
                if (e.key === "Enter" || e.key === " ") resendSetupEmail();
              }}
              style={linkStyleBase}
              onMouseEnter={(e) => {
                if (actionDisabled) return;
                e.currentTarget.style.textDecoration = "underline";
                e.currentTarget.style.opacity = "0.92";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.textDecoration = "none";
                e.currentTarget.style.opacity = "1";
              }}
              aria-disabled={actionDisabled}
              title={
                canResend
                  ? "Resend your setup email"
                  : "Enter username and password first"
              }
            >
              {resendLoading ? "Resending setup email…" : "Resend setup email"}
            </span>
          </div>

          <form onSubmit={verifySetup}>
            <input
              type="text"
              placeholder="Setup token (from email)"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              disabled={actionDisabled}
            />

            <input
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              disabled={actionDisabled}
            />

            <button type="submit" disabled={actionDisabled}>
              {loading ? "Verifying..." : "Enable 2FA"}
            </button>
          </form>

          <div className="footer-text" style={{ marginTop: 14 }}>
            <span
              role="button"
              tabIndex={0}
              style={{
                cursor: actionDisabled ? "not-allowed" : "pointer",
                color: actionDisabled ? "#9ca3af" : "#8b1c1c",
                fontWeight: 800,
                textDecoration: "none",
              }}
              onClick={() => !actionDisabled && nav("/login")}
              onKeyDown={(e) => {
                if (actionDisabled) return;
                if (e.key === "Enter" || e.key === " ") nav("/login");
              }}
              onMouseEnter={(e) => {
                if (actionDisabled) return;
                e.currentTarget.style.textDecoration = "underline";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.textDecoration = "none";
              }}
              aria-disabled={actionDisabled}
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
            while giving you access to Africa’s most authoritative legal
            knowledge.
          </p>
        </div>
      </footer>
    </div>
  );
}

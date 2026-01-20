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

// ✅ store setup token so refresh still auto-populates
const LS_2FA_SETUP_TOKEN = "la_2fa_setup_token";

function getApiErrorMessage(err, fallback = "Request failed.") {
  const data = err?.response?.data;
  if (data && typeof data === "object" && typeof data.message === "string") return data.message;
  if (typeof data === "string") return data;
  if (typeof err?.message === "string") return err.message;
  return fallback;
}

export default function TwoFactorSetup() {
  const nav = useNavigate();
  const location = useLocation();

  // ✅ only auto-fetch when coming from Register flow
  const autoFetchSetupToken = !!location.state?.autoFetchSetupToken;

  const initialUsername = location.state?.username || "";
  const initialPassword = location.state?.password || "";

  const initialSetupToken =
    (location.state?.setupToken || "").trim() ||
    (() => {
      try {
        return (localStorage.getItem(LS_2FA_SETUP_TOKEN) || "").trim();
      } catch {
        return "";
      }
    })();

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

  // ✅ these remain in background (not rendered)
  const [username, setUsername] = useState(initialUsername || storedUsername || "");
  const [password, setPassword] = useState(initialPassword || storedPassword || "");
  const [setupToken, setSetupToken] = useState(initialSetupToken);

  // ✅ Only visible input
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const canResend = useMemo(() => username.trim() && password, [username, password]);

  const autoFetchRanRef = useRef(false);

  // ✅ keep creds stored (best effort) — still hidden
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

  // ✅ persist setup token for refresh — still hidden
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
      if (!silent) setError("We couldn’t recover your session details. Please sign in again.");
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

      if (data?.setupToken) {
        setSetupToken(data.setupToken);
        if (!silent) setInfo("Setup prepared. Enter your 6-digit code to continue.");
        return data.setupToken;
      }

      if (!silent) {
        setInfo("A new setup email has been sent. If token isn’t returned by the API, use the email token.");
      }
      return "";
    } catch (err) {
      if (!silent) setError(getApiErrorMessage(err, "Failed to resend setup email."));
      return "";
    } finally {
      setResendLoading(false);
    }
  }

  // ✅ auto-fetch token ONCE when coming from Register and token is empty
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
        setInfo("Ready. Enter the 6-digit code from your authenticator app.");
      } else {
        setInfo("Check your email for setup instructions. If needed, click “Resend setup email”.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchSetupToken, canResend, setupToken]);

  async function verifySetup(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!setupToken.trim()) {
      setError("Setup is not ready yet. Click “Resend setup email” to prepare it.");
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

      clearStoredCreds();
      clearStoredSetupToken();

      setInfo("2FA enabled successfully. Redirecting to sign in…");
      setTimeout(() => nav("/login", { replace: true }), 900);
    } catch (err) {
      setError(getApiErrorMessage(err, "Invalid/expired setup token or invalid code."));
    } finally {
      setLoading(false);
    }
  }

  const actionDisabled = resendLoading || loading;

  // ✅ If we have no creds, don't show hidden fields — just guide user
  const hasSession = !!(username.trim() && password);

  return (
    <div className="auth-page">
      <div className="auth-content">
        <div
          className="twofactor-card"
          style={{
            maxWidth: 520,
            padding: "28px 26px",
            borderRadius: 18,
            boxShadow: "0 18px 40px rgba(17,24,39,0.08)",
          }}
        >
          <div className="brand-header" style={{ marginBottom: 18 }}>
            <img
              src="/logo.png"
              alt="LawAfrica Logo"
              className="brand-logo"
              style={{ height: 54, objectFit: "contain" }}
            />
            <p className="brand-tagline" style={{ marginTop: 6 }}>
              Know. Do. Be More.
            </p>
          </div>

          <h2 style={{ marginBottom: 8 }}>Set up Two-Factor Authentication</h2>

          <p className="subtitle" style={{ marginBottom: 16 }}>
            Open your authenticator app (Google Authenticator / Authy), then enter the 6-digit code below.
          </p>

          {error && (
            <div className="error-box" style={{ marginBottom: 12 }}>
              {String(error)}
            </div>
          )}

          {info && (
            <div
              className="success-box"
              style={{
                background: "#e9fff3",
                border: "1px solid #a7f3d0",
                color: "#065f46",
                padding: 12,
                borderRadius: 12,
                marginBottom: 14,
              }}
            >
              {String(info)}
            </div>
          )}

          {/* ✅ Resend link (kept) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Didn’t get the setup email?
            </div>

            <button
              type="button"
              onClick={() => !actionDisabled && resendSetupEmail()}
              disabled={actionDisabled || !hasSession}
              style={{
                border: "1px solid #e5e7eb",
                background: "white",
                color: hasSession ? "#8b1c1c" : "#9ca3af",
                fontWeight: 900,
                padding: "10px 12px",
                borderRadius: 12,
                cursor: actionDisabled || !hasSession ? "not-allowed" : "pointer",
              }}
              title={hasSession ? "Resend setup email" : "Please sign in again to resend"}
            >
              {resendLoading ? "Resending…" : "Resend setup email"}
            </button>
          </div>

          {!hasSession && (
            <div
              style={{
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                color: "#7c2d12",
                padding: 12,
                borderRadius: 12,
                marginBottom: 14,
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              We can’t recover your session details to complete setup. Please go back to sign in and try again.
            </div>
          )}

          <form onSubmit={verifySetup} style={{ marginTop: 6 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#111827", marginBottom: 8 }}>
              6-digit code
            </label>

            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => {
                // ✅ Keep digits only, max 6
                const v = String(e.target.value || "").replace(/\D/g, "").slice(0, 6);
                setCode(v);
              }}
              maxLength={6}
              disabled={actionDisabled || !hasSession}
              style={{
                textAlign: "center",
                letterSpacing: "6px",
                fontSize: 18,
                fontWeight: 900,
              }}
            />

            <button
              type="submit"
              disabled={actionDisabled || !hasSession}
              style={{
                marginTop: 14,
                borderRadius: 12,
              }}
            >
              {loading ? "Verifying..." : "Enable 2FA"}
            </button>

            <div style={{ marginTop: 14, textAlign: "center" }}>
              <span
                role="button"
                tabIndex={0}
                style={{
                  cursor: actionDisabled ? "not-allowed" : "pointer",
                  color: actionDisabled ? "#9ca3af" : "#8b1c1c",
                  fontWeight: 900,
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
          </form>
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
            LawAfrica protects your legal research with industry-grade security while giving you access to Africa’s most
            authoritative legal knowledge.
          </p>
        </div>
      </footer>
    </div>
  );
}

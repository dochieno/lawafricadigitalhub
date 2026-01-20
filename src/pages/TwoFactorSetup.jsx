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

// ✅ small helper for masking tokens in UI
function maskToken(t) {
  const s = String(t || "").trim();
  if (!s) return "";
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export default function TwoFactorSetup() {
  const nav = useNavigate();
  const location = useLocation();

  // ✅ from 2FA email link (?token=xxxx)
  const urlToken = useMemo(() => {
    const sp = new URLSearchParams(location.search || "");
    return (sp.get("token") || "").trim();
  }, [location.search]);

  // ✅ only auto-fetch when coming from Register flow
  const autoFetchSetupToken = !!location.state?.autoFetchSetupToken;

  const initialUsername = location.state?.username || "";
  const initialPassword = location.state?.password || "";

  const initialSetupToken =
    (location.state?.setupToken || "").trim() ||
    urlToken ||
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
  const codeInputRef = useRef(null);

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

  // ✅ if token comes from URL and state/localstorage was empty, focus code input
  useEffect(() => {
    if (urlToken && !setupToken) setSetupToken(urlToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken]);

  useEffect(() => {
    // focus once page loads and input is enabled
    const t = setTimeout(() => codeInputRef.current?.focus?.(), 200);
    return () => clearTimeout(t);
  }, []);

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
      if (!silent) setError("Your session details are missing. Please sign in again to resend setup.");
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
        setSetupToken(String(data.setupToken).trim());
        if (!silent) setInfo("Setup refreshed. Enter the 6-digit code from your authenticator app.");
        return data.setupToken;
      }

      if (!silent) {
        setInfo("A new setup email has been sent. Use the token in the email if one isn’t shown here.");
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
        setTimeout(() => codeInputRef.current?.focus?.(), 150);
      } else {
        setInfo("Check your email for setup instructions. If needed, use “Resend setup”.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchSetupToken, canResend, setupToken]);

  async function verifySetup(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!setupToken.trim()) {
      setError("Missing setup token. Open the 2FA email link again, or use “Resend setup”.");
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setError("Enter a valid 6-digit code.");
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

      setInfo("2FA enabled. Redirecting to sign in…");
      setTimeout(() => nav("/login", { replace: true }), 900);
    } catch (err) {
      setError(getApiErrorMessage(err, "Invalid/expired setup token or invalid code."));
    } finally {
      setLoading(false);
    }
  }

  const actionDisabled = resendLoading || loading;

  // ✅ If we have no creds, we can still verify if token was provided via email link.
  const hasToken = !!setupToken.trim();
  const canVerify = !actionDisabled && hasToken;

  // ✅ Resend requires creds
  const canShowResend = !!(username.trim() && password);

  // ---------- UI helpers ----------
  const cardStyle = {
    width: "100%",
    maxWidth: 560,
    borderRadius: 22,
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 22px 60px rgba(17,24,39,0.10)",
    border: "1px solid rgba(229,231,235,0.9)",
    backdropFilter: "blur(10px)",
    padding: "28px 26px",
  };

  const pillStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#374151",
    fontSize: 12,
    fontWeight: 800,
  };

  const primaryBtnStyle = {
    marginTop: 14,
    borderRadius: 14,
    padding: "12px 14px",
    fontWeight: 900,
    letterSpacing: "0.2px",
  };

  const secondaryBtnStyle = {
    border: "1px solid #e5e7eb",
    background: "white",
    color: "#111827",
    fontWeight: 900,
    padding: "10px 12px",
    borderRadius: 14,
    cursor: actionDisabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  return (
    <div className="auth-page" style={{ position: "relative" }}>
      {/* subtle background accents (no new CSS required) */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(900px 450px at 20% 10%, rgba(128,16,16,0.10), transparent 55%), radial-gradient(800px 400px at 90% 30%, rgba(29,78,216,0.10), transparent 55%)",
        }}
      />

      <div className="auth-content" style={{ position: "relative", zIndex: 1 }}>
        <div className="twofactor-card" style={cardStyle}>
          {/* Header */}
          <div className="brand-header" style={{ marginBottom: 16 }}>
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

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 style={{ marginBottom: 6 }}>Two-Factor Setup</h2>
              <p className="subtitle" style={{ marginBottom: 0, maxWidth: 460 }}>
                Open your authenticator app and enter the <b>6-digit</b> code. If you came from an email link, your setup
                token is already included.
              </p>
            </div>

            <span style={pillStyle} title={hasToken ? "Setup token detected" : "No setup token yet"}>
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: hasToken ? "#10b981" : "#f59e0b",
                  display: "inline-block",
                }}
              />
              {hasToken ? `Token: ${maskToken(setupToken)}` : "Token needed"}
            </span>
          </div>

          {/* Alerts */}
          {error && (
            <div className="error-box" style={{ marginTop: 14, marginBottom: 10 }}>
              {String(error)}
            </div>
          )}

          {info && (
            <div
              className="success-box"
              style={{
                background: "#ecfdf3",
                border: "1px solid #a7f3d0",
                color: "#065f46",
                padding: 12,
                borderRadius: 14,
                marginTop: 14,
                marginBottom: 10,
                lineHeight: 1.35,
              }}
            >
              {String(info)}
            </div>
          )}

          {/* Quick guidance */}
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 16,
              border: "1px solid #eef2ff",
              background: "#f8fafc",
              color: "#0f172a",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>What to do</div>
            <ol style={{ margin: 0, paddingLeft: 18, color: "#334155", fontSize: 13, lineHeight: 1.5 }}>
              <li>Open your authenticator app and find “LawAfrica”.</li>
              <li>Type the <b>6-digit code</b> shown there.</li>
              <li>Tap <b>Enable 2FA</b> to finish.</li>
            </ol>
          </div>

          {/* Resend section */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginTop: 14,
            }}
          >
            <div style={{ fontSize: 13, color: "#64748b" }}>
              Need a new setup email?
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                (Only available if we can recover your session.)
              </div>
            </div>

            <button
              type="button"
              onClick={() => !actionDisabled && resendSetupEmail()}
              disabled={actionDisabled || !canShowResend}
              style={{
                ...secondaryBtnStyle,
                color: canShowResend ? "#801010" : "#9ca3af",
                borderColor: "#e5e7eb",
              }}
              title={canShowResend ? "Resend setup email" : "Sign in again to resend"}
            >
              {resendLoading ? "Sending…" : "Resend setup"}
              <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
                ↻
              </span>
            </button>
          </div>

          {!canShowResend && (
            <div
              style={{
                marginTop: 12,
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                color: "#7c2d12",
                padding: 12,
                borderRadius: 14,
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              We can’t resend without your session details. If you didn’t open this from the email link, please sign in
              again and complete 2FA setup.
            </div>
          )}

          {/* Verify form */}
          <form onSubmit={verifySetup} style={{ marginTop: 14 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 13,
                fontWeight: 900,
                color: "#0f172a",
                marginBottom: 8,
              }}
            >
              <span>Authenticator code</span>
              <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 800 }}>6 digits</span>
            </label>

            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => {
                const v = String(e.target.value || "").replace(/\D/g, "").slice(0, 6);
                setCode(v);
              }}
              maxLength={6}
              disabled={actionDisabled}
              style={{
                textAlign: "center",
                letterSpacing: "10px",
                fontSize: 20,
                fontWeight: 900,
                borderRadius: 16,
                padding: "14px 12px",
              }}
            />

            <button
              type="submit"
              disabled={!canVerify}
              style={primaryBtnStyle}
              title={!hasToken ? "Missing setup token" : "Enable 2FA"}
            >
              {loading ? "Enabling…" : "Enable 2FA"}
            </button>

            {/* token help */}
            {!hasToken && (
              <div style={{ marginTop: 12, fontSize: 13, color: "#64748b", lineHeight: 1.35 }}>
                <b>Missing token?</b> Open the 2FA email link again (it includes the token), or use “Resend setup” if
                available.
              </div>
            )}

            {/* footer actions */}
            <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => !actionDisabled && nav("/login")}
                disabled={actionDisabled}
                style={{
                  ...secondaryBtnStyle,
                  borderRadius: 999,
                  padding: "10px 14px",
                }}
              >
                Back to sign in
              </button>

              <button
                type="button"
                onClick={() => {
                  if (actionDisabled) return;
                  setCode("");
                  setError("");
                  setInfo("");
                  setTimeout(() => codeInputRef.current?.focus?.(), 120);
                }}
                disabled={actionDisabled}
                style={{
                  ...secondaryBtnStyle,
                  borderRadius: 999,
                  padding: "10px 14px",
                }}
                title="Clear code input"
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      </div>

      <footer className="auth-footer" style={{ position: "relative", zIndex: 1 }}>
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

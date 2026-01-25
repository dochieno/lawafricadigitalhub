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
      return localStorage.getItem(LS_REG_USERNAME) || localStorage.getItem(LS_LOGIN_USERNAME) || "";
    } catch {
      return "";
    }
  })();

  const storedPassword = (() => {
    try {
      return localStorage.getItem(LS_REG_PASSWORD) || localStorage.getItem(LS_LOGIN_PASSWORD) || "";
    } catch {
      return "";
    }
  })();

  // ✅ these remain in background (not rendered)
const [username] = useState(initialUsername || storedUsername || "");
const [password] = useState(initialPassword || storedPassword || "");
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

  // ✅ if token comes from URL and state/localstorage was empty, set it
  useEffect(() => {
    if (urlToken && !setupToken) setSetupToken(urlToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken]);

  useEffect(() => {
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

    const clean = String(code || "").replace(/\D/g, "").slice(0, 6);
    if (!/^\d{6}$/.test(clean)) {
      setError("Enter a valid 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/Security/verify-2fa-setup", {
        setupToken: setupToken.trim(),
        code: clean,
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

  const hasToken = !!setupToken.trim();
  const canVerify = !actionDisabled && hasToken;

  const canShowResend = !!(username.trim() && password);

  return (
    <div className="tf-layout">
      {/* LEFT */}
      <section className="tf-info-panel">
        <div className="tf-left-wrap">
          <a className="tf-brand" href="/" aria-label="LawAfrica home">
            <img src="/logo.png" alt="LawAfrica" className="tf-brand-logo" draggable="false" />
          </a>

          <h1 className="tf-title">Two-Factor Setup</h1>
          <p className="tf-tagline">Enable extra security before you continue.</p>

          <div className="tf-what-card">
            <div className="tf-what-title">Why you’re seeing this</div>

            <div className="tf-item">
              <div className="tf-icoWrap" aria-hidden="true">
                <svg className="tf-ico" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2l8 4v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6l8-4z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 12l2 2 4-5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className="tf-itemText">
                <div className="tf-itemName">Account protection</div>
                <div className="tf-itemDesc">
                  Enter a 6-digit code from your authenticator app to enable 2FA.
                </div>
              </div>
            </div>

            <div className="tf-divider" />
            <div className="tf-trustline">Secure • Trusted • Authoritative</div>
          </div>
        </div>
      </section>

      {/* RIGHT */}
      <section className="tf-form-panel">
        <div className="tf-card">
          <h2>Enter verification code</h2>
          <p className="tf-subtitle">
            Open your authenticator app and enter the <b>6-digit</b> code. If you came from an email link, your setup
            token may already be included.
          </p>

          <div className={`tf-pill ${hasToken ? "is-ok" : "is-warn"}`} title={hasToken ? "Setup token detected" : "No setup token yet"}>
            <span className="tf-pill-dot" aria-hidden="true" />
            {hasToken ? (
              <span>
                Token: <b>{maskToken(setupToken)}</b>
              </span>
            ) : (
              <span>Token needed</span>
            )}
          </div>

          {error && <div className="tf-error">{String(error)}</div>}
          {info && <div className="tf-success">{String(info)}</div>}

          <div className="tf-steps">
            <div className="tf-steps-title">What to do</div>
            <ol className="tf-steps-list">
              <li>Open your authenticator app and find “LawAfrica”.</li>
              <li>Type the <b>6-digit code</b> shown there.</li>
              <li>Tap <b>Enable 2FA</b> to finish.</li>
            </ol>
          </div>

          <div className="tf-resend-row">
            <div className="tf-resend-text">
              Need a new setup email?
              <div className="tf-resend-sub">(Only available if we can recover your session.)</div>
            </div>

            <button
              type="button"
              className="tf-ghost"
              onClick={() => !actionDisabled && resendSetupEmail()}
              disabled={actionDisabled || !canShowResend}
              title={canShowResend ? "Resend setup email" : "Sign in again to resend"}
            >
              {resendLoading ? "Sending…" : "Resend setup"} <span aria-hidden="true">↻</span>
            </button>
          </div>

          {!canShowResend && (
            <div className="tf-warn">
              We can’t resend without your session details. If you didn’t open this from the email link, please sign in
              again and complete 2FA setup.
            </div>
          )}

          <form onSubmit={verifySetup} style={{ marginTop: 14 }}>
            <label className="tf-label">
              <span>Authenticator code</span>
              <span className="tf-label-hint">6 digits</span>
            </label>

            <input
              ref={codeInputRef}
              className="tf-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(String(e.target.value || "").replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              disabled={actionDisabled}
            />

            <button className="tf-btn" type="submit" disabled={!canVerify} title={!hasToken ? "Missing setup token" : "Enable 2FA"}>
              {loading ? "Enabling…" : "Enable 2FA"}
            </button>

            {!hasToken && (
              <div className="tf-help">
                <b>Missing token?</b> Open the 2FA email link again (it includes the token), or use “Resend setup” if
                available.
              </div>
            )}

            <div className="tf-actions">
              <button type="button" className="tf-ghost" onClick={() => !actionDisabled && nav("/login")} disabled={actionDisabled}>
                Back to sign in
              </button>

              <button
                type="button"
                className="tf-ghost"
                onClick={() => {
                  if (actionDisabled) return;
                  setCode("");
                  setError("");
                  setInfo("");
                  setTimeout(() => codeInputRef.current?.focus?.(), 120);
                }}
                disabled={actionDisabled}
                title="Clear code input"
              >
                Clear
              </button>
            </div>
          </form>

          <div className="tf-footer-text">Secure • Trusted • Authoritative</div>
        </div>
      </section>
    </div>
  );
}
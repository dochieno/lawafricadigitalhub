// src/pages/TwoFactor.jsx
import { useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import api from "../api/client.js";
import { saveToken } from "../auth/auth.js";
import { useAuth } from "../auth/AuthContext";
import "../styles/twofactor.css";

const LS_LOGIN_USERNAME = "la_login_username";

// ✅ Optional: if your login returns a userId or temp token for 2FA, persist it.
// If you don't use these yet, leaving them here won't break anything.
const LS_2FA_USERID = "la_2fa_user_id";
const LS_2FA_TEMP_TOKEN = "la_2fa_temp_token";

function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function getApiErrorMessage(err, fallback) {
  const data = err?.response?.data;

  // ASP.NET ProblemDetails
  if (data && typeof data === "object") {
    if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
    if (typeof data.title === "string" && data.title.trim()) return data.title;
    if (typeof data.message === "string" && data.message.trim()) return data.message;
  }

  if (typeof data === "string" && data.trim()) return data;
  if (typeof err?.message === "string" && err.message.trim()) return err.message;

  return fallback;
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" className="tf-ico" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2l8 4v6c0 5.5-3.7 9.8-8 10-4.3-.2-8-4.5-8-10V6l8-4Zm0 2.2L6 7v5c0 4.3 2.9 7.9 6 8.1 3.1-.2 6-3.8 6-8.1V7l-6-2.8Z"
      />
      <path
        fill="currentColor"
        d="M11 12.6l-1.6-1.6a1 1 0 10-1.4 1.4l2.3 2.3a1 1 0 001.4 0l4.8-4.8a1 1 0 10-1.4-1.4L11 12.6Z"
      />
    </svg>
  );
}

export default function TwoFactor() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useAuth();

  // ✅ Resolve username safely (state OR storage)
  const username = useMemo(() => {
    const fromState = String(location.state?.username || "").trim();
    if (fromState) return fromState;

    try {
      return String(localStorage.getItem(LS_LOGIN_USERNAME) || "").trim();
    } catch {
      return "";
    }
  }, [location.state]);

  // ✅ Optional context (only if your login sets them)
  const ctxUserId = useMemo(() => {
    const fromState = location.state?.userId;
    if (fromState != null && Number(fromState) > 0) return Number(fromState);

    try {
      const raw = localStorage.getItem(LS_2FA_USERID);
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }, [location.state]);

  const ctxTempToken = useMemo(() => {
    const fromState = String(location.state?.twoFactorToken || "").trim();
    if (fromState) return fromState;

    try {
      return String(localStorage.getItem(LS_2FA_TEMP_TOKEN) || "").trim();
    } catch {
      return "";
    }
  }, [location.state]);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onVerify(e) {
    e.preventDefault();
    setError("");

    // ✅ Don’t proceed without a session identifier
    if (!username && !ctxUserId && !ctxTempToken) {
      setError("Your verification session has expired. Please sign in again.");
      return;
    }

    const cleanCode = String(code || "").trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Please enter a valid 6-digit verification code.");
      return;
    }

    setLoading(true);

    try {
      // ✅ Most backends accept username+code.
      // If yours needs userId or tempToken, we include them safely (won't break if ignored).
      const payload = {
        username: username || undefined,
        userId: ctxUserId || undefined,
        twoFactorToken: ctxTempToken || undefined,
        code: cleanCode,
      };

      const res = await api.post("/Auth/confirm-2fa", payload);

      const token = res.data?.token || res.data?.Token || res.data;
      if (!token || typeof token !== "string") {
        throw new Error("Verification succeeded but token was not returned.");
      }

      saveToken(token);

      // ✅ cleanup pending keys
    try {
      localStorage.removeItem(LS_LOGIN_USERNAME);
      localStorage.removeItem(LS_2FA_USERID);
      localStorage.removeItem(LS_2FA_TEMP_TOKEN);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("2FA storage cleanup failed:", err);
      }
    }
      await refreshUser();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("confirm-2fa failed:", err);
      setError(
        getApiErrorMessage(
          err,
          "The verification code you entered is incorrect or expired. Please try again."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  const sessionMissing = !username && !ctxUserId && !ctxTempToken;

  return (
    <div className="tf-layout">
      {/* LEFT PANEL (matches Login premium panel) */}
      <div className="tf-info-panel">
        <div className="tf-left-wrap">
          <a className="tf-brand" href="/" aria-label="Go to home">
            <img src="/logo.png" alt="LawAfrica" className="tf-brand-logo" />
          </a>

          <h1 className="tf-title">Two-Step Verification</h1>
          <p className="tf-tagline">Extra security to protect your account.</p>

          <div className="tf-what-card">
            <div className="tf-what-title">Why you’re seeing this</div>

            <div className="tf-item">
              <span className="tf-icoWrap">
                <IconShield />
              </span>
              <div className="tf-itemText">
                <div className="tf-itemName">Account protection</div>
                <div className="tf-itemDesc">
                  We verify a 6-digit code from your authenticator app before granting access.
                </div>
              </div>
            </div>

            <div className="tf-divider" />
            <div className="tf-trustline">Secure • Trusted • Authoritative</div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="tf-form-panel">
        <div className="tf-card">
          <h2>Enter verification code</h2>
          <p className="tf-subtitle">
            Use the 6-digit code from Google Authenticator or Microsoft Authenticator.
          </p>

          {sessionMissing ? (
            <div className="tf-error">
              Session missing. Please go back to login and try again.
            </div>
          ) : null}

          {error ? <div className="tf-error">{toText(error)}</div> : null}

          <form onSubmit={onVerify}>
            <input
              className="tf-input"
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              autoFocus
              disabled={loading}
            />

            <button className="tf-btn" type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Verify Code"}
            </button>
          </form>

          <div className="tf-footer-text">Secure • Trusted • Authoritative</div>

          <div className="tf-help">
            Having trouble?{" "}
            <button
              type="button"
              className="tf-linkbtn"
              onClick={() => navigate("/login", { replace: true })}
              disabled={loading}
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
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
      } catch {}

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

  return (
    <div className="auth-page">
      <div className="auth-content">
        <div className="twofactor-card">
          <div className="brand-header">
            <img src="/logo.png" alt="LawAfrica Logo" className="brand-logo" />
            <p className="brand-tagline">Know. Do. Be More.</p>
          </div>

          <h2>Two-Step Verification</h2>
          <p className="subtitle">
            For your security, please enter the 6-digit verification code from your Google Authenticator
            or Microsoft Authenticator app.
          </p>

          {/* helpful debug hint (safe) */}
          {!username && !ctxUserId && !ctxTempToken ? (
            <div className="error-box" style={{ marginBottom: 12 }}>
              Session missing. Please go back to login and try again.
            </div>
          ) : null}

          {error && <div className="error-box">{toText(error)}</div>}

          <form onSubmit={onVerify}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              autoFocus
              disabled={loading}
            />

            <button type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Verify Code"}
            </button>
          </form>

          <div className="footer-text">Secure • Trusted • Authoritative</div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
            Having trouble?{" "}
            <span
              style={{ color: "#8b1c1c", fontWeight: 800, cursor: "pointer" }}
              onClick={() => navigate("/login", { replace: true })}
            >
              Back to login
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
            LawAfrica protects your legal research with industry-grade security while giving you access to
            Africa’s most authoritative legal knowledge.
          </p>
        </div>
      </footer>
    </div>
  );
}

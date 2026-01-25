// src/pages/Login.jsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/login.css";
import { useAuth } from "../auth/AuthContext";

// ✅ Use env if provided, otherwise fallback:
// - local dev: VITE_API_BASE_URL=http://localhost:7033
// - production: VITE_API_BASE_URL=https://lawafricaapi.onrender.com
const API_BASE = (import.meta?.env?.VITE_API_BASE_URL || "http://localhost:7033").replace(/\/$/, "");
const API = `${API_BASE}/api`;

function IconScale() {
  return (
    <svg viewBox="0 0 24 24" className="li-ico" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3c.3 0 .6.1.8.3l6.5 6.5c.4.4.4 1 0 1.4l-6.5 6.5c-.4.4-1 .4-1.4 0L4.9 11.2c-.4-.4-.4-1 0-1.4l6.5-6.5c.2-.2.5-.3.8-.3Zm0 2.4L7 10.4l5 5 5-5-5-5ZM6 21c-.6 0-1-.4-1-1s.4-1 1-1h12c.6 0 1 .4 1 1s-.4 1-1 1H6Z"
      />
    </svg>
  );
}
function IconReport() {
  return (
    <svg viewBox="0 0 24 24" className="li-ico" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 3h7l5 5v13c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2Zm6 1v5h5"
      />
      <path
        fill="currentColor"
        d="M8 12h8c.6 0 1 .4 1 1s-.4 1-1 1H8c-.6 0-1-.4-1-1s.4-1 1-1Zm0 4h8c.6 0 1 .4 1 1s-.4 1-1 1H8c-.6 0-1-.4-1-1s.4-1 1-1Z"
      />
    </svg>
  );
}
function IconComment() {
  return (
    <svg viewBox="0 0 24 24" className="li-ico" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 4h16c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H8l-4 3v-3H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2Zm3 5h10c.6 0 1 .4 1 1s-.4 1-1 1H7c-.6 0-1-.4-1-1s.4-1 1-1Zm0 4h7c.6 0 1 .4 1 1s-.4 1-1 1H7c-.6 0-1-.4-1-1s.4-1 1-1Z"
      />
    </svg>
  );
}
function IconJournal() {
  return (
    <svg viewBox="0 0 24 24" className="li-ico" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 3h10c1.1 0 2 .9 2 2v16c0 .6-.4 1-1 1H7c-1.7 0-3-1.3-3-3V6c0-1.7 1.3-3 3-3Zm0 2c-.6 0-1 .4-1 1v13c0 .6.4 1 1 1h10V5H6Z"
      />
      <path
        fill="currentColor"
        d="M8 8h6c.6 0 1 .4 1 1s-.4 1-1 1H8c-.6 0-1-.4-1-1s.4-1 1-1Zm0 4h6c.6 0 1 .4 1 1s-.4 1-1 1H8c-.6 0-1-.4-1-1s.4-1 1-1Z"
      />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Email verified redirect banner
  const [banner, setBanner] = useState({ type: "", text: "" });

  // ✅ forgot password popup
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // ✅ inline "resend verification email" link loading
  const [resendInlineLoading, setResendInlineLoading] = useState(false);

  const { refreshUser } = useAuth();

  // ✅ Read ?verified=1/0 from redirect after email verification
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const verified = (qs.get("verified") || "").trim();
    const reason = (qs.get("reason") || "").trim();

    if (verified === "1") {
      setBanner({ type: "success", text: "✅ Email verified successfully. Please log in." });
      return;
    }

    if (verified === "0") {
      const msg =
        reason === "expired"
          ? "⚠️ Verification link expired. Please resend verification email."
          : "⚠️ Email verification failed. Please resend verification email.";
      setBanner({ type: "error", text: msg });
      return;
    }

    setBanner({ type: "", text: "" });
  }, [location.search]);

  function formatLockoutMessage(rawMessage) {
    const match = rawMessage.match(/until\s(.+)/i);
    if (!match) {
      return "Your account is temporarily locked due to suspicious activity. Please try again later.";
    }
    const date = new Date(match[1]);
    if (isNaN(date.getTime())) {
      return "Your account is temporarily locked due to suspicious activity. Please try again later.";
    }
    return (
      `Due to suspicious activity, your account has been temporarily locked until ` +
      `${date.toLocaleDateString()} at ${date.toLocaleTimeString()}. ` +
      `Please contact the LawAfrica support team if this persists.`
    );
  }

  function looksLikeEmailNotVerified(msg) {
    const m = String(msg || "").toLowerCase();
    return m.includes("verify your email") || m.includes("email not verified");
  }

  async function handleInlineResendVerification() {
    setError("");
    setInfo("");
    setResendInlineLoading(true);

    try {
      const key = (username || "").trim();
      if (!key) {
        setError("Enter your username or email first, then click resend verification email.");
        return;
      }

      const res = await fetch(`${API}/Auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrUsername: key }),
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
        setError(typeof data === "string" ? data : data?.message || "Could not resend verification email.");
        return;
      }

      // ✅ generic success (no user enumeration)
      setInfo("If the account exists, a verification email has been sent.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResendInlineLoading(false);
    }
  }

  async function handleLogin() {
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const response = await fetch(`${API}/Auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const text = await response.text();
      let raw;
      try {
        raw = text ? JSON.parse(text) : null;
      } catch {
        raw = text;
      }
      const data = raw?.data ?? raw;

      if (!response.ok) {
        const msg = typeof data === "string" ? data : data?.message;

        if (typeof msg === "string" && msg.toLowerCase().includes("account locked")) {
          setError(formatLockoutMessage(msg));
          return;
        }

        // ✅ Email not verified UX (compact + link)
        if (looksLikeEmailNotVerified(msg)) {
          setError(msg || "Email not verified. Please verify your email before logging in.");
          return;
        }

        setError(msg || "Incorrect username or password. Please try again.");
        return;
      }

      if (data?.requires2FASetup) {
        navigate("/twofactor-setup", { state: { username, password }, replace: true });
        return;
      }

      if (data?.requires2FA) {
        navigate("/twofactor", { state: { username }, replace: true });
        return;
      }

      const token = data?.token || data?.Token;
      if (token) {
        localStorage.setItem("token", token);
        await refreshUser();
        navigate("/dashboard", { replace: true });
        return;
      }

      setError("Login response did not include a token.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestPasswordReset() {
    setError("");
    setInfo("");
    setResetLoading(true);

    try {
      const email = (resetEmail || "").trim();
      if (!email) {
        setError("Please enter your email address.");
        return;
      }

      const res = await fetch(`${API}/Auth/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
        setError(typeof data === "string" ? data : data?.message || "Could not request password reset.");
        return;
      }

      setInfo("If the account exists, a password reset link has been sent.");
      setShowForgot(false);
      setResetEmail("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResetLoading(false);
    }
  }

  // ✅ Branded modal (still simple, no libs)
  function Modal({ title, children, onClose }) {
    return (
      <div
        className="li-modal-overlay"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="li-modal">
          <div className="li-modal-brandbar" />
          <div className="li-modal-head">
            <div>
              <div className="li-modal-title">{title}</div>
              <div className="li-modal-sub">We’ll send a reset link (if the account exists).</div>
            </div>
            <button type="button" className="li-modal-x" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="li-modal-body">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-layout">
      {/* LEFT PANEL */}
      <div className="login-info-panel">
        <div className="li-left-wrap">
          <a className="li-brand" href="/" aria-label="Go to home">
            <img src="/logo.png" alt="LawAfrica" className="login-brand-logo" />
          </a>

          <h1 className="li-title">Digital Platform</h1>
          <p className="tagline">Trusted legal knowledge. Anywhere. Anytime.</p>

          {/* ✅ Dark “What you get” card (landing-style, but dark) */}
          <div className="li-what-card">
            <div className="li-what-title">What you get</div>

            <div className="li-item">
              <span className="li-icoWrap">
                <IconScale />
              </span>
              <div className="li-itemText">
                <div className="li-itemName">Statutes</div>
                <div className="li-itemDesc">Consolidated, updated and indexed legal materials.</div>
              </div>
            </div>

            <div className="li-item">
              <span className="li-icoWrap">
                <IconReport />
              </span>
              <div className="li-itemText">
                <div className="li-itemName">Law Reports</div>
                <div className="li-itemDesc">Reliable reporting for research and precedent-based work.</div>
              </div>
            </div>

            <div className="li-item">
              <span className="li-icoWrap">
                <IconComment />
              </span>
              <div className="li-itemText">
                <div className="li-itemName">Commentaries</div>
                <div className="li-itemDesc">Expert analysis for deeper understanding.</div>
              </div>
            </div>

            <div className="li-item">
              <span className="li-icoWrap">
                <IconJournal />
              </span>
              <div className="li-itemText">
                <div className="li-itemName">Journals</div>
                <div className="li-itemDesc">Scholarly insights for academics and practitioners.</div>
              </div>
            </div>

            <div className="li-what-divider" />

            <div className="li-trustline">Used by courts, law firms, universities, and public institutions.</div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-top-accent" />
          <h2>Sign in</h2>
          <p className="subtitle">Access trusted legal publications and resources.</p>

          {/* ✅ Verified banner */}
          {banner?.text && <div className={banner.type === "success" ? "success-box" : "error-box"}>{banner.text}</div>}

          {/* ✅ Error + inline resend link */}
          {error && (
            <div className="error-box">
              {error}

              {looksLikeEmailNotVerified(error) && (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <button
                    type="button"
                    className="link-button"
                    onClick={handleInlineResendVerification}
                    disabled={resendInlineLoading}
                    title={!username.trim() ? "Enter your username or email first" : "Resend verification email"}
                  >
                    {resendInlineLoading ? "Resending…" : "Resend verification email"}
                  </button>

                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>Tip: check your Spam/Junk folder too.</div>
                </div>
              )}
            </div>
          )}

          {info && <div className="success-box">{info}</div>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
          >
            <input
              type="text"
              placeholder="Username or email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            <button type="submit" disabled={loading} style={{ marginTop: 10 }}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* ✅ Forgot password below Sign In */}
          <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
            <span
              className="linkish"
              onClick={() => {
                setError("");
                setInfo("");
                setShowForgot(true);
              }}
            >
              Forgot password?
            </span>
          </div>

          {/* ✅ Forgot password modal */}
          {showForgot && (
            <Modal
              title="Reset your password"
              onClose={() => {
                setShowForgot(false);
                setResetEmail("");
              }}
            >
              <div className="li-modal-note">
                Enter the email address on your account and we’ll send a reset link (if the account exists).
              </div>

              <input
                type="email"
                placeholder="Email address"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="li-modal-input"
              />

              <div className="li-modal-actions">
                <button type="button" onClick={handleRequestPasswordReset} disabled={resetLoading} className="li-modal-primary">
                  {resetLoading ? "Sending..." : "Send reset link"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(false);
                    setResetEmail("");
                  }}
                  className="li-modal-ghost"
                >
                  Cancel
                </button>
              </div>
            </Modal>
          )}

          <div style={{ marginTop: 16, fontSize: 13, color: "#6b7280" }}>
            Don&apos;t have an account?{" "}
            <span className="linkish" onClick={() => navigate("/register")}>
              Create account
            </span>
          </div>

          <div className="footer-text">Secure • Trusted • Authoritative</div>
        </div>
      </div>
    </div>
  );
}
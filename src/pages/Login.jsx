// src/pages/Login.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/login.css";
import { useAuth } from "../auth/AuthContext";

// ✅ Use env if provided, otherwise fallback:
// - local dev: VITE_API_BASE_URL=http://localhost:7033
// - production: VITE_API_BASE_URL=https://lawafricaapi.onrender.com
const API_BASE = (import.meta?.env?.VITE_API_BASE_URL || "http://localhost:7033").replace(/\/$/, "");
const API = `${API_BASE}/api`;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ forgot password popup
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // ✅ inline "resend verification email" link loading
  const [resendInlineLoading, setResendInlineLoading] = useState(false);

  const { refreshUser } = useAuth();

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

  const emailNotVerified = useMemo(() => looksLikeEmailNotVerified(error), [error]);

  // ----------------------------------------------------
  // ✅ Banner after email verification redirect
  // API redirects to: /login?verified=1 OR /login?verified=0&reason=expired
  // ----------------------------------------------------
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const verified = (qs.get("verified") || "").trim();
    const reason = (qs.get("reason") || "").trim();

    if (verified === "1") {
      setError("");
      setInfo("Email verified successfully. You can now sign in.");
    } else if (verified === "0") {
      setInfo("");
      if (reason === "expired") {
        setError("Verification link expired. Please resend the verification email.");
      } else {
        setError("Email verification failed. Please request a new verification email.");
      }
    }
  }, [location.search]);

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

        // ✅ Email not verified UX
        if (looksLikeEmailNotVerified(msg)) {
          setError(msg || "Email not verified. Please verify your email before logging in.");
          return;
        }

        setError(msg || "Incorrect username or password. Please try again.");
        return;
      }

      if (data?.requires2FASetup) {
        navigate("/twofactor-setup", {
          state: { username, password },
          replace: true,
        });
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

  // ✅ Simple modal (no extra libs)
  function Modal({ title, children, onClose }) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          zIndex: 9999,
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #EAECF0",
            boxShadow: "0 18px 50px rgba(16,24,40,0.18)",
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ fontWeight: 850, color: "#101828" }}>{title}</div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "#fff",
                border: "1px solid #D0D5DD",
                borderRadius: 10,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ marginTop: 12 }}>{children}</div>
        </div>
      </div>
    );
  }

  function Banner({ kind, children, right }) {
    const isErr = kind === "error";
    const bg = isErr ? "#FEF2F2" : "#ECFDF3";
    const border = isErr ? "#FECACA" : "#ABEFC6";
    const color = isErr ? "#7F1D1D" : "#067647";
    const icon = isErr ? "⚠️" : "✅";

    return (
      <div
        style={{
          background: bg,
          border: `1px solid ${border}`,
          color,
          padding: "10px 12px",
          borderRadius: 12,
          marginBottom: 12,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ lineHeight: 1.1 }}>{icon}</div>
          <div style={{ fontSize: 13, fontWeight: 650, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
            {children}
          </div>
        </div>
        {right ? <div style={{ flex: "0 0 auto" }}>{right}</div> : null}
      </div>
    );
  }

  const inputStyle = {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #D0D5DD",
    padding: "12px 12px",
    outline: "none",
    fontSize: 14,
    background: "#fff",
  };

  return (
    <div className="login-layout">
      {/* LEFT PANEL */}
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

        <div className="trust-note">Used by courts, law firms, universities, and public institutions.</div>
      </div>

      {/* RIGHT PANEL */}
      <div className="login-form-panel">
        <div className="login-card" style={{ paddingTop: 26 }}>
          <h2 style={{ marginBottom: 6 }}>Sign in</h2>
          <p className="subtitle" style={{ marginTop: 0 }}>
            Access trusted legal publications and resources.
          </p>

          {/* ✅ Polished banners */}
          {error && (
            <Banner
              kind="error"
              right={
                emailNotVerified ? (
                  <button
                    type="button"
                    onClick={handleInlineResendVerification}
                    disabled={resendInlineLoading}
                    style={{
                      background: "transparent",
                      border: "1px solid #FCA5A5",
                      color: "#7F1D1D",
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: resendInlineLoading ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                    title={!username.trim() ? "Enter your username or email first" : "Resend verification email"}
                  >
                    {resendInlineLoading ? "Resending…" : "Resend email"}
                  </button>
                ) : null
              }
            >
              {error}
              {emailNotVerified && (
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 650, opacity: 0.9 }}>
                  Tip: check your Spam/Junk folder too.
                </div>
              )}
            </Banner>
          )}

          {info && <Banner kind="ok">{info}</Banner>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            style={{ display: "grid", gap: 10, marginTop: 4 }}
          >
            <input
              type="text"
              placeholder="Username or email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 6,
                borderRadius: 12,
                padding: "12px 14px",
                fontWeight: 900,
                letterSpacing: 0.2,
                background: "#801010",
                color: "#fff",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* Forgot password */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => {
                setError("");
                setInfo("");
                setShowForgot(true);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#801010",
                fontWeight: 900,
                cursor: "pointer",
                fontSize: 13,
                textDecoration: "underline",
              }}
            >
              Forgot password?
            </button>
          </div>

          {/* Forgot password modal */}
          {showForgot && (
            <Modal
              title="Reset your password"
              onClose={() => {
                setShowForgot(false);
                setResetEmail("");
              }}
            >
              <div style={{ fontSize: 13, color: "#344054", marginBottom: 10 }}>
                Enter the email address on your account and we’ll send a reset link (if the account exists).
              </div>

              <input
                type="email"
                placeholder="Email address"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                style={{
                  ...inputStyle,
                  marginBottom: 10,
                }}
              />

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={handleRequestPasswordReset}
                  disabled={resetLoading}
                  style={{
                    flex: 1,
                    background: "#801010",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontWeight: 900,
                    cursor: resetLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {resetLoading ? "Sending..." : "Send reset link"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(false);
                    setResetEmail("");
                  }}
                  style={{
                    flex: 1,
                    background: "#fff",
                    color: "#344054",
                    border: "1px solid #D0D5DD",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </Modal>
          )}

          <div style={{ marginTop: 14, fontSize: 13, color: "#6b7280", textAlign: "center" }}>
            Don&apos;t have an account?{" "}
            <span
              style={{ color: "#801010", fontWeight: 900, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => navigate("/register")}
            >
              Create account
            </span>
          </div>

          <div className="footer-text" style={{ marginTop: 14 }}>
            Secure • Trusted • Authoritative
          </div>
        </div>
      </div>
    </div>
  );
}

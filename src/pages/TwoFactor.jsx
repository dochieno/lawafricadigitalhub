import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import api from "../api/client.js";
import { saveToken } from "../auth/auth.js";
import { useAuth } from "../auth/AuthContext";
import "../styles/twofactor.css";

export default function TwoFactor() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useAuth();

  // Username passed from Login page
  const username = location.state?.username;

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onVerify(e) {
    e.preventDefault();
    setError("");

    if (!username) {
      setError("Your verification session has expired. Please sign in again.");
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setError("Please enter a valid 6-digit verification code.");
      return;
    }

    setLoading(true);

    try {
      const res = await api.post("/Auth/confirm-2fa", {
        username,
        code,
      });

      const token = res.data?.token || res.data?.Token || res.data;
      if (!token) throw new Error("Verification failed.");

      saveToken(token);
      await refreshUser();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data ||
          "The verification code you entered is incorrect or expired. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      {/* ================= MAIN CONTENT ================= */}
      <div className="auth-content">
        <div className="twofactor-card">
          {/* LOGO */}
          <div className="brand-header">
            <img src="/logo.png" alt="LawAfrica Logo" className="brand-logo" />
            <p className="brand-tagline">Know. Do. Be More.</p>
          </div>

          {/* TEXT */}
          <h2>Two-Step Verification</h2>
          <p className="subtitle">
            For your security, please enter the 6-digit verification
            code from your Google Authenticator or Microsoft Authenticator app.
          </p>

          {/* ERROR */}
          {error && <div className="error-box">{error}</div>}

          {/* FORM */}
          <form onSubmit={onVerify}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              autoFocus
            />

            <button type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Verify Code"}
            </button>
          </form>

          {/* SMALL INLINE TRUST TEXT */}
          <div className="footer-text">
            Secure • Trusted • Authoritative
          </div>
        </div>
      </div>

      {/* ================= PAGE FOOTER ================= */}
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

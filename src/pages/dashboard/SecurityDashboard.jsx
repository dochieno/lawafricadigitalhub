// src/pages/dashboard/SecurityDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import "../../styles/securityDashboard.css";

function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if (v.message) return String(v.message);
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return "An unexpected error occurred.";
    }
  }
  return String(v);
}

function safePretty(v) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function pickBool(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "boolean") return v;
  }
  return null;
}

function pickText(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function IconShield(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMail(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M4 6h16v12H4z"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M4 7.5l8 6 8-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M4 6h16v12H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRefresh(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M20 12a8 8 0 10-2.35 5.65"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20 8v4h-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconKey(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M8.5 14a4.5 4.5 0 114.4-5.6L22 8v4l-2 2h-2l-2 2h-2l-1.2 1.2A4.5 4.5 0 018.5 14z"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M8.5 14a4.5 4.5 0 114.4-5.6L22 8v4l-2 2h-2l-2 2h-2l-1.2 1.2A4.5 4.5 0 018.5 14z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="9.5" r="1" fill="currentColor" />
    </svg>
  );
}

export default function SecurityDashboard() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // resend setup email flow
  const [resendUsername, setResendUsername] = useState("");
  const [resendPassword, setResendPassword] = useState("");
  const [resendOut, setResendOut] = useState(null);

  // verify setup (setup token + TOTP code)
  const [setupToken, setSetupToken] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [verifyOut, setVerifyOut] = useState(null);

  const twoFactorEnabled = useMemo(() => {
    if (!status) return false;
    return !!(
      status.twoFactorEnabled ??
      status.TwoFactorEnabled ??
      status.isTwoFactorEnabled ??
      status.IsTwoFactorEnabled ??
      false
    );
  }, [status]);

  const emailVerified = useMemo(() => {
    return pickBool(status, [
      "isEmailVerified",
      "IsEmailVerified",
      "emailVerified",
      "EmailVerified",
    ]);
  }, [status]);

  const approved = useMemo(() => {
    return pickBool(status, ["isApproved", "IsApproved"]);
  }, [status]);

  const role = useMemo(() => pickText(status, ["role", "Role"]), [status]);
  const username = useMemo(() => pickText(status, ["username", "Username"]), [status]);
  const email = useMemo(() => pickText(status, ["email", "Email"]), [status]);
  const lastLoginAt = useMemo(() => pickText(status, ["lastLoginAt", "LastLoginAt"]), [status]);

  function twoFaTitle() {
    return twoFactorEnabled ? "Protected" : "Setup required";
  }

  function twoFaHelp() {
    if (twoFactorEnabled) {
      return "2FA is enabled on your account. You’ll be prompted for a code whenever you sign in.";
    }
    return "2FA is not enabled yet. Send the setup email, scan the QR code, then verify using the token + 6-digit code.";
  }

  async function loadStatus() {
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const res = await api.get("/security/status");
      const data = res.data?.data ?? res.data;
      setStatus(data || null);
    } catch (err) {
      setStatus(null);

      const statusCode = err?.response?.status;
      if (statusCode === 401) {
        setError(
          "Unauthorized (401). Your token is being sent, but the API can’t identify your user from JWT claims. Fix JWT claims (include 'userId' or read NameIdentifier in SecurityController)."
        );
      } else {
        setError(toText(err?.response?.data || err?.message || "Failed to load security status."));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function run(actionFn, successMsg) {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await actionFn();
      setInfo(successMsg);
      await loadStatus();
    } catch (err) {
      const statusCode = err?.response?.status;
      if (statusCode === 401) {
        setError(
          "Unauthorized (401). This usually means the JWT does not include the claim that the endpoint expects (e.g. 'userId')."
        );
      } else {
        setError(toText(err?.response?.data || err?.message || "Action failed."));
      }
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function enable2fa() {
    await run(
      () => api.post("/security/enable-2fa"),
      "2FA setup email sent. Check your inbox."
    );
  }

  async function regenerate2fa() {
    await run(
      () => api.post("/security/regenerate-2fa"),
      "A new 2FA setup email has been sent (new secret)."
    );
  }

  async function disable2fa() {
    await run(() => api.post("/security/disable-2fa"), "2FA has been disabled.");
  }

  async function resendSetupEmail(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");
    setResendOut(null);

    if (!resendUsername.trim() || !resendPassword) {
      setError("Enter username and password to resend the setup email.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/security/resend-2fa-setup", {
        username: resendUsername.trim(),
        password: resendPassword,
      });
      const data = res.data?.data ?? res.data;
      setResendOut(data);
      setInfo("If credentials are correct, a new setup email has been sent.");
    } catch (err) {
      setError(toText(err?.response?.data || err?.message || "Failed to resend setup email."));
    } finally {
      setBusy(false);
    }
  }

  async function verifySetup(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");
    setVerifyOut(null);

    if (!setupToken.trim() || !setupCode.trim()) {
      setError("Setup token and the 6-digit code are required.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/security/verify-2fa-setup", {
        setupToken: setupToken.trim(),
        code: setupCode.trim(),
      });
      const data = res.data?.data ?? res.data;
      setVerifyOut(data);
      setInfo("2FA enabled successfully.");
      await loadStatus();
    } catch (err) {
      setError(toText(err?.response?.data || err?.message || "Verification failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sec3-page">
      <header className="sec3-header">
        <div className="sec3-titleRow">
          <div className="sec3-iconWrap">
            <IconShield className="sec3-icon" />
          </div>
          <div>
            <h1 className="sec3-title">Security</h1>
            <p className="sec3-subtitle">Your account protection and two-factor authentication.</p>
          </div>
        </div>

        <button className="sec3-btn ghost" onClick={loadStatus} disabled={busy || loading}>
          <IconRefresh className="sec3-btnIcon" />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {(error || info) && (
        <div className={`sec3-alert ${error ? "error" : "ok"}`}>
          <div className="sec3-alertTitle">{error ? "Action needed" : "Success"}</div>
          <div className="sec3-alertBody">{error ? error : info}</div>
        </div>
      )}

      {/* Top summary */}
      <section className="sec3-summary">
        <div className={`sec3-summaryCard ${twoFactorEnabled ? "good" : "warn"}`}>
          <div className="sec3-summaryTop">
            <div className="sec3-summaryLeft">
              <div className="sec3-badge">
                <IconShield className="sec3-badgeIcon" />
                <span>2FA</span>
              </div>
              <div className="sec3-summaryTitle">{twoFaTitle()}</div>
              <div className="sec3-summaryHint">{twoFaHelp()}</div>
            </div>
            <div className={`sec3-pill ${twoFactorEnabled ? "ok" : "warn"}`}>
              {twoFactorEnabled ? "Enabled" : "Not enabled"}
            </div>
          </div>

          <div className="sec3-metaRow">
            <div className="sec3-meta">
              <span className="sec3-metaLabel">Email</span>
              <span className={`sec3-metaValue ${emailVerified ? "ok" : ""}`}>
                {emailVerified == null ? "—" : emailVerified ? "Verified" : "Not verified"}
              </span>
            </div>

            <div className="sec3-meta">
              <span className="sec3-metaLabel">Approval</span>
              <span className={`sec3-metaValue ${approved ? "ok" : ""}`}>
                {approved == null ? "—" : approved ? "Approved" : "Pending"}
              </span>
            </div>

            <div className="sec3-meta">
              <span className="sec3-metaLabel">Role</span>
              <span className="sec3-metaValue">{role || "—"}</span>
            </div>
          </div>

          <div className="sec3-miniProfile">
            <div className="sec3-miniLine">
              <span className="sec3-miniK">User</span>
              <span className="sec3-miniV">{username || "—"}</span>
            </div>
            <div className="sec3-miniLine">
              <span className="sec3-miniK">Email</span>
              <span className="sec3-miniV">{email || "—"}</span>
            </div>
            <div className="sec3-miniLine">
              <span className="sec3-miniK">Last login</span>
              <span className="sec3-miniV">{lastLoginAt || "—"}</span>
            </div>
          </div>
        </div>

        <div className="sec3-next">
          <div className="sec3-nextHead">
            <div className="sec3-nextTitle">Next steps</div>
            <div className="sec3-nextSub">Quick actions based on your status.</div>
          </div>

          <div className="sec3-nextList">
            <div className="sec3-step">
              <div className="sec3-stepIcon">
                <IconMail className="sec3-stepSvg" />
              </div>
              <div className="sec3-stepBody">
                <div className="sec3-stepTitle">Send setup email</div>
                <div className="sec3-stepText">
                  We’ll email you a QR code and setup token for activating 2FA.
                </div>
              </div>
              <button
                className="sec3-btn primary"
                onClick={enable2fa}
                disabled={busy || loading}
              >
                Send
              </button>
            </div>

            <div className="sec3-step">
              <div className="sec3-stepIcon">
                <IconKey className="sec3-stepSvg" />
              </div>
              <div className="sec3-stepBody">
                <div className="sec3-stepTitle">Verify setup</div>
                <div className="sec3-stepText">
                  After scanning the QR, verify with your setup token + 6-digit code.
                </div>
              </div>
              <div className={`sec3-pill ${twoFactorEnabled ? "ok" : "warn"}`}>
                {twoFactorEnabled ? "Done" : "Pending"}
              </div>
            </div>
          </div>

          <div className="sec3-actionsRow">
            <button className="sec3-btn" onClick={regenerate2fa} disabled={busy || loading}>
              Regenerate QR
            </button>

            <button
              className="sec3-btn danger"
              onClick={disable2fa}
              disabled={busy || loading || !twoFactorEnabled}
              title={!twoFactorEnabled ? "2FA is not enabled" : "Disable 2FA"}
            >
              Disable 2FA
            </button>
          </div>
        </div>
      </section>

      {/* Main grid */}
      <div className="sec3-grid">
        {/* LEFT: resend */}
        <section className="sec3-card">
          <div className="sec3-cardHead">
            <h2>Didn’t receive the setup email?</h2>
            <p>Resend the 2FA setup email using your username and password.</p>
          </div>

          <form className="sec3-form" onSubmit={resendSetupEmail}>
            <label className="sec3-label">Username</label>
            <input
              className="sec3-input"
              placeholder="Username"
              value={resendUsername}
              onChange={(e) => setResendUsername(e.target.value)}
              disabled={busy}
            />

            <label className="sec3-label">Password</label>
            <input
              className="sec3-input"
              placeholder="Password"
              type="password"
              value={resendPassword}
              onChange={(e) => setResendPassword(e.target.value)}
              disabled={busy}
            />

            <button className="sec3-btn primary full" type="submit" disabled={busy}>
              Resend setup email
            </button>
          </form>

          {resendOut && <pre className="sec3-pre">{safePretty(resendOut)}</pre>}
        </section>

        {/* RIGHT: verify */}
        <section className="sec3-card">
          <div className="sec3-cardHead">
            <h2>Verify 2FA setup</h2>
            <p>Paste the setup token from your email, then enter the 6-digit code.</p>
          </div>

          <form className="sec3-form" onSubmit={verifySetup}>
            <label className="sec3-label">Setup token</label>
            <input
              className="sec3-input"
              placeholder="Setup token"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              disabled={busy}
            />

            <label className="sec3-label">6-digit code</label>
            <input
              className="sec3-input"
              placeholder="123456"
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
              disabled={busy}
            />

            <button className="sec3-btn primary full" type="submit" disabled={busy}>
              Verify & enable 2FA
            </button>
          </form>

          {verifyOut && <pre className="sec3-pre">{safePretty(verifyOut)}</pre>}

          <details className="sec3-details">
            <summary>Raw security status (dev)</summary>
            <pre className="sec3-pre">
              {loading ? "Loading…" : status ? safePretty(status) : "No status returned."}
            </pre>
          </details>
        </section>
      </div>
    </div>
  );
}

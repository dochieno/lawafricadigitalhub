// src/pages/payments/PaystackReturn.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/client";
import { getToken, saveToken } from "../../auth/auth";
import "../../styles/paystackReturn.css";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeText(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v.message) return String(v.message);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function extractAxiosError(e) {
  const data = e?.response?.data;
  if (!data) return e?.message || "Request failed.";
  if (typeof data === "string") return data;
  if (typeof data === "object") return data.detail || data.title || data.message || safeText(data);
  return e?.message || "Request failed.";
}

const LS_REG_INTENT = "la_reg_intent_id";
function ctxKey(ref) {
  return `la_paystack_ctx_${ref}`;
}

export default function PaystackReturn() {
  const nav = useNavigate();
  const query = useQuery();
  const { state } = useLocation();

  const reference = (query.get("reference") || query.get("trxref") || "").trim();
  const fallbackDocId = state?.docId ? Number(state.docId) : null;

  // supports redirects after subscription purchases too
  const next = (query.get("next") || "/dashboard/law-reports").trim();

  const [phase, setPhase] = useState("LOADING"); // LOADING | SUCCESS | FAILED
  const [message, setMessage] = useState("Processing Paystack return…");
  const [error, setError] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState(null);

  const didRunRef = useRef(false);

  function readCtx(ref) {
    try {
      if (!ref) return null;
      const raw = localStorage.getItem(ctxKey(ref));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clearCtx(ref) {
    try {
      if (!ref) return;
      localStorage.removeItem(ctxKey(ref));
    } catch {
      // ignore
    }
  }

  function restoreTokenIfMissing(ref) {
    try {
      const token = getToken?.() || null;
      if (token) return token;

      const ctx = readCtx(ref);
      const snapshot = ctx?.tokenSnapshot;
      if (snapshot) {
        saveToken(snapshot);
        return snapshot;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function logReturnVisit(ref) {
    try {
      if (!ref) return;
      await api.post(
        "/payments/paystack/return-visit",
        {
          reference: ref,
          currentUrl: window.location.href,
          userAgent: navigator.userAgent,
        },
        { __skipThrottle: true }
      );
    } catch {
      // ignore
    }
  }

  async function fetchIntentByReference(ref) {
    const res = await api.get(`/payments/paystack/intent-by-reference/${encodeURIComponent(ref)}`, {
      __skipThrottle: true,
    });
    return res.data?.data ?? res.data;
  }

  async function confirmPaystack(ref) {
    const res = await api.post("/payments/paystack/confirm", { reference: ref }, { __skipThrottle: true });
    return res.data?.data ?? res.data;
  }

  // Paystack can be eventually-consistent right after redirect.
  // Retry confirm a few times before giving up.
  async function confirmWithRetry(ref) {
    const maxAttempts = 8;
    const delays = [0, 600, 900, 1200, 1500, 2000, 2500, 3000];

    let lastErr = null;
    for (let i = 0; i < maxAttempts; i++) {
      if (delays[i]) await sleep(delays[i]);
      try {
        return await confirmPaystack(ref);
      } catch (e) {
        lastErr = e;

        const status = e?.response?.status;
        const msg = extractAxiosError(e).toLowerCase();

        // If it’s clearly not a "just wait" issue, stop early.
        // (We do NOT want to redirect to login for signup.)
        const fatal =
          status === 403 ||
          msg.includes("forbid") ||
          msg.includes("not found") ||
          msg.includes("currency mismatch") ||
          msg.includes("amount mismatch");

        if (fatal) break;
      }
    }
    throw lastErr || new Error("Payment confirmation failed.");
  }

  function redirectToRegisterPaid(ref) {
    const qs = new URLSearchParams();
    qs.set("paid", "1");
    qs.set("provider", "paystack");
    if (ref) qs.set("reference", ref);
    nav(`/register?${qs.toString()}`, { replace: true });
  }

  function hardGoToReader(docId, intentId, ref) {
    const qs = new URLSearchParams();
    qs.set("paid", "1");
    qs.set("provider", "paystack");
    if (ref) qs.set("reference", ref);
    if (intentId) qs.set("paymentIntentId", String(intentId));
    window.location.replace(`/dashboard/documents/${docId}/read?${qs.toString()}`);
  }

  function hardGoNext(path) {
    const safe = path.startsWith("/") ? path : "/dashboard/law-reports";
    window.location.replace(safe);
  }

  function isSignupMeta(meta) {
    // meta from /intent-by-reference returns:
    // meta: { purpose, registrationIntentId, ... }
    const purpose = String(meta?.purpose || "").toLowerCase();
    const hasReg = !!meta?.registrationIntentId;
    return purpose === "publicsignupfee" || hasReg;
  }

  async function run() {
    setError("");

    if (!reference) {
      setPhase("FAILED");
      setError("Missing Paystack reference in the return URL.");
      setMessage("Payment confirmation issue");
      return;
    }

    // Always try to restore token for non-signup UX, but do NOT depend on it.
    restoreTokenIfMissing(reference);

    try {
      setPhase("LOADING");
      setMessage("Resolving your payment…");
      await logReturnVisit(reference);

      // ✅ Always resolve intent first so we can correctly route signup vs other flows,
      // even if LS_REG_INTENT is missing.
      const resolved = await fetchIntentByReference(reference);
      const intentId = resolved?.paymentIntentId || resolved?.id || null;
      const meta = resolved?.meta || null;

      if (intentId) setPaymentIntentId(intentId);

      const storedRegIntent = localStorage.getItem(LS_REG_INTENT);
      const ctx = readCtx(reference);

      const isSignup =
        !!storedRegIntent || isSignupMeta(meta) || !!ctx?.registrationIntentId || !!meta?.registrationIntentId;

      // ✅ SIGNUP FLOW: NEVER send user to login/dashboard.
      // Confirm first (finalizes), then go back to /register (no auth required).
      if (isSignup) {
        setMessage("Confirming payment on server…");
        const confirm = await confirmWithRetry(reference);

        const confirmedIntentId = confirm?.paymentIntentId || confirm?.id || intentId || null;
        if (confirmedIntentId) setPaymentIntentId(confirmedIntentId);

        setPhase("SUCCESS");
        setMessage("Payment confirmed ✅ Returning to registration…");

        clearCtx(reference);
        await sleep(350);
        redirectToRegisterPaid(reference);
        return;
      }

      // Non-signup flows (subscriptions / doc purchase etc.)
      const docId = meta?.legalDocumentId ?? ctx?.docId ?? fallbackDocId ?? null;

      setMessage("Confirming payment on server…");
      await confirmWithRetry(reference);

      setPhase("SUCCESS");
      setMessage("Payment received ✅ Redirecting…");
      await sleep(250);

      clearCtx(reference);

      if (docId) {
        hardGoToReader(docId, intentId, reference);
        return;
      }

      hardGoNext(next);
    } catch (e) {
      const status = e?.response?.status;

      // For non-signup flows, 401/403 can mean user must login.
      // For signup, we already short-circuit earlier and never come here for routing.
      if (status === 401 || status === 403) {
        setPhase("FAILED");
        setMessage("Payment confirmation issue");
        setError(extractAxiosError(e));
        return;
      }

      setPhase("FAILED");
      setMessage("Payment confirmation issue");
      setError(extractAxiosError(e));
    }
  }

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="psrPage">
      <div className="psrHeader">
        <div className="psrKicker">LawAfrica</div>
        <h2 className="psrTitle">Paystack Return</h2>
      </div>

      {phase !== "FAILED" ? (
        <div className="psrCard">
          <div className="psrRow">
            <div className="psrSpinner" aria-hidden="true" />
            <div className="psrBody">
              <div className="psrMsg">{message}</div>
              <div className="psrHint">Don’t close this page. We’re redirecting you back.</div>

              {paymentIntentId && (
                <div className="psrMeta">
                  PaymentIntentId: <b>#{paymentIntentId}</b> • Reference: <b>{reference}</b>
                </div>
              )}
            </div>
          </div>

          {phase === "SUCCESS" && <div className="psrOk">Payment received ✅ Redirecting…</div>}
        </div>
      ) : (
        <div className="psrErrorCard">
          <div className="psrErrTitle">{message}</div>
          <div className="psrErrText">{error}</div>

          <div className="psrActions">
            <button className="psrBtn psrBtnPrimary" onClick={() => window.location.reload()} type="button">
              Refresh
            </button>

            {/* Keep login button for non-signup flows (e.g., subscription/doc purchase) */}
            <button className="psrBtn psrBtnGhost" onClick={() => nav("/login", { replace: true })} type="button">
              Go to Login
            </button>
          </div>

          <div className="psrHint2">
            If this is a signup payment, go back to the registration page and refresh. If it’s a subscription/doc purchase,
            log in then refresh this return URL.
          </div>
        </div>
      )}
    </div>
  );
}

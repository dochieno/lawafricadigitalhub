// src/pages/payments/PaystackReturn.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/client";
import { getToken, clearToken, saveToken } from "../../auth/auth";
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

  async function run() {
    setError("");

    if (!reference) {
      setPhase("FAILED");
      setError("Missing Paystack reference in the return URL.");
      setMessage("Payment confirmation issue");
      return;
    }

    // ✅ SIGNUP FLOW MUST WIN — but MUST confirm/finalize before redirecting to /register
    const storedRegIntent = localStorage.getItem(LS_REG_INTENT);
    if (storedRegIntent) {
      try {
        setPhase("LOADING");
        setMessage("Confirming payment on server…");

        // NOTE:
        // - confirm is AllowAnonymous
        // - PublicSignupFee intent.UserId is null, so ownership checks won't block
        const confirm = await confirmPaystack(reference);
        const intentId = confirm?.paymentIntentId || confirm?.id || null;
        if (intentId) setPaymentIntentId(intentId);

        setPhase("SUCCESS");
        setMessage("Payment confirmed ✅ Returning to registration…");

        // IMPORTANT:
        // - DO NOT clear LS_REG_INTENT here; register flow may still rely on it
        // - Do not clearToken() here; it can break other flows. If needed, clear later.
        clearCtx(reference);

        await sleep(350);
        redirectToRegisterPaid(reference);
        return;
      } catch (e) {
        const status = e?.response?.status;

        setPhase("FAILED");
        setMessage("Payment confirmation issue");
        setError(extractAxiosError(e));

        // If confirm truly requires auth in some environment, guide user
        if (status === 401 || status === 403) {
          setError("Please log in, then come back to this return URL and click Refresh.");
        }

        return;
      }
    }

    // ✅ IMPORTANT:
    // Do NOT block if token is missing. For subscription flows, confirm is AllowAnonymous.
    // We still try to restore token for better UX, but we proceed either way.
    restoreTokenIfMissing(reference);

    try {
      setPhase("LOADING");
      setMessage("Resolving your payment…");
      await logReturnVisit(reference);

      const resolved = await fetchIntentByReference(reference);
      const intentId = resolved?.paymentIntentId || resolved?.id || null;
      const meta = resolved?.meta || null;

      if (!intentId) throw new Error("Could not resolve payment intent from reference.");
      setPaymentIntentId(intentId);

      const ctx = readCtx(reference);
      const docId = meta?.legalDocumentId ?? ctx?.docId ?? fallbackDocId ?? null;

      setMessage("Confirming payment on server…");
      await confirmPaystack(reference);

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

      // If the server truly requires auth (or ownership check hit), THEN show login UI.
      if (status === 401 || status === 403) {
        setPhase("FAILED");
        setMessage("You’re not logged in.");
        setError("Please log in first, then come back to this return URL and click Refresh.");
        return;
      }

      // Other errors
      if (status === 401) {
        clearToken();
        clearCtx(reference);
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

            <button className="psrBtn psrBtnGhost" onClick={() => nav("/login", { replace: true })} type="button">
              Go to Login
            </button>
          </div>

          <div className="psrHint2">Tip: after logging in, come back to this same return URL and click Refresh.</div>
        </div>
      )}
    </div>
  );
}

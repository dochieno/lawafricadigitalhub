// src/pages/payments/PaystackReturn.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/client";
import { getToken, clearToken, saveToken } from "../../auth/auth";

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

// localStorage keys for signup flow
const LS_REG_INTENT = "la_reg_intent_id";

// ✅ paystack return context key
function ctxKey(ref) {
  return `la_paystack_ctx_${ref}`;
}

export default function PaystackReturn() {
  const nav = useNavigate();
  const query = useQuery();
  const { state } = useLocation();

  // ✅ Paystack returns `reference` AND sometimes `trxref`
  const reference = (query.get("reference") || query.get("trxref") || "").trim();
  const fallbackDocId = state?.docId ? Number(state.docId) : null;

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

  // ✅ Restore token snapshot if it was lost on return
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

  // best-effort only (safe even if endpoint doesn't exist)
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

  // ✅ Force server verification + finalize/fulfillment (avoids “works only after refresh”)
  async function confirmPaystack(ref) {
    const res = await api.post(
      "/payments/paystack/confirm",
      { reference: ref },
      { __skipThrottle: true }
    );
    return res.data?.data ?? res.data;
  }

  function redirectToRegisterPaid(ref) {
    const qs = new URLSearchParams();
    qs.set("paid", "1");
    qs.set("provider", "paystack");
    if (ref) qs.set("reference", ref);
    nav(`/register?${qs.toString()}`, { replace: true });
  }

  // ✅ HARD redirect so AuthProvider re-reads token immediately (no blank screen requiring manual refresh)
  function hardGoToReader(docId, intentId, ref) {
    const qs = new URLSearchParams();
    qs.set("paid", "1");
    qs.set("provider", "paystack");
    if (ref) qs.set("reference", ref);
    if (intentId) qs.set("paymentIntentId", String(intentId));

    window.location.replace(`/dashboard/documents/${docId}/read?${qs.toString()}`);
  }

  async function run() {
    setError("");

    if (!reference) {
      setPhase("FAILED");
      setError("Missing Paystack reference in the return URL.");
      setMessage("Payment confirmation issue");
      return;
    }

    // ✅ SIGNUP FLOW MUST WIN — DO NOT CHANGE
    const storedRegIntent = localStorage.getItem(LS_REG_INTENT);
    if (storedRegIntent) {
      clearToken();
      setPhase("SUCCESS");
      setMessage("Payment received ✅ Returning to registration…");

      clearCtx(reference);
      await sleep(350);
      redirectToRegisterPaid(reference);
      return;
    }

    // ✅ Authenticated purchase flow: token required for the user experience
    const token = restoreTokenIfMissing(reference);
    if (!token) {
      setPhase("FAILED");
      setMessage("You’re not logged in.");
      setError("Please log in first, then come back to this return URL and click Refresh.");
      return;
    }

    try {
      setPhase("LOADING");
      setMessage("Resolving your payment…");
      await logReturnVisit(reference);

      // 1) Resolve intent & meta (docId)
      const resolved = await fetchIntentByReference(reference);
      const intentId = resolved?.paymentIntentId || resolved?.id || null;
      const meta = resolved?.meta || null;

      if (!intentId) throw new Error("Could not resolve payment intent from reference.");

      setPaymentIntentId(intentId);

      const ctx = readCtx(reference);

      // 2) Pick docId from best sources (intent/meta > ctx > location.state)
      const docId = meta?.legalDocumentId ?? ctx?.docId ?? fallbackDocId ?? null;

      // 3) ✅ Confirm server-side now (forces entitlement/fulfillment immediately)
      setMessage("Confirming payment on server…");
      await confirmPaystack(reference);

      setPhase("SUCCESS");
      setMessage("Payment received ✅ Opening your document…");
      await sleep(250);

      // ✅ Safe to clear now
      clearCtx(reference);

      if (docId) {
        // ✅ Hard redirect to reader to avoid “blank until refresh”
        hardGoToReader(docId, intentId, reference);
        return;
      }

      // No docId means not a doc purchase; go to library (hard redirect not necessary)
      nav("/dashboard/library", { replace: true });
    } catch (e) {
      const status = e?.response?.status;
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
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ fontWeight: 900, marginBottom: 12 }}>Paystack Return</h2>

      {phase !== "FAILED" ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            background: "white",
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: "3px solid #e5e7eb",
                borderTopColor: "#8b1c1c",
                animation: "spin 0.9s linear infinite",
              }}
            />
            <div>
              <div style={{ fontWeight: 900 }}>{message}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>
                Don’t close this page. We’re redirecting you back.
              </div>
              {paymentIntentId && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                  PaymentIntentId: <b>#{paymentIntentId}</b> • Reference: <b>{reference}</b>
                </div>
              )}
            </div>
          </div>

          {phase === "SUCCESS" && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 12,
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                color: "#065f46",
              }}
            >
              Payment received ✅ Redirecting…
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fff1f2",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 900, color: "#9f1239" }}>{message}</div>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap", color: "#7f1d1d" }}>{error}</div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#8b1c1c",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "10px 14px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Refresh
            </button>

            <button
              onClick={() => nav("/login", { replace: true })}
              style={{
                background: "white",
                color: "#8b1c1c",
                border: "1px solid #8b1c1c",
                borderRadius: 10,
                padding: "10px 14px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Go to Login
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
            Tip: after logging in, come back to this same return URL and click Refresh.
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
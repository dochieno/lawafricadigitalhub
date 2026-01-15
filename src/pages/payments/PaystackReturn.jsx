import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/client";
import { getToken } from "../../auth/auth";

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

// LocalStorage keys used by your Register flow
const LS_REG_INTENT = "la_reg_intent_id";
const LS_REG_EMAIL = "la_reg_email";

// Your production frontend base (used only as a fallback)
// If you run locally, this still works because nav() stays within SPA routing.
const FRONTEND_BASE = "https://lawafricadigitalhub.vercel.app";

export default function PaystackReturn() {
  const nav = useNavigate();
  const query = useQuery();
  const location = useLocation();
  const { state } = location;

  // Paystack returns reference + trxref
  const reference = (query.get("reference") || query.get("trxref") || "").trim();

  // Optional fallback (if you passed docId via route state)
  const fallbackDocId = state?.docId ? Number(state.docId) : null;

  const [phase, setPhase] = useState("LOADING"); // LOADING | WAITING | SUCCESS | FAILED
  const [message, setMessage] = useState("Finalizing payment… please wait.");
  const [error, setError] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState(null);

  const didRunRef = useRef(false);

  function clearLocalStorageMapping(ref) {
    try {
      if (!ref) return;
      localStorage.removeItem(`paystack_intent_${ref}`);
    } catch {
      // ignore
    }
  }

  function redirectToRegisterPaid() {
    const qs = new URLSearchParams();
    qs.set("paid", "1");
    qs.set("provider", "paystack");
    if (reference) qs.set("reference", reference); // optional debugging
    nav(`/register?${qs.toString()}`, { replace: true });
  }

  // IMPORTANT: only call this when authenticated (avoid 401 -> login redirect)
  async function logReturnVisit(ref) {
    try {
      if (!ref) return;
      await api.post("/payments/paystack/return-visit", {
        reference: ref,
        currentUrl: window.location.href,
        userAgent: navigator.userAgent,
      });
    } catch {
      // best-effort only
    }
  }

  async function fetchIntentByReference(ref) {
    const res = await api.get(`/payments/paystack/intent-by-reference/${encodeURIComponent(ref)}`);
    return res.data?.data ?? res.data;
  }

  async function pollIntent(intentId) {
    // 2 minutes
    const deadline = Date.now() + 120000;

    while (Date.now() < deadline) {
      try {
        const res = await api.get(`/payments/intent/${intentId}`);
        const intent = res.data?.data ?? res.data;

        const status = intent?.status;

        // Support both numeric and string enums
        const isSuccess = status === 3 || status === "Success" || status === "SUCCESS";
        const isFailed = status === 4 || status === "Failed" || status === "FAILED";

        if (isFailed) throw new Error(intent?.providerResultDesc || "Payment failed.");
        if (isSuccess) return intent;
      } catch {
        // ignore transient errors while waiting for webhook finalize
      }

      setPhase("WAITING");
      setMessage("Payment received. Confirming on the server…");
      await sleep(2000);
    }

    throw new Error("Payment is taking longer to confirm. Please refresh in a moment.");
  }

  async function run() {
    setError("");

    if (!reference) {
      setPhase("FAILED");
      setError("Missing Paystack reference in the return URL.");
      setMessage("Payment confirmation issue");
      return;
    }

    // ✅ FIRST: decide if we are in signup flow (anonymous) BEFORE any api.* calls
    const storedRegIntent = localStorage.getItem(LS_REG_INTENT);
    const token = getToken?.() || null;

    // If registration intent exists but no JWT, we’re returning from Paystack signup flow.
    // We should NOT call protected endpoints — just bounce back to /register?paid=1
    if (storedRegIntent && !token) {
      setPhase("SUCCESS");
      setMessage("Payment received ✅ Returning to registration to finalize your account…");
      clearLocalStorageMapping(reference);
      await sleep(500);
      redirectToRegisterPaid();
      return;
    }

    // From here: likely a logged-in purchase flow (user has JWT)
    try {
      setPhase("LOADING");
      setMessage("Finalizing payment… please wait.");

      // If authenticated, this should succeed; if not, it's best-effort only.
      await logReturnVisit(reference);

      clearLocalStorageMapping(reference);

      // Resolve intent using the reference (endpoint is AllowAnonymous)
      const resolved = await fetchIntentByReference(reference);
      const intentId = resolved?.paymentIntentId || null;
      const meta = resolved?.meta || null;

      if (!intentId) throw new Error("Could not resolve payment intent from reference.");

      setPaymentIntentId(intentId);

      // Wait for webhook to finalize and set status
      const intent = await pollIntent(intentId);

      const docId =
        intent?.legalDocumentId ??
        meta?.legalDocumentId ??
        fallbackDocId ??
        null;

      setPhase("SUCCESS");
      setMessage("Payment confirmed ✅ Redirecting…");
      await sleep(600);

      if (docId) {
        nav(`/dashboard/documents/${docId}/read?paid=1&provider=paystack`, { replace: true });
        return;
      }

      nav("/dashboard/library", { replace: true });
    } catch (e) {
      const status = e?.response?.status;
      const stored = localStorage.getItem(LS_REG_INTENT);

      // ✅ If auth fails but we still have a reg intent, we are likely in signup flow.
      if ((status === 401 || status === 403) && stored) {
        setPhase("SUCCESS");
        setMessage("Payment received ✅ Returning to registration to finalize your account…");
        await sleep(500);
        redirectToRegisterPaid();
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
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ fontWeight: 900, marginBottom: 12 }}>Finalizing Paystack payment</h2>

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
                Don’t close this page. We’re confirming your payment.
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
              Payment confirmed ✅ Redirecting…
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
              onClick={() => nav("/register")}
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
              Back to Register
            </button>

            <button
              onClick={() => nav("/login")}
              style={{
                background: "#111827",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "10px 14px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Go to Login
            </button>

            <a
              href={FRONTEND_BASE}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                color: "#111827",
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "10px 14px",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Home
            </a>
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

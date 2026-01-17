// PaystackReturn.jsx
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

  const reference = (query.get("reference") || query.get("trxref") || "").trim();
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
    } catch {}
  }

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
    } catch {}
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

  // best-effort only (Authorized endpoint)
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
      // ignore (never block the user)
    }
  }

  async function fetchIntentByReference(ref) {
    const res = await api.get(
      `/payments/paystack/intent-by-reference/${encodeURIComponent(ref)}`,
      { __skipThrottle: true }
    );
    return res.data?.data ?? res.data;
  }

  // ✅ confirm payment server-side (avoids webhook timing)
  async function confirmPaystack(ref) {
    const res = await api.post(
      "/payments/paystack/confirm",
      { reference: ref },
      { __skipThrottle: true }
    );
    return res.data?.data ?? res.data;
  }

  async function getIntent(intentId) {
    const res = await api.get(`/payments/intent/${intentId}`, { __skipThrottle: true });
    return res.data?.data ?? res.data;
  }

  async function pollIntent(intentId) {
    const deadline = Date.now() + 45000;

    while (Date.now() < deadline) {
      try {
        const intent = await getIntent(intentId);

        const status = intent?.status;
        const isSuccess = status === 3 || status === "Success";
        const isFailed = status === 4 || status === "Failed";

        if (isFailed) throw new Error(intent?.providerResultDesc || "Payment failed.");
        if (isSuccess) return intent;
      } catch (e) {
        if (e?.code === "ERR_CANCELED") {
          await sleep(600);
          continue;
        }
      }

      setPhase("WAITING");
      setMessage("Payment received. Confirming on the server…");
      await sleep(1500);
    }

    throw new Error("Payment is taking longer to confirm. Please refresh in a moment.");
  }

  function redirectToRegisterPaid() {
    const qs = new URLSearchParams();
    qs.set("paid", "1");
    qs.set("provider", "paystack");
    if (reference) qs.set("reference", reference);
    nav(`/register?${qs.toString()}`, { replace: true });
  }

  async function run() {
    setError("");

    if (!reference) {
      setPhase("FAILED");
      setError("Missing Paystack reference in the return URL.");
      setMessage("Payment confirmation issue");
      return;
    }

    // ✅ SIGNUP FLOW MUST WIN — regardless of existing token (DO NOT CHANGE)
    const storedRegIntent = localStorage.getItem(LS_REG_INTENT);
    if (storedRegIntent) {
      clearToken();
      setPhase("SUCCESS");
      setMessage("Payment received ✅ Returning to registration to finalize your account…");

      clearLocalStorageMapping(reference);
      clearCtx(reference);
      await sleep(400);
      redirectToRegisterPaid();
      return;
    }

    // ✅ Authenticated purchase flow
    const token = restoreTokenIfMissing(reference);
    if (!token) {
      setPhase("FAILED");
      setMessage("You’re not logged in.");
      setError("Please log in first, then come back to this return URL and click Refresh.");
      return;
    }

    try {
      setPhase("LOADING");
      setMessage("Finalizing payment… please wait.");

      // best-effort audit; ignore failures
      logReturnVisit(reference);

      clearLocalStorageMapping(reference);

      // 1) Resolve intent
      const resolved = await fetchIntentByReference(reference);
      const intentId = resolved?.paymentIntentId || null;
      const meta = resolved?.meta || null;

      if (!intentId) throw new Error("Could not resolve payment intent from reference.");

      setPaymentIntentId(intentId);

      // 2) Force-confirm immediately (best-effort)
      try {
        await confirmPaystack(reference);
      } catch (e) {
        if (e?.code !== "ERR_CANCELED") {
          console.warn("Paystack confirm failed (fallback to poll):", e);
        }
      }

      // 3) Fetch/poll final state
      let intent;
      try {
        intent = await getIntent(intentId);
        const status = intent?.status;
        const isSuccess = status === 3 || status === "Success";
        const isFailed = status === 4 || status === "Failed";
        if (isFailed) throw new Error(intent?.providerResultDesc || "Payment failed.");
        if (!isSuccess) intent = await pollIntent(intentId);
      } catch (e) {
        if (e?.code === "ERR_CANCELED") {
          intent = await pollIntent(intentId);
        } else {
          throw e;
        }
      }

      const ctx = readCtx(reference);

      const docId =
        intent?.legalDocumentId ??
        meta?.legalDocumentId ??
        ctx?.docId ??
        fallbackDocId ??
        null;

      setPhase("SUCCESS");
      setMessage("Payment confirmed ✅ Redirecting…");
      await sleep(500);

      clearCtx(reference);

      // ✅ IMPORTANT: redirect to reader WITHOUT query params; use state instead
      if (docId) {
        nav(`/dashboard/documents/${docId}/read`, {
          replace: true,
          state: { paid: true, provider: "paystack", reference },
        });
        return;
      }

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

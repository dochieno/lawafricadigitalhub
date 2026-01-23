// src/pages/documents/DocumentDetails.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api, { API_BASE_URL } from "../../api/client";
import { getToken } from "../../auth/auth";
import { getAuthClaims } from "../../auth/auth";
import { useAuth } from "../../auth/AuthContext";
import "../../styles/document-details.css";

function getServerOrigin() {
  return String(API_BASE_URL || "").replace(/\/api\/?$/i, "");
}

function buildCoverUrl(coverImagePath) {
  if (!coverImagePath) return null;

  const raw = String(coverImagePath).trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return raw;

  let clean = raw.replace(/\\/g, "/").replace(/^\/+/, "");

  if (clean.toLowerCase().startsWith("storage/")) {
    clean = clean.slice("storage/".length);
    return `${getServerOrigin()}/storage/${clean}`;
  }

  if (clean.startsWith("Storage/")) {
    clean = clean.slice("Storage/".length);
    return `${getServerOrigin()}/storage/${clean}`;
  }

  return `${getServerOrigin()}/storage/${clean}`;
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function paystackCtxKey(ref) {
  return `la_paystack_ctx_${ref}`;
}

function savePaystackCtx(ref, ctx) {
  try {
    if (!ref) return;
    localStorage.setItem(paystackCtxKey(ref), JSON.stringify(ctx));
  } catch {}
}

function toBool(v) {
  if (v === true || v === false) return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  if (typeof v === "number") return v !== 0;
  return false;
}

function toNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(n) {
  const num = toNumber(n);
  if (num == null) return "—";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function normalizeKenyanPhone(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, "");
  if (!s) return "";

  if (s.startsWith("+")) return s.slice(1);
  if (s.startsWith("0") && s.length >= 10) return `254${s.slice(1)}`;
  if (/^7\d{8}$/.test(s)) return `254${s}`;
  return s;
}

function isInstitutionUser() {
  const c = getAuthClaims();
  return !!(c?.institutionId && c.institutionId > 0);
}

function extractEmailFromClaims(claims) {
  if (!claims || typeof claims !== "object") return null;

  const candidates = [
    claims.email,
    claims.Email,
    claims.emailAddress,
    claims.EmailAddress,
    claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"],
    claims["emails"],
    claims["preferred_username"],
  ];

  for (const v of candidates) {
    const s = String(v || "").trim();
    if (s && s.includes("@")) return s;
  }

  return null;
}

function extractAxiosError(e) {
  const data = e?.response?.data;
  if (!data) return e?.message || "Request failed.";
  if (typeof data === "string") return data;
  if (typeof data === "object")
    return data.detail || data.title || data.message || e?.message || "Request failed.";
  return e?.message || "Request failed.";
}

/* =========================
   ✅ VAT helpers
========================= */
function hasVatRate(doc, offer) {
  const vatRateId =
    pick(offer, ["vatRateId", "VatRateId"]) ??
    pick(doc, ["vatRateId", "VatRateId"]) ??
    null;

  const ratePercent =
    pick(offer, ["vatRatePercent", "VatRatePercent", "ratePercent", "RatePercent"]) ??
    pick(doc, ["vatRatePercent", "VatRatePercent", "ratePercent", "RatePercent"]) ??
    pick(doc, ["vatRate", "VatRate"])?.ratePercent ??
    null;

  return !!vatRateId || (typeof ratePercent === "number" && ratePercent > 0);
}

function getIsTaxInclusive(doc, offer) {
  const v =
    pick(offer, ["isTaxInclusive", "IsTaxInclusive"]) ??
    pick(doc, ["isTaxInclusive", "IsTaxInclusive"]) ??
    null;

  return !!v;
}

function buildVatNote(doc, offer) {
  if (!hasVatRate(doc, offer)) return null;
  const inclusive = getIsTaxInclusive(doc, offer);

  return inclusive
    ? "Price shown is VAT inclusive (where applicable)."
    : "Price shown is subject to VAT (added at checkout) where applicable.";
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s || "";
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let val = n;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function DocumentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [doc, setDoc] = useState(null);
  const [inLibrary, setInLibrary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [hasContent, setHasContent] = useState(true);
  const [showUnavailable, setShowUnavailable] = useState(false);

  const [toast, setToast] = useState(null);

  const [publicOffer, setPublicOffer] = useState(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerError, setOfferError] = useState("");
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState("MPESA");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [pendingPaymentId, setPendingPaymentId] = useState(null);

  const isInst = isInstitutionUser();
  const [coverFailed, setCoverFailed] = useState(false);

  const [paystackFinal, setPaystackFinal] = useState({
    open: false,
    phase: "LOADING",
    title: "Confirming payment…",
    message: "Please wait while we confirm your Paystack payment.",
    error: "",
    reference: "",
    paymentIntentId: null,
  });

  const [mpesaFinal, setMpesaFinal] = useState({
    open: false,
    phase: "LOADING",
    title: "Waiting for M-PESA confirmation…",
    message: "Check your phone and enter your M-PESA PIN to complete payment.",
    error: "",
    paymentIntentId: null,
  });

  const paystackRanRef = useRef(false);

  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const paid = (qs.get("paid") || "").trim();
  const provider = (qs.get("provider") || "").trim();
  const paystackReference = (qs.get("reference") || "").trim();
  const paystackIntentId = qs.get("paymentIntentId") ? Number(qs.get("paymentIntentId")) : null;

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  function clearPaystackReturnParams() {
    const next = new URLSearchParams(location.search);
    next.delete("paid");
    next.delete("provider");
    next.delete("reference");
    next.delete("paymentIntentId");

    navigate(
      {
        pathname: location.pathname,
        search: next.toString() ? `?${next.toString()}` : "",
      },
      { replace: true }
    );
  }

  async function refreshOffer(docId) {
    setOfferLoading(true);
    setOfferError("");
    try {
      const offerRes = await api.get(`/legal-documents/${docId}/public-offer`);
      setPublicOffer(offerRes.data?.data ?? offerRes.data ?? null);
      setOfferError("");
    } catch (e) {
      setPublicOffer(null);
      const msg =
        e?.response?.status === 401 || e?.response?.status === 403
          ? "Pricing is not available for this account (authorization failed)."
          : "Unable to load pricing at the moment.";
      setOfferError(msg);
    } finally {
      setOfferLoading(false);
    }
  }

  async function refreshLibrary(docId) {
    try {
      const libraryRes = await api.get("/my-library");
      const exists = (libraryRes.data || []).some((item) => item.id === docId);
      setInLibrary(exists);
    } catch {
      setInLibrary(false);
    }
  }

  async function refreshAccess(docId) {
    setAccessLoading(true);
    try {
      const res = await api.get(`/legal-documents/${docId}/access`);
      setAccess(res.data ?? null);
    } catch {
      setAccess(null);
    } finally {
      setAccessLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setOfferError("");
      setCoverFailed(false);

      try {
        const [docRes, availabilityRes] = await Promise.all([
          api.get(`/legal-documents/${id}`),
          api.get(`/legal-documents/${id}/availability`),
        ]);

        if (!alive) return;

        setDoc(docRes.data);
        setHasContent(availabilityRes.data?.hasContent ?? true);

        await refreshLibrary(docRes.data.id);
        await refreshOffer(docRes.data.id);
        await refreshAccess(docRes.data.id);
      } catch (err) {
        console.error(err);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Paystack return confirmation
  useEffect(() => {
    if (paystackRanRef.current) return;
    if (!(paid === "1" && provider.toLowerCase() === "paystack")) return;
    if (!doc?.id) return;

    paystackRanRef.current = true;

    (async () => {
      try {
        if (!paystackReference) {
          setPaystackFinal({
            open: true,
            phase: "FAILED",
            title: "Payment confirmation issue",
            message: "Missing Paystack reference.",
            error: "We couldn’t confirm your payment because the return URL has no reference.",
            reference: "",
            paymentIntentId: paystackIntentId,
          });
          return;
        }

        setPaystackFinal({
          open: true,
          phase: "LOADING",
          title: "Confirming Paystack payment…",
          message: "Please wait while we confirm your payment and unlock this document.",
          error: "",
          reference: paystackReference,
          paymentIntentId: paystackIntentId,
        });

        await api.post("/payments/paystack/confirm", { reference: paystackReference }, { __skipThrottle: true });

        await refreshOffer(doc.id);
        await refreshLibrary(doc.id);
        await refreshAccess(doc.id);

        setPaystackFinal((s) => ({
          ...s,
          phase: "SUCCESS",
          title: "Payment confirmed ✅",
          message: "Unlocking your reader…",
          error: "",
        }));

        clearPaystackReturnParams();

        setTimeout(() => {
          navigate(`/dashboard/documents/${doc.id}/read?paid=1&provider=paystack`, { replace: false });
        }, 450);
      } catch (e) {
        const msg = extractAxiosError(e);
        setPaystackFinal((s) => ({
          ...s,
          open: true,
          phase: "FAILED",
          title: "Payment failed",
          message: "We could not confirm your Paystack payment.",
          error: msg,
        }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, provider, paystackReference, paystackIntentId, doc?.id]);

  async function addToLibrary() {
    try {
      setActionLoading(true);
      await api.post(`/my-library/${doc.id}`);
      setInLibrary(true);
      showToast("Added to your library");
    } catch (e) {
      const msg = extractAxiosError(e);
      showToast(String(msg), "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function removeFromLibrary() {
    try {
      setActionLoading(true);
      await api.delete(`/my-library/${doc.id}`);
      setInLibrary(false);
      showToast("Removed from library");
    } catch {
      showToast("Failed to remove from library", "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function pollPayment(paymentIntentId) {
    const deadline = Date.now() + 120000;

    while (Date.now() < deadline) {
      try {
        const res = await api.get(`/payments/intent/${paymentIntentId}`);
        const status = res.data?.status;

        const isSuccess = status === 3 || status === "Success";
        const isFailed = status === 4 || status === "Failed";

        if (isSuccess) return true;

        if (isFailed) {
          const msg = res.data?.providerResultDesc || "Payment failed. Please try again.";
          throw new Error(msg);
        }
      } catch {
        // ignore transient errors
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    throw new Error("Payment still pending. If you completed it, wait a moment and refresh.");
  }

  function priceToPay() {
    const offerPrice = pick(publicOffer, ["price", "Price"]);
    const docPrice = pick(doc, ["publicPrice", "PublicPrice"]);
    return offerPrice ?? docPrice ?? 0;
  }

  async function startMpesaPayment(phoneNumber) {
    if (!doc) return;

    const amount = Number(priceToPay() || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("This document does not have a valid price set.", "error");
      return;
    }

    const phone = normalizeKenyanPhone(phoneNumber);
    if (!phone) {
      showToast("Enter a valid M-PESA phone number.", "error");
      return;
    }

    setPurchaseLoading(true);
    try {
      const initRes = await api.post(`/payments/mpesa/stk/initiate`, {
        purpose: 4,
        amount,
        phoneNumber: phone,
        legalDocumentId: doc.id,
      });

      const paymentIntentId = initRes.data?.paymentIntentId;
      if (!paymentIntentId) throw new Error("Payment initiation failed.");

      setPendingPaymentId(paymentIntentId);

      setMpesaFinal({
        open: true,
        phase: "LOADING",
        title: "Waiting for M-PESA confirmation…",
        message: "Check your phone and enter your M-PESA PIN to complete payment.",
        error: "",
        paymentIntentId,
      });

      showToast("STK sent. Check your phone to complete payment.");

      await pollPayment(paymentIntentId);

      setMpesaFinal((s) => ({
        ...s,
        phase: "SUCCESS",
        title: "Payment confirmed ✅",
        message: "Unlocking your reader…",
        error: "",
      }));

      await refreshOffer(doc.id);
      await refreshLibrary(doc.id);
      await refreshAccess(doc.id);

      setMpesaPhone("");
      setShowPayModal(false);

      setTimeout(() => {
        setMpesaFinal((s) => ({ ...s, open: false }));
        if (hasContent) navigate(`/dashboard/documents/${doc.id}/read`);
      }, 450);
    } catch (e) {
      const msg = extractAxiosError(e);

      setMpesaFinal((s) => ({
        ...s,
        open: true,
        phase: "FAILED",
        title: "Payment failed",
        message: "We could not confirm your M-PESA payment.",
        error: msg,
      }));

      showToast(String(msg), "error");
    } finally {
      setPurchaseLoading(false);
      setPendingPaymentId(null);
    }
  }

  async function startPaystackPayment() {
    if (!doc) return;

    const claims = getAuthClaims() || {};
    const email = String(user?.email || "").trim() || extractEmailFromClaims(claims);

    if (!email) {
      showToast(
        "Missing account email for Paystack. Please update your profile email or log out and log in again.",
        "error"
      );
      return;
    }

    const amount = Number(priceToPay() || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("This document does not have a valid price set.", "error");
      return;
    }

    const currency =
      pick(publicOffer, ["currency", "Currency"]) ||
      pick(doc, ["publicCurrency", "PublicCurrency"]) ||
      "KES";

    setPurchaseLoading(true);
    try {
      const initRes = await api.post("/payments/paystack/initialize", {
        purpose: 4,
        amount,
        currency,
        email,
        legalDocumentId: doc.id,
      });

      const data = initRes.data?.data ?? initRes.data;

      const authorizationUrl =
        data?.authorization_url || data?.authorizationUrl || data?.data?.authorization_url;

      const reference = data?.reference || data?.data?.reference || data?.trxref || null;

      if (!authorizationUrl) {
        throw new Error("Paystack initialize did not return authorization_url.");
      }

      if (reference) {
        savePaystackCtx(reference, {
          docId: doc.id,
          tokenSnapshot: getToken?.() || null,
          ts: Date.now(),
        });
      }

      showToast("Redirecting to Paystack checkout...");
      window.location.href = authorizationUrl;
    } catch (e) {
      const msg = extractAxiosError(e);
      showToast(String(msg), "error");
      setPurchaseLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="au-wrap docDetails">
        <div className="docSkeletonHero" />
        <div className="docSkeletonGrid" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="au-wrap docDetails">
        <div className="au-hero">
          <div className="au-kicker">LawAfrica</div>
          <h1 className="au-title">Document not found</h1>
          <p className="au-subtitle">This publication may have been removed or the link is incorrect.</p>
          <div className="docTopActions">
            <button className="docBtn docBtnPrimary" onClick={() => navigate("/dashboard/explore")}>
              Browse publications
            </button>
          </div>
        </div>
      </div>
    );
  }

  const coverUrl = buildCoverUrl(doc.coverImagePath);

  const offerAllow = toBool(pick(publicOffer, ["allowPublicPurchase", "AllowPublicPurchase"]));
  const offerOwned = toBool(pick(publicOffer, ["alreadyOwned", "AlreadyOwned"]));
  const offerPrice = pick(publicOffer, ["price", "Price"]);
  const offerCurrency = pick(publicOffer, ["currency", "Currency"]);
  const offerMessage = pick(publicOffer, ["message", "Message"]) || "";

  const docAllow = toBool(pick(doc, ["allowPublicPurchase", "AllowPublicPurchase"]));
  const docPrice = pick(doc, ["publicPrice", "PublicPrice"]);
  const docCurrency = pick(doc, ["publicCurrency", "PublicCurrency"]);

  const allow = offerAllow || docAllow;
  const currency = offerCurrency || docCurrency || "KES";
  const price = offerPrice ?? docPrice;

  const vatNote = buildVatNote(doc, publicOffer);

  const hasFullAccess = !!access?.hasFullAccess;
  const isBlocked = !!access?.isBlocked;

  const blockMessage =
    access?.blockMessage || "Institution subscription expired. Please contact your administrator.";

  const canPurchaseIndividually =
    access?.canPurchaseIndividually === undefined ? true : !!access?.canPurchaseIndividually;

  const purchaseDisabledReason =
    access?.purchaseDisabledReason ||
    "Purchases are disabled for this account. Please contact your administrator.";

  const showPublicPurchaseDisabledMessage =
    !!doc.isPremium &&
    !offerOwned &&
    ((publicOffer && offerAllow === false) || (!publicOffer && docAllow === false));

  const purchaseDisabledMessage =
    offerMessage ||
    "This document is not available for individual purchase. Ask an admin to set a price and enable public purchase.";

  const showPurchaseBox =
    !!doc.isPremium && allow && !offerOwned && (!isInst || !isBlocked || canPurchaseIndividually);

  const purchaseButtonDisabled =
    purchaseLoading || !hasContent || (isInst && isBlocked && !canPurchaseIndividually);

  const purchaseButtonTitle =
    !hasContent
      ? "Coming soon"
      : isInst && isBlocked && !canPurchaseIndividually
      ? purchaseDisabledReason
      : "";

  const showIncludedActiveBadge = doc.isPremium && isInst && !accessLoading && hasFullAccess;
  const showIncludedInactiveBadge = doc.isPremium && isInst && !accessLoading && isBlocked && !hasFullAccess;

  const primaryLabel = !doc.isPremium
    ? "Read Now"
    : hasFullAccess
    ? "Read Now"
    : isBlocked
    ? "Read (Preview)"
    : "View / Preview";

  const canInstitutionAddPremium = isInst && doc.isPremium && hasFullAccess;
  const canAddToLibrary = hasContent && (!doc.isPremium || canInstitutionAddPremium);

  const description = safeText(doc.description);

  return (
    <div className="au-wrap docDetails">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      {/* Paystack confirmation overlay */}
      {paystackFinal.open && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3 style={{ marginBottom: 8 }}>{paystackFinal.title}</h3>
            <p style={{ marginTop: 0, color: "#6b7280" }}>{paystackFinal.message}</p>

            {paystackFinal.phase === "LOADING" && (
              <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
                <div className="la-spinner" />
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  Reference: <b>{paystackFinal.reference}</b>
                  {paystackFinal.paymentIntentId ? (
                    <>
                      {" "}
                      • Intent: <b>#{paystackFinal.paymentIntentId}</b>
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {paystackFinal.phase === "FAILED" && (
              <div className="status-box error">{paystackFinal.error || "Payment confirmation failed."}</div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {paystackFinal.phase === "FAILED" ? (
                <>
                  <button className="docBtn docBtnPrimary" onClick={() => window.location.reload()}>
                    Retry confirmation
                  </button>
                  <button
                    className="docBtn docBtnGhost"
                    onClick={() => {
                      setPaystackFinal((s) => ({ ...s, open: false }));
                      clearPaystackReturnParams();
                    }}
                  >
                    Close
                  </button>
                </>
              ) : (
                <button className="docBtn docBtnGhost" disabled>
                  Please wait…
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MPESA status overlay */}
      {mpesaFinal.open && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3 style={{ marginBottom: 8 }}>{mpesaFinal.title}</h3>
            <p style={{ marginTop: 0, color: "#6b7280" }}>{mpesaFinal.message}</p>

            {mpesaFinal.phase === "LOADING" && (
              <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
                <div className="la-spinner" />
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  Payment Intent: <b>#{mpesaFinal.paymentIntentId}</b>
                </div>
              </div>
            )}

            {mpesaFinal.phase === "FAILED" && (
              <div className="status-box error">{mpesaFinal.error || "Payment failed. Please try again."}</div>
            )}

            {mpesaFinal.phase === "SUCCESS" && (
              <div className="status-box success">Payment confirmed. You now own this document.</div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
              {mpesaFinal.phase === "FAILED" ? (
                <>
                  <button
                    className="docBtn docBtnPrimary"
                    onClick={() => {
                      setMpesaFinal((s) => ({ ...s, open: false }));
                      setPayMethod("MPESA");
                      setShowPayModal(true);
                    }}
                  >
                    Retry M-PESA
                  </button>
                  <button className="docBtn docBtnGhost" onClick={() => setMpesaFinal((s) => ({ ...s, open: false }))}>
                    Close
                  </button>
                </>
              ) : mpesaFinal.phase === "SUCCESS" ? (
                <button className="docBtn docBtnGhost" disabled>
                  Opening reader…
                </button>
              ) : (
                <button
                  className="docBtn docBtnGhost"
                  onClick={() => setMpesaFinal((s) => ({ ...s, open: false }))}
                  disabled={purchaseLoading}
                >
                  Hide
                </button>
              )}
            </div>

            {mpesaFinal.phase === "LOADING" && (
              <div className="docHint" style={{ marginTop: 12 }}>
                Tip: If you didn’t receive the prompt, confirm your number and try again. Some prompts arrive within 30–60 seconds.
              </div>
            )}
          </div>
        </div>
      )}

      {/* HERO */}
      <div className="au-hero">
        <div className="au-titleRow">
          <div>
            <div className="au-kicker">LawAfrica Publication</div>
            <h1 className="au-title">{doc.title}</h1>
            <p className="au-subtitle">
              {doc.countryName || "—"} <span className="docSep">•</span> {doc.category || "—"}
              {doc.version ? (
                <>
                  <span className="docSep">•</span> Version {doc.version}
                </>
              ) : null}
              {doc.fileType ? (
                <>
                  <span className="docSep">•</span> {doc.fileType}
                </>
              ) : null}
            </p>

            <div className="docBadges">
              {doc.isPremium ? (
                <span className="docBadge docBadgePremium">Premium</span>
              ) : (
                <span className="docBadge docBadgeFree">Free</span>
              )}
              {!hasContent && <span className="docBadge docBadgeSoon">Coming soon</span>}

              {showIncludedActiveBadge && <span className="docBadge docBadgeInfo">Included in subscription</span>}

              {showIncludedInactiveBadge && (
                <span className="docBadge docBadgeWarn" title={blockMessage}>
                  Included — inactive
                </span>
              )}
            </div>

            {isInst && isBlocked && (
              <div className="docBannerWarn" style={{ marginTop: 12 }}>
                <div className="docBannerTitle">Subscription inactive</div>
                <div className="docBannerSub">{blockMessage}</div>
              </div>
            )}
          </div>

          <div className="au-heroRight">
            <div className="docTopActions">
              <button
                className="docBtn docBtnPrimary"
                disabled={!hasContent}
                onClick={() => {
                  if (!hasContent) {
                    setShowUnavailable(true);
                    return;
                  }
                  navigate(`/dashboard/documents/${doc.id}/read`);
                }}
                title={!hasContent ? "Coming soon" : ""}
              >
                📖 {primaryLabel}
              </button>

              <button
                className="docBtn docBtnGhost"
                disabled={actionLoading || !canAddToLibrary}
                title={!hasContent ? "Coming soon" : ""}
                onClick={() => (inLibrary ? removeFromLibrary() : addToLibrary())}
                style={{
                  opacity: canAddToLibrary ? 1 : 0.55,
                  cursor: canAddToLibrary ? "pointer" : "not-allowed",
                }}
              >
                {inLibrary ? "🗑️ Library" : "➕ Library"}
              </button>

              <button className="docBtn docBtnGhost" onClick={() => navigate("/dashboard/explore")} type="button">
                Browse
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="docGrid">
        {/* LEFT: COVER */}
        <div className="docCard docCoverCard">
          <div className="docCoverWrap">
            {!coverFailed && coverUrl ? (
              <img
                src={coverUrl}
                alt={doc.title}
                className="docCoverImg"
                onError={() => setCoverFailed(true)}
              />
            ) : (
              <div className="docCoverFallback">
                <div className="docCoverMark">LA</div>
                <div className="docCoverTiny">LawAfrica</div>
              </div>
            )}
          </div>

          <div className="docMiniMeta">
            <div className="docMiniRow">
              <span className="docMiniKey">Pages</span>
              <span className="docMiniVal">{doc.pageCount ?? "—"}</span>
            </div>
            <div className="docMiniRow">
              <span className="docMiniKey">Chapters</span>
              <span className="docMiniVal">{doc.chapterCount ?? "—"}</span>
            </div>
            <div className="docMiniRow">
              <span className="docMiniKey">Size</span>
              <span className="docMiniVal">{formatBytes(doc.fileSizeBytes)}</span>
            </div>
          </div>
        </div>

        {/* RIGHT: DETAILS + PURCHASE */}
        <div className="docRightCol">
          {/* DESCRIPTION (✅ NEW) */}
          <div className="docCard">
            <div className="docCardTitle">Description</div>
            {description ? (
              <div className="docDescription">{description}</div>
            ) : (
              <div className="docEmptyHint">
                No description provided yet. (Admin can add this in Legal Documents management.)
              </div>
            )}
          </div>

          {/* DETAILS */}
          <div className="docCard">
            <div className="docCardTitle">Publication details</div>
            <div className="docFacts">
              <div className="docFact">
                <div className="docFactKey">Author</div>
                <div className="docFactVal">{doc.author || "—"}</div>
              </div>
              <div className="docFact">
                <div className="docFactKey">Publisher</div>
                <div className="docFactVal">{doc.publisher || "—"}</div>
              </div>
              <div className="docFact">
                <div className="docFactKey">Edition</div>
                <div className="docFactVal">{doc.edition || "—"}</div>
              </div>
              <div className="docFact">
                <div className="docFactKey">Kind</div>
                <div className="docFactVal">{doc.kind || "—"}</div>
              </div>
              <div className="docFact">
                <div className="docFactKey">Status</div>
                <div className="docFactVal">{doc.status || "—"}</div>
              </div>
              <div className="docFact">
                <div className="docFactKey">Country</div>
                <div className="docFactVal">{doc.countryName || "—"}</div>
              </div>
            </div>
          </div>

          {/* PURCHASE */}
          {!!doc.isPremium && (
            <div className="docCard docPurchaseCard">
              {offerLoading ? (
                <div className="docMuted">Checking price…</div>
              ) : showPurchaseBox ? (
                <>
                  <div className="docPurchaseTop">
                    <div>
                      <div className="docCardTitle" style={{ marginBottom: 6 }}>
                        Buy this document
                      </div>
                      <div className="docMuted">
                        One-time purchase • Full access on this account
                      </div>

                      <div className="docHint" style={{ marginTop: 10 }}>
                        <b>M-PESA:</b> STK prompt to your phone (Kenya).{" "}
                        <b>Paystack:</b> Card/bank payments (Visa/Mastercard), including international.
                      </div>

                      {vatNote ? <div className="docHint">{vatNote}</div> : null}
                    </div>

                    <div className="docPricePill">
                      <div className="docPriceLabel">Price</div>
                      <div className="docPriceValue">
                        {currency} {formatMoney(price)}
                      </div>
                    </div>
                  </div>

                  <div className="docPayBtns">
                    <button
                      className="docBtn docBtnPrimary"
                      onClick={() => {
                        setPayMethod("MPESA");
                        setShowPayModal(true);
                      }}
                      disabled={purchaseButtonDisabled}
                      title={purchaseButtonTitle}
                    >
                      {purchaseLoading ? "Processing…" : "Pay with M-PESA"}
                    </button>

                    <button
                      className="docBtn docBtnGhost"
                      onClick={() => {
                        setPayMethod("PAYSTACK");
                        setShowPayModal(true);
                      }}
                      disabled={purchaseButtonDisabled}
                      title={purchaseButtonTitle}
                    >
                      {purchaseLoading ? "Processing…" : "Pay with Paystack"}
                    </button>
                  </div>

                  {isInst && isBlocked && !canPurchaseIndividually && (
                    <div className="docHint">{purchaseDisabledReason}</div>
                  )}

                  {!hasContent && (
                    <div className="docHint">
                      This publication is marked “Coming soon”. Payments are disabled until content is available.
                    </div>
                  )}

                  {pendingPaymentId && (
                    <div className="docHint" style={{ marginTop: 8 }}>
                      Waiting for confirmation… (Payment #{pendingPaymentId})
                    </div>
                  )}
                </>
              ) : offerOwned ? (
                <div>
                  <div className="docCardTitle">Owned</div>
                  <div className="docMuted">You already purchased this document.</div>

                  <div className="docTopActions" style={{ marginTop: 12 }}>
                    <button
                      className="docBtn docBtnPrimary"
                      disabled={!hasContent}
                      onClick={() => {
                        if (!hasContent) {
                          setShowUnavailable(true);
                          return;
                        }
                        navigate(`/dashboard/documents/${doc.id}/read`);
                      }}
                    >
                      📖 Read now
                    </button>
                    <button className="docBtn docBtnGhost" onClick={() => navigate("/dashboard/library")}>
                      My Library →
                    </button>
                  </div>
                </div>
              ) : offerError ? (
                <div>
                  <div className="docCardTitle">Pricing unavailable</div>
                  <div className="docMuted">{offerError}</div>
                </div>
              ) : showPublicPurchaseDisabledMessage ? (
                <div>
                  <div className="docCardTitle">Purchase unavailable</div>
                  <div className="docMuted">{purchaseDisabledMessage}</div>
                  <div className="docHint" style={{ marginTop: 8 }}>
                    Admin fix: enable <b>Allow public purchase</b> and set a valid <b>Public price</b>.
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* FREE DOC CTA */}
          {!doc.isPremium && (
            <div className="docCard docCtaCard">
              <div className="docCardTitle">Access</div>
              <div className="docMuted">This publication is free to read on LawAfrica.</div>

              <div className="docTopActions" style={{ marginTop: 12 }}>
                <button
                  className="docBtn docBtnPrimary"
                  disabled={!hasContent}
                  onClick={() => {
                    if (!hasContent) {
                      setShowUnavailable(true);
                      return;
                    }
                    navigate(`/dashboard/documents/${doc.id}/read`);
                  }}
                >
                  📖 Read now
                </button>
                <button className="docBtn docBtnGhost" onClick={() => navigate("/dashboard/explore")}>
                  Browse more
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Explore */}
      <section className="docExplore">
        <div className="docExploreInner">
          <h2>Continue Your Legal Research</h2>
          <p>
            Discover more free and premium legal publications across jurisdictions, categories, and practice areas curated by LawAfrica.
          </p>

          <div className="docExploreActions">
            <button className="docExplorePrimary" onClick={() => navigate("/dashboard/explore")}>
              Browse All Publications
            </button>

            <button className="docExploreSecondary" onClick={() => navigate("/dashboard/library")}>
              Go to My Library →
            </button>
          </div>
        </div>
      </section>

      {showUnavailable && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Content not available</h3>
            <p>
              Great news! This document is in our catalog, but the content isn’t ready just yet. Check back soon — we are working on it!
            </p>

            <button className="docBtn docBtnPrimary" onClick={() => setShowUnavailable(false)}>
              OK
            </button>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPayModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Choose payment method</h3>
            <p style={{ marginTop: 6 }}>
              <b>M-PESA</b> is for Kenyan users (STK prompt to your phone).{" "}
              <b>Paystack</b> supports card or bank payments (Visa/Mastercard) including international payments.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <button
                className={`docBtn ${payMethod === "MPESA" ? "docBtnPrimary" : "docBtnGhost"}`}
                onClick={() => setPayMethod("MPESA")}
                disabled={purchaseLoading}
              >
                M-PESA
              </button>
              <button
                className={`docBtn ${payMethod === "PAYSTACK" ? "docBtnPrimary" : "docBtnGhost"}`}
                onClick={() => setPayMethod("PAYSTACK")}
                disabled={purchaseLoading}
              >
                Paystack
              </button>
            </div>

            {payMethod === "MPESA" ? (
              <div style={{ marginTop: 12, textAlign: "left" }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 900 }}>M-PESA Number</label>
                <input
                  type="tel"
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="07XXXXXXXX or 2547XXXXXXXX"
                  className="docInput"
                  disabled={purchaseLoading}
                />
                <div className="docHint" style={{ marginTop: 10 }}>
                  Amount: <b>{currency} {formatMoney(priceToPay())}</b>
                  {vatNote ? <div className="docHint" style={{ marginTop: 6 }}>{vatNote}</div> : null}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, textAlign: "left" }}>
                <div className="docHint">
                  Amount: <b>{currency} {formatMoney(priceToPay())}</b>
                </div>
                {vatNote ? <div className="docHint" style={{ marginTop: 6 }}>{vatNote}</div> : null}
                <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
                  You’ll be redirected to Paystack to complete payment securely.
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="docBtn docBtnGhost" onClick={() => setShowPayModal(false)} disabled={purchaseLoading}>
                Cancel
              </button>

              {payMethod === "MPESA" ? (
                <button
                  className="docBtn docBtnPrimary"
                  onClick={async () => {
                    setShowPayModal(false);
                    await startMpesaPayment(mpesaPhone);
                  }}
                  disabled={purchaseLoading || !hasContent || (isInst && isBlocked && !canPurchaseIndividually)}
                  title={
                    !hasContent
                      ? "Coming soon"
                      : isInst && isBlocked && !canPurchaseIndividually
                      ? purchaseDisabledReason
                      : ""
                  }
                >
                  {purchaseLoading ? "Processing…" : "Send STK Prompt"}
                </button>
              ) : (
                <button
                  className="docBtn docBtnPrimary"
                  onClick={async () => {
                    setShowPayModal(false);
                    await startPaystackPayment();
                  }}
                  disabled={purchaseLoading || !hasContent || (isInst && isBlocked && !canPurchaseIndividually)}
                  title={
                    !hasContent
                      ? "Coming soon"
                      : isInst && isBlocked && !canPurchaseIndividually
                      ? purchaseDisabledReason
                      : ""
                  }
                >
                  {purchaseLoading ? "Processing…" : "Continue to Paystack"}
                </button>
              )}
            </div>

            {isInst && isBlocked && !canPurchaseIndividually && (
              <div className="docHint" style={{ marginTop: 10 }}>
                {purchaseDisabledReason}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

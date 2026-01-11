// src/pages/dashboard/DocumentDetails.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import { useAuth } from "../../auth/AuthContext"; // ✅ NEW
import "../../styles/document-details.css";

function getServerOrigin() {
  return String(API_BASE_URL || "").replace(/\/api\/?$/i, "");
}

function buildCoverUrl(coverImagePath) {
  if (!coverImagePath) return null;

  const clean = String(coverImagePath)
    .replace(/^Storage\//i, "")
    .replace(/^\/+/, "")
    .toLowerCase();

  return `${getServerOrigin()}/storage/${clean}`;
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return null;
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

// Accepts 07..., 2547..., +2547...
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

// ✅ NEW: robust email extraction (JWT claim keys vary)
function extractEmailFromClaims(claims) {
  if (!claims || typeof claims !== "object") return null;

  const candidates = [
    claims.email,
    claims.Email,
    claims.emailAddress,
    claims.EmailAddress,

    // common .NET claim URI
    claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"],

    // sometimes mapped differently
    claims["emails"],
    claims["preferred_username"],
  ];

  for (const v of candidates) {
    const s = String(v || "").trim();
    if (s && s.includes("@")) return s;
  }

  return null;
}

export default function DocumentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { user } = useAuth(); // ✅ NEW: your UI clearly has this user email

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

  // ✅ Access (institution bundle / subscription etc.)
  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState("MPESA"); // "MPESA" | "PAYSTACK"
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [pendingPaymentId, setPendingPaymentId] = useState(null);

  const isInst = isInstitutionUser();

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
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

  async function addToLibrary() {
    try {
      setActionLoading(true);
      await api.post(`/my-library/${doc.id}`);
      setInLibrary(true);
      showToast("Added to your library");
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data ||
        e?.message ||
        "Failed to add to library";
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

  // More resilient polling (handles temporary network errors)
  async function pollPayment(paymentIntentId) {
    const deadline = Date.now() + 120000; // 2 mins

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
      // PaymentPurpose.PublicLegalDocumentPurchase = 4
      const initRes = await api.post(`/payments/mpesa/stk/initiate`, {
        purpose: 4,
        amount,
        phoneNumber: phone,
        legalDocumentId: doc.id,
      });

      const paymentIntentId = initRes.data?.paymentIntentId;
      if (!paymentIntentId) throw new Error("Payment initiation failed.");

      setPendingPaymentId(paymentIntentId);

      showToast("STK sent. Check your phone and enter your M-PESA PIN to complete payment.");

      await pollPayment(paymentIntentId);

      showToast("Payment successful. You now own this document.");

      await refreshOffer(doc.id);
      await refreshLibrary(doc.id);
      await refreshAccess(doc.id);

      setMpesaPhone("");
      setShowPayModal(false);

      if (hasContent) {
        navigate(`/dashboard/documents/${doc.id}/read`);
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data || e?.message || "Payment failed.";
      showToast(String(msg), "error");
    } finally {
      setPurchaseLoading(false);
      setPendingPaymentId(null);
    }
  }

  async function startPaystackPayment() {
    if (!doc) return;

    // ✅ Prefer AuthContext user.email (what your UI shows), then claims
    const claims = getAuthClaims() || {};
    const email =
      String(user?.email || "").trim() ||
      extractEmailFromClaims(claims);

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
        email, // ✅ always send (backend may ignore if it can read user email; harmless)
        legalDocumentId: doc.id,
      });

      const data = initRes.data?.data ?? initRes.data;

      const authorizationUrl =
        data?.authorization_url ||
        data?.authorizationUrl ||
        data?.data?.authorization_url;

      if (!authorizationUrl) {
        throw new Error("Paystack initialize did not return authorization_url.");
      }

      showToast("Redirecting to Paystack checkout...");

      window.location.href = authorizationUrl;
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data ||
        e?.message ||
        "Paystack payment failed.";
      showToast(String(msg), "error");
      setPurchaseLoading(false);
    }
  }

  if (loading) return <p className="doc-loading">Loading…</p>;
  if (!doc) return <p className="doc-error">Document not found.</p>;

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

  const hasFullAccess = !!access?.hasFullAccess;

  const isBlocked = !!access?.isBlocked;
  const blockMessage = access?.blockMessage || "Institution subscription expired. Please contact your administrator.";

  const canPurchaseIndividually =
    access?.canPurchaseIndividually === undefined ? true : !!access?.canPurchaseIndividually;

  const purchaseDisabledReason =
    access?.purchaseDisabledReason || "Purchases are disabled for this account. Please contact your administrator.";

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
    !hasContent ? "Coming soon" : isInst && isBlocked && !canPurchaseIndividually ? purchaseDisabledReason : "";

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

  return (
    <div className="doc-detail-container">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <div className="doc-detail-grid">
        <div className="doc-detail-cover">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={doc.title}
              className="doc-cover-img"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="doc-cover-placeholder">LAW</div>
          )}
        </div>

        <div className="doc-detail-info">
          <h1 className="doc-title">{doc.title}</h1>

          <p className="doc-meta">
            {doc.countryName} • {doc.category} • Version {doc.version}
          </p>

          <div className="doc-badge">
            {doc.isPremium ? <span className="badge premium">Premium</span> : <span className="badge free">Free</span>}

            {!hasContent && <span className="badge coming-soon">Coming soon</span>}

            {showIncludedActiveBadge && (
              <span className="badge free" style={{ marginLeft: 8 }}>
                Included in subscription
              </span>
            )}

            {showIncludedInactiveBadge && (
              <span className="badge coming-soon" style={{ marginLeft: 8 }} title={blockMessage}>
                Included — inactive
              </span>
            )}
          </div>

          {isInst && isBlocked && (
            <div className="doc-offer-card" style={{ marginTop: 12, opacity: 0.95 }}>
              <div className="doc-offer-title">Subscription inactive</div>
              <div className="doc-offer-sub">{blockMessage}</div>
            </div>
          )}

          {!!doc.isPremium && (
            <div style={{ marginTop: 12 }}>
              {offerLoading ? (
                <div className="doc-offer-card" style={{ opacity: 0.75 }}>
                  Checking price…
                </div>
              ) : showPurchaseBox ? (
                <div className="doc-offer-card">
                  <div className="doc-offer-top">
                    <div>
                      <div className="doc-offer-title">Buy this document</div>
                      <div className="doc-offer-sub">One-time purchase • Full access on this account</div>
                    </div>

                    <div className="doc-offer-price">
                      {currency} {formatMoney(price)}
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setPayMethod("MPESA");
                      setShowPayModal(true);
                    }}
                    disabled={purchaseButtonDisabled}
                    style={{ marginTop: 10 }}
                    title={purchaseButtonTitle}
                  >
                    {purchaseLoading ? "Processing…" : "Pay with M-PESA"}
                  </button>

                  <button
                    className="btn btn-outline-danger"
                    onClick={() => {
                      setPayMethod("PAYSTACK");
                      setShowPayModal(true);
                    }}
                    disabled={purchaseButtonDisabled}
                    style={{ marginTop: 10 }}
                    title={purchaseButtonTitle}
                  >
                    {purchaseLoading ? "Processing…" : "Pay with Paystack"}
                  </button>

                  {(isInst && isBlocked && !canPurchaseIndividually) && (
                    <div className="doc-offer-note">{purchaseDisabledReason}</div>
                  )}

                  {!hasContent && (
                    <div className="doc-offer-note">
                      This publication is marked “Coming soon”. Payments are disabled for it until content is available.
                    </div>
                  )}

                  {pendingPaymentId && (
                    <div className="doc-offer-note" style={{ marginTop: 8 }}>
                      Waiting for confirmation… (Payment #{pendingPaymentId})
                    </div>
                  )}
                </div>
              ) : offerOwned ? (
                <div className="doc-offer-card doc-offer-owned">
                  <div className="doc-offer-title">Owned</div>
                  <div className="doc-offer-sub">You already purchased this document.</div>

                  <button
                    className="btn btn-primary"
                    style={{ marginTop: 10 }}
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
                </div>
              ) : offerError ? (
                <div className="doc-offer-card" style={{ opacity: 0.9 }}>
                  <div className="doc-offer-title">Pricing unavailable</div>
                  <div className="doc-offer-sub">{offerError}</div>
                </div>
              ) : showPublicPurchaseDisabledMessage ? (
                <div className="doc-offer-card" style={{ opacity: 0.95 }}>
                  <div className="doc-offer-title">Purchase unavailable</div>
                  <div className="doc-offer-sub">{purchaseDisabledMessage}</div>
                  <div className="doc-offer-note" style={{ marginTop: 8 }}>
                    Admin fix: enable <b>Allow public purchase</b> and set a valid <b>Public price</b>.
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div className="doc-actions">
            <button
              className="btn btn-primary"
              disabled={!hasContent}
              onClick={() => {
                if (!hasContent) {
                  setShowUnavailable(true);
                  return;
                }
                navigate(`/dashboard/documents/${doc.id}/read`);
              }}
            >
              📖 {primaryLabel}
            </button>

            <button
              className="btn btn-outline-danger"
              disabled={actionLoading || !canAddToLibrary}
              title={!hasContent ? "Coming soon" : ""}
              onClick={() => (inLibrary ? removeFromLibrary() : addToLibrary())}
              style={{
                opacity: canAddToLibrary ? 1 : 0.5,
                cursor: canAddToLibrary ? "pointer" : "not-allowed",
              }}
            >
              {inLibrary ? "🗑️ Remove from my Library" : "➕ Add to my Library"}
            </button>
          </div>
        </div>
      </div>

      <section className="doc-footer-explore">
        <div className="doc-footer-explore-inner">
          <h2>Continue Your Legal Research</h2>
          <p>
            Discover more free and premium legal publications across jurisdictions, categories, and practice areas
            curated by LawAfrica.
          </p>

          <div className="doc-footer-explore-actions">
            <button className="doc-footer-primary" onClick={() => navigate("/dashboard/explore")}>
              Browse All Publications
            </button>

            <button className="doc-footer-secondary" onClick={() => navigate("/dashboard/library")}>
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
              Great news! This document is in our catalog, but the content isn’t ready just yet. Check back soon we are
              working on it!
            </p>

            <button className="btn btn-primary" onClick={() => setShowUnavailable(false)}>
              OK
            </button>
          </div>
        </div>
      )}

      {/* ✅ PAYMENT MODAL (MPESA OR PAYSTACK) */}
      {showPayModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Choose payment method</h3>
            <p style={{ marginTop: 6 }}>
              MPesa is Kenya-only. Paystack supports card/bank/international. After payment, fulfillment runs
              automatically.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                className={`btn ${payMethod === "MPESA" ? "btn-primary" : "btn-outline-danger"}`}
                onClick={() => setPayMethod("MPESA")}
                disabled={purchaseLoading}
                style={{ width: "auto", padding: "10px 14px" }}
              >
                MPesa
              </button>
              <button
                className={`btn ${payMethod === "PAYSTACK" ? "btn-primary" : "btn-outline-danger"}`}
                onClick={() => setPayMethod("PAYSTACK")}
                disabled={purchaseLoading}
                style={{ width: "auto", padding: "10px 14px" }}
              >
                Paystack
              </button>
            </div>

            {payMethod === "MPESA" ? (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: "block", marginBottom: 6 }}>M-PESA Number</label>
                <input
                  type="tel"
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="07XXXXXXXX or 2547XXXXXXXX"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    outline: "none",
                  }}
                  disabled={purchaseLoading}
                />
                <div style={{ marginTop: 8, opacity: 0.85, fontSize: 13 }}>
                  Amount: <b>{currency} {formatMoney(priceToPay())}</b>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, opacity: 0.9 }}>
                <div style={{ fontSize: 13 }}>
                  Amount: <b>{currency} {formatMoney(priceToPay())}</b>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
                  You’ll be redirected to Paystack to complete the payment.
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn btn-outline-danger" onClick={() => setShowPayModal(false)} disabled={purchaseLoading}>
                Cancel
              </button>

              {payMethod === "MPESA" ? (
                <button
                  className="btn btn-primary"
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
                  className="btn btn-primary"
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

            {(isInst && isBlocked && !canPurchaseIndividually) && (
              <div className="doc-offer-note" style={{ marginTop: 10 }}>
                {purchaseDisabledReason}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

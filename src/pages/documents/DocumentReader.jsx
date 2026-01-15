// src/pages/dashboard/DocumentReader.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../../api/client";
import PdfViewer from "../../reader/PdfViewer";
import "../../styles/reader.css";

export default function DocumentReader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [access, setAccess] = useState(null);
  const [offer, setOffer] = useState(null);
  const [contentAvailable, setContentAvailable] = useState(true);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  // hard-block overlay
  const [blocked, setBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState(
    "Access blocked. Please contact your administrator."
  );

  // purchase gating returned by /access
  const [canPurchaseIndividually, setCanPurchaseIndividually] = useState(true);
  const [purchaseDisabledReason, setPurchaseDisabledReason] = useState(null);
  const [blockReason, setBlockReason] = useState(null);

  // success toast when landing from payment
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  // show success toast when redirected from Paystack/MPesa return
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const paid = (qs.get("paid") || "").trim();
    const provider = (qs.get("provider") || "").trim();

    if (paid === "1") {
      showToast(
        `Payment successful ✅${provider ? ` (${provider})` : ""}`,
        "success"
      );

      qs.delete("paid");
      qs.delete("provider");

      navigate(
        {
          pathname: location.pathname,
          search: qs.toString() ? `?${qs.toString()}` : "",
        },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        setLoading(true);
        setLocked(false);

        setBlocked(false);
        setOffer(null);

        setBlockReason(null);
        setCanPurchaseIndividually(true);
        setPurchaseDisabledReason(null);

        setContentAvailable(true);
        setBlockMessage("Access blocked. Please contact your administrator.");

        // 1) Load access rules
        const accessRes = await api.get(`/legal-documents/${id}/access`);
        if (cancelled) return;

        const accessData = accessRes.data;
        setAccess(accessData);

        setCanPurchaseIndividually(accessData?.canPurchaseIndividually !== false);
        setPurchaseDisabledReason(accessData?.purchaseDisabledReason || null);

        // 2) Load public offer (safe)
        try {
          const offerRes = await api.get(`/legal-documents/${id}/public-offer`);
          if (!cancelled) setOffer(offerRes.data);
        } catch {
          // ignore
        }

        // HARD BLOCK from backend decision
        if (accessData?.isBlocked) {
          setBlocked(true);
          setBlockReason(accessData?.blockReason || null);
          setBlockMessage(
            accessData?.blockMessage || accessData?.message || "Access blocked."
          );
          return;
        }

        // 3) Verify content exists (LIGHTWEIGHT RANGE PREFLIGHT)
        // This avoids downloading huge PDFs just to check.
        try {
          await api.get(`/legal-documents/${id}/download`, {
            responseType: "blob",
            headers: { Range: "bytes=0-0" },
          });
          if (!cancelled) setContentAvailable(true);
        } catch (err) {
          if (cancelled) return;

          const status = err?.response?.status;

          if (status === 404) {
            setContentAvailable(false);
            return;
          }

          if (status === 403) {
            // Access denied, but /access should have handled block states.
            // Still, do not crash: show unavailable.
            setContentAvailable(false);
            return;
          }

          console.error("Content check failed:", err);
          setContentAvailable(false);
        }
      } catch (err) {
        console.error("Failed to initialize reader", err);
        if (!cancelled) setAccess(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <p style={{ padding: 20 }}>Loading reader…</p>;
  if (!access) return <p style={{ padding: 20 }}>Unable to open document.</p>;

  // HARD BLOCK overlay
  if (blocked) {
    const canPay =
      canPurchaseIndividually === true &&
      offer?.allowPublicPurchase === true &&
      offer?.alreadyOwned !== true;

    const primaryLabel = (() => {
      if (!canPurchaseIndividually) return "Purchases disabled";
      if (offer?.alreadyOwned) return "Already owned";
      if (offer?.allowPublicPurchase) return "Purchase options";
      return "Purchase options";
    })();

    return (
      <div className="reader-shell">
        {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

        <div className="preview-lock-backdrop">
          <div className="preview-lock-card">
            <h2>Access blocked</h2>

            {blockReason && (
              <div
                style={{
                  display: "inline-flex",
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 900,
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#991b1b",
                  marginBottom: 10,
                }}
              >
                {blockReason}
              </div>
            )}

            <p style={{ whiteSpace: "pre-wrap" }}>{blockMessage}</p>

            {!canPurchaseIndividually && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                  color: "#92400e",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {purchaseDisabledReason ||
                  "Purchases are disabled for institution accounts. Please contact your administrator."}
              </div>
            )}

            <div className="preview-lock-actions">
              <button className="outline-btn" onClick={() => navigate(`/dashboard/documents/${id}`)}>
                Back to Details
              </button>

              <button
                className="primary-btn"
                disabled={!canPurchaseIndividually || offer?.alreadyOwned === true}
                onClick={() => navigate(`/dashboard/documents/${id}`)}
                title={
                  !canPurchaseIndividually
                    ? purchaseDisabledReason || "Purchases disabled"
                    : offer?.alreadyOwned
                    ? "You already own this document."
                    : ""
                }
              >
                {primaryLabel}
              </button>
            </div>

            <p className="preview-lock-footnote">
              {canPurchaseIndividually
                ? "If available for sale, you can purchase this publication as an individual user."
                : "Purchasing is disabled for your institution account. Please contact your administrator."}
            </p>

            {canPay && (
              <p className="preview-lock-footnote" style={{ marginTop: 6 }}>
                Tip: Go to the details page to complete the purchase.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!contentAvailable) {
    return (
      <div className="reader-error-state">
        {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

        <h2>Document unavailable</h2>
        <p>This publication is listed in the catalog, but its content is not available yet.</p>

        <div className="reader-error-actions">
          <button className="outline-btn" onClick={() => navigate(`/dashboard/documents/${id}`)}>
            Back to Details
          </button>

          <button className="primary-btn" onClick={() => navigate("/dashboard/explore")}>
            Explore Other Publications
          </button>
        </div>
      </div>
    );
  }

  const maxPages = access.hasFullAccess ? null : access.previewMaxPages;

  return (
    <div className="reader-shell">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <PdfViewer
        documentId={Number(id)}
        maxAllowedPage={maxPages}
        onPreviewLimitReached={() => setLocked(true)}
      />

      {locked && !access.hasFullAccess && (
        <div className="preview-lock-backdrop">
          <div className="preview-lock-card">
            <h2>Preview limit reached</h2>
            <p>
              You’re reading a preview of this publication. To continue beyond page{" "}
              {access.previewMaxPages}, you’ll need full access.
            </p>

            <div className="preview-lock-actions">
              <button className="outline-btn" onClick={() => navigate(`/dashboard/documents/${id}`)}>
                Back to Details
              </button>

              <button className="primary-btn" onClick={() => navigate(`/dashboard/documents/${id}`)}>
                Purchase Access
              </button>

              <button className="outline-btn" onClick={() => navigate("/dashboard/explore")}>
                Explore More
              </button>
            </div>

            <p className="preview-lock-footnote">
              You can purchase this publication from the details page to unlock full reading access.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

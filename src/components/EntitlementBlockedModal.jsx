import React from "react";

export default function EntitlementBlockedModal({
  open,
  title = "Access blocked",
  message,
  denyReason,
  canPurchaseIndividually = true,
  purchaseDisabledReason,
  onClose,
  onGoToPurchase,
}) {
  if (!open) return null;

  return (
    <div className="entitlement-modal-overlay" role="dialog" aria-modal="true">
      <div className="entitlement-modal">
        <div className="entitlement-modal-header">
          <div className="entitlement-modal-title">{title}</div>
          <button className="entitlement-modal-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="entitlement-modal-body">
          {denyReason && (
            <div className="entitlement-pill">
              {String(denyReason)}
            </div>
          )}

          <div className="entitlement-message">
            {message || "You do not have access to this document."}
          </div>

          {!canPurchaseIndividually ? (
            <div className="entitlement-note entitlement-note-warn">
              {purchaseDisabledReason ||
                "Purchases are disabled for institution accounts. Please contact your administrator."}
            </div>
          ) : (
            <div className="entitlement-note">
              You can still purchase this document individually if it’s available for sale.
            </div>
          )}
        </div>

        <div className="entitlement-modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>

          <button
            className="btn-primary"
            onClick={onGoToPurchase}
            disabled={!canPurchaseIndividually}
            title={!canPurchaseIndividually ? (purchaseDisabledReason || "Purchases disabled") : ""}
          >
            Purchase options
          </button>
        </div>
      </div>
    </div>
  );
}

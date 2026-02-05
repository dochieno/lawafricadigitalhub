import { useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import "../../styles/requestTrial.css";

function extractErrorMessage(e) {
  const data = e?.response?.data;

  if (data?.message) return data.message;

  if (data?.errors && typeof data.errors === "object") {
    const firstKey = Object.keys(data.errors)[0];
    const firstVal = Array.isArray(data.errors[firstKey]) ? data.errors[firstKey][0] : null;
    if (firstVal) return `${firstKey}: ${firstVal}`;
  }

  if (typeof data === "string") return data;
  return e?.message || "Request failed";
}

/**
 * Fixes "/api missing" and "double /api" issues.
 * - If axios baseURL already includes "/api", keep paths like "/trials/request"
 * - If axios baseURL does NOT include "/api", prefix "/api"
 */
function apiPath(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (p.startsWith("/api/") || p === "/api") return p;

  const base = String(api?.defaults?.baseURL || "").toLowerCase();
  const baseHasApi = base.includes("/api");
  return baseHasApi ? p : `/api${p}`;
}

export default function RequestTrial() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [contentProductId, setContentProductId] = useState("");
  const [reason, setReason] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const productIdNum = useMemo(() => Number(contentProductId), [contentProductId]);
  const canSubmit = Number.isFinite(productIdNum) && productIdNum > 0;

  const selectedProduct = useMemo(() => {
    const id = Number(contentProductId);
    if (!id) return null;
    return products.find((p) => Number(p.id ?? p.Id) === id) || null;
  }, [products, contentProductId]);

  async function loadProducts() {
    setLoadingProducts(true);
    setError("");

    try {
      const res = await api.get(apiPath("/public/content-products/subscription-products"));
      const data = res.data?.data ?? res.data;
      const list = Array.isArray(data) ? data : [];

      setProducts(list);

      // auto-select first product if none selected
      if (!contentProductId && list.length) {
        const firstId = list[0].id ?? list[0].Id;
        if (firstId != null) setContentProductId(String(firstId));
      }
    } catch (e) {
      setProducts([]);
      setError(extractErrorMessage(e) || "Failed to load subscription products.");
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e) {
    e?.preventDefault?.();
    if (!canSubmit || busy) return;

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const res = await api.post(apiPath("/trials/request"), {
        contentProductId: productIdNum,
        reason: reason.trim() || null,
      });

      setResult(res.data?.data ?? res.data);
      setReason("");
    } catch (e2) {
      setError(extractErrorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rt-page">
      {/* Branded header card */}
      <div className="rt-heroCard">
        <div className="rt-heroTop">
          <div>
            <div className="rt-kicker">LAWFRAICA • TRIALS</div>
            <h1 className="rt-title">Request a Trial</h1>
            <p className="rt-sub">
              Request trial access for a subscription product. A Global Admin must approve it.
            </p>
          </div>

          <div className="rt-countPill" title="Public subscription products available">
            {loadingProducts ? "Loading…" : `${products.length} subscription product(s)`}
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="rt-card">
        <form className="rt-form" onSubmit={submit}>
          <div className="rt-grid">
            <label className="rt-label">
              <span>Subscription product</span>
              <select
                className="rt-select"
                value={contentProductId}
                onChange={(e) => setContentProductId(e.target.value)}
                disabled={busy || loadingProducts || products.length === 0}
              >
                {products.length === 0 ? <option value="">No public subscription products found</option> : null}

                {products.map((p) => {
                  const id = p.id ?? p.Id;
                  const name = p.name ?? p.Name ?? `Product #${id}`;
                  return (
                    <option key={id} value={String(id)}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </label>

            {selectedProduct ? (
              <div className="rt-productCard" role="note" aria-label="Selected product details">
                <div className="rt-productName">{selectedProduct.name ?? selectedProduct.Name}</div>
                <div className="rt-productDesc">
                  {(selectedProduct.description ?? selectedProduct.Description) || "No description provided."}
                </div>
              </div>
            ) : null}

            <label className="rt-label">
              <span>Reason (optional)</span>
              <textarea
                className="rt-textarea"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell us why you need a trial…"
                disabled={busy}
              />
            </label>
          </div>

          {/* Actions: right aligned, small submit */}
          <div className="rt-actions">
            <button className="rt-btnPrimary" disabled={busy || !canSubmit} type="submit">
              {busy ? "Submitting…" : "Submit request"}
            </button>
          </div>

          {error ? (
            <div className="rt-alert rt-alertErr">
              <b>Error:</b> {error}
            </div>
          ) : null}

          {result ? (
            <div className="rt-alert rt-alertOk">
              <div className="rt-alertTitle">Request sent</div>
              <div className="rt-alertMeta">
                Status: <b>{result?.status ?? "Pending"}</b>
              </div>

              <details className="rt-details">
                <summary>Show raw response</summary>
                <pre className="rt-pre">{JSON.stringify(result, null, 2)}</pre>
              </details>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

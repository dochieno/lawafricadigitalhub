// src/pages/dashboard/trials/RequestTrial.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import "../../styles/requestTrial.css";

function extractErrorMessage(e) {
  const data = e?.response?.data;

  if (data?.message) return data.message;

  if (data?.errors && typeof data.errors === "object") {
    const firstKey = Object.keys(data.errors)[0];
    const firstVal = Array.isArray(data.errors[firstKey])
      ? data.errors[firstKey][0]
      : null;
    if (firstVal) return `${firstKey}: ${firstVal}`;
  }

  if (typeof data === "string") return data;
  return e?.message || "Request failed";
}

/**
 * Avoid “/api double” or “missing /api”.
 * - If axios baseURL ends with "/api", then paths should be "/trials/..."
 * - Otherwise prefix "/api" (useful if baseURL is just the host origin)
 */
function makeApiPath(pathAfterApi) {
  const base = String(api?.defaults?.baseURL || "");

  try {
    const u = new URL(base, window.location.origin);
    const normalized = u.pathname.replace(/\/+$/, ""); // trim trailing slash(es)
    const endsWithApi = normalized.endsWith("/api");
    return endsWithApi ? pathAfterApi : `/api${pathAfterApi}`;
  } catch {
    // base may be a relative path; fallback safely
    const cleaned = base.replace(/\/+$/, "");
    const endsWithApi = cleaned.endsWith("/api");
    return endsWithApi ? pathAfterApi : `/api${pathAfterApi}`;
  }
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
      const res = await api.get(
        makeApiPath("/public/content-products/subscription-products")
      );
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
    // Make sure there are NO `debugger;` statements in this file or in main.jsx
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
      const cleanReason = reason.trim();
      const payload = {
        // send both casing variants to be bulletproof across JSON options
        contentProductId: productIdNum,
        ContentProductId: productIdNum,
        reason: cleanReason || null,
        Reason: cleanReason || null,
      };

      const res = await api.post(makeApiPath("/trials/request"), payload);

      setResult(res.data?.data ?? res.data);
      setReason("");
    } catch (e2) {
      setError(extractErrorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rt-wrap">
      <div className="rt-hero">
        <div>
          <h2 className="rt-title">Request a Trial</h2>
          <p className="rt-sub">
            Request trial access for a subscription product. A Global Admin must approve it.
          </p>
        </div>

        <div className="rt-mini">
          {loadingProducts ? "Loading products…" : `${products.length} subscription product(s)`}
        </div>
      </div>

      <div className="rt-card">
        <form className="rt-grid" onSubmit={submit}>
          <label className="rt-label">
            <span>Subscription product</span>
            <select
              className="rt-select"
              value={contentProductId}
              onChange={(e) => setContentProductId(e.target.value)}
              disabled={busy || loadingProducts || products.length === 0}
            >
              {products.length === 0 ? (
                <option value="">No public subscription products found</option>
              ) : null}

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
            <div className="rt-productCard">
              <div className="rt-productName">
                {selectedProduct.name ?? selectedProduct.Name}
              </div>
              <div className="rt-productDesc">
                {(selectedProduct.description ?? selectedProduct.Description) ||
                  "No description provided."}
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

          <div className="rt-row">
            <button className="rt-btn" disabled={busy || !canSubmit} type="submit">
              {busy ? "Submitting…" : "Submit request"}
            </button>

            <button
              type="button"
              className="rt-btn rt-btnGhost"
              disabled={busy}
              onClick={loadProducts}
              title="Reload products"
            >
              Refresh products
            </button>
          </div>

          {error ? (
            <div className="rt-alert err">
              <b>Error:</b> {error}
            </div>
          ) : null}

          {result ? (
            <div className="rt-alert ok">
              <b>Request sent</b>
              <div className="rt-mt6">
                Status: <b>{result?.status ?? "Pending"}</b>
              </div>

              <details className="rt-details">
                <summary className="rt-summary">Show raw response</summary>
                <pre className="rt-pre">{JSON.stringify(result, null, 2)}</pre>
              </details>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

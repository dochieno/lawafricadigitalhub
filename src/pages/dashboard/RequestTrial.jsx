// ✅ src/pages/dashboard/RequestTrial.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../api/client";

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

export default function RequestTrial() {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");

  const [contentProductId, setContentProductId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Load allowed products (AvailableToPublic=true AND PublicAccessModel=Subscription)
  useEffect(() => {
    let alive = true;

    async function load() {
      setProductsLoading(true);
      setProductsError("");
      try {
        const res = await api.get("/public/content-products/subscription-products");
        const data = res.data?.data ?? res.data;
        const list = Array.isArray(data) ? data : [];

        if (!alive) return;

        setProducts(list);

        // auto select first product to reduce friction
        if (!contentProductId && list.length) {
          const firstId = list[0]?.id ?? list[0]?.Id;
          if (firstId != null) setContentProductId(String(firstId));
        }
      } catch (e) {
        if (!alive) return;
        setProducts([]);
        setProductsError(extractErrorMessage(e) || "Failed to load products.");
      } finally {
        if (alive) setProductsLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const productIdNum = useMemo(() => Number(contentProductId), [contentProductId]);
  const canSubmit = Number.isFinite(productIdNum) && productIdNum > 0 && !productsLoading;

  const selectedProduct = useMemo(() => {
    const id = productIdNum;
    if (!id) return null;
    return products.find((p) => (p.id ?? p.Id) === id) || null;
  }, [products, productIdNum]);

  async function submit() {
    if (!canSubmit) return;

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const res = await api.post("/trials/request", {
        contentProductId: productIdNum,
        reason: reason.trim() || null,
      });

      setResult(res.data?.data ?? res.data);
      setReason("");
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>Request a Trial</h2>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Request trial access for a subscription product. A Global Admin must approve it.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Subscription Product</span>

          {productsLoading ? (
            <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10, opacity: 0.8 }}>
              Loading products…
            </div>
          ) : productsError ? (
            <div style={{ padding: 12, border: "1px solid #ffb3b3", background: "#fff5f5" }}>
              <b>Failed to load products:</b> {productsError}
              <div style={{ marginTop: 8, opacity: 0.85 }}>
                Ensure products are marked: <b>AvailableToPublic</b> and <b>PublicAccessModel = Subscription</b>.
              </div>
            </div>
          ) : products.length === 0 ? (
            <div style={{ padding: 12, border: "1px solid #e5e7eb", background: "#fff", borderRadius: 10 }}>
              No public subscription products are available for trials yet.
            </div>
          ) : (
            <select value={contentProductId} onChange={(e) => setContentProductId(e.target.value)}>
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
          )}
        </label>

        {selectedProduct ? (
          <div style={{ padding: 12, border: "1px solid #e5e7eb", background: "#fff", borderRadius: 10 }}>
            <div style={{ fontWeight: 800 }}>{selectedProduct.name ?? selectedProduct.Name}</div>
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              {(selectedProduct.description ?? selectedProduct.Description) || "—"}
            </div>
          </div>
        ) : null}

        <label style={{ display: "grid", gap: 6 }}>
          <span>Reason (optional)</span>
          <textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tell us why you need a trial..."
          />
        </label>

        <button disabled={busy || !canSubmit || products.length === 0} onClick={submit}>
          {busy ? "Submitting..." : "Submit request"}
        </button>

        {error && (
          <div style={{ padding: 12, border: "1px solid #ffb3b3", background: "#fff5f5" }}>
            <b>Error:</b> {error}
          </div>
        )}

        {result && (
          <div style={{ padding: 12, border: "1px solid #cfe9cf", background: "#f6fff6" }}>
            <b>Request sent</b>
            <div style={{ marginTop: 8, opacity: 0.9 }}>
              Status: <b>{result?.status}</b>
            </div>

            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>Show raw response</summary>
              <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

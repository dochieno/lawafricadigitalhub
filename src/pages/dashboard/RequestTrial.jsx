import { useMemo, useState } from "react";
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
  const [contentProductId, setContentProductId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const productIdNum = useMemo(() => Number(contentProductId), [contentProductId]);
  const canSubmit = Number.isFinite(productIdNum) && productIdNum > 0;

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

      setResult(res.data);
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
        Request trial access for a subscription product. An admin must approve it.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>ContentProductId</span>
          <input
            value={contentProductId}
            onChange={(e) => setContentProductId(e.target.value)}
            placeholder="e.g. Reports product id"
            inputMode="numeric"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Reason (optional)</span>
          <textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tell us why you need a trial..."
          />
        </label>

        <button disabled={busy || !canSubmit} onClick={submit}>
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
            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
            <div style={{ marginTop: 8, opacity: 0.8 }}>
              Status: <b>{result?.status}</b>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

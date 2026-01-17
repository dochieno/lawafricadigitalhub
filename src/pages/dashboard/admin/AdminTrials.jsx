import { useMemo, useState } from "react";
import api from "../../../api/client"; // axios instance

export default function AdminTrials() {
  const [userId, setUserId] = useState("");
  const [contentProductId, setContentProductId] = useState("");
  const [unit, setUnit] = useState("Days"); // "Days" | "Months"
  const [value, setValue] = useState(7);
  const [extendIfActive, setExtendIfActive] = useState(true);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const userIdNum = useMemo(() => Number(userId), [userId]);
  const productIdNum = useMemo(() => Number(contentProductId), [contentProductId]);
  const valueNum = useMemo(() => Number(value), [value]);

  const canSubmit = Number.isFinite(userIdNum) && userIdNum > 0 &&
                    Number.isFinite(productIdNum) && productIdNum > 0;

  function normalizeUnit(u) {
    // API enum int: Days=1 Months=2
    return u === "Months" ? 2 : 1;
  }

  function extractErrorMessage(e) {
    const data = e?.response?.data;

    // Common API pattern: { message: "..." }
    if (data?.message) return data.message;

    // ASP.NET validation errors: { errors: { Field: ["msg"] } }
    if (data?.errors && typeof data.errors === "object") {
      const firstKey = Object.keys(data.errors)[0];
      const firstVal = Array.isArray(data.errors[firstKey]) ? data.errors[firstKey][0] : null;
      if (firstVal) return `${firstKey}: ${firstVal}`;
    }

    // String responses
    if (typeof data === "string") return data;

    return e?.message || "Request failed";
  }

  async function call(endpoint, payload) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post(endpoint, payload);
      setResult(res.data);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function grant() {
    if (!canSubmit) return;
    await call("/admin/trials/grant", {
      userId: userIdNum,
      contentProductId: productIdNum,
      unit: normalizeUnit(unit),
      value: valueNum,
      extendIfActive: !!extendIfActive,
    });
  }

  async function extend() {
    if (!canSubmit) return;
    await call("/admin/trials/extend", {
      userId: userIdNum,
      contentProductId: productIdNum,
      unit: normalizeUnit(unit),
      value: valueNum,
    });
  }

  async function revoke() {
    if (!canSubmit) return;
    await call("/admin/trials/revoke", {
      userId: userIdNum,
      contentProductId: productIdNum,
    });
  }

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>Trial Management</h2>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Grant / extend / revoke a user trial for a product (e.g. Reports).
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>UserId</span>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. 123"
              inputMode="numeric"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>ContentProductId (Reports product id)</span>
            <input
              value={contentProductId}
              onChange={(e) => setContentProductId(e.target.value)}
              placeholder="e.g. 9"
              inputMode="numeric"
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="Days">Days</option>
              <option value="Months">Months</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Value</span>
            <input
              type="number"
              min={1}
              max={365}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Grant behavior</span>
            <select
              value={extendIfActive ? "extend" : "reset"}
              onChange={(e) => setExtendIfActive(e.target.value === "extend")}
            >
              <option value="extend">Extend if active</option>
              <option value="reset">Reset from now</option>
            </select>
          </label>
        </div>

        {!canSubmit && (
          <div style={{ padding: 10, border: "1px solid #ddd", background: "#fafafa" }}>
            Enter a valid <b>UserId</b> and <b>ContentProductId</b> to enable actions.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button disabled={busy || !canSubmit} onClick={grant}>
            {busy ? "Working..." : "Grant Trial"}
          </button>

          <button disabled={busy || !canSubmit} onClick={extend}>
            {busy ? "Working..." : "Extend Trial"}
          </button>

          <button disabled={busy || !canSubmit} onClick={revoke}>
            {busy ? "Working..." : "Revoke Trial"}
          </button>
        </div>

        {error && (
          <div style={{ padding: 12, border: "1px solid #ffb3b3", background: "#fff5f5" }}>
            <b>Error:</b> {error}
          </div>
        )}

        {result && (
          <div style={{ padding: 12, border: "1px solid #cfe9cf", background: "#f6fff6" }}>
            <b>Response</b>
            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <hr style={{ margin: "18px 0" }} />

      <div style={{ opacity: 0.8 }}>
        <b>Notes:</b>
        <ul>
          <li>Unit values sent to API: Days=1, Months=2.</li>
          <li>
            Next improvement: fetch products and let you pick “Reports” instead of typing the id.
          </li>
        </ul>
      </div>
    </div>
  );
}

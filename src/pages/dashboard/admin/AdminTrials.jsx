import { useState } from "react";
import api from "../../../api/client"; // assuming this is your axios instance

export default function AdminTrials() {
  const [userId, setUserId] = useState("");
  const [contentProductId, setContentProductId] = useState("");
  const [unit, setUnit] = useState("Days"); // "Days" | "Months"
  const [value, setValue] = useState(7);
  const [extendIfActive, setExtendIfActive] = useState(true);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function normalizeUnit(u) {
    // Your API expects enum int: Days=1 Months=2 (from DTO)
    return u === "Months" ? 2 : 1;
  }

  async function call(endpoint, payload) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post(endpoint, payload);
      setResult(res.data);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        (typeof e?.response?.data === "string" ? e.response.data : null) ||
        e.message ||
        "Request failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function grant() {
    await call("/api/admin/trials/grant", {
      userId: Number(userId),
      contentProductId: Number(contentProductId),
      unit: normalizeUnit(unit),
      value: Number(value),
      extendIfActive: !!extendIfActive,
    });
  }

  async function extendvoke() {
    await call("/api/admin/trials/revoke", {
      userId: Number(userId),
      contentProductId: Number(contentProductId),
    });
  }

  async function extend() {
    await call("/api/admin/trials/extend", {
      userId: Number(userId),
      contentProductId: Number(contentProductId),
      unit: normalizeUnit(unit),
      value: Number(value),
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
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>ContentProductId (Reports product id)</span>
            <input
              value={contentProductId}
              onChange={(e) => setContentProductId(e.target.value)}
              placeholder="e.g. 9"
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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button disabled={busy} onClick={grant}>
            {busy ? "Working..." : "Grant Trial"}
          </button>

          <button disabled={busy} onClick={extend}>
            {busy ? "Working..." : "Extend Trial"}
          </button>

          <button disabled={busy} onClick={Rvoke}>
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
          <li>
            Unit values sent to API: Days=1, Months=2 (matches your backend DTO enum).
          </li>
          <li>
            If you want, next we can fetch product list automatically and let you pick “Reports”
            instead of typing the product id.
          </li>
        </ul>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import api from "../api/client"; // ✅ your existing axios client


function getApiErrorMessage(err, fallback = "Request failed.") {
  const data = err?.response?.data;

  if (data && typeof data === "object") {
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;

    if (data.errors && typeof data.errors === "object") {
      const firstKey = Object.keys(data.errors)[0];
      const first = firstKey ? data.errors[firstKey]?.[0] : null;
      if (first) return first;
    }

    if (typeof data.detail === "string") return data.detail;
  }

  if (typeof err?.message === "string") return err.message;
  return fallback;
}

export default function AiSummaryTest() {
  const [lawReportId, setLawReportId] = useState("");
  const [type, setType] = useState("basic");
  const [forceRegenerate, setForceRegenerate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const canRun = useMemo(() => Number.isFinite(Number(lawReportId)) && Number(lawReportId) > 0, [lawReportId]);

  async function generate() {
    if (!canRun) {
      setError("Enter a valid LawReport ID (number).");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await api.post(`/ai/law-reports/${Number(lawReportId)}/summary`, {
        type,
        forceRegenerate,
      });

      setResult(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to generate summary."));
    } finally {
      setLoading(false);
    }
  }

  async function fetchCached() {
    if (!canRun) {
      setError("Enter a valid LawReport ID (number).");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await api.get(`/ai/law-reports/${Number(lawReportId)}/summary`, {
        params: { type },
      });

      setResult(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to fetch cached summary."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 18 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>AI Summary Test</h2>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        This page calls <code>/api/ai/law-reports/&#123;id&#125;/summary</code> and prints the response.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          padding: 14,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          marginTop: 14,
        }}
      >
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>LawReport ID</label>
          <input
            value={lawReportId}
            onChange={(e) => setLawReportId(e.target.value)}
            placeholder="e.g. 123"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.04)",
              color: "inherit",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Summary Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.04)",
              color: "inherit",
            }}
          >
            <option value="basic">basic</option>
            <option value="extended">extended</option>
          </select>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={forceRegenerate}
              onChange={(e) => setForceRegenerate(e.target.checked)}
            />
            Force regenerate (ignore cache)
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, gridColumn: "1 / -1" }}>
          <button
            onClick={generate}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: loading ? "rgba(255,255,255,0.06)" : "rgba(112,40,64,0.35)",
              color: "inherit",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {loading ? "Working..." : "Generate summary"}
          </button>

          <button
            onClick={fetchCached}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "inherit",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            Fetch cached
          </button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,80,80,0.35)",
            background: "rgba(255,80,80,0.08)",
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      ) : null}

      {result ? (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              <div>
                <b>LawReport:</b> {result.lawReportId}
              </div>
              <div>
                <b>Type:</b> {result.type}
              </div>
              {"cached" in result ? (
                <div>
                  <b>Cached:</b> {String(result.cached)}
                </div>
              ) : null}
            </div>
          </div>

          <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.10)", margin: "12px 0" }} />

          <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            {result.summary}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
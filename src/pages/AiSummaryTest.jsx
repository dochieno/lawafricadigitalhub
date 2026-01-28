// src/pages/AiSummaryTest.jsx
import { useMemo, useState } from "react";
import api from "../api/client"; // your existing axios client

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

function fmtDate(v) {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  } catch {
    return String(v);
  }
}

function pillStyle(bg) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background: bg,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.2,
  };
}

export default function AiSummaryTest() {
  const [lawReportId, setLawReportId] = useState("");
  const [type, setType] = useState("basic");
  const [forceRegenerate, setForceRegenerate] = useState(false);

  // ✅ Related cases controls
  const [takeKenya, setTakeKenya] = useState(6);
  const [takeForeign, setTakeForeign] = useState(2);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const numericId = useMemo(() => Number(lawReportId), [lawReportId]);
  const canRun = useMemo(() => Number.isFinite(numericId) && numericId > 0, [numericId]);

  async function generate() {
    if (!canRun) {
      setError("Enter a valid LawReport ID (number).");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await api.post(`/ai/law-reports/${numericId}/summary`, {
        type,
        forceRegenerate,
      });

      setResult({ kind: "summary", data: res.data });
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
      const res = await api.get(`/ai/law-reports/${numericId}/summary`, {
        params: { type },
      });

      setResult({ kind: "summary", data: res.data });
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to fetch cached summary."));
    } finally {
      setLoading(false);
    }
  }

  async function generateRelatedCases() {
    if (!canRun) {
      setError("Enter a valid LawReport ID (number).");
      return;
    }

    const k = Math.max(1, Math.min(12, Number(takeKenya) || 6));
    const f = Math.max(0, Math.min(5, Number(takeForeign) || 0));

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await api.post(
        `/ai/law-reports/${numericId}/related-cases`,
        {},
        {
          params: { takeKenya: k, takeForeign: f },
        }
      );

      setResult({ kind: "related", data: res.data });
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to generate related cases."));
    } finally {
      setLoading(false);
    }
  }

  const summaryView = useMemo(() => {
    if (!result || result.kind !== "summary") return null;
    const r = result.data || {};

    return {
      lawReportId: r.lawReportId ?? numericId,
      type: r.type ?? type,
      summary: r.summary ?? "",
      cached: typeof r.cached === "boolean" ? r.cached : null,
      createdAt: r.createdAt ?? null,
      updatedAt: r.updatedAt ?? null,
    };
  }, [result, numericId, type]);

  const relatedView = useMemo(() => {
    if (!result || result.kind !== "related") return null;

    const r = result.data || {};
    const items = Array.isArray(r.items) ? r.items : [];

    return {
      lawReportId: r.lawReportId ?? numericId,
      kenyaCount: r.kenyaCount ?? null,
      foreignCount: r.foreignCount ?? null,
      disclaimer: r.disclaimer ?? "",
      model: r.model ?? "",
      items,
    };
  }, [result, numericId]);

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: 18 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>AI Tools Test</h2>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Summary: <code>/api/ai/law-reports/&#123;id&#125;/summary</code> (GET cache / POST generate){" "}
        · Related: <code>/api/ai/law-reports/&#123;id&#125;/related-cases</code> (POST)
      </p>

      {/* Controls */}
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
        <div style={{ gridColumn: "1 / -1" }}>
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
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Tip: paste a real LawReportId from your DB (LawReports table).
          </div>
        </div>

        {/* Summary config */}
        <div
          style={{
            padding: 12,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 10 }}>Summary</div>

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

          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
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
              {loading ? "Working..." : "Generate (POST)"}
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
              Fetch cached (GET)
            </button>
          </div>
        </div>

        {/* Related cases config */}
        <div
          style={{
            padding: 12,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 10 }}>AI Related Cases</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Kenya cases (max 12)
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={takeKenya}
                onChange={(e) => setTakeKenya(e.target.value)}
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
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Outside Kenya (max 5)
              </label>
              <input
                type="number"
                min={0}
                max={5}
                value={takeForeign}
                onChange={(e) => setTakeForeign(e.target.value)}
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
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            Uses <code>POST /api/ai/law-reports/&#123;id&#125;/related-cases</code> with query params.
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button
              onClick={generateRelatedCases}
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: loading ? "rgba(255,255,255,0.06)" : "rgba(14,165,165,0.22)",
                color: "inherit",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 800,
              }}
            >
              {loading ? "Working..." : "Generate related (POST)"}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,80,80,0.35)",
            background: "rgba(255,80,80,0.08)",
            fontWeight: 700,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Summary output */}
      {summaryView ? (
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
            <div style={{ fontSize: 13, opacity: 0.9, display: "grid", gap: 4 }}>
              <div>
                <b>LawReport:</b> {summaryView.lawReportId}
              </div>
              <div>
                <b>Type:</b> {summaryView.type}
              </div>
              <div>
                <b>Cached:</b>{" "}
                {summaryView.cached === null
                  ? "—"
                  : summaryView.cached
                  ? "Yes (served from DB)"
                  : "No (generated now)"}
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.75, textAlign: "right" }}>
              <div>
                <b>Created:</b> {fmtDate(summaryView.createdAt)}
              </div>
              <div>
                <b>Updated:</b> {fmtDate(summaryView.updatedAt)}
              </div>
            </div>
          </div>

          <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.10)", margin: "12px 0" }} />

          <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            {summaryView.summary || "— (empty summary) —"}
          </pre>
        </div>
      ) : null}

      {/* Related cases output */}
      {relatedView ? (
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
            <div style={{ fontSize: 13, opacity: 0.9, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>AI Related Cases</div>
              <div>
                <b>LawReport:</b> {relatedView.lawReportId}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={pillStyle("rgba(112,40,64,0.25)")}>
                  Kenya: {relatedView.kenyaCount ?? "—"}
                </span>
                <span style={pillStyle("rgba(14,165,165,0.18)")}>
                  Outside: {relatedView.foreignCount ?? "—"}
                </span>
                {relatedView.model ? <span style={pillStyle("rgba(255,255,255,0.06)")}>Model: {relatedView.model}</span> : null}
              </div>
            </div>

            {relatedView.disclaimer ? (
              <div
                style={{
                  maxWidth: 420,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,200,80,0.30)",
                  background: "rgba(255,200,80,0.08)",
                  fontSize: 12,
                  fontWeight: 800,
                  lineHeight: 1.35,
                }}
              >
                {relatedView.disclaimer}
              </div>
            ) : null}
          </div>

          <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.10)", margin: "12px 0" }} />

          {relatedView.items.length === 0 ? (
            <div style={{ opacity: 0.8, fontWeight: 700 }}>No suggestions returned.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {relatedView.items.map((it, idx) => {
                const title = it?.title || `Suggestion #${idx + 1}`;
                const jur = it?.jurisdiction || "—";
                const cite = it?.citation || "";
                const year = it?.year || null;
                const court = it?.court || "";
                const url = it?.url || "";
                const conf = typeof it?.confidence === "number" ? it.confidence : null;
                const note = it?.note || "";

                const metaBits = [jur, year ? String(year) : null, court || null].filter(Boolean).join(" • ");

                return (
                  <div
                    key={`${title}-${idx}`}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.10)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 260 }}>
                        <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.25 }}>{title}</div>
                        {metaBits ? (
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.78 }}>{metaBits}</div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {cite ? <span style={pillStyle("rgba(255,255,255,0.06)")}>{cite}</span> : null}
                        {conf !== null ? (
                          <span style={pillStyle("rgba(255,255,255,0.06)")}>Conf: {Math.round(conf * 100)}%</span>
                        ) : null}
                        {jur && jur.toLowerCase() !== "kenya" ? (
                          <span style={pillStyle("rgba(255,200,80,0.10)")}>Persuasive</span>
                        ) : null}
                      </div>
                    </div>

                    {note ? (
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, fontWeight: 700 }}>
                        {note}
                      </div>
                    ) : null}

                    {url ? (
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "inherit", textDecoration: "underline" }}
                        >
                          Open reference
                        </a>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
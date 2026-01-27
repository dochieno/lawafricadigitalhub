import { useMemo, useState } from "react";
import api from "../../api/client";
import "../../styles/devContentBlocksTest.css";

/**
 * Existing routes:
 *  POST /api/law-reports/{id}/content/build?force=true
 *  GET  /api/law-reports/{id}/content/json?forceBuild=true
 *  GET  /api/law-reports/{id}/content/json/status
 *
 * New AI formatter route:
 *  POST /api/law-reports/{id}/ai-format   body: { force, maxInputChars }
 */

function toErrMsg(e, fallback = "Request failed.") {
  return (
    e?.response?.data?.message ||
    e?.response?.data?.detail ||
    e?.response?.data?.error ||
    e?.message ||
    fallback
  );
}

function safeJsonParse(maybeStringOrObj) {
  if (maybeStringOrObj == null) return null;
  if (typeof maybeStringOrObj !== "string") return maybeStringOrObj;
  try {
    return JSON.parse(maybeStringOrObj);
  } catch {
    return null;
  }
}

export default function DevContentBlocksTest() {
  const [lawReportId, setLawReportId] = useState("");
  const [forceBuild, setForceBuild] = useState(true);

  // ✅ NEW
  const [useAiFormatter, setUseAiFormatter] = useState(false);
  const [aiMaxInputChars, setAiMaxInputChars] = useState(20000);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [json, setJson] = useState(null);
  const [status, setStatus] = useState(null);

  const blocks = useMemo(() => {
    const arr = json?.blocks;
    return Array.isArray(arr) ? arr : [];
  }, [json]);

  async function build(id) {
    const res = await api.post(`/law-reports/${id}/content/build`, null, {
      params: { force: true },
    });
    return res.data ?? null;
  }

  // ✅ NEW
  async function aiFormat(id) {
    const res = await api.post(`/law-reports/${id}/ai-format`, {
      force: true,
      maxInputChars: Number(aiMaxInputChars) || 20000,
    });
    return res.data ?? null;
  }

  async function getJson(id) {
    const res = await api.get(`/law-reports/${id}/content/json`, {
      params: { forceBuild },
    });
    return safeJsonParse(res.data);
  }

  async function getStatus(id) {
    const res = await api.get(`/law-reports/${id}/content/json/status`);
    return res.data ?? null;
  }

  async function run() {
    const id = Number(lawReportId);

    if (!Number.isFinite(id) || id <= 0) {
      setErr("Enter a valid LawReportId.");
      setJson(null);
      setStatus(null);
      return;
    }

    setLoading(true);
    setErr("");
    setJson(null);
    setStatus(null);

    try {
      // ✅ If AI is enabled, build via AI formatter first
      if (useAiFormatter) {
        await aiFormat(id);
      } else if (forceBuild) {
        await build(id);
      }

      const data = await getJson(id);
      setJson(data ?? null);

      try {
        const st = await getStatus(id);
        setStatus(st ?? null);
      } catch {
        setStatus(null);
      }
    } catch (e) {
      setErr(String(toErrMsg(e)));
      setJson(null);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dcbWrap">
      <header className="dcbTop">
        <div className="dcbTitle">Dev · LawReport Content Blocks Tester</div>

        <div className="dcbControls">
          <label className="dcbField">
            <span>LawReportId</span>
            <input
              value={lawReportId}
              onChange={(e) => setLawReportId(e.target.value)}
              placeholder="e.g. 3"
              className="dcbInput"
              inputMode="numeric"
            />
          </label>

          <label className="dcbCheck">
            <input
              type="checkbox"
              checked={forceBuild}
              onChange={(e) => setForceBuild(e.target.checked)}
              disabled={useAiFormatter}
            />
            Force build (POST /build first)
          </label>

          {/* ✅ NEW */}
          <label className="dcbCheck">
            <input
              type="checkbox"
              checked={useAiFormatter}
              onChange={(e) => setUseAiFormatter(e.target.checked)}
            />
            Use AI formatter (POST /ai-format)
          </label>

          {/* ✅ NEW */}
          {useAiFormatter ? (
            <label className="dcbField" style={{ minWidth: 180 }}>
              <span>AI max input chars</span>
              <input
                value={String(aiMaxInputChars)}
                onChange={(e) => setAiMaxInputChars(e.target.value)}
                className="dcbInput"
                inputMode="numeric"
              />
            </label>
          ) : null}

          <button className="dcbBtn" onClick={run} disabled={loading}>
            {loading ? "Loading…" : "Fetch & Render"}
          </button>
        </div>

        {err ? <div className="dcbErr">{err}</div> : null}

        {status ? (
          <div className="dcbStatus">
            <div>
              <b>Status:</b> exists={String(status.exists)} · blocksCount=
              {String(status.blocksCount ?? "-")}
            </div>
            <div className="dcbStatusMeta">
              hash: {String(status.hash ?? "-")} · builtBy:{" "}
              {String(status.builtBy ?? "-")}
            </div>
          </div>
        ) : null}
      </header>

      <div className="dcbGrid">
        <section className="dcbCard">
          <div className="dcbCardTitle">Rendered Preview</div>

          {!json ? (
            <div className="dcbEmpty">Enter an ID and click “Fetch & Render”.</div>
          ) : (
            <article className="lexWrap">
              {blocks.map((b, idx) => {
                const type = String(b?.type || "").toLowerCase();
                const text = String(b?.text || "").trim();

                if (!text && !b?.data) return null;

                if (type === "title")
                  return (
                    <h1 key={idx} className="lexTitle">
                      {text}
                    </h1>
                  );
                if (type === "metaline")
                  return (
                    <div key={idx} className="lexMeta">
                      {text}
                    </div>
                  );
                if (type === "heading")
                  return (
                    <div key={idx} className="lexHeading">
                      {text}
                    </div>
                  );

                if (type === "listitem") {
                  const marker = b?.data?.marker ? String(b.data.marker) : "";
                  const t = b?.data?.text ? String(b.data.text) : text;

                  return (
                    <div key={idx} className="lexLi">
                      {marker ? (
                        <span className="lexLiMarker">{marker}</span>
                      ) : null}
                      <span className="lexLiText">{t}</span>
                    </div>
                  );
                }

                return (
                  <p key={idx} className="lexP">
                    {text}
                  </p>
                );
              })}
            </article>
          )}
        </section>

        <section className="dcbCard">
          <div className="dcbCardTitle">Raw JSON (debug)</div>

          {!json ? (
            <div className="dcbEmpty">Nothing loaded yet.</div>
          ) : (
            <pre className="dcbJson">{JSON.stringify(json, null, 2)}</pre>
          )}
        </section>
      </div>
    </div>
  );
}
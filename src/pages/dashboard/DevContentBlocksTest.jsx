// src/pages/dev/DevContentBlocksTest.jsx
import { useMemo, useState } from "react";
import api from "../../api/client";
import "../../styles/devContentBlocksTest.css";

/**
 * Dev-only tester for normalized blocks JSON.
 *
 * Supports BOTH possible backend shapes:
 *
 * A) REST style:
 *   GET  /api/law-reports/{id}/content/json?forceBuild=true
 *   GET  /api/law-reports/{id}/content/json/status
 *
 * B) Query style:
 *   GET  /api/law-reports/content/json?lawReportId={id}&forceBuild=true
 *   GET  /api/law-reports/content/json/status?lawReportId={id}
 *
 * And your confirmed controller:
 *   POST /api/law-reports/{id}/content/build?force=true
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

async function firstOk(fns) {
  let lastErr = null;
  for (const fn of fns) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All attempts failed.");
}

export default function DevContentBlocksTest() {
  const [lawReportId, setLawReportId] = useState("");
  const [forceBuild, setForceBuild] = useState(true);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [json, setJson] = useState(null);
  const [status, setStatus] = useState(null);

  const blocks = useMemo(() => {
    const arr = json?.blocks;
    return Array.isArray(arr) ? arr : [];
  }, [json]);

  // ---------- Endpoints ----------

  async function build(id) {
    // POST /api/law-reports/{id}/content/build?force=true
    const res = await api.post(`/law-reports/${id}/content/build`, null, {
      params: { force: true },
    });
    return res.data ?? null;
  }

  async function getJsonRest(id) {
    // GET /api/law-reports/{id}/content/json?forceBuild=true
    const res = await api.get(`/law-reports/${id}/content/json`, {
      params: { forceBuild },
    });
    return safeJsonParse(res.data);
  }

  async function getJsonQuery(id) {
    // GET /api/law-reports/content/json?lawReportId=...&forceBuild=true
    const res = await api.get(`/law-reports/content/json`, {
      params: { lawReportId: id, forceBuild },
    });
    return safeJsonParse(res.data);
  }

  async function getStatusRest(id) {
    // GET /api/law-reports/{id}/content/json/status
    const res = await api.get(`/law-reports/${id}/content/json/status`);
    return res.data ?? null;
  }

  async function getStatusQuery(id) {
    // GET /api/law-reports/content/json/status?lawReportId=...
    const res = await api.get(`/law-reports/content/json/status`, {
      params: { lawReportId: id },
    });
    return res.data ?? null;
  }

  // ---------- UI Action ----------

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
      // If forceBuild is checked: build first (your confirmed POST endpoint)
      if (forceBuild) {
        await build(id);
      }

      // Fetch JSON: try REST style, then query style
      const data = await firstOk([() => getJsonRest(id), () => getJsonQuery(id)]);
      setJson(data ?? null);

      // Fetch status: try REST style, then query style (optional)
      try {
        const st = await firstOk([() => getStatusRest(id), () => getStatusQuery(id)]);
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
              placeholder="e.g. 2"
              className="dcbInput"
              inputMode="numeric"
            />
          </label>

          <label className="dcbCheck">
            <input
              type="checkbox"
              checked={forceBuild}
              onChange={(e) => setForceBuild(e.target.checked)}
            />
            Force build (POST /build first)
          </label>

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
        {/* Rendered preview */}
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

                if (type === "title") {
                  return (
                    <h1 key={idx} className="lexTitle">
                      {text}
                    </h1>
                  );
                }

                if (type === "metaline") {
                  return (
                    <div key={idx} className="lexMeta">
                      {text}
                    </div>
                  );
                }

                if (type === "heading") {
                  return (
                    <div key={idx} className="lexHeading">
                      {text}
                    </div>
                  );
                }

                if (type === "listitem") {
                  const marker = b?.data?.marker ? String(b.data.marker) : "";
                  const t = b?.data?.text ? String(b.data.text) : text;

                  return (
                    <div key={idx} className="lexLi">
                      {marker ? <span className="lexLiMarker">{marker}</span> : null}
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

        {/* Raw JSON */}
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
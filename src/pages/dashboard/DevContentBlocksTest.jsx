// src/pages/dev/DevContentBlocksTest.jsx
import { useMemo, useState } from "react";
import api from "../../api/client";
import "../../styles/devContentBlocksTest.css";

/**
 * Dev-only tester for normalized blocks JSON.
 *
 * ✅ Supports BOTH API styles (so you won't get stuck on 405):
 *
 * Style A (recommended):
 *   POST /law-reports/{id}/content/build         (force build)
 *   GET  /law-reports/{id}/content/json          (read cached json)
 *
 * Style B (legacy fallback):
 *   GET  /law-reports/{id}/content/json?forceBuild=true
 *
 * The code below tries Style A first, and if it hits 404/405,
 * it automatically falls back to Style B.
 */

function isMethodNotAllowed(err) {
  return Number(err?.response?.status) === 405;
}

function isNotFound(err) {
  return Number(err?.response?.status) === 404;
}

function toErrMsg(e, fallback = "Request failed.") {
  return (
    e?.response?.data?.message ||
    e?.response?.data?.detail ||
    e?.response?.data?.error ||
    e?.message ||
    fallback
  );
}

export default function DevContentBlocksTest() {
  const [lawReportId, setLawReportId] = useState("");
  const [forceBuild, setForceBuild] = useState(true);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [json, setJson] = useState(null);

  const blocks = useMemo(() => {
    const arr = json?.blocks;
    return Array.isArray(arr) ? arr : [];
  }, [json]);

  async function run() {
    const id = Number(lawReportId);
    if (!Number.isFinite(id) || id <= 0) {
      setErr("Enter a valid LawReportId.");
      setJson(null);
      return;
    }

    setLoading(true);
    setErr("");
    setJson(null);

    try {
      // -------------------------
      // 1) FORCE BUILD (preferred: POST)
      // -------------------------
      if (forceBuild) {
        try {
          // ✅ preferred build endpoint
          // (create this in API when ready)
          await api.post(`/law-reports/${id}/content/build`);
        } catch (buildErr) {
          // If build endpoint doesn't exist or doesn't allow POST,
          // we will fallback later to legacy GET ?forceBuild=true
          if (!isNotFound(buildErr) && !isMethodNotAllowed(buildErr)) {
            // real error (401/403/500 etc.)
            throw buildErr;
          }
        }
      }

      // -------------------------
      // 2) READ JSON (preferred: GET without params)
      // -------------------------
      try {
        const res = await api.get(`/law-reports/${id}/content/json`);
        setJson(res.data ?? null);
        return;
      } catch (getErr) {
        // If endpoint exists but requires legacy param OR server rejects GET,
        // try legacy fallback below
        if (!isNotFound(getErr) && !isMethodNotAllowed(getErr)) {
          throw getErr;
        }
      }

      // -------------------------
      // 3) LEGACY FALLBACK: GET with forceBuild param
      // -------------------------
      const res2 = await api.get(`/law-reports/${id}/content/json`, {
        params: { forceBuild },
      });
      setJson(res2.data ?? null);
    } catch (e) {
      setErr(String(toErrMsg(e, "Request failed.")));
      setJson(null);
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
              placeholder="e.g. 1745"
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
            Force build (reparse now)
          </label>

          <button className="dcbBtn" onClick={run} disabled={loading}>
            {loading ? "Loading…" : "Fetch & Render"}
          </button>
        </div>

        {err ? <div className="dcbErr">{err}</div> : null}
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

                // paragraph default
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
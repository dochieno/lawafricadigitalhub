import { useMemo, useState } from "react";
import api from "../../api/client";
import "../../styles/devContentBlocksTest.css";

/**
 * Dev-only tester for normalized blocks JSON.
 * Calls:
 *  GET /law-reports/{id}/content/json?forceBuild=true
 */
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
    try {
      // NOTE: controller route we created:
      // GET /api/law-reports/{id}/content/json
      // Your axios client already prefixes /api if configured; keep as below to match your other calls.
      const res = await api.get(`/law-reports/${id}/content/json`, {
        params: { forceBuild },
        // IMPORTANT: controller returns Content(application/json) => axios parses as object if headers are right
      });

      setJson(res.data ?? null);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.detail ||
        e?.message ||
        "Request failed.";
      setErr(String(msg));
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
                  // Prefer structured marker/text if present
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
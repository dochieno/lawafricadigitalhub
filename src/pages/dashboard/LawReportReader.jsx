// src/pages/dashboard/LawReportReader.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import "../../styles/lawReportReader.css";

function isInstitutionUser() {
  const c = getAuthClaims();
  return !!(c?.institutionId && c?.institutionId > 0);
}

function isPublicUser() {
  const c = getAuthClaims();
  const userType = c?.payload?.userType || c?.payload?.UserType || null;
  const inst = c?.institutionId;
  return String(userType).toLowerCase() === "public" && (!inst || inst <= 0);
}

/**
 * Robust global admin detection.
 * Adjust role names here to match your backend roles exactly.
 */
function isGlobalAdminUser() {
  const c = getAuthClaims();

  const rolesRaw =
    c?.roles ??
    c?.payload?.roles ??
    c?.payload?.role ??
    c?.payload?.Role ??
    c?.payload?.Roles ??
    [];

  const roles = Array.isArray(rolesRaw)
    ? rolesRaw
    : typeof rolesRaw === "string"
      ? rolesRaw
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

  const norm = roles.map((r) => String(r).toLowerCase());
  return (
    norm.includes("admin") ||
    norm.includes("globaladmin") ||
    norm.includes("global_admin") ||
    norm.includes("superadmin") ||
    norm.includes("super_admin")
  );
}

// ----------------------
// Helpers
// ----------------------
function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
}

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

// ----------------------
// AI Summary Panel (same API endpoints as your current code)
// ----------------------
function formatDateMaybe(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleString();
  } catch {
    return String(d);
  }
}

function LawReportAiSummaryPanel({ lawReportId }) {
  const [type, setType] = useState("basic"); // basic | extended
  const [forceRegenerate, setForceRegenerate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const canRun = useMemo(
    () => Number.isFinite(Number(lawReportId)) && Number(lawReportId) > 0,
    [lawReportId]
  );

  async function fetchCached() {
    if (!canRun) return;

    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/ai/law-reports/${Number(lawReportId)}/summary`, {
        params: { type },
      });
      setResult(res.data?.data ?? res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No cached summary found yet."));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    if (!canRun) return;

    setLoading(true);
    setError("");
    try {
      const res = await api.post(`/ai/law-reports/${Number(lawReportId)}/summary`, {
        type,
        forceRegenerate,
      });
      setResult(res.data?.data ?? res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to generate AI summary."));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="lrrAi">
      <div className="lrrAiTop">
        <div className="lrrAiTitleRow">
          <div className="lrrAiTitle">LegalAI Summary</div>
          <span className="lrrAiBadge">AI generated</span>
        </div>
        <div className="lrrAiSub">
          Generates (and caches) a summary for this report. Always verify important details against the full text.
        </div>
      </div>

      <div className="lrrAiControls">
        <div className="lrrAiLeftControls">
          <label className="lrrAiField">
            <span className="lrrAiLabel">Summary type</span>
            <select className="lrrAiSelect" value={type} onChange={(e) => setType(e.target.value)} disabled={loading}>
              <option value="basic">basic</option>
              <option value="extended">extended</option>
            </select>
          </label>

          <label className="lrrAiCheck">
            <input
              className="lrrAiCheckbox"
              type="checkbox"
              checked={forceRegenerate}
              onChange={(e) => setForceRegenerate(e.target.checked)}
              disabled={loading}
            />
            <span>Force regenerate</span>
          </label>
        </div>

        <div className="lrrAiActions">
          <button type="button" className="lrrAiBtn lrrAiBtnPrimary" onClick={fetchCached} disabled={loading || !canRun}>
            {loading ? "Working…" : "Get cached"}
          </button>

          <button type="button" className="lrrAiBtn lrrAiBtnGhost" onClick={generate} disabled={loading || !canRun}>
            {loading ? "Working…" : "Generate"}
          </button>
        </div>
      </div>

      {error ? <div className="lrrAiError">{error}</div> : null}

      {result ? (
        <div className="lrrAiResult">
          <div className="lrrAiMeta">
            <div className="lrrAiMetaCol">
              <div>
                <b>Type:</b> {result.type ?? type}
              </div>
              {"cached" in result ? (
                <div>
                  <b>Cached:</b> {String(result.cached)}
                </div>
              ) : null}
            </div>

            <div className="lrrAiMetaCol right">
              <div>
                <b>Created:</b> {formatDateMaybe(result.createdAt)}
              </div>
              <div>
                <b>Updated:</b> {formatDateMaybe(result.updatedAt)}
              </div>
            </div>
          </div>

          <div className="lrrAiBody">
            <pre className="lrrAiText">{result.summary || ""}</pre>
          </div>
        </div>
      ) : (
        <div className="lrrAiTip">
          Tip: Click <b>Get cached</b> first. If none exists, click <b>Generate</b>.
        </div>
      )}
    </section>
  );
}

// ----------------------
// Reader
// ----------------------
export default function LawReportReader() {
  const { id } = useParams();
  const reportId = Number(id);
  const navigate = useNavigate();

  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();
  const isAdmin = isGlobalAdminUser();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // gating
  const [hasContent, setHasContent] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  // UI state: "content" or "ai"
  const [view, setView] = useState("content");

  // Search
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [openResults, setOpenResults] = useState(false);
  const searchAbortRef = useRef({ cancelled: false });

  // Load report
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await api.get(`/law-reports/${reportId}`);
        if (cancelled) return;
        setReport(res.data ?? null);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("We couldn’t load this report right now. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (Number.isFinite(reportId) && reportId > 0) load();
    else {
      setError("Invalid report id.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  // Availability + access checks (based on LegalDocumentId) — DO NOT CHANGE LOGIC
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!report?.legalDocumentId) return;

      // ✅ Global admin bypass
      if (isAdmin) {
        if (!cancelled) {
          setHasContent(true);
          setAvailabilityLoading(false);
          setAccess({ hasFullAccess: true });
          setAccessLoading(false);
        }
        return;
      }

      // ✅ If ContentText exists, treat as available and skip /availability
      const textHasContent = !!String(report?.contentText || "").trim();
      if (textHasContent) {
        if (!cancelled) {
          setHasContent(true);
          setAvailabilityLoading(false);
        }
      } else {
        try {
          setAvailabilityLoading(true);
          const r = await api.get(`/legal-documents/${report.legalDocumentId}/availability`);
          const ok = !!r?.data?.hasContent;
          if (!cancelled) setHasContent(ok);
        } catch {
          if (!cancelled) setHasContent(true); // fail-open
        } finally {
          if (!cancelled) setAvailabilityLoading(false);
        }
      }

      // Access: only needed for premium + public/institution flows
      if (report?.isPremium && (isInst || isPublic)) {
        try {
          setAccessLoading(true);
          const r = await api.get(`/legal-documents/${report.legalDocumentId}/access`);
          if (!cancelled) setAccess(r?.data ?? null);
        } catch {
          if (!cancelled) setAccess(null);
        } finally {
          if (!cancelled) setAccessLoading(false);
        }
      } else {
        if (!cancelled) setAccess(null);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [report, isInst, isPublic, isAdmin]);

  const rawContent = useMemo(() => String(report?.contentText || ""), [report?.contentText]);
  const textHasContent = !!rawContent.trim();
  const hasFullAccess = !!access?.hasFullAccess;

  const canRead =
    !!report &&
    (isAdmin ||
      ((hasContent || textHasContent) && (!report.isPremium || hasFullAccess || (!isInst && !isPublic))));

// ----------------------
// Search (debounced) — uses your controller: GET /api/law-reports/search
// ----------------------
    useEffect(() => {
      const abortState = searchAbortRef.current; // ✅ capture once
      abortState.cancelled = false;

      const term = String(q || "").trim();
      if (term.length < 2) {
        setSearchErr("");
        setSearchResults([]);
        setOpenResults(false);
        return () => {
          abortState.cancelled = true;
        };
      }

      const t = setTimeout(async () => {
        try {
          setSearching(true);
          setSearchErr("");

          const res = await api.get(`/law-reports/search`, {
            params: { q: term, page: 1, pageSize: 8 },
          });

          if (abortState.cancelled) return;

          const payload = res.data?.data ?? res.data;
          const items = Array.isArray(payload?.items) ? payload.items : [];

          setSearchResults(items);
          setOpenResults(true);
        } catch (e) {
          if (!abortState.cancelled) {
            setSearchErr(getApiErrorMessage(e, "Search failed."));
            setSearchResults([]);
            setOpenResults(true);
          }
        } finally {
          if (!abortState.cancelled) setSearching(false);
        }
      }, 280);

      return () => {
        abortState.cancelled = true;
        clearTimeout(t);
      };
    }, [q]);

  function pickReport(r) {
    const rid = Number(r?.id || r?.lawReportId);
    if (!rid) return;
    setOpenResults(false);
    setQ("");
    setSearchResults([]);
    navigate(`/dashboard/law-reports/${rid}`);
  }

  // ----------------------
  // Returns
  // ----------------------
  if (loading) {
    return (
      <div className="lrr2Wrap">
        <div className="lrr2Loading">Loading report…</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="lrr2Wrap">
        <div className="lrr2Error">
          <div className="lrr2ErrorTitle">Report unavailable</div>
          <div className="lrr2ErrorMsg">{error || "Not found."}</div>
          <div className="lrr2TopActions">
            <button className="lrr2Btn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back to Law Reports
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="lrr2Wrap">
        <div className="lrr2Error">
          <div className="lrr2ErrorTitle">Access required</div>
          <div className="lrr2ErrorMsg">
            {availabilityLoading
              ? "Checking availability…"
              : !hasContent && !textHasContent
                ? "This report isn’t available yet."
                : "This is a premium report. Please subscribe or sign in with an eligible account to read it."}
          </div>

          <div className="lrr2TopActions">
            <button className="lrr2Btn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back
            </button>
            <button
              className="lrr2Btn secondary"
              onClick={() => navigate(`/dashboard/documents/${report.legalDocumentId}`)}
              disabled={!report.legalDocumentId}
            >
              Document page
            </button>
          </div>
        </div>
      </div>
    );
  }

  const title = report.parties || report.title || "Law Report";
  const llrNo = report.reportNumber || report.llrNo || report.llrNumber || String(reportId);

  return (
    <div className="lrr2Wrap">
      {/* Top header + search */}
      <header className="lrr2Header">
        <div className="lrr2HeaderTop">
          <div className="lrr2Brand">Law Africa Law Reports</div>

          <div className="lrr2HeaderRight">
            <button className="lrr2LinkBtn" onClick={() => navigate("/dashboard/law-reports")}>
              ← Back
            </button>

            <button
              className="lrr2LinkBtn"
              onClick={() => navigate(`/dashboard/documents/${report.legalDocumentId}`)}
              disabled={!report.legalDocumentId}
            >
              Document page
            </button>
          </div>
        </div>

        <div className="lrr2SearchRow">
          <div className="lrr2SearchLabel">Case Search</div>

          <div className="lrr2SearchBox">
            <input
              className="lrr2SearchInput"
              placeholder="Type parties, citation, year, court…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => {
                if (searchResults.length || searchErr) setOpenResults(true);
              }}
            />
            <button
              type="button"
              className="lrr2SearchBtn"
              onClick={() => setOpenResults((v) => !v)}
              title="Show results"
            >
              {searching ? "Searching…" : "Search"}
            </button>

            {openResults && (searchErr || searchResults.length > 0) ? (
              <div className="lrr2SearchDropdown">
                {searchErr ? <div className="lrr2SearchErr">{searchErr}</div> : null}

                {searchResults.map((r, idx) => {
                    const rid = Number(r?.id);
                    const rtitle = r?.parties || r?.title || `Report #${rid || idx + 1}`;
                    const rcite = r?.citation || r?.reportNumber || "";
                                      return (
                    <button
                      type="button"
                      key={rid || idx}
                      className="lrr2SearchItem"
                      onClick={() => pickReport(r)}
                    >
                      <div className="lrr2SearchItemTitle">{rtitle}</div>
                      <div className="lrr2SearchItemMeta">{rcite}</div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="lrr2SearchHint">
            Usage: To find cases, type in search terms in the textbox above e.g. distressed tenant
          </div>
        </div>
      </header>

      {/* Big title line */}
      <div className="lrr2TitleLine">
        <span className="lrr2TitleKicker">LLR No. {llrNo}:</span> {title}
      </div>

      {/* Two columns: meta table + actions */}
      <div className="lrr2TopGrid">
        <section className="lrr2MetaCard">
          <div className="lrr2MetaTable">
            <div className="lrr2Row">
              <div className="lrr2Key">LLRNO</div>
              <div className="lrr2Val">{llrNo}</div>
            </div>
            {report.caseNumber ? (
              <div className="lrr2Row">
                <div className="lrr2Key">CASENO</div>
                <div className="lrr2Val">{report.caseNumber}</div>
              </div>
            ) : null}
            {report.court ? (
              <div className="lrr2Row">
                <div className="lrr2Key">COURT</div>
                <div className="lrr2Val">{report.court}</div>
              </div>
            ) : null}
            {report.country ? (
              <div className="lrr2Row">
                <div className="lrr2Key">COUNTRY</div>
                <div className="lrr2Val">{report.country}</div>
              </div>
            ) : null}
            {report.town || report.townPostCode ? (
              <div className="lrr2Row">
                <div className="lrr2Key">TOWN</div>
                <div className="lrr2Val">{report.town || report.townPostCode}</div>
              </div>
            ) : null}
            {report.decisionTypeLabel ? (
              <div className="lrr2Row">
                <div className="lrr2Key">DECISION</div>
                <div className="lrr2Val">{report.decisionTypeLabel}</div>
              </div>
            ) : null}
            {report.judges ? (
              <div className="lrr2Row">
                <div className="lrr2Key">JUDGE</div>
                <div className="lrr2Val">{report.judges}</div>
              </div>
            ) : null}
            {report.decisionDate ? (
              <div className="lrr2Row">
                <div className="lrr2Key">DATE</div>
                <div className="lrr2Val">{formatDate(report.decisionDate)}</div>
              </div>
            ) : null}

            {isAdmin ? <div className="lrr2MetaNote">admin access</div> : null}
            {!isAdmin && accessLoading ? <div className="lrr2MetaNote">checking access…</div> : null}
            {!isAdmin && availabilityLoading ? <div className="lrr2MetaNote">checking availability…</div> : null}
          </div>
        </section>

        <section className="lrr2ActionsCard">
          <div className="lrr2ActionBtns">
            <button type="button" className="lrr2Btn primary" onClick={() => setView("content")}>
              View Case Content
            </button>

            <button type="button" className="lrr2Btn" onClick={() => setView("ai")}>
              Summarize with LegalAI
            </button>

            <button type="button" className="lrr2Btn ghost" disabled title="Coming soon">
              Download
            </button>
          </div>
        </section>
      </div>

      {/* Unified content area */}
      <section className="lrr2Content">
        {view === "ai" ? (
          <LawReportAiSummaryPanel lawReportId={reportId} />
        ) : !textHasContent ? (
          <div className="lrr2Empty">This report has no content yet.</div>
        ) : (
          <article className="lrr2Article">
            <div className="lrr2ArticleTitle">Case File / Transcript</div>
            <pre className="lrr2Raw">{rawContent}</pre>
          </article>
        )}
      </section>
    </div>
  );
}
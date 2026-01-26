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

function AiSummaryRichText({ text }) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  // Detect headings like "Digest:", "Court:", "Issue:", "Summary:", "Held:", "Key Point:"
const isHeadingLine = (s) =>
  /^(digest|court|issue|summary|held|key points?|keypoint|key-point)\s*:/i.test(s.trim());

  // Detect bullets: "-", "•", "*", "–"
  const isBulletLine = (s) => /^\s*[-•*–]\s+/.test(s);

  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const s = raw.trim();

    // Skip extra blank lines
    if (!s) {
      i += 1;
      continue;
    }

    // Heading line
    if (isHeadingLine(s)) {
      const [label, ...rest] = s.split(":");
      const value = rest.join(":").trim();

    blocks.push(
      <div className="lrrAiBlock" key={`h-${i}`}>
        <div className="lrrAiH">
          {label.trim()}:
          {value ? <span className="lrrAiHVal"> {value}</span> : null}
        </div>
      </div>
    );
      i += 1;
      continue;
    }

    // Bullet list
    if (isBulletLine(raw)) {
      const items = [];
      while (i < lines.length && isBulletLine(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-•*–]\s+/, "").trim();
        if (itemText) items.push(itemText);
        i += 1;
      }

      blocks.push(
        <ul className="lrrAiUl" key={`ul-${i}`}>
          {items.map((t, idx) => (
            <li key={idx} className="lrrAiLi">
              {t}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraph block (consume until blank line or heading or bullets)
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isHeadingLine(lines[i]) &&
      !isBulletLine(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }

    blocks.push(
      <p className="lrrAiP" key={`p-${i}`}>
        {para.join(" ")}
      </p>
    );
  }

  return <div className="lrrAiRich">{blocks}</div>;
}



function LawReportAiSummaryPanel({ lawReportId, digestTitle, courtLabel }) {
  const [type] = useState("basic"); // keep as default for API param
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const canRun = useMemo(
    () => Number.isFinite(Number(lawReportId)) && Number(lawReportId) > 0,
    [lawReportId]
  );

  useEffect(() => {
    if (!canRun) return;
    fetchCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun, type, lawReportId]);

  

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

  return (
   <section className="lrrAi">
  <div className="lrrAiTop">
    <div className="lrrAiTitleRow">
      <div className="lrrAiTitle">LegalAI Summary</div>
      <span className="lrrAiBadge">AI generated</span>
    </div>

    <div className="lrrAiDigestTop">
      <div className="lrrAiDigestLine">
        <b>Digest:</b> {digestTitle || "—"}
      </div>
      <div className="lrrAiDigestLine">
        <b>Court:</b> {courtLabel || "—"}
      </div>
    </div>

    <div className="lrrAiSub">
      This summary is automatically generated by LegalAI and may be cached for performance.
      Always verify critical details against the full case text.
    </div>
  </div>

  {/* Subtle status line instead of buttons */}
  <div className="lrrAiStatus">
    {loading ? (
      <span>Preparing summary…</span>
    ) : result ? (
      <span>
        Summary type: <b>{result.type ?? type}</b>
      </span>
    ) : null}
  </div>

  {error ? <div className="lrrAiError">{error}</div> : null}

  {result ? (
    <div className="lrrAiResult">
      <div className="lrrAiMeta">
        <div className="lrrAiMetaCol">
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
        <AiSummaryRichText text={result.summary || ""} />
      </div>
    </div>
  ) : loading ? null : (
    <div className="lrrAiTip">
      No summary available yet.
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
  // Transcript toggle
  const [contentOpen, setContentOpen] = useState(true);

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

  // Search dropdown close helpers
const searchBoxRef = useRef(null);
const searchInputRef = useRef(null);

  useEffect(() => {
    if (!openResults) return;

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpenResults(false);
        // optional: clear error/results or keep them
        // setSearchErr("");
        // setSearchResults([]);
        // setQ("");
        searchInputRef.current?.blur?.();
      }
    }

    function onPointerDown(e) {
      const el = searchBoxRef.current;
      if (!el) return;
      if (!el.contains(e.target)) {
        setOpenResults(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    // pointerdown catches mouse + touch
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openResults]);

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
          </div>
        </div>

        <div className="lrr2SearchRow">
          <div className="lrr2SearchLabel">Case Search</div>

          <div className="lrr2SearchBox" ref={searchBoxRef}>
            <input
              ref={searchInputRef}
              className="lrr2SearchInput"
              placeholder="Search parties, citation, court, year, or words inside the case…"
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

          // Left meta line (citation / report no)
          const leftMeta = r?.citation || r?.reportNumber || "";

          // Right-side compact meta
          const year = r?.year ? String(r.year) : "";
          const court = r?.courtTypeLabel || r?.court || "";
          const decision = r?.decisionTypeLabel || "";

        return (
          <button
            type="button"
            key={rid || idx}
            className="lrr2SearchItem"
            onClick={() => pickReport(r)}
          >
            <div className="lrr2SearchItemLeft">
              <div className="lrr2SearchItemTitle">{rtitle}</div>
              {leftMeta ? <div className="lrr2SearchItemMeta">{leftMeta}</div> : null}
            </div>

            <div className="lrr2SearchItemRight">
              {year ? <span className="lrr2Tag">{year}</span> : null}
              {court ? <span className="lrr2Tag">{court}</span> : null}
              {decision ? <span className="lrr2Tag soft">{decision}</span> : null}
            </div>
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

{/* Two columns: meta table + actions (ONLY these two cards live inside this grid) */}
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
      {view === "content" ? (
        <>
          {/* Primary action in CONTENT view */}
          <button
            type="button"
            className="lrr2Btn primary isActive"
            onClick={() => {
              setView("content");
              setContentOpen(true);
            }}
          >
            <span className="lrr2BtnIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
              </svg>
            </span>
            View Case Content
          </button>

          {/* Switch to AI */}
          <button
            type="button"
            className="lrr2Btn"
            onClick={() => {
              setView("ai");
              setContentOpen(false);
            }}
          >
            <span className="lrr2BtnIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2l1.2 4.1L17 7.3l-3.8 1.2L12 12l-1.2-3.5L7 7.3l3.8-1.2L12 2z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M19 13l.8 2.6L22 16l-2.2.6L19 19l-.8-2.4L16 16l2.2-.4L19 13z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M5 14l.9 3L9 18l-3.1 1L5 22l-1-3-3-1 3-1 .9-3z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Summarize with LegalAI
          </button>

          {/* Collapse toggle ONLY in content view */}
          <button
            type="button"
            className="lrr2Btn"
            onClick={() => setContentOpen((v) => !v)}
          >
            <span className="lrr2BtnIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            {contentOpen ? "Hide Case Content" : "Show Case Content"}
          </button>
        </>
      ) : (
        <>
          {/* Primary action in AI view: go back to content */}
          <button
            type="button"
            className="lrr2Btn primary isActive"
            onClick={() => {
              setView("content");
              setContentOpen(true);
            }}
          >
            <span className="lrr2BtnIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke="currentColor" strokeWidth="1.7"/>
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" strokeWidth="1.7"/>
              </svg>
            </span>
            Back to Case Content
          </button>

          {/* Optional: keep "Download" only in AI view */}
          <button type="button" className="lrr2Btn" disabled title="Coming soon">
            <span className="lrr2BtnIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path
                  d="M8 11l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            Download AI Report
          </button>
        </>
      )}
    </div>
  </section>
</div>

{/* Unified content area (THIS MUST be OUTSIDE lrr2TopGrid) */}
<section className="lrr2Content">
  {view === "ai" ? (
    <LawReportAiSummaryPanel
      lawReportId={reportId}
      digestTitle={title} // parties/title you already computed
      courtLabel={report?.court || ""} // from report
      />
  ) : !textHasContent ? (
    <div className="lrr2Empty">This report has no content yet.</div>
  ) : (
    <article className="lrr2Article">
      <div className="lrr2ArticleTitle">Case File / Transcript</div>

      <div className={`lrr2Collapse ${contentOpen ? "open" : "closed"}`}>
        <pre className="lrr2Raw">{rawContent}</pre>
      </div>
    </article>
  )}
</section>
</div>
);
}
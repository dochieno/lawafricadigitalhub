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

function isProbablyHtml(s) {
  const x = String(s || "").trim();
  if (!x) return false;
  // very conservative: real tags, not just "<" in text
  return /<\/?(p|br|div|span|h1|h2|h3|h4|ul|ol|li|table|thead|tbody|tr|td|th|blockquote)\b/i.test(x);
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
// Case content formatting (NEW)
// ----------------------
function normalizeText(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoParagraphs(text) {
  const t = normalizeText(text);
  if (!t) return [];

  // If text already has paragraph breaks, keep them
  const hasParaBreaks = /\n\s*\n/.test(t);
  if (hasParaBreaks) {
    return t
      .split(/\n\s*\n+/)
      .map((p) => p.replace(/\n+/g, " ").trim())
      .filter(Boolean);
  }

  // Heuristic: insert breaks before common section headings & some patterns
  const headings = [
    "JUDGMENT",
    "INTRODUCTION",
    "BACKGROUND",
    "FACTS",
    "ISSUE",
    "ISSUES",
    "HELD",
    "HOLDING",
    "ANALYSIS",
    "DETERMINATION",
    "DISCUSSION",
    "RULING",
    "ORDER",
    "ORDERS",
    "DISPOSITION",
    "CONCLUSION",
  ];

  let x = t;

  // Break before headings that appear as words in the blob
  for (const h of headings) {
    const re = new RegExp(`\\s(${h})\\s`, "g");
    x = x.replace(re, `\n\n$1 `);
  }

  // Break before numbered points (1., 2., 3.) and lettered points (a), (b)
  x = x
    .replace(/\s(\d{1,2}\.)\s/g, "\n\n$1 ")
    .replace(/\s(\([a-z]\))\s/g, "\n\n$1 ");

  // Break at sentence boundaries when there is a clear “new section” vibe:
  // (this is conservative; avoids over-splitting)
  x = x.replace(/([.?!])\s+(The issues in dispute are:)/g, "$1\n\n$2");

  return x
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isLikelyHeadingParagraph(p) {
  const s = String(p || "").trim();

  // Pure uppercase short lines (e.g., "ANALYSIS", "DETERMINATION")
  if (s.length <= 40 && /^[A-Z\s]+$/.test(s) && /[A-Z]/.test(s)) return true;

  // Title-case headings like "Judgment", "Introduction"
  if (s.length <= 40 && /^(Judgment|Introduction|Background|Facts|Issues?|Held|Analysis|Determination|Orders?|Conclusion)\b/.test(s))
    return true;

  return false;
}

function CaseContentFormatted({ text }) {
  const paras = useMemo(() => splitIntoParagraphs(text), [text]);

  if (!paras.length) return null;

  return (
    <div className="lrr2CaseFmt">
      {paras.map((p, idx) =>
        isLikelyHeadingParagraph(p) ? (
          <h3 className="lrr2CaseH" key={idx}>
            {p}
          </h3>
        ) : (
          <p className="lrr2CaseP" key={idx}>
            {p}
          </p>
        )
      )}
    </div>
  );
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
    /^(digest|court|issue|summary|held|key points?|keypoint|key-point)\s*:/i.test(
      s.trim()
    );

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
      const isKeyPoints = /^key points?\s*$/i.test(label.trim());

      blocks.push(
        <div
          className={`lrrAiBlock ${isKeyPoints ? "isKeyPoints" : ""}`}
          key={`h-${i}`}
        >
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
const didAutoGenRef = useRef(false);


  const canRun = useMemo(
    () => Number.isFinite(Number(lawReportId)) && Number(lawReportId) > 0,
    [lawReportId]
  );

  function isCacheMiss(err) {
    return err?.response?.status === 404;
  }

  async function generateSummary({ force = false } = {}) {
  const res = await api.post(
    `/ai/law-reports/${Number(lawReportId)}/summary`,
    { type, forceRegenerate: force }
  );
  return res.data?.data ?? res.data;
}

useEffect(() => {
  if (!canRun) return;

  // reset "auto-generate once" guard each time report/type changes
  didAutoGenRef.current = false;

  let cancelled = false;

  (async () => {
    setLoading(true);
    setError("");
    try {
      // 1) Try cached first (GET)
      const res = await api.get(`/ai/law-reports/${Number(lawReportId)}/summary`, {
        params: { type },
      });

      if (cancelled) return;
      setResult(res.data?.data ?? res.data);
      setError("");
    } catch (err) {
      if (cancelled) return;

      // 2) If cache miss (404), auto-generate ONCE (POST), then show it
      if (isCacheMiss(err) && !didAutoGenRef.current) {
        didAutoGenRef.current = true;
        try {
          const generated = await generateSummary({ force: false });
          if (cancelled) return;
          setResult(generated);
          setError("");
        } catch (genErr) {
          if (cancelled) return;
          setResult(null);
          setError(getApiErrorMessage(genErr, "Failed to generate AI summary."));
        }
      } else {
        // 3) Other errors (401/403/500/etc.)
        setResult(null);
        setError(getApiErrorMessage(err, "No cached summary found yet."));
      }
    } finally {
      // ✅ Always clear loading (even on early returns before)
      if (!cancelled) setLoading(false);
    }
  })();

  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [canRun, type, lawReportId]);

  return (
    <section className="lrrAi">
      <div className="lrrAiTop">
        <div className="lrrAiTitleRow">
          <div className="lrrAiTitle">LegalAI Summary</div>
          <span className="lrrAiBadge">AI generated</span>
        </div>

        <div className="lrrAiHeadnote">
          <div className="lrrAiHeadnoteTitle">{digestTitle || "—"}</div>
          <div className="lrrAiHeadnoteMeta">{courtLabel || "—"}</div>
          <div className="lrrAiHeadnoteRule" />
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
        <div className="lrrAiTip">No summary available yet.</div>
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

  const [fontScale, setFontScale] = useState(1); // 0.9 - 1.2
  const [readingTheme, setReadingTheme] = useState("paper"); // paper | sepia | dark
  const [serif, setSerif] = useState(true);

  

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

  // Reading progress
const [progress, setProgress] = useState(0);

useEffect(() => {
  function onScroll() {
    const el = document.documentElement;
    const scrollTop = el.scrollTop || document.body.scrollTop;
    const scrollHeight = el.scrollHeight || document.body.scrollHeight;
    const clientHeight = el.clientHeight || window.innerHeight;
    const max = Math.max(1, scrollHeight - clientHeight);
    setProgress(Math.min(1, Math.max(0, scrollTop / max)));
  }

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => window.removeEventListener("scroll", onScroll);
}, []);

  useEffect(() => {
    if (!openResults) return;

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpenResults(false);
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
      ((hasContent || textHasContent) &&
        (!report.isPremium || hasFullAccess || (!isInst && !isPublic))));

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
    <div
      className="lrr2Wrap"
      data-theme={readingTheme}
    >
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
      <div className="lrr2Progress" aria-hidden="true">
  <div className="lrr2ProgressBar" style={{ transform: `scaleX(${progress})` }} />
</div>

    <button
      type="button"
      className="lrr2ToTop"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      title="Back to top"
    >
      ↑
    </button>

      {/* Big title line */}

      {/* Two columns: meta table + actions (ONLY these two cards live inside this grid) */}
      <div className="lrr2TopGrid">
        <section className="lrr2MetaCard">
        <div className="lrr2MetaChips">
          {llrNo ? (
            <button className="lrr2MetaChip" data-tip="LLR Number">
              <span className="lrr2MetaIcon">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M8 9h8M8 13h6" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              {llrNo}
            </button>
          ) : null}

          {report.caseNumber ? (
            <button className="lrr2MetaChip" data-tip="Case Number">
              <span className="lrr2MetaIcon">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M7 7h10v10H7z" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M9 11h6M9 14h4" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              {report.caseNumber}
            </button>
          ) : null}

          {report.court ? (
            <button className="lrr2MetaChip" data-tip="Court">
              <span className="lrr2MetaIcon">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 10h16" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M6 10V6h12v4" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M6 18h12" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              {report.court}
            </button>
          ) : null}

          {report.country ? (
            <button className="lrr2MetaChip" data-tip="Country">
              <span className="lrr2MetaIcon">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M3 12h18M12 3a15 15 0 0 1 0 18" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </span>
              {report.country}
            </button>
          ) : null}

          {report.decisionTypeLabel ? (
            <button className="lrr2MetaChip" data-tip="Decision Type">
              <span className="lrr2MetaIcon">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v18M5 12h14" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              {report.decisionTypeLabel}
            </button>
          ) : null}

          {report.judges ? (
            <button className="lrr2MetaChip" data-tip="Judge(s)">
              <span className="lrr2MetaIcon">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M5 20c1.5-4 12.5-4 14 0" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              {report.judges}
            </button>
          ) : null}

          {report.decisionDate ? (
            <button className="lrr2MetaChip" data-tip="Decision Date">
              <span className="lrr2MetaIcon">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              {formatDate(report.decisionDate)}
            </button>
          ) : null}

          <button
          type="button"
          className="lrr2MetaChip"
          title="Copy title"
          onClick={() => navigator.clipboard?.writeText(`${title}`)}
        >
          Copy title
        </button>

        {report?.citation ? (
          <button
            type="button"
            className="lrr2MetaChip"
            title="Copy citation"
            onClick={() => navigator.clipboard?.writeText(String(report.citation))}
          >
            Copy citation
          </button>
        ) : null}

          {/* subtle status hints */}

        </div>
        {!isAdmin && accessLoading ? (
          <span className="lrr2MetaHint" data-tip="Checking subscription access">
            checking access…
          </span>
        ) : null}
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
                  Back to Case Content
                </button>

                {/* Optional: keep "Download" only in AI view */}
                <button type="button" className="lrr2Btn" disabled title="Coming soon">
                  <span className="lrr2BtnIcon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 3v10"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M8 11l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5 21h14"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
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
           
        <div className="lrr2ReaderBar">
          {/* Left group: typography */}
          <div className="lrr2ReaderCluster">
            <button
              type="button"
              className="lrr2IconBtn"
              onClick={() =>
                setFontScale((v) => Math.max(0.9, Number((v - 0.05).toFixed(2))))
              }
              title="Decrease text size"
              aria-label="Decrease text size"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 18h2.2l1.2-3h5.2l1.2 3H17L12.9 6h-1.8L5 18z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M9.2 13.2h4l-2-5-2 5z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M18 10h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="lrr2IconBtnText">A−</span>
            </button>

            <button
              type="button"
              className="lrr2IconBtn"
              onClick={() =>
                setFontScale((v) => Math.min(1.2, Number((v + 0.05).toFixed(2))))
              }
              title="Increase text size"
              aria-label="Increase text size"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 18h2.2l1.2-3h5.2l1.2 3H17L12.9 6h-1.8L5 18z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M9.2 13.2h4l-2-5-2 5z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M20 8v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M17 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="lrr2IconBtnText">A+</span>
            </button>

            <button
              type="button"
              className={`lrr2IconBtn ${serif ? "isOn" : ""}`}
              onClick={() => setSerif((v) => !v)}
              title={serif ? "Serif font (on)" : "Serif font (off)"}
              aria-label="Toggle serif font"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M9 18V6h6v12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M8 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="lrr2IconBtnText">Serif</span>
            </button>
          </div>

          {/* Right group: theme pills */}
          <div className="lrr2ReaderCluster">
            <button
              type="button"
              className={`lrr2IconBtn ${readingTheme === "paper" ? "isOn" : ""}`}
              onClick={() => setReadingTheme("paper")}
              title="Paper theme"
              aria-label="Paper theme"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 3h7l3 3v15H7V3z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" />
                <path d="M9 11h6M9 15h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span className="lrr2IconBtnText">Paper</span>
            </button>

            <button
              type="button"
              className={`lrr2IconBtn ${readingTheme === "sepia" ? "isOn" : ""}`}
              onClick={() => setReadingTheme("sepia")}
              title="Sepia theme"
              aria-label="Sepia theme"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 3h10v18H7V3z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M9 8h6M9 12h6M9 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M5.5 6.5c1.2-1.2 2.7-2 4.5-2" stroke="currentColor" strokeWidth="1.2" opacity=".7" />
              </svg>
              <span className="lrr2IconBtnText">Sepia</span>
            </button>

            <button
              type="button"
              className={`lrr2IconBtn ${readingTheme === "dark" ? "isOn" : ""}`}
              onClick={() => setReadingTheme("dark")}
              title="Dark theme"
              aria-label="Dark theme"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="lrr2IconBtnText">Dark</span>
            </button>
          </div>
        </div>
          <div
            className={`lrr2Collapse ${contentOpen ? "open" : "closed"} lrr2Theme-${readingTheme}`}
            style={{
              fontSize: `${fontScale}em`,
              fontFamily: serif
                ? 'ui-serif, Georgia, "Times New Roman", Times, serif'
                : 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            }}
          >
            {isProbablyHtml(rawContent) ? (
              <div className="lrr2Html" dangerouslySetInnerHTML={{ __html: rawContent }} />
            ) : (
              <CaseContentFormatted text={rawContent} />
            )}
          </div>
        </article>
      )}
    </section>
    </div>
  );
}
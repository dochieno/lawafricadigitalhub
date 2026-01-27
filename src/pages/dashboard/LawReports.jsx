// src/pages/dashboard/LawReports.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { getAuthClaims } from "../../auth/auth";
import { isLawReportDocument } from "../../utils/isLawReportDocument";
import {
  extractReportMeta,
  getReportSearchHaystack,
  makeReportExcerpt,
  makeReportMiniHeader,
  normalize,
  REPORT_CASE_TYPES_ALL,
} from "../../utils/lawReportMeta";
import { useDebounce } from "../../utils/useDebounce";
import "../../styles/lawReports.css";

/* -----------------------------
   Tiny Icons (inline SVG)
------------------------------ */
function IcArrowLeft(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M14.5 6.5L9 12l5.5 5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}



function IcCase(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 7.5V6.2A2.2 2.2 0 0 1 10.2 4h3.6A2.2 2.2 0 0 1 16 6.2v1.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6.5 7.5h11A2.5 2.5 0 0 1 20 10v8.5A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5V10A2.5 2.5 0 0 1 6.5 7.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9.2 12.2h5.6M9.2 15.3h4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IcArrowRight(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9.5 6.5L15 12l-5.5 5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IcCalendar(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M7 3v3M17 3v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4.5 9h15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6.5 6h11A2.5 2.5 0 0 1 20 8.5v11A2.5 2.5 0 0 1 17.5 22h-11A2.5 2.5 0 0 1 4 19.5v-11A2.5 2.5 0 0 1 6.5 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}
function IcGavel(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M14.5 6.5l3 3M13 8l3-3 3 3-3 3-3-3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M3 21l7-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9 15l3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10.5 13.5l5.5-5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IcPin(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 13.2a3.2 3.2 0 110-6.4 3.2 3.2 0 010 6.4z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}
function IcUser(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4.5 21a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -----------------------------
   Helpers
------------------------------ */
function isInstitutionUser() {
  const c = getAuthClaims();
  return !!(c?.institutionId && c.institutionId > 0);
}

function isPublicUser() {
  const c = getAuthClaims();
  const userType = c?.payload?.userType || c?.payload?.UserType || null;
  const inst = c?.institutionId;
  return String(userType).toLowerCase() === "public" && (!inst || inst <= 0);
}

function parseSearchResponse(payload) {
  if (Array.isArray(payload)) return { items: payload, total: payload.length };

  const items = payload?.items ?? payload?.data ?? payload?.results ?? [];
  const total =
    payload?.total ??
    payload?.count ??
    (Array.isArray(items) ? items.length : 0);

  return { items: Array.isArray(items) ? items : [], total: Number(total) || 0 };
}

function stripHtmlToText(html) {
  const s = String(html || "");
  if (!s) return "";

  // remove script/style blocks
  const noScripts = s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  // preserve some structure before stripping tags
  const withBreaks = noScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*/gi, "\n\n")
    .replace(/<\/div>\s*/gi, "\n");

  // strip remaining tags
  const noTags = withBreaks.replace(/<\/?[^>]+>/g, " ");

  // decode common entities
  return noTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPreview(text) {
  // 🔑 NEW: strip HTML first
  const t = stripHtmlToText(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!t) return "";
  return t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function truncateText(text, max = 100) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// Fallback decision labels (used only if /law-reports/decision-types doesn't exist yet)
const FALLBACK_DECISIONS = [
  "Judgment",
  "Ruling",
  "Award",
  "Award by Consent",
  "Notice of Motion",
  "Interpretation of Award",
  "Order",
  "Interpretation of Amended Order",
];

export default function LawReports() {
  const navigate = useNavigate();
  const isInst = isInstitutionUser();
  const isPublic = isPublicUser();

  // Mode: try server search first; fallback to client mode if 404
  const [mode, setMode] = useState("server"); // "server" | "client"
  const searchUnavailableRef = useRef(false);

  // Data
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);

  // Client fallback enrichment
  const [detailsMap, setDetailsMap] = useState({});
  const [detailsLoadingIds, setDetailsLoadingIds] = useState(new Set());

  // Access + availability
  const [accessMap, setAccessMap] = useState({});
  const [accessLoadingIds, setAccessLoadingIds] = useState(new Set());

  const [availabilityMap, setAvailabilityMap] = useState({});
  const [availabilityLoadingIds, setAvailabilityLoadingIds] = useState(new Set());

  // ✅ Options from DB distinct endpoints
  const [caseTypeOptions, setCaseTypeOptions] = useState([]); // [{value,label,count}]
  const [decisionOptions, setDecisionOptions] = useState([]); // [{value,label,count}]

  // UX
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [toast, setToast] = useState(null);
  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  // Filters/search/sort
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300);

  const [reportNumber, setReportNumber] = useState("");
  const [parties, setParties] = useState("");
  const [citation, setCitation] = useState("");

  const [year, setYear] = useState("");
  const [courtType, setCourtType] = useState("");
  const [townOrPostCode, setTownOrPostCode] = useState("");

  // ✅ IMPORTANT: store selected values as INT strings (backend parses int or name)
  const [caseType, setCaseType] = useState(""); // "" or "1".."6"
  const [decisionType, setDecisionType] = useState(""); // "" or enum int

  const [sortBy, setSortBy] = useState("year_desc");

  // Pagination (both modes now)
  const [page, setPage] = useState(1);
  const pageSize = 9; // ✅ 3 columns × 3 rows

  const [showAdvanced, setShowAdvanced] = useState(false);

  function resetFilters() {
    setQ("");
    setReportNumber("");
    setParties("");
    setCitation("");
    setYear("");
    setCourtType("");
    setTownOrPostCode("");
    setCaseType("");
    setDecisionType("");
    setSortBy("year_desc");
    setPage(1);
    showToast("Filters cleared");
  }

  // ------------------------------------------------------------
  // ✅ Load dropdown options: case types + decision types
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const res = await api.get("/law-reports/case-types");
        const arr = Array.isArray(res.data) ? res.data : [];
        if (!cancelled && arr.length > 0) setCaseTypeOptions(arr);
      } catch {
        // ignore
      }

      try {
        const res = await api.get("/law-reports/decision-types");
        const arr = Array.isArray(res.data) ? res.data : [];
        if (!cancelled && arr.length > 0) setDecisionOptions(arr);
      } catch {
        if (!cancelled) setDecisionOptions([]);
      }
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  async function tryServerSearch(params) {
    if (searchUnavailableRef.current) return { ok: false, reason: "unavailable" };

    try {
      const res = await api.get("/law-reports/search", { params });
      const { items, total: t } = parseSearchResponse(res.data);
      return { ok: true, items, total: t };
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404) {
        searchUnavailableRef.current = true;
        return { ok: false, reason: "404" };
      }
      throw e;
    }
  }

  async function loadAllReportsClientFallback() {
    const res = await api.get("/legal-documents");
    const all = res.data || [];
    return all.filter(isLawReportDocument);
  }

  // ------------------------------------------------------------
  // Main load: server search OR client fallback
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError("");

        if (mode === "server") {
          const params = {
            q: debouncedQ?.trim() || undefined,
            reportNumber: reportNumber.trim() || undefined,
            parties: parties.trim() || undefined,
            citation: citation.trim() || undefined,
            year: year ? Number(year) : undefined,
            courtType: courtType || undefined,
            townOrPostCode: townOrPostCode || undefined,

            caseType: caseType || undefined,
            decisionType: decisionType || undefined,

            sort: sortBy || "year_desc",
            page,
            pageSize,
          };

          const out = await tryServerSearch(params);

          if (!out.ok) {
            if (!cancelled) {
              setMode("client");
              setPage(1);
              const list = await loadAllReportsClientFallback();
              if (cancelled) return;
              setReports(list);
              setTotal(list.length);
            }
            return;
          }

          if (cancelled) return;
          setReports(out.items || []);
          setTotal(out.total || 0);
          return;
        }

        // client mode
        const list = await loadAllReportsClientFallback();
        if (cancelled) return;
        setReports(list);
        setTotal(list.length);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("We couldn’t load Law Reports right now. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };

  }, [
    mode,
    debouncedQ,
    reportNumber,
    parties,
    citation,
    year,
    courtType,
    townOrPostCode,
    caseType,
    decisionType,
    sortBy,
    page,
  ]);

  // ------------------------------------------------------------
  // Client-mode enrichment (only needed in client mode)
  // ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function enrichMissingDetails() {
      if (mode !== "client") return;
      if (!reports || reports.length === 0) return;

      const needs = reports
        .map((r) => r?.id)
        .filter(Boolean)
        .filter((id) => {
          if (detailsMap[id]) return false;
          const base = reports.find((x) => x.id === id);
          const meta = extractReportMeta(base);

          const missingCore =
            !meta.reportNumber &&
            !meta.parties &&
            !meta.citation &&
            !meta.courtType &&
            !meta.town &&
            !meta.postCode &&
            !meta.caseType &&
            !meta.year &&
            !meta.content;

          return missingCore;
        });

      if (needs.length === 0) return;

      const batchSize = 8;

      for (let i = 0; i < needs.length; i += batchSize) {
        const batch = needs.slice(i, i + batchSize);

        setDetailsLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.add(x));
          return s;
        });

        const results = await Promise.allSettled(
          batch.map((id) => api.get(`/legal-documents/${id}`))
        );

        if (cancelled) return;

        setDetailsMap((prev) => {
          const next = { ...prev };
          results.forEach((r, idx) => {
            const id = batch[idx];
            next[id] = r.status === "fulfilled" ? r.value?.data ?? null : null;
          });
          return next;
        });

        setDetailsLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.delete(x));
          return s;
        });
      }
    }

    enrichMissingDetails();
    return () => {
      cancelled = true;
    };
  }, [mode, reports, detailsMap]);

  const mergedReports = useMemo(() => {
    if (mode !== "client") return reports || [];
    return (reports || []).map((r) => {
      const enriched = detailsMap[r.id];
      return enriched ? { ...r, ...enriched } : r;
    });
  }, [mode, reports, detailsMap]);

  // ------------------------------------------------------------
  // Client filtering (still supported)
  // NOTE: client filter expects labels, not ints.
  // ------------------------------------------------------------
  const selectedCaseLabel = useMemo(() => {
    if (!caseType) return "";
    const match = (caseTypeOptions || []).find((x) => String(x.value) === String(caseType));
    return match?.label || "";
  }, [caseType, caseTypeOptions]);

  const selectedDecisionLabel = useMemo(() => {
    if (!decisionType) return "";
    const match = (decisionOptions || []).find((x) => String(x.value) === String(decisionType));
    return match?.label || "";
  }, [decisionType, decisionOptions]);

  const visibleClientAll = useMemo(() => {
    if (mode !== "client") return mergedReports;

    const query = normalize(debouncedQ);
    const rn = normalize(reportNumber);
    const p = normalize(parties);
    const c = normalize(citation);

    const yearNum = year ? Number(year) : null;
    const courtNorm = normalize(courtType);
    const townNorm = normalize(townOrPostCode);

    const caseNorm = normalize(selectedCaseLabel || "");
    const decisionNorm = normalize(selectedDecisionLabel || "");

    let items = mergedReports.filter((r) => {
      const meta = extractReportMeta(r);

      const matchesQ = !query || getReportSearchHaystack(r).includes(query);

      const matchesReportNumber = !rn || normalize(meta.reportNumber).includes(rn);
      const matchesParties = !p || normalize(meta.parties).includes(p);
      const matchesCitation = !c || normalize(meta.citation).includes(c);

      const matchesYear = !yearNum || meta.year === yearNum;
      const matchesCourt = !courtNorm || normalize(meta.courtType) === courtNorm;

      const matchesTown =
        !townNorm ||
        normalize(meta.town) === townNorm ||
        normalize(meta.postCode) === townNorm;

      const matchesCaseType = !caseNorm || normalize(meta.caseType) === caseNorm;
      const matchesDecision =
        !decisionNorm || normalize(meta.decisionType || meta.decision || "") === decisionNorm;

      return (
        matchesQ &&
        matchesReportNumber &&
        matchesParties &&
        matchesCitation &&
        matchesYear &&
        matchesCourt &&
        matchesTown &&
        matchesCaseType &&
        matchesDecision
      );
    });

    const getYear = (r) => extractReportMeta(r).year ?? -1;
    const getReportNo = (r) => extractReportMeta(r).reportNumber || r.title || "";
    const getParties = (r) => extractReportMeta(r).parties || r.title || "";
    const getDate = (r) => {
      const raw = extractReportMeta(r).judgmentDate;
      const t = raw ? Date.parse(raw) : NaN;
      return Number.isFinite(t) ? t : -1;
    };

    if (sortBy === "year_asc") items.sort((a, b) => getYear(a) - getYear(b));
    else if (sortBy === "year_desc") items.sort((a, b) => getYear(b) - getYear(a));
    else if (sortBy === "reportno_asc")
      items.sort((a, b) => String(getReportNo(a)).localeCompare(String(getReportNo(b))));
    else if (sortBy === "parties_asc")
      items.sort((a, b) => String(getParties(a)).localeCompare(String(getParties(b))));
    else if (sortBy === "date_desc") items.sort((a, b) => getDate(b) - getDate(a));

    return items;
  }, [
    mode,
    mergedReports,
    debouncedQ,
    reportNumber,
    parties,
    citation,
    year,
    courtType,
    townOrPostCode,
    selectedCaseLabel,
    selectedDecisionLabel,
    sortBy,
  ]);

  const visibleAll = mode === "client" ? visibleClientAll : reports;

  // ------------------------------------------------------------
  // ✅ Pagination for BOTH modes
  // ------------------------------------------------------------
  const totalPages = useMemo(() => {
    if (mode === "server") return Math.max(1, Math.ceil((total || 0) / pageSize));
    return Math.max(1, Math.ceil((visibleAll?.length || 0) / pageSize));
  }, [mode, total, pageSize, visibleAll]);

  useEffect(() => {
    // Keep page in bounds when filters shrink results
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const visible = useMemo(() => {
    if (mode === "server") return visibleAll; // already paged by backend
    const start = (page - 1) * pageSize;
    return (visibleAll || []).slice(start, start + pageSize);
  }, [mode, visibleAll, page, pageSize]);

  // ------------------------------------------------------------
  // ✅ IMPORTANT FIX: availability/access require LegalDocumentId
  // ------------------------------------------------------------
  function getDocIdForRow(r) {
    return mode === "server" ? r?.legalDocumentId : r?.id;
  }

  // Access checks
  useEffect(() => {
    let cancelled = false;

    async function fetchAccessForVisiblePremiumReports() {
      if (!isInst && !isPublic) return;

      const premiumDocIds = (visible || [])
        .filter((d) => !!d?.isPremium)
        .map((d) => getDocIdForRow(d))
        .filter(Boolean);

      const missing = premiumDocIds.filter((docId) => accessMap[docId] == null);
      if (missing.length === 0) return;

      const batchSize = 8;

      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);

        setAccessLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.add(x));
          return s;
        });

        const results = await Promise.allSettled(
          batch.map((docId) => api.get(`/legal-documents/${docId}/access`))
        );

        if (cancelled) return;

        setAccessMap((prev) => {
          const next = { ...prev };
          results.forEach((r, idx) => {
            const docId = batch[idx];
            next[docId] = r.status === "fulfilled" ? r.value?.data ?? null : null;
          });
          return next;
        });

        setAccessLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.delete(x));
          return s;
        });
      }
    }

    fetchAccessForVisiblePremiumReports();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isInst, isPublic, mode]);

  // Availability checks
  useEffect(() => {
    let cancelled = false;

    async function fetchAvailabilityForVisibleReports() {
      const docIds = (visible || []).map((d) => getDocIdForRow(d)).filter(Boolean);

      const missing = docIds.filter((docId) => availabilityMap[docId] == null);
      if (missing.length === 0) return;

      const batchSize = 10;

      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);

        setAvailabilityLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.add(x));
          return s;
        });

        const results = await Promise.allSettled(
          batch.map((docId) => api.get(`/legal-documents/${docId}/availability`))
        );

        if (cancelled) return;

        setAvailabilityMap((prev) => {
          const next = { ...prev };
          results.forEach((r, idx) => {
            const docId = batch[idx];
            if (r.status === "fulfilled") next[docId] = !!r.value?.data?.hasContent;
            else next[docId] = true; // fail-open
          });
          return next;
        });

        setAvailabilityLoadingIds((prev) => {
          const s = new Set(prev);
          batch.forEach((x) => s.delete(x));
          return s;
        });
      }
    }

    fetchAvailabilityForVisibleReports();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode]);

  // ------------------------------------------------------------
  // Dropdown option lists (render value=INT string)
  // ------------------------------------------------------------
  const computedCaseOptions = useMemo(() => {
    if (caseTypeOptions && caseTypeOptions.length > 0) {
      return [...caseTypeOptions].sort((a, b) =>
        String(a.label || "").localeCompare(String(b.label || ""))
      );
    }
    return REPORT_CASE_TYPES_ALL.map((label, idx) => ({
      value: idx + 1,
      label,
      count: 0,
    }));
  }, [caseTypeOptions]);

  const computedDecisionOptions = useMemo(() => {
    if (decisionOptions && decisionOptions.length > 0) {
      return [...decisionOptions].sort((a, b) =>
        String(a.label || "").localeCompare(String(b.label || ""))
      );
    }
    return FALLBACK_DECISIONS.map((label, idx) => ({
      value: idx + 1,
      label,
      count: 0,
    }));
  }, [decisionOptions]);

  // ------------------------------------------------------------
  // Unified meta + excerpt per mode
  // ------------------------------------------------------------
  function getMetaForRow(r) {
    if (mode === "server") {
      return {
        parties: r?.parties || "",
        reportNumber: r?.reportNumber || "",
        citation: r?.citation || "",
        year: r?.year || null,
        caseType: r?.caseTypeLabel || "",
        decisionType: r?.decisionTypeLabel || "",
        courtType: r?.courtTypeLabel || "",
        town: r?.town || "",
        postCode: r?.townPostCode || "",
        judges: r?.judges || "",
        judgmentDate: r?.decisionDate ? String(r.decisionDate).slice(0, 10) : "",
        title: r?.title || "",
      };
    }
    return extractReportMeta(r);
  }

  function getExcerptForRow(r) {
    if (mode === "server") {
      return truncateText(cleanPreview(r?.previewText || ""), 100);
    }
    // client mode can also carry html in meta.content/excerpt
    return truncateText(cleanPreview(makeReportExcerpt(r, 260)), 100);
  }

  function setPageToFirst() {
    setPage(1);
  }

  function buildTags(meta) {
    const list = [];
    if (meta.reportNumber) list.push(meta.reportNumber);
    if (meta.year) list.push(String(meta.year));
    if (meta.decisionType) list.push(meta.decisionType);
    if (meta.caseType) list.push(meta.caseType);
    if (meta.courtType) list.push(meta.courtType);
    if (meta.town) list.push(meta.town);
    if (!meta.town && meta.postCode) list.push(meta.postCode);
    if (meta.citation) list.push(meta.citation);
    return list;
  }

  return (
    <div className="lr-wrap lr-theme">
      {toast && (
        <div className={`lr-toast ${toast.type === "error" ? "error" : ""}`}>
          {toast.message}
        </div>
      )}

      <div className="lr-hero">
        <div
          className="lr-hero-inner"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div className="lr-hero-left" style={{ minWidth: 0, maxWidth: "none" }}>
            <div className="lr-chip" title="LawAfrica Reports">
              <IcCase style={{ width: 18, height: 18 }} />
            </div>
            <h1 className="lr-hero-title">Law Reports</h1>
            <p className="lr-hero-sub" style={{ maxWidth: "none" }}>
              Access authoritative judicial decisions that set legal precedent. Filter by key
              criteria and preview short excerpts to quickly identify relevant judgments.
            </p>
          </div>

          <div
            className="lr-hero-right"
            style={{
              display: "flex",
              flexWrap: "nowrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "flex-end",
              whiteSpace: "nowrap",
            }}
          >
            <button className="lr-pill" onClick={() => navigate("/dashboard/explore")}>
              Explore Publications
            </button>
            <button className="lr-pill ghost" onClick={resetFilters}>
              Clear filters
            </button>
          </div>
        </div>
      </div>

      <div className="lr-body">
        {loading && <div className="lr-loading">Loading Law Reports…</div>}

        {!loading && error && (
          <div className="lr-results">
            <div className="lr-empty">
              <strong>Law Reports unavailable</strong>
              <div style={{ marginTop: 6 }}>{error}</div>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="lr-grid">
            {/* Filters */}
            <aside className="lr-panel">
              <div className="lr-panel-title">Search & Filters</div>

              <div className="lr-field">
                <div className="lr-label">Quick search</div>
                <input
                  className="lr-input"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPageToFirst();
                  }}
                  placeholder="Report no, parties, citation, year, court, town/post code…"
                />
              </div>

              <div className="lr-field">
                <button
                  className="lr-card-btn"
                  onClick={() => setShowAdvanced((v) => !v)}
                  style={{ width: "100%" }}
                >
                  {showAdvanced ? "Hide" : "Show"} advanced fields
                </button>
              </div>

              {showAdvanced && (
                <>
                  <div className="lr-field">
                    <div className="lr-label">Report Number</div>
                    <input
                      className="lr-input"
                      value={reportNumber}
                      onChange={(e) => {
                        setReportNumber(e.target.value);
                        setPageToFirst();
                      }}
                      placeholder="e.g. HCK027…"
                    />
                  </div>

                  <div className="lr-field">
                    <div className="lr-label">Parties</div>
                    <input
                      className="lr-input"
                      value={parties}
                      onChange={(e) => {
                        setParties(e.target.value);
                        setPageToFirst();
                      }}
                      placeholder="e.g. Mwabonje v Sarova…"
                    />
                  </div>

                  <div className="lr-field">
                    <div className="lr-label">Citation</div>
                    <input
                      className="lr-input"
                      value={citation}
                      onChange={(e) => {
                        setCitation(e.target.value);
                        setPageToFirst();
                      }}
                      placeholder="e.g. [2016] LLR (HCK)…"
                    />
                  </div>
                </>
              )}

              <div className="lr-row">
                <div className="lr-field">
                  <div className="lr-label">Year</div>
                  <input
                    className="lr-input"
                    value={year}
                    onChange={(e) => {
                      setYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4));
                      setPageToFirst();
                    }}
                    placeholder="e.g. 2016"
                  />
                </div>

                <div className="lr-field">
                  <div className="lr-label">Sort</div>
                  <select
                    className="lr-select"
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setPageToFirst();
                    }}
                  >
                    <option value="year_desc">Year (new → old)</option>
                    <option value="year_asc">Year (old → new)</option>
                    <option value="date_desc">Judgment date (new → old)</option>
                    <option value="reportno_asc">Report number (A → Z)</option>
                    <option value="parties_asc">Parties (A → Z)</option>
                  </select>
                </div>
              </div>

              {/* Decision */}
              <div className="lr-field">
                <div className="lr-label">Decision</div>
                <select
                  className="lr-select"
                  value={decisionType}
                  onChange={(e) => {
                    setDecisionType(e.target.value);
                    setPageToFirst();
                  }}
                >
                  <option value="">All</option>
                  {computedDecisionOptions.map((d) => (
                    <option key={String(d.value)} value={String(d.value)}>
                      {d.label}
                      {d.count ? ` (${d.count})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Case Type */}
              <div className="lr-field">
                <div className="lr-label">Case Type</div>
                <select
                  className="lr-select"
                  value={caseType}
                  onChange={(e) => {
                    setCaseType(e.target.value);
                    setPageToFirst();
                  }}
                >
                  <option value="">All</option>
                  {computedCaseOptions.map((ct) => (
                    <option key={String(ct.value)} value={String(ct.value)}>
                      {ct.label}
                      {ct.count ? ` (${ct.count})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lr-field">
                <div className="lr-label">Court Type</div>
                <input
                  className="lr-input"
                  value={courtType}
                  onChange={(e) => {
                    setCourtType(e.target.value);
                    setPageToFirst();
                  }}
                  placeholder="e.g. High Court / ELRC"
                />
              </div>

              <div className="lr-field">
                <div className="lr-label">Town / Post Code</div>
                <input
                  className="lr-input"
                  value={townOrPostCode}
                  onChange={(e) => {
                    setTownOrPostCode(e.target.value);
                    setPageToFirst();
                  }}
                  placeholder="e.g. Mombasa / 00100"
                />
              </div>

              <div className="lr-panel-actions">
                <button className="lr-btn secondary" onClick={resetFilters}>
                  Clear
                </button>
                <button className="lr-btn" onClick={() => showToast("Tip: try Decision + Case Type + Year")}>
                  Tip
                </button>
              </div>
            </aside>

            {/* Results */}
            <section className="lr-results">
              <div className="lr-results-top">
                <div className="lr-count">
                  {mode === "server" ? (
                    <>
                      Showing <strong>{reports.length}</strong> of <strong>{total}</strong> report
                      {total === 1 ? "" : "s"} • Page <strong>{page}</strong>/{totalPages}
                    </>
                  ) : (
                    <>
                      Showing <strong>{visibleAll.length}</strong> report
                      {visibleAll.length === 1 ? "" : "s"} • Page{" "}
                      <strong>{page}</strong>/{totalPages}
                      {detailsLoadingIds.size > 0 ? (
                        <span className="lr-soft"> • loading details…</span>
                      ) : null}
                    </>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="lr-card-btn"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    title="Previous page"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <IcArrowLeft style={{ width: 18, height: 18 }} />
                    Prev
                  </button>
                  <button
                    className="lr-card-btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    title="Next page"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    Next
                    <IcArrowRight style={{ width: 18, height: 18 }} />
                  </button>
                </div>
              </div>

              {visible.length === 0 ? (
                <div className="lr-empty">
                  <strong>No matching reports</strong>
                  <div style={{ marginTop: 6 }}>Try clearing filters or changing your search terms.</div>
                </div>
              ) : (
                <div className="lr-cards">
                  {visible.map((r) => {
                    const meta = getMetaForRow(r);
                    const excerpt = getExcerptForRow(r);

                    const docId = getDocIdForRow(r);

                    const access = accessMap[docId];
                    const hasFullAccess = !!access?.hasFullAccess;
                    const accessLoading = accessLoadingIds.has(docId);

                    const availabilityLoading = availabilityLoadingIds.has(docId);

                    const inferredHasContent =
                      mode === "server"
                        ? !!cleanPreview(r?.previewText || "").trim()
                        : availabilityMap[docId] == null
                        ? true
                        : !!availabilityMap[docId];

                    const hasContent = inferredHasContent;
                    const isPremiumRow = !!r.isPremium;
                    const showIncluded =
                      isPremiumRow && (isInst || isPublic) && !accessLoading && hasFullAccess;

                    const canReadMore = hasContent;

                    // ✅ Reader expects LawReportId in both modes
                    const detailsId = r.id;

                    const tags = buildTags(meta);
                    const maxTags = 5;
                    const shown = tags.slice(0, maxTags);
                    const remaining = Math.max(0, tags.length - shown.length);

                    return (
                      <article
                        key={`${mode}-${r.id}`}
                        className="lr-card2"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/dashboard/law-reports/${detailsId}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/dashboard/law-reports/${detailsId}`);
                          }
                        }}
                      >
                        <div className="lr-card2-top">
                          <div className="lr-card2-title">
                            {meta.parties || meta.title || "Untitled report"}
                          </div>

                          <div className="lr-badges">
                            {isPremiumRow ? (
                              <span className="lr-badge premium">Premium</span>
                            ) : (
                              <span className="lr-badge">Free</span>
                            )}
                            {showIncluded && <span className="lr-badge included">Included</span>}
                          </div>
                        </div>

                        {/* compact tags */}
                        <div className="lr-tags">
                          {shown.map((t, idx) => (
                            <span key={`${r.id}-t-${idx}`} className="lr-tag">
                              {t}
                            </span>
                          ))}
                          {remaining > 0 ? (
                            <span className="lr-tag" title={tags.slice(maxTags).join(" • ")}>
                              +{remaining}
                            </span>
                          ) : null}
                        </div>

                        {/* mini meta line with icons */}
                        {mode === "client" ? (
                          (() => {
                            const mh = makeReportMiniHeader(r);
                            return mh ? <div className="lr-mini">{mh}</div> : null;
                          })()
                        ) : (
                          <div className="lr-mini" style={{ display: "grid", gap: 6 }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                              {meta.judgmentDate ? (
                                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                  <IcCalendar style={{ width: 14, height: 14, opacity: 0.9 }} />
                                  {meta.judgmentDate}
                                </span>
                              ) : null}
                              {meta.courtType ? (
                                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                  <IcGavel style={{ width: 14, height: 14, opacity: 0.9 }} />
                                  {meta.courtType}
                                </span>
                              ) : null}
                              {meta.town || meta.postCode ? (
                                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                  <IcPin style={{ width: 14, height: 14, opacity: 0.9 }} />
                                  {meta.town || meta.postCode}
                                </span>
                              ) : null}
                            </div>

                            {meta.judges ? (
                              <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <IcUser style={{ width: 14, height: 14, opacity: 0.9 }} />
                                {meta.judges}
                              </div>
                            ) : null}
                          </div>
                        )}

                        <div className="lr-excerpt" data-full={excerpt}>
                          {excerpt || "Preview will appear here once the report content is available."}
                        </div>

                        <div className="lr-card2-actions">
                          <button
                            className="lr-card-btn primary"
                            disabled={!canReadMore || availabilityLoading}
                            title={!hasContent ? "Not available yet" : ""}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/dashboard/law-reports/${detailsId}`);
                            }}
                            style={{
                              opacity: canReadMore ? 1 : 0.6,
                              cursor: canReadMore ? "pointer" : "not-allowed",
                              width: "100%",
                            }}
                          >
                            {availabilityLoading ? "Checking…" : "Read More"}
                          </button>
                        </div>

                        {!hasContent && !availabilityLoading && (
                          <div className="lr-soft" style={{ marginTop: 8 }}>
                            This report is not available yet.
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {totalPages > 1 && (
                <div className="lr-pager">
                  <button
                    className="lr-card-btn"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <IcArrowLeft style={{ width: 18, height: 18 }} />
                    Prev
                  </button>
                  <div className="lr-soft">
                    Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                  </div>
                  <button
                    className="lr-card-btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    Next <IcArrowRight style={{ width: 18, height: 18 }} />
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
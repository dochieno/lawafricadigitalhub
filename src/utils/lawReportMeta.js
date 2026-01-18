// src/utils/lawReportMeta.js

/**
 * Backend enum mapping:
 * Criminal = 1, Civil = 2, Environmental = 3, Family = 4,
 * Commercial = 5, Constitutional = 6
 */
export const REPORT_CASE_TYPE_MAP = {
  1: "Criminal",
  2: "Civil",
  3: "Environmental",
  4: "Family",
  5: "Commercial",
  6: "Constitutional",
};

export const REPORT_CASE_TYPES_ALL = Object.values(REPORT_CASE_TYPE_MAP);

export function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function normalizeCaseType(raw) {
  if (raw === undefined || raw === null) return "";

  // numeric or numeric-string
  const n = Number(raw);
  if (Number.isFinite(n) && REPORT_CASE_TYPE_MAP[n]) return REPORT_CASE_TYPE_MAP[n];

  // string (e.g. "Civil")
  const s = String(raw).trim();
  if (!s) return "";

  // Try to match known names ignoring case
  const hit = REPORT_CASE_TYPES_ALL.find((x) => normalize(x) === normalize(s));
  return hit || s; // keep original if it's some future/new case type
}

/**
 * Extract LawReport metadata from a LegalDocument-like object.
 * Tolerant across multiple backend shapes/casing.
 */
export function extractReportMeta(d) {
  const lr =
    d?.lawReport ||
    d?.LawReport ||
    d?.report ||
    d?.Report ||
    d?.reportMeta ||
    d?.ReportMeta ||
    null;

  const pick = (...keys) => {
    for (const k of keys) {
      const v = d?.[k] ?? lr?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  };

  const reportNumber = String(pick("reportNumber", "ReportNumber", "code", "Code")).trim();
  const parties = String(pick("parties", "Parties")).trim();
  const citation = String(pick("citation", "Citation")).trim();
  const courtType = String(pick("courtType", "CourtType", "court", "Court")).trim();
  const town = String(pick("town", "Town")).trim();
  const postCode = String(pick("postCode", "PostCode", "postalCode", "PostalCode")).trim();

  // ✅ CaseType: supports enum number OR string
  const caseTypeRaw = pick("caseType", "CaseType");
  const caseType = normalizeCaseType(caseTypeRaw);

  const yearRaw = pick("year", "Year");
  const yearNum = yearRaw ? Number(yearRaw) : NaN;
  const year = Number.isFinite(yearNum) ? yearNum : null;

  const judgmentDateRaw = pick("judgmentDate", "JudgmentDate", "date", "Date");
  const judgmentDate = judgmentDateRaw ? String(judgmentDateRaw) : "";

  // Optional richer fields
  const judges = String(pick("judges", "Judges")).trim();
  const decisionType = String(pick("decisionType", "DecisionType")).trim();
  const caseNotes = String(pick("caseNotes", "CaseNotes")).trim();
  const hcRef = String(pick("hcRef", "HcRef", "HCRef")).trim();

  // Content (for teaser/snippet)
  const content =
    pick("content", "Content") ||
    lr?.content ||
    lr?.Content ||
    d?.content ||
    d?.Content ||
    "";

  return {
    reportNumber,
    parties,
    citation,
    year,
    courtType,
    town,
    postCode,
    caseType,
    judgmentDate,
    judges,
    decisionType,
    caseNotes,
    hcRef,
    content: String(content || ""),
  };
}

/**
 * Build a unified search string used in client fallback mode.
 * Includes user-relevant report fields (+ title + snippet).
 */
export function getReportSearchHaystack(doc) {
  const m = extractReportMeta(doc);
  return [
    doc?.title,
    m.reportNumber,
    m.parties,
    m.citation,
    m.year ? String(m.year) : "",
    m.courtType,
    m.town,
    m.postCode,
    m.caseType,
    // light-weight content sampling helps discoverability
    (m.content || "").slice(0, 400),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Create a teaser excerpt from report content.
 */
export function makeReportExcerpt(doc, maxLen = 260) {
  const m = extractReportMeta(doc);
  const raw = String(m.content || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";

  const trimmed = raw.length > maxLen ? raw.slice(0, maxLen).trimEnd() + "…" : raw;
  return trimmed;
}

/**
 * Build a compact header line like:
 * "EMPLOYMENT AND LABOUR RELATIONS COURT • O. MAKAU, J • 27 May 2016 • Case No.724/15"
 * (Best-effort based on available metadata)
 */
export function makeReportMiniHeader(doc) {
  const m = extractReportMeta(doc);

  const parts = [];
  if (m.courtType) parts.push(m.courtType);
  if (m.judges) parts.push(m.judges);
  if (m.judgmentDate) parts.push(m.judgmentDate);
  if (m.hcRef) parts.push(`Ref: ${m.hcRef}`);

  return parts.filter(Boolean).join(" • ");
}

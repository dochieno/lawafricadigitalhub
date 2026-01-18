// src/utils/lawReportMeta.js

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

  // ✅ NEW: CaseType (enum on backend, but we accept strings too)
  const caseTypeRaw = pick("caseType", "CaseType");
  const caseType = String(caseTypeRaw || "").trim();

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

  return {
    reportNumber,
    parties,
    citation,
    year,
    courtType,
    town,
    postCode,
    caseType, // ✅ NEW
    judgmentDate,
    judges,
    decisionType,
    caseNotes,
    hcRef,
  };
}

/**
 * Build a unified search string used in client fallback mode.
 * Includes only the user-relevant report fields (+ title).
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
    m.caseType, // ✅ NEW
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

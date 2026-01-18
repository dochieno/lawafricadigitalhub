// src/utils/isLawReportDocument.js

/**
 * Detect whether a LegalDocument is a Law Report (LLR Service).
 * We keep this tolerant because the backend may return different casing / property names.
 */
export function isLawReportDocument(d) {
  if (!d) return false;

  const kind = String(
    d.kind ?? d.Kind ?? d.documentKind ?? d.DocumentKind ?? d.legalDocumentKind ?? ""
  )
    .trim()
    .toLowerCase();

  const fileType = String(d.fileType ?? d.FileType ?? d.file_type ?? "")
    .trim()
    .toLowerCase();

  // Primary signals
  if (kind === "report") return true;
  if (fileType === "report") return true;

  // Some backends use variants; harmless to support
  if (kind === "lawreport" || kind === "law-report") return true;

  return false;
}

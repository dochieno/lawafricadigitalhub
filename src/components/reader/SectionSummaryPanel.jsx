import { useEffect, useMemo } from "react";
import { parseAiSummary } from "../../reader/ai/parseAiSummary";

function sectionAccent(title) {
  const t = String(title || "").toLowerCase();
  if (t.includes("fact")) return "facts";
  if (t.includes("issue")) return "issues";
  if (t.includes("holding") || t.includes("decision")) return "holding";
  if (t.includes("reason")) return "reasoning";
  if (t.includes("takeaway") || t.includes("key")) return "takeaways";
  return "default";
}

export default function SectionSummaryPanel({
  open,
  title,
  type,
  loading,
  error,
  summaryText,
  meta,
  expanded,
  onToggleExpanded,
  onClose,
  onCopy,
  onRegenerate,
  onSwitchType,
}) {
  const sections = useMemo(() => parseAiSummary(summaryText), [summaryText]);

  // ESC closes modal
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const safeTitle = String(title || "").trim();
  const headerTitle = safeTitle || "Selected section";

  return (
    <div className="laSummaryModal" role="dialog" aria-modal="true" aria-label="AI Summary">
      {/* Backdrop (click to close) */}
      <button type="button" className="laSummaryBackdrop" aria-label="Close" onClick={onClose} />

      {/* Modal */}
      <div className={`laSummaryWindow ${expanded ? "expanded" : ""}`}>
        <div className="laSummaryHeader">
          <div className="laSummaryHeaderText">
            <div className="laSummaryKicker">AI Summary</div>
            <div className="laSummaryTitle" title={headerTitle}>
              {headerTitle}
            </div>
          </div>

          <button type="button" className="laSummaryIconBtn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="laSummarySubHeader">
          <div className="laSummaryTypePills">
            <button
              type="button"
              className={`laPill ${type === "basic" ? "active" : ""}`}
              onClick={() => onSwitchType?.("basic")}
              disabled={loading}
              title="Basic summary"
            >
              Basic
            </button>
            <button
              type="button"
              className={`laPill ${type === "extended" ? "active" : ""}`}
              onClick={() => onSwitchType?.("extended")}
              disabled={loading}
              title="Extended summary"
            >
              Extended
            </button>
          </div>

          {meta ? (
            <div className="laSummaryMetaRow" title="Summary metadata">
              <span>{meta.fromCache ? "cache" : "fresh"}</span>
              <span>pages {meta.usedPages || "—"}</span>
              <span>{meta.inputCharCount ? `${meta.inputCharCount} chars` : ""}</span>
            </div>
          ) : (
            <div className="laSummaryMetaRow muted">Generated summary appears here.</div>
          )}
        </div>

        <div className="laSummaryBody">
          {loading ? (
            <div className="laSummaryState">Generating {type} summary…</div>
          ) : error ? (
            <div className="laSummaryState error">{error}</div>
          ) : !summaryText ? (
            <div className="laSummaryState muted">
              No summary yet. Generate from ToC (Basic/Extended) or click “Regenerate”.
            </div>
          ) : (
            <div className="laSummaryContent">
              {meta?.warnings?.length ? (
                <div className="laSummaryWarnings">
                  <div className="laSummaryWarningsTitle">Warnings</div>
                  <ul className="laSummaryUl">
                    {meta.warnings.map((w, i) => (
                      <li key={`${i}-${w}`} className="laSummaryLi">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {sections.map((s) => {
                const accent = sectionAccent(s.title);
                return (
                  <section key={s.title} className={`laSumSection laAccent-${accent}`}>
                    <div className="laSumPillRow">
                      <span className="laSumDot" aria-hidden="true" />
                      <span className="laSumPill">{s.title}</span>
                    </div>

                    <div className="laSumCard">
                      {s.blocks.map((b, idx) => {
                        if (b.kind === "ul") {
                          return (
                            <ul key={idx} className="laSummaryUl">
                              {b.items.map((it, i) => (
                                <li key={`${i}-${it}`} className="laSummaryLi">
                                  {it}
                                </li>
                              ))}
                            </ul>
                          );
                        }
                        return (
                          <p key={idx} className="laSummaryP">
                            {b.text}
                          </p>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="laSummaryActions">
          <button type="button" className="laActionBtn" onClick={onCopy} disabled={!summaryText || loading} title="Copy">
            Copy
          </button>

          <button
            type="button"
            className="laActionBtn"
            onClick={onToggleExpanded}
            disabled={!summaryText}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>

          <button
            type="button"
            className="laActionBtn primary"
            onClick={onRegenerate}
            disabled={loading}
            title="Regenerate (force)"
          >
            {loading ? "Working…" : "Regenerate"}
          </button>
        </div>
      </div>
    </div>
  );
}

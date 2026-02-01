// src/components/reader/SectionSummaryPanel.jsx
import { useEffect, useMemo } from "react";
import { parseAiSummary } from "../../reader/ai/parseAiSummary";

export default function SectionSummaryPanel({
  open,
  title,
  type,
  loading,
  error,
  summaryText,
  expanded,
  onToggleExpanded,
  onClose,
  onCopy,
  onRegenerate,
  onSwitchType,
}) {
  const sections = useMemo(() => parseAiSummary(summaryText), [summaryText]);

  // ESC closes
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
    <div className="laSummaryOverlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside className="laSummaryModal" role="dialog" aria-label="AI Summary" aria-modal="true">
        {/* Header */}
        <div className="laSummaryPanelHeader">
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

        {/* Type switch (no meta row anymore) */}
        <div className="laSummaryPanelSubHeader">
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
        </div>

        {/* Body */}
        <div className={`laSummaryBody ${expanded ? "expanded" : ""}`}>
          {loading ? (
            <div className="laSummaryState">Generating {type} summary…</div>
          ) : error ? (
            <div className="laSummaryState error">{error}</div>
          ) : !summaryText ? (
            <div className="laSummaryState muted">
              No summary yet. Select a ToC section and click Basic or Extended.
            </div>
          ) : (
            <div className="laSummaryContent">
              {sections.map((s) => (
                <section key={s.title} className="laSummarySection">
                  {/* ✅ Bold / clearer headers */}
                  <h3 className="laSummaryH3">{s.title}</h3>

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
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions (only what you want) */}
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
      </aside>
    </div>
  );
}

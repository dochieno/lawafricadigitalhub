// src/components/reader/SectionSummaryPanel.jsx
import { useEffect, useMemo } from "react";
import { parseAiSummary } from "../../reader/parseAiSummary";

export default function SectionSummaryPanel({
  open,
  logoSrc,
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

  // ✅ Premium UX: ESC closes panel (desktop)
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
    <aside className="laSummaryPanel" role="dialog" aria-label="AI Summary">
      <div className="laSummaryPanelHeader">
        <div className="laSummaryBrand">
          {logoSrc ? <img className="laSummaryLogo" src={logoSrc} alt="LawAfrica" /> : null}

          <div className="laSummaryHeaderText">
            <div className="laSummaryKicker">AI Summary</div>

            <div className="laSummaryTitle" title={headerTitle}>
              {headerTitle}
            </div>

            {/* Optional subtle helper label */}
            {safeTitle ? (
              <div className="laSummarySubtitle" title={safeTitle}>
                Section
              </div>
            ) : null}
          </div>
        </div>

        <button type="button" className="laSummaryIconBtn" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

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

      <div className={`laSummaryBody ${expanded ? "expanded" : ""}`}>
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
                <ul>
                  {meta.warnings.map((w, i) => (
                    <li key={`${i}-${w}`}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {sections.map((s) => (
              <section key={s.title} className="laSummarySection">
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

      <div className="laSummaryActions">
        <button
          type="button"
          className="laActionBtn"
          onClick={onCopy}
          disabled={!summaryText || loading}
          title="Copy"
        >
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
  );
}

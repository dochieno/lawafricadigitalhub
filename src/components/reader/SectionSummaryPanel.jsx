// src/components/reader/SectionSummaryPanel.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { parseAiSummary } from "../../reader/ai/parseAiSummary";

const ANIM_MS = 160;

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

  // Keep mounted during close animation
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);
  const lastActiveElRef = useRef(null);

  const requestClose = useCallback(() => {
    if (!mounted) return;
    setClosing(true);
    window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      onClose?.();
    }, ANIM_MS);
  }, [mounted, onClose]);

  // Mount/unmount + focus management + body scroll lock
  useEffect(() => {
    if (open) {
      lastActiveElRef.current = document.activeElement;
      setMounted(true);
      setClosing(false);

      document.body.classList.add("laModalOpen");

      // focus after paint
      window.setTimeout(() => {
        closeBtnRef.current?.focus?.();
      }, 0);

      return;
    }

    // If parent sets open=false while mounted, animate out
    if (mounted && !closing) {
      setClosing(true);
      window.setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, ANIM_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!mounted) return;

    function cleanup() {
      document.body.classList.remove("laModalOpen");
      const el = lastActiveElRef.current;
      if (el && typeof el.focus === "function") {
        try {
          el.focus();
        } catch {
          // ignore
        }
      }
    }

    return cleanup;
  }, [mounted]);

  // ESC closes
  useEffect(() => {
    if (!mounted) return;

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }

      // basic focus trap (Tab)
      if (e.key === "Tab") {
        const root = modalRef.current;
        if (!root) return;

        const focusables = root.querySelectorAll(
          'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
        );
        const list = Array.from(focusables).filter(
          (n) => !n.hasAttribute("disabled") && !n.getAttribute("aria-hidden")
        );
        if (!list.length) return;

        const first = list[0];
        const last = list[list.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, requestClose]);

  if (!mounted) return null;

  const safeTitle = String(title || "").trim();
  const headerTitle = safeTitle || "Selected section";

  return (
    <div
      className={`laSummaryOverlay ${closing ? "closing" : "open"}`}
      role="presentation"
      onMouseDown={(e) => {
        // backdrop click closes (but not clicks inside the modal)
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={modalRef}
        className={`laSummaryModal ${closing ? "closing" : "open"} ${expanded ? "expanded" : ""}`}
        role="dialog"
        aria-label="AI Summary"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="laSummaryHeader">
          <div className="laSummaryHeaderLeft">
            <div className="laSummaryKicker">AI Summary</div>
            <div className="laSummaryTitle" title={headerTitle}>
              {headerTitle}
            </div>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="laSummaryIconBtn"
            onClick={requestClose}
            title="Close (Esc)"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Controls row */}
        <div className="laSummaryControls">
          <div className="laSummaryTypePills" role="tablist" aria-label="Summary type">
            <button
              type="button"
              className={`laPill ${type === "basic" ? "active" : ""}`}
              onClick={() => onSwitchType?.("basic")}
              disabled={loading}
              aria-selected={type === "basic"}
              title="Basic summary"
            >
              Basic
            </button>

            <button
              type="button"
              className={`laPill ${type === "extended" ? "active" : ""}`}
              onClick={() => onSwitchType?.("extended")}
              disabled={loading}
              aria-selected={type === "extended"}
              title="Extended summary"
            >
              Extended
            </button>
          </div>

          <div className="laSummaryHeaderActions">
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
        </div>

        {/* Body */}
        <div className="laSummaryBody">
          {loading ? (
            <div className="laSummaryState">Generating {type} summary…</div>
          ) : error ? (
            <div className="laSummaryState error">{error}</div>
          ) : !summaryText ? (
            <div className="laSummaryState muted">
              No summary yet. Select a ToC section and click <strong>Basic</strong> or <strong>Extended</strong>.
            </div>
          ) : (
            <div className="laSummaryContent">
              {sections.map((s) => (
                <section key={s.title} className="laSummarySectionCard">
                  <div className="laSummarySectionHeader">
                    <span className="laSummarySectionDot" aria-hidden="true" />
                    <h3 className="laSummaryH3">{String(s.title || "").trim()}</h3>
                  </div>

                  <div className="laSummarySectionBody">
                    {(s.blocks || []).map((b, idx) => {
                      if (b.kind === "ul") {
                        return (
                          <ul key={idx} className="laSummaryUl">
                            {(b.items || []).map((it, i) => (
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
              ))}
            </div>
          )}
        </div>

        {/* Footer (small, optional hint) */}
        <div className="laSummaryFooter">
          <div className="laSummaryFooterHint">
            Tip: Click outside this box or press <strong>Esc</strong> to close.
          </div>
        </div>
      </div>
    </div>
  );
}

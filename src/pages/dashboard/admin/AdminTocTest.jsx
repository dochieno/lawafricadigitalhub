import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  adminGetDocumentToc,
  adminImportToc,
} from "../../../api/toc";

function prettyJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return "";
  }
}

export default function AdminTocTest() {
  const [sp, setSp] = useSearchParams();

  // Use query param: ?docId=123
  const docId = useMemo(() => {
    const raw = (sp.get("docId") || "").trim();
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [sp]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tree, setTree] = useState(null);

  // Upload modal (simple textarea)
  const [showUpload, setShowUpload] = useState(false);
  const [mode, setMode] = useState("replace"); // replace | append
  const [payloadText, setPayloadText] = useState("");

  async function load() {
    if (!docId) {
      setTree(null);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await adminGetDocumentToc(docId);
      // backend returns { items: [...] }
      setTree(res?.items ?? []);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to load ToC.");
      setTree(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  async function handleImport() {
    if (!docId) return;

    let parsed;
    try {
      parsed = JSON.parse(payloadText || "{}");
    } catch {
      setErr("Invalid JSON. Paste valid JSON payload.");
      return;
    }

    // Allow user to paste just "items": [...] too
    const finalPayload =
      parsed?.items && parsed?.mode
        ? parsed
        : {
            mode,
            items: Array.isArray(parsed) ? parsed : parsed?.items || [],
          };

    if (!finalPayload?.items?.length) {
      setErr("Import payload has no items.");
      return;
    }

    setLoading(true);
    setErr("");
    try {
      await adminImportToc(docId, finalPayload);
      setShowUpload(false);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Admin • ToC Test</h2>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, opacity: 0.75 }}>docId:</label>
          <input
            value={docId ?? ""}
            onChange={(e) => setSp({ docId: e.target.value })}
            placeholder="e.g. 123"
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(15,23,42,0.18)",
              minWidth: 140,
            }}
          />
        </div>

        <button
          type="button"
          onClick={load}
          disabled={!docId || loading}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(15,23,42,0.18)",
            background: "white",
            cursor: "pointer",
          }}
        >
          {loading ? "Loading..." : "Reload"}
        </button>

        <button
          type="button"
          onClick={() => setShowUpload(true)}
          disabled={!docId || loading}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(15,23,42,0.18)",
            background: "white",
            cursor: "pointer",
          }}
        >
          Upload ToC (JSON)
        </button>
      </div>

      {err && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(220,38,38,0.22)",
            background: "rgba(220,38,38,0.06)",
            color: "#991b1b",
          }}
        >
          {err}
        </div>
      )}

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div
          style={{
            border: "1px solid rgba(15,23,42,0.12)",
            borderRadius: 14,
            padding: 14,
            background: "white",
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>Tree (raw)</div>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {prettyJson(tree)}
          </pre>
        </div>

        <div
          style={{
            border: "1px solid rgba(15,23,42,0.12)",
            borderRadius: 14,
            padding: 14,
            background: "white",
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>Preview</div>
          {!tree?.length ? (
            <div style={{ opacity: 0.7 }}>No ToC entries yet.</div>
          ) : (
            <TocTreePreview items={tree} depth={0} />
          )}
        </div>
      </div>

      {showUpload && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 880 }}>
            <h3 style={{ marginTop: 0 }}>Upload ToC</h3>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <label style={{ fontSize: 13, opacity: 0.75 }}>Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.18)",
                  background: "white",
                }}
              >
                <option value="replace">replace</option>
                <option value="append">append</option>
              </select>

              <div style={{ fontSize: 13, opacity: 0.7 }}>
                Paste JSON: either full payload <code>{"{ mode, items }"}</code> or just <code>items</code>.
              </div>
            </div>

            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              placeholder='{"mode":"replace","items":[...]}'
              style={{
                width: "100%",
                minHeight: 320,
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.18)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.4,
              }}
            />

            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="modal-btn secondary" onClick={() => setShowUpload(false)}>
                Cancel
              </button>
              <button className="modal-btn" onClick={handleImport} disabled={loading}>
                {loading ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TocTreePreview({ items, depth }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map((x) => {
        const indent = depth * 14;
        const dest =
          x?.targetType === 2
            ? `#${x?.anchorId || ""}`
            : x?.endPage
            ? `p.${x.startPage}–${x.endPage}`
            : x?.startPage
            ? `p.${x.startPage}`
            : "";

        return (
          <div key={x.id}>
            <div
              style={{
                marginLeft: indent,
                display: "flex",
                gap: 10,
                alignItems: "baseline",
              }}
            >
              <div style={{ fontSize: 13 }}>{x.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{dest}</div>
              {x.pageLabel ? (
                <div style={{ fontSize: 12, opacity: 0.65 }}>({x.pageLabel})</div>
              ) : null}
            </div>

            {x.children?.length ? (
              <TocTreePreview items={x.children} depth={depth + 1} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

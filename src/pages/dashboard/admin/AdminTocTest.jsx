
import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  adminCreateTocEntry,
  adminDeleteTocEntry,
  adminGetDocumentToc,
  adminImportToc,
  adminUpdateTocEntry,
} from "../../../api/toc";

function prettyJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return "";
  }
}

function normTargetType(v) {
  // backend enum: PageRange=1, Anchor=2
  const n = Number(v);
  return n === 2 ? 2 : 1;
}

function normLevel(v) {
  // backend enum: Chapter=1, Section=2, Subsection=3
  const n = Number(v);
  if (n === 1 || n === 2 || n === 3) return n;
  return 2;
}

export default function AdminTocTest() {
  const [sp, setSp] = useSearchParams();

  const docId = useMemo(() => {
    const raw = (sp.get("docId") || "").trim();
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [sp]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [tree, setTree] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  // Expand/collapse state (ids)
  const [openIds, setOpenIds] = useState(() => new Set());

  // Upload modal (simple textarea)
  const [showUpload, setShowUpload] = useState(false);
  const [mode, setMode] = useState("replace"); // replace | append
  const [payloadText, setPayloadText] = useState("");

  // Add/Edit modal
  const [showEditor, setShowEditor] = useState(false);
  const [editorMode, setEditorMode] = useState("create"); // create | edit
  const [editorParentId, setEditorParentId] = useState(null);
  const [editorEntryId, setEditorEntryId] = useState(null);

  const [form, setForm] = useState({
    title: "",
    level: 2,
    targetType: 1,
    startPage: "",
    endPage: "",
    anchorId: "",
    pageLabel: "",
    notes: "",
  });

const findNodeById = useCallback((nodes, id) => {
  for (const n of nodes || []) {
    if (n.id === id) return n;
    const hit = findNodeById(n.children || [], id);
    if (hit) return hit;
  }
  return null;
}, []);


const selectedNode = useMemo(() => {
  if (!selectedId) return null;
  return findNodeById(tree, selectedId);
}, [tree, selectedId, findNodeById]);


  async function load() {
    if (!docId) {
      setTree([]);
      setSelectedId(null);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await adminGetDocumentToc(docId);
      const items = res?.items ?? [];
      setTree(items);

      // Auto-open roots for nicer UX
      const nextOpen = new Set(openIds);
      for (const r of items) nextOpen.add(r.id);
      setOpenIds(nextOpen);

      // Keep selection if possible
      if (selectedId) {
        const still = findNodeById(items, selectedId);
        if (!still) setSelectedId(null);
      }
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to load ToC.");
      setTree([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  function toggleOpen(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate({ parentId }) {
    setErr("");
    setEditorMode("create");
    setEditorParentId(parentId ?? null);
    setEditorEntryId(null);
    setForm({
      title: "",
      level: parentId ? 2 : 1, // default: root=Chapter, child=Section
      targetType: 1,
      startPage: "",
      endPage: "",
      anchorId: "",
      pageLabel: "",
      notes: "",
    });
    setShowEditor(true);
  }

  function openEdit(node) {
    if (!node) return;
    setErr("");
    setEditorMode("edit");
    setEditorParentId(node.parentId ?? null);
    setEditorEntryId(node.id);

    setForm({
      title: node.title || "",
      level: normLevel(node.level),
      targetType: normTargetType(node.targetType),
      startPage: node.startPage ?? "",
      endPage: node.endPage ?? "",
      anchorId: node.anchorId ?? "",
      pageLabel: node.pageLabel ?? "",
      notes: node.notes ?? "",
    });

    setShowEditor(true);
  }

  async function saveEditor() {
    if (!docId) return;

    const payload = {
      title: String(form.title || "").trim(),
      level: normLevel(form.level),
      targetType: normTargetType(form.targetType),
      startPage:
        form.startPage === "" || form.startPage === null ? null : Number(form.startPage),
      endPage: form.endPage === "" || form.endPage === null ? null : Number(form.endPage),
      anchorId: String(form.anchorId || "").trim() || null,
      pageLabel: String(form.pageLabel || "").trim() || null,
      notes: String(form.notes || "").trim() || null,
    };

    if (!payload.title) {
      setErr("Title is required.");
      return;
    }

    // Basic client-side checks (server also validates)
    if (payload.targetType === 1) {
      if (!payload.startPage || payload.startPage <= 0) {
        setErr("StartPage is required and must be > 0 for PageRange.");
        return;
      }
      if (payload.endPage && payload.endPage < payload.startPage) {
        setErr("EndPage cannot be less than StartPage.");
        return;
      }
    } else {
      if (!payload.anchorId) {
        setErr("AnchorId is required for Anchor target type.");
        return;
      }
      // Clear pages if anchor
      payload.startPage = null;
      payload.endPage = null;
    }

    setLoading(true);
    setErr("");
    try {
      if (editorMode === "create") {
        const createPayload = {
          ...payload,
          parentId: editorParentId,
        };
        await adminCreateTocEntry(docId, createPayload);
      } else {
        await adminUpdateTocEntry(docId, editorEntryId, payload);
      }

      setShowEditor(false);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!docId || !selectedNode) return;
    const ok = window.confirm(`Delete "${selectedNode.title}"?\n\n(Children must be deleted first.)`);
    if (!ok) return;

    setLoading(true);
    setErr("");
    try {
      await adminDeleteTocEntry(docId, selectedNode.id);
      setSelectedId(null);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Delete failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!docId) return;

    let parsed;
    try {
      parsed = JSON.parse(payloadText || "{}");
    } catch {
      setErr("Invalid JSON. Paste valid JSON payload.");
      return;
    }

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
      setPayloadText("");
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  const canEdit = Boolean(selectedNode);
  const canAddChild = Boolean(selectedNode);
  const canDelete = Boolean(selectedNode);

  return (
    <div style={{ padding: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Admin • ToC Editor (Test)</h2>

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
          style={btnStyle("ghost")}
        >
          {loading ? "Loading..." : "Reload"}
        </button>

        <button
          type="button"
          onClick={() => openCreate({ parentId: null })}
          disabled={!docId || loading}
          style={btnStyle("primary")}
        >
          + Add Root
        </button>

        <button
          type="button"
          onClick={() => setShowUpload(true)}
          disabled={!docId || loading}
          style={btnStyle("ghost")}
        >
          Upload ToC (JSON)
        </button>
      </div>

      {err && (
        <div style={alertStyle}>
          {err}
        </div>
      )}

      {/* Body */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "420px 1fr", gap: 14 }}>
        {/* Left: Tree */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>ToC Tree</div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                Click item to select • Use chevron to expand/collapse
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => openCreate({ parentId: selectedNode?.id ?? null })}
                disabled={!docId || loading || !canAddChild}
                style={btnStyle("ghostSmall")}
                title="Add child under selected"
              >
                + Child
              </button>
              <button
                type="button"
                onClick={() => openEdit(selectedNode)}
                disabled={!docId || loading || !canEdit}
                style={btnStyle("ghostSmall")}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!docId || loading || !canDelete}
                style={btnStyle("dangerSmall")}
              >
                Delete
              </button>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            {!docId ? (
              <div style={{ opacity: 0.7 }}>Enter docId to load ToC.</div>
            ) : !tree?.length ? (
              <div style={{ opacity: 0.7 }}>No ToC entries yet.</div>
            ) : (
              <TocTree
                items={tree}
                depth={0}
                openIds={openIds}
                onToggleOpen={toggleOpen}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </div>
        </div>

        {/* Right: Details + raw json */}
        <div style={{ display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>Selected</div>

            {!selectedNode ? (
              <div style={{ opacity: 0.7 }}>Select an item from the tree.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 16 }}>{selectedNode.title}</div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, opacity: 0.8 }}>
                  <Chip label={`Level: ${levelLabel(selectedNode.level)}`} />
                  <Chip label={`Target: ${targetLabel(selectedNode.targetType)}`} />
                  {selectedNode.targetType === 2 ? (
                    <Chip label={`Anchor: ${selectedNode.anchorId || "-"}`} />
                  ) : (
                    <Chip
                      label={`Pages: ${selectedNode.startPage || "-"}${selectedNode.endPage ? `–${selectedNode.endPage}` : ""}`}
                    />
                  )}
                  {selectedNode.pageLabel ? <Chip label={`Label: ${selectedNode.pageLabel}`} /> : null}
                </div>

                {selectedNode.notes ? (
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 4 }}>Notes (admin-only)</div>
                    <div>{selectedNode.notes}</div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>Tree (raw JSON)</div>
            <pre style={preStyle}>{prettyJson(tree)}</pre>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 900 }}>
            <h3 style={{ marginTop: 0 }}>Upload ToC</h3>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <label style={{ fontSize: 13, opacity: 0.75 }}>Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={inputStyle}
              >
                <option value="replace">replace</option>
                <option value="append">append</option>
              </select>

              <div style={{ fontSize: 13, opacity: 0.7 }}>
                Paste JSON: either full payload <code>{"{ mode, items }"}</code> or <code>[...]</code>.
              </div>
            </div>

            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              placeholder='{"mode":"replace","items":[...]}'
              style={textareaStyle}
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

      {/* Add/Edit Modal */}
      {showEditor && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 760 }}>
            <h3 style={{ marginTop: 0 }}>
              {editorMode === "create" ? "Add ToC Entry" : "Edit ToC Entry"}
            </h3>

            <div style={{ display: "grid", gap: 10 }}>
              <Field label="Title *">
                <input
                  value={form.title}
                  onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                  style={inputStyleWide}
                  placeholder="e.g. Chapter One: Marriage Rites"
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Level">
                  <select
                    value={form.level}
                    onChange={(e) => setForm((s) => ({ ...s, level: Number(e.target.value) }))}
                    style={inputStyleWide}
                  >
                    <option value={1}>Chapter</option>
                    <option value={2}>Section</option>
                    <option value={3}>Subsection</option>
                  </select>
                </Field>

                <Field label="Target Type">
                  <select
                    value={form.targetType}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, targetType: Number(e.target.value) }))
                    }
                    style={inputStyleWide}
                  >
                    <option value={1}>Page Range</option>
                    <option value={2}>Anchor</option>
                  </select>
                </Field>
              </div>

              {normTargetType(form.targetType) === 1 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Start Page *">
                    <input
                      value={form.startPage}
                      onChange={(e) => setForm((s) => ({ ...s, startPage: e.target.value }))}
                      style={inputStyleWide}
                      placeholder="e.g. 1"
                    />
                  </Field>
                  <Field label="End Page (optional)">
                    <input
                      value={form.endPage}
                      onChange={(e) => setForm((s) => ({ ...s, endPage: e.target.value }))}
                      style={inputStyleWide}
                      placeholder="e.g. 74"
                    />
                  </Field>
                </div>
              ) : (
                <Field label="AnchorId *">
                  <input
                    value={form.anchorId}
                    onChange={(e) => setForm((s) => ({ ...s, anchorId: e.target.value }))}
                    style={inputStyleWide}
                    placeholder="e.g. blk_123 or heading_1"
                  />
                </Field>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Page Label (optional)">
                  <input
                    value={form.pageLabel}
                    onChange={(e) => setForm((s) => ({ ...s, pageLabel: e.target.value }))}
                    style={inputStyleWide}
                    placeholder='e.g. "ix", "xi", "497"'
                  />
                </Field>

                <Field label="Notes (admin-only)">
                  <input
                    value={form.notes}
                    onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                    style={inputStyleWide}
                    placeholder="optional notes"
                  />
                </Field>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="modal-btn secondary" onClick={() => setShowEditor(false)}>
                Cancel
              </button>
              <button className="modal-btn" onClick={saveEditor} disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- UI helpers ---------------- */

function TocTree({ items, depth, openIds, onToggleOpen, selectedId, onSelect }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map((x) => {
        const hasChildren = (x.children || []).length > 0;
        const isOpen = openIds.has(x.id);
        const isSelected = selectedId === x.id;

        const dest =
          x.targetType === 2
            ? `#${x.anchorId || ""}`
            : x.endPage
            ? `p.${x.startPage}–${x.endPage}`
            : x.startPage
            ? `p.${x.startPage}`
            : "";

        return (
          <div key={x.id}>
            <div
              onClick={() => onSelect(x.id)}
              style={{
                cursor: "pointer",
                borderRadius: 12,
                padding: "8px 10px",
                border: isSelected ? "1px solid rgba(139,28,28,0.35)" : "1px solid rgba(15,23,42,0.10)",
                background: isSelected ? "rgba(139,28,28,0.06)" : "white",
                marginLeft: depth * 14,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleOpen(x.id);
                  }}
                  title={isOpen ? "Collapse" : "Expand"}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 10,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  {isOpen ? "▾" : "▸"}
                </button>
              ) : (
                <div style={{ width: 26 }} />
              )}

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {x.title}
                </div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>
                  {levelLabel(x.level)} • {targetLabel(x.targetType)} {dest ? `• ${dest}` : ""}
                  {x.pageLabel ? ` • (${x.pageLabel})` : ""}
                </div>
              </div>
            </div>

            {hasChildren && isOpen ? (
              <TocTree
                items={x.children}
                depth={depth + 1}
                openIds={openIds}
                onToggleOpen={onToggleOpen}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Chip({ label }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(15,23,42,0.12)",
        background: "rgba(255,255,255,0.7)",
      }}
    >
      {label}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
      {children}
    </label>
  );
}

function levelLabel(v) {
  const n = Number(v);
  if (n === 1) return "Chapter";
  if (n === 3) return "Subsection";
  return "Section";
}

function targetLabel(v) {
  const n = Number(v);
  return n === 2 ? "Anchor" : "PageRange";
}

const cardStyle = {
  border: "1px solid rgba(15,23,42,0.12)",
  borderRadius: 14,
  padding: 14,
  background: "white",
};

const alertStyle = {
  marginTop: 12,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(220,38,38,0.22)",
  background: "rgba(220,38,38,0.06)",
  color: "#991b1b",
};

const preStyle = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 12,
  lineHeight: 1.4,
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(15,23,42,0.18)",
  background: "white",
};

const inputStyleWide = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.18)",
  background: "white",
};

const textareaStyle = {
  width: "100%",
  minHeight: 320,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.18)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.4,
};

function btnStyle(kind) {
  const base = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.18)",
    background: "white",
    cursor: "pointer",
  };

  const small = {
    padding: "7px 10px",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.18)",
    background: "white",
    cursor: "pointer",
    fontSize: 12,
  };

  if (kind === "primary") {
    return {
      ...base,
      border: "1px solid rgba(139,28,28,0.35)",
      background: "rgba(139,28,28,0.08)",
    };
  }

  if (kind === "ghost") return base;

  if (kind === "ghostSmall") return small;

  if (kind === "dangerSmall") {
    return {
      ...small,
      border: "1px solid rgba(220,38,38,0.25)",
      background: "rgba(220,38,38,0.06)",
      color: "#991b1b",
    };
  }

  return base;
}

// src/pages/dashboard/admin/AdminTocEditor.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import api from "../../../api/client";
import "../../../styles/adminTocEditor.css";

function assertDocId(docId) {
  const did = Number(docId);
  return Number.isFinite(did) && did > 0 ? did : 0;
}

function adminTocBase(docId) {
  const did = assertDocId(docId);
  return `/admin/legal-documents/${did}/toc`;
}

/** =========================================================
 *  ✅ Step 4 API assumptions (change here ONLY if needed)
 * ========================================================= */
async function adminCreateTocItem(docId, payload) {
  const did = assertDocId(docId);
  const res = await api.post(adminTocBase(did), payload);
  return res.data; // expected: created item DTO
}

async function adminUpdateTocItem(docId, tocItemId, payload) {
  const did = assertDocId(docId);
  const res = await api.put(`${adminTocBase(did)}/${tocItemId}`, payload);
  return res.data; // expected: updated item DTO
}

async function adminDeleteTocItem(docId, tocItemId) {
  const did = assertDocId(docId);
  const res = await api.delete(`${adminTocBase(did)}/${tocItemId}`);
  return res.data;
}

async function adminReorderToc(docId, payload) {
  const did = assertDocId(docId);
  const res = await api.post(`${adminTocBase(did)}/reorder`, payload);
  return res.data;
}

/** Existing endpoints */
async function adminGetDocsForDropdown() {
  const res = await api.get(`/legal-documents/admin`);
  return res.data ?? [];
}

async function publicGetDocById(id) {
  const res = await api.get(`/legal-documents/${id}`);
  return res.data ?? null;
}

async function adminGetTocTree(docId) {
  const did = assertDocId(docId);
  const res = await api.get(adminTocBase(did));
  return res.data?.items ?? [];
}

async function adminImportToc(docId, payload) {
  const did = assertDocId(docId);
  const res = await api.post(`${adminTocBase(did)}/import`, payload);
  return res.data;
}

/* =========================================================
   Helpers
========================================================= */
function toInt(v, fallback = null) {
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function norm(s) {
  return String(s ?? "").trim();
}

function csvKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]+/g, "");
}

function uuid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function parentKeyFromOutlineKey(k) {
  const s = norm(k);
  if (!s) return "";
  const parts = s.split(".").map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join(".");
}

function levelFromDepth(depth) {
  if (depth <= 1) return 1;
  if (depth === 2) return 2;
  return 3;
}

function inferLevelFromKey(k) {
  const depth = norm(k).split(".").filter(Boolean).length;
  return levelFromDepth(depth);
}

function targetTypeFromValues({ anchorId, startPage, endPage }) {
  if (norm(anchorId)) return 2; // Anchor
  if (Number.isFinite(Number(startPage)) || Number.isFinite(Number(endPage))) return 1; // PageRange
  return 1;
}

function parseLevelCell(v, fallbackLevel = 2) {
  const s = norm(v);
  if (!s) return fallbackLevel;

  const n = Number(s);
  if (Number.isFinite(n)) {
    const i = Math.trunc(n);
    if (i === 1 || i === 2 || i === 3) return i;
  }

  const t = s.toLowerCase();
  if (t === "chapter") return 1;
  if (t === "section") return 2;
  if (t === "subsection" || t === "sub-section" || t === "sub section") return 3;

  return fallbackLevel;
}

function parseTargetTypeCell(v, fallbackType = 1) {
  const s = norm(v);
  if (!s) return fallbackType;

  const n = Number(s);
  if (Number.isFinite(n)) {
    const i = Math.trunc(n);
    if (i === 1 || i === 2) return i;
  }

  const t = s.toLowerCase();
  if (t.includes("anchor")) return 2;
  if (t.includes("page")) return 1;

  return fallbackType;
}

function parseTocCsvToImportItems(csvText) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: false });
  if (parsed.errors?.length) {
    throw new Error(parsed.errors[0]?.message || "CSV parse error");
  }

  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  if (!rows.length) return { items: [], issues: ["No rows found in CSV."] };

  const keyToClientId = new Map();
  const issues = [];

  const temp = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] || {};
    const m = {};
    for (const [k, v] of Object.entries(raw)) m[csvKey(k)] = v;

    const outlineKey = norm(m["key"] || m["number"] || "");
    const title = norm(m["title"] || m["name"] || "");

    if (!title) {
      issues.push(`Row ${i + 2}: Missing Title.`);
      continue;
    }

    const clientId = uuid();
    if (outlineKey) keyToClientId.set(outlineKey, clientId);

    temp.push({ __row: i + 2, __outlineKey: outlineKey, __clientId: clientId, __map: m });
  }

  const payloadItems = temp.map((r, idx) => {
    const m = r.__map;

    const outlineKey = r.__outlineKey;
    const parentOutlineKey = parentKeyFromOutlineKey(outlineKey);
    const parentClientId = parentOutlineKey ? keyToClientId.get(parentOutlineKey) || null : null;

    const title = norm(m["title"] || m["name"] || "");
    const notes = norm(m["notes"] || "");
    const pageLabel = norm(m["pagelabel"] || "");

    const startPage = toInt(m["startpage"], null);
    const endPage = toInt(m["endpage"], null);
    const anchorId = norm(m["anchorid"] || "");

    const inferredLevel = outlineKey ? inferLevelFromKey(outlineKey) : 2;
    const level = parseLevelCell(m["level"], inferredLevel);

    const inferredTargetType = targetTypeFromValues({ anchorId, startPage, endPage });
    const targetType = parseTargetTypeCell(m["targettype"], inferredTargetType);

    const order = toInt(m["order"], null);
    const orderFinal = Number.isFinite(order) ? order : idx;

    return {
      clientId: r.__clientId,
      parentClientId: parentClientId || null,
      title,
      level,
      order: orderFinal,
      targetType,
      startPage,
      endPage,
      anchorId: anchorId || null,
      pageLabel: pageLabel || null,
      notes: notes || null,
    };
  });

  return { items: payloadItems, issues };
}

/* =========================================================
   Template download
========================================================= */
function buildTemplateCsvText() {
  const rows = [
    {
      Key: "FrontMatter",
      Title: "Front Matter",
      StartPage: "",
      EndPage: "",
      PageLabel: "",
      AnchorId: "",
      Notes: "",
      Level: "chapter",
      TargetType: "page",
      Order: 0,
    },
    {
      Key: "FrontMatter.Dedication",
      Title: "Dedication",
      StartPage: "",
      EndPage: "",
      PageLabel: "ix",
      AnchorId: "",
      Notes: "",
      Level: "section",
      TargetType: "page",
      Order: 1,
    },
    {
      Key: "1",
      Title: "Chapter One",
      StartPage: 1,
      EndPage: "",
      PageLabel: "1",
      AnchorId: "",
      Notes: "",
      Level: "chapter",
      TargetType: "page",
      Order: 10,
    },
    {
      Key: "1.1",
      Title: "Section 1.1",
      StartPage: 1,
      EndPage: "",
      PageLabel: "1",
      AnchorId: "",
      Notes: "",
      Level: "section",
      TargetType: "page",
      Order: 11,
    },
  ];

  return Papa.unparse(rows, { quotes: false, newline: "\n" });
}

function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================================================
   Tree utilities (edit / reorder)
========================================================= */
function getId(n) {
  return n?.id ?? n?.Id ?? n?.clientId ?? null;
}
function getChildren(n) {
  const c = n?.children ?? n?.Children;
  return Array.isArray(c) ? c : [];
}
function setChildren(n, children) {
  if ("Children" in n) return { ...n, Children: children };
  return { ...n, children };
}

function updateNodeInTree(nodes, targetId, updater) {
  const arr = Array.isArray(nodes) ? nodes : [];
  return arr.map((n) => {
    const id = getId(n);
    if (String(id) === String(targetId)) return updater(n);
    const kids = getChildren(n);
    if (!kids.length) return n;
    return setChildren(n, updateNodeInTree(kids, targetId, updater));
  });
}

function removeNodeFromTree(nodes, targetId) {
  const arr = Array.isArray(nodes) ? nodes : [];
  const out = [];
  for (const n of arr) {
    const id = getId(n);
    if (String(id) === String(targetId)) continue;
    const kids = getChildren(n);
    out.push(kids.length ? setChildren(n, removeNodeFromTree(kids, targetId)) : n);
  }
  return out;
}

function insertChild(nodes, parentId, childNode) {
  const arr = Array.isArray(nodes) ? nodes : [];
  if (!parentId) return [...arr, childNode];

  return arr.map((n) => {
    const id = getId(n);
    if (String(id) === String(parentId)) {
      const kids = getChildren(n);
      return setChildren(n, [...kids, childNode]);
    }
    const kids = getChildren(n);
    if (!kids.length) return n;
    return setChildren(n, insertChild(kids, parentId, childNode));
  });
}

function flattenForReorder(nodes, parentId = null, acc = []) {
  const arr = Array.isArray(nodes) ? nodes : [];
  for (let i = 0; i < arr.length; i++) {
    const n = arr[i];
    const id = getId(n);
    if (id != null && !String(id).startsWith("tmp_")) {
      acc.push({ id: Number(id), parentId: parentId ? Number(parentId) : null, order: i });
    }
    const kids = getChildren(n);
    if (kids.length) flattenForReorder(kids, id, acc);
  }
  return acc;
}

function reorderSiblings(nodes, parentId, fromIndex, toIndex) {
  const arr = Array.isArray(nodes) ? nodes : [];

  // root reorder
  if (!parentId) {
    const copy = [...arr];
    const [moved] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, moved);
    return copy;
  }

  return arr.map((n) => {
    const id = getId(n);
    if (String(id) === String(parentId)) {
      const kids = [...getChildren(n)];
      const [moved] = kids.splice(fromIndex, 1);
      kids.splice(toIndex, 0, moved);
      return setChildren(n, kids);
    }
    const kids = getChildren(n);
    if (!kids.length) return n;
    return setChildren(n, reorderSiblings(kids, parentId, fromIndex, toIndex));
  });
}

/* =========================================================
   Page
========================================================= */
export default function AdminTocEditor() {
  const [docs, setDocs] = useState([]);
  const [docId, setDocId] = useState("");
  const [selectedKind, setSelectedKind] = useState(null);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [loadingToc, setLoadingToc] = useState(false);
  const [tree, setTree] = useState([]);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [importMode, setImportMode] = useState("replace");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvPreviewItems, setCsvPreviewItems] = useState([]);
  const [csvPreviewIssues, setCsvPreviewIssues] = useState([]);
  const fileInputRef = useRef(null);

  // Editor state
  const [expanded, setExpanded] = useState(() => new Set());
  const [drafts, setDrafts] = useState(() => new Map()); // id -> draft
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // reorder state
  const [orderDirty, setOrderDirty] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // drag state
  const dragRef = useRef(null); // { parentId, index, id }

  const docOptions = useMemo(() => {
    return (docs || []).map((d) => ({
      id: d.id ?? d.Id,
      title: d.title ?? d.Title,
      status: d.status ?? d.Status,
      pageCount: d.pageCount ?? d.PageCount,
      kind: d.kind ?? d.Kind,
    }));
  }, [docs]);

  const loadDocs = useCallback(async () => {
    setError("");
    setInfo("");
    setLoadingDocs(true);
    try {
      const list = await adminGetDocsForDropdown();
      const arr = Array.isArray(list) ? list : [];
      setDocs(arr);
      if (!arr.length) setInfo("No documents returned from /api/legal-documents/admin.");
    } catch (e) {
      setError(e?.response?.data?.message || String(e?.message || e));
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const loadToc = useCallback(async (id) => {
    const did = assertDocId(id);
    if (!did) {
      setTree([]);
      setSelectedKind(null);
      setDrafts(new Map());
      setExpanded(new Set());
      setOrderDirty(false);
      return;
    }

    setError("");
    setInfo("");
    setLoadingToc(true);

    try {
      const doc = await publicGetDocById(did);
      const kind = doc?.kind ?? doc?.Kind ?? null;
      setSelectedKind(kind);

      if (kind === 2) {
        setTree([]);
        setInfo("This document is Kind=Report. ToC editor is for Standard documents only.");
        return;
      }

      const t = await adminGetTocTree(did);
      const arr = Array.isArray(t) ? t : [];
      setTree(arr);
      setDrafts(new Map());
      setOrderDirty(false);

      // expand first level by default
      const next = new Set();
      for (const n of arr) {
        const nid = getId(n);
        if (nid != null) next.add(String(nid));
      }
      setExpanded(next);

      if (!arr.length) setInfo("No ToC entries yet.");
    } catch (e) {
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.message;

      if (status === 405) {
        setError(
          `405 (Method Not Allowed). Confirm ToC calls use: GET ${adminTocBase(did)} and POST ${adminTocBase(did)}/import.`
        );
      } else {
        setError(serverMsg || e?.message || "Failed to load ToC.");
      }
    } finally {
      setLoadingToc(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    if (docId) loadToc(docId);
    else {
      setTree([]);
      setSelectedKind(null);
      setDrafts(new Map());
      setExpanded(new Set());
      setOrderDirty(false);
    }
  }, [docId, loadToc]);

  async function onReload() {
    await loadToc(docId);
  }

  function resetCsvPreview() {
    setCsvFileName("");
    setCsvPreviewItems([]);
    setCsvPreviewIssues([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCsvFile(file) {
    setError("");
    setInfo("");
    resetCsvPreview();

    try {
      const text = await file.text();
      const out = parseTocCsvToImportItems(text);
      setCsvFileName(file.name || "toc.csv");
      setCsvPreviewItems(out.items || []);
      setCsvPreviewIssues(out.issues || []);
      setInfo(`CSV loaded: ${out.items?.length || 0} row(s) ready for import preview.`);
    } catch (e) {
      setError(String(e?.message || e));
    }
  }

  async function confirmImportCsv() {
    const did = assertDocId(docId);
    if (!did) return setError("Pick a document first.");
    if (selectedKind === 2) return setError("This is Kind=Report. Import is disabled for Report.");
    if (!csvPreviewItems.length) return setError("No CSV items loaded.");

    const ok = window.confirm(`Import ${csvPreviewItems.length} item(s) to document #${did} using "${importMode}"?`);
    if (!ok) return;

    setError("");
    setInfo("");

    try {
      await adminImportToc(did, { mode: importMode, items: csvPreviewItems });
      setShowUpload(false);
      resetCsvPreview();
      await loadToc(did);
      setInfo("✅ Imported ToC successfully.");
    } catch (e) {
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.message;

      if (status === 405) {
        setError(
          `405 during import. Ensure you're posting to: ${adminTocBase(did)}/import (admin controller).`
        );
      } else {
        setError(serverMsg || String(e?.message || e));
      }
    }
  }

  function onDownloadTemplate() {
    const csv = buildTemplateCsvText();
    downloadTextFile("toc-template.csv", csv);
    setInfo("✅ Template downloaded. Fill it, then Upload ToC (CSV).");
    setError("");
  }

  // -------------------------
  // Inline editor helpers
  // -------------------------
  function toggleExpand(idStr) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idStr)) next.delete(idStr);
      else next.add(idStr);
      return next;
    });
  }

  function getDraftForNode(n) {
    const id = String(getId(n));
    const d = drafts.get(id);
    if (d) return d;

    return {
      title: n.title ?? n.Title ?? "",
      startPage: n.startPage ?? n.StartPage ?? "",
      endPage: n.endPage ?? n.EndPage ?? "",
      pageLabel: n.pageLabel ?? n.PageLabel ?? "",
      anchorId: n.anchorId ?? n.AnchorId ?? "",
      notes: n.notes ?? n.Notes ?? "",
      level: n.level ?? n.Level ?? 2,
      targetType: n.targetType ?? n.TargetType ?? 1,
    };
  }

  function setDraftField(id, field, value) {
    setDrafts((prev) => {
      const next = new Map(prev);
      const d = next.get(String(id)) || {};
      next.set(String(id), { ...d, [field]: value });
      return next;
    });
  }

  function discardDraft(id) {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.delete(String(id));
      return next;
    });
  }

  async function saveNodeEdits(nodeId) {
    const did = assertDocId(docId);
    if (!did) return;

    const idStr = String(nodeId);
    const d = drafts.get(idStr);
    if (!d) return;

    const payload = {
      title: norm(d.title),
      startPage: toInt(d.startPage, null),
      endPage: toInt(d.endPage, null),
      pageLabel: norm(d.pageLabel) || null,
      anchorId: norm(d.anchorId) || null,
      notes: norm(d.notes) || null,
      level: toInt(d.level, 2),
      targetType: toInt(d.targetType, 1),
    };

    if (!payload.title) {
      setError("Title is required.");
      return;
    }

    setSavingId(idStr);
    setError("");
    setInfo("");

    try {
      const updated = await adminUpdateTocItem(did, nodeId, payload);

      setTree((prev) =>
        updateNodeInTree(prev, nodeId, (n) => {
          // preserve children
          const kids = getChildren(n);
          const merged = { ...n, ...updated };
          return setChildren(merged, kids);
        })
      );

      discardDraft(idStr);
      setInfo("✅ Saved.");
    } catch (e) {
      setError(e?.response?.data?.message || String(e?.message || e));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteNode(nodeId) {
    const did = assertDocId(docId);
    if (!did) return;

    const ok = window.confirm("Delete this ToC item? Its children (if any) may also be removed.");
    if (!ok) return;

    setDeletingId(String(nodeId));
    setError("");
    setInfo("");

    try {
      await adminDeleteTocItem(did, nodeId);
      setTree((prev) => removeNodeFromTree(prev, nodeId));
      discardDraft(String(nodeId));
      setInfo("✅ Deleted.");
    } catch (e) {
      setError(e?.response?.data?.message || String(e?.message || e));
    } finally {
      setDeletingId(null);
    }
  }

  function addTempNode(parentId = null) {
    const tmpId = `tmp_${uuid()}`;
    const tmp = {
      id: tmpId,
      title: "",
      level: parentId ? 2 : 1,
      targetType: 1,
      startPage: null,
      endPage: null,
      pageLabel: null,
      anchorId: null,
      notes: null,
      children: [],
      __isNew: true,
    };

    setTree((prev) => insertChild(prev, parentId, tmp));
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(tmpId, {
        title: "",
        startPage: "",
        endPage: "",
        pageLabel: "",
        anchorId: "",
        notes: "",
        level: parentId ? 2 : 1,
        targetType: 1,
      });
      return next;
    });

    if (parentId) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(String(parentId));
        return next;
      });
    }
  }

  async function createFromTemp(tmpId, parentId) {
    const did = assertDocId(docId);
    if (!did) return;

    const d = drafts.get(String(tmpId));
    if (!d) return;

    const payload = {
      parentId: parentId ? Number(parentId) : null,
      title: norm(d.title),
      startPage: toInt(d.startPage, null),
      endPage: toInt(d.endPage, null),
      pageLabel: norm(d.pageLabel) || null,
      anchorId: norm(d.anchorId) || null,
      notes: norm(d.notes) || null,
      level: toInt(d.level, parentId ? 2 : 1),
      targetType: toInt(d.targetType, 1),
    };

    if (!payload.title) {
      setError("Title is required.");
      return;
    }

    setSavingId(String(tmpId));
    setError("");
    setInfo("");

    try {
      const created = await adminCreateTocItem(did, payload);

      // Replace temp node with created node (preserve its children array)
      setTree((prev) =>
        updateNodeInTree(prev, tmpId, (n) => {
          const kids = getChildren(n);
          const merged = { ...n, ...created, __isNew: false };
          return setChildren(merged, kids);
        })
      );

      // move draft to new server id
      const newId = String(getId(created));
      setDrafts((prev) => {
        const next = new Map(prev);
        const oldDraft = next.get(String(tmpId));
        next.delete(String(tmpId));
        if (oldDraft && newId) next.set(newId, oldDraft);
        return next;
      });

      setInfo("✅ Created.");
    } catch (e) {
      setError(e?.response?.data?.message || String(e?.message || e));
    } finally {
      setSavingId(null);
    }
  }

  function cancelTemp(tmpId) {
    setTree((prev) => removeNodeFromTree(prev, tmpId));
    discardDraft(String(tmpId));
  }

  // -------------------------
  // Drag-drop reorder
  // -------------------------
  function onDragStart(parentId, index, id) {
    dragRef.current = { parentId: parentId ? String(parentId) : null, index, id: String(id) };
  }

  function onDrop(parentId, toIndex) {
    const src = dragRef.current;
    dragRef.current = null;
    if (!src) return;

    const sameParent = (src.parentId || null) === (parentId ? String(parentId) : null);
    if (!sameParent) {
      setError("Reorder only supports moving within the same parent (for now).");
      return;
    }
    if (src.index === toIndex) return;

    setTree((prev) => reorderSiblings(prev, parentId ? String(parentId) : null, src.index, toIndex));
    setOrderDirty(true);
    setInfo("Order changed — click “Save order”.");
    setError("");
  }

  async function saveOrder() {
    const did = assertDocId(docId);
    if (!did) return;
    if (!orderDirty) return;

    setSavingOrder(true);
    setError("");
    setInfo("");

    try {
      const flat = flattenForReorder(tree);
      await adminReorderToc(did, { items: flat });
      setOrderDirty(false);
      setInfo("✅ Order saved.");
    } catch (e) {
      setError(e?.response?.data?.message || String(e?.message || e));
    } finally {
      setSavingOrder(false);
    }
  }

  const computedTreeFromPreview = useMemo(() => buildTreeFromImportItems(csvPreviewItems), [csvPreviewItems]);

  return (
    <div className="laTocPage">
      <div className="laTocTop">
        <div>
          <h1 className="laTocH1">Admin · ToC Editor</h1>
          <div className="laTocSub">
            Uses <b>GET /api/admin/legal-documents/:id/toc</b> and{" "}
            <b>POST /api/admin/legal-documents/:id/toc/import</b>.
          </div>
        </div>

        <div className="laTocActions">
          <button className="laBtn" type="button" onClick={onDownloadTemplate} title="Download the CSV template">
            Download Template
          </button>

          <button className="laBtn" type="button" onClick={loadDocs} disabled={loadingDocs}>
            {loadingDocs ? "Loading…" : "Reload Docs"}
          </button>

          <button className="laBtn" type="button" onClick={onReload} disabled={!docId || loadingToc}>
            {loadingToc ? "Loading…" : "Reload ToC"}
          </button>

          <button
            className="laBtnPrimary"
            type="button"
            onClick={() => setShowUpload(true)}
            disabled={!docId || selectedKind === 2}
            title={!docId ? "Pick a document first" : selectedKind === 2 ? "Report docs not supported" : "Upload CSV"}
          >
            Upload ToC (CSV)
          </button>
        </div>
      </div>

      {(error || info) && <div className={`laTocAlert ${error ? "err" : "ok"}`}>{error || info}</div>}

      <div className="laTocCard">
        <div className="laTocRow">
          <label className="laTocLabel">Legal Document</label>

          <select className="laTocSelect" value={docId} onChange={(e) => setDocId(e.target.value)}>
            <option value="">— Select a document —</option>
            {docOptions.map((d) => (
              <option key={d.id} value={d.id}>
                #{d.id} · {d.title}
                {d.pageCount ? ` · ${d.pageCount}p` : ""}
                {d.status ? ` · ${d.status}` : ""}
              </option>
            ))}
          </select>

          <div className="laTocHint">
            Kind: <b>{selectedKind === 1 ? "Standard" : selectedKind === 2 ? "Report" : "—"}</b> (Report is blocked in
            this editor)
          </div>
        </div>

        {/* Instructions block */}
        <div className="laTocHelp">
          <div className="laTocHelpTitle">How to upload a ToC CSV</div>
          <ol className="laTocHelpList">
            <li>
              Click <b>Download Template</b> and open it in Excel/Google Sheets.
            </li>
            <li>
              Fill rows using:
              <ul className="laTocHelpBullets">
                <li>
                  <b>Key</b> = outline id (e.g., <code>1</code>, <code>1.1</code>, <code>FrontMatter.Preface</code>).
                </li>
                <li>
                  <b>Title</b> = heading text shown in the reader.
                </li>
                <li>
                  <b>StartPage</b>/<b>EndPage</b> = PDF page number (1-based) for the jump target.
                </li>
                <li>
                  <b>PageLabel</b> = printed label shown (e.g., <code>ix</code>, <code>xi</code>, <code>1</code>).
                </li>
                <li>
                  <b>Level</b> = <code>chapter</code> | <code>section</code> | <code>subsection</code> (or 1/2/3).
                </li>
                <li>
                  <b>TargetType</b> = <code>page</code> or <code>anchor</code> (or 1/2).
                </li>
                <li>
                  <b>Order</b> = optional; controls sorting within the same parent.
                </li>
              </ul>
            </li>
            <li>
              Save as <b>CSV</b> (not XLSX), then click <b>Upload ToC (CSV)</b>.
            </li>
            <li>
              Check the <b>Preview</b> in the modal before clicking <b>Import</b>.
            </li>
          </ol>
          <div className="laTocHelpNote">
            Tip: Use <b>PageLabel</b> for roman numerals (i, ii, iii…) and use <b>StartPage</b> for the actual PDF page
            number to jump to.
          </div>
        </div>

        <div className="laTocGrid">
          {/* Left: Manual Editor */}
          <div className="laTocPane">
            <div className="laTocPaneTitleRow">
              <div className="laTocPaneTitle">Manual Editor</div>

              <div className="laTocPaneActions">
                <button className="laBtn" type="button" onClick={() => addTempNode(null)} disabled={!docId || loadingToc}>
                  + Add root
                </button>

                <button
                  className="laBtnPrimary"
                  type="button"
                  onClick={saveOrder}
                  disabled={!docId || !orderDirty || savingOrder}
                  title={!orderDirty ? "No changes" : "Persist order via /toc/reorder"}
                >
                  {savingOrder ? "Saving…" : "Save order"}
                </button>
              </div>
            </div>

            {!tree?.length ? (
              <div className="laTocEmpty">No ToC entries yet.</div>
            ) : (
              <AdminEditableTocTree
                items={tree}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                getDraftForNode={getDraftForNode}
                setDraftField={setDraftField}
                discardDraft={discardDraft}
                onSave={saveNodeEdits}
                onDelete={deleteNode}
                onAddChild={(pid) => addTempNode(pid)}
                onCreateFromTemp={createFromTemp}
                onCancelTemp={cancelTemp}
                savingId={savingId}
                deletingId={deletingId}
                onDragStart={onDragStart}
                onDrop={onDrop}
              />
            )}
          </div>

          {/* Right: Preview */}
          <div className="laTocPane">
            <div className="laTocPaneTitle">Preview</div>
            {!tree?.length ? <div className="laTocEmpty">No ToC entries yet.</div> : <TocTreePreview items={tree} />}
          </div>
        </div>

        {/* Raw JSON collapsed (optional) */}
        <details className="laTocDetails">
          <summary>Show raw JSON</summary>
          <pre className="laTocPre">{JSON.stringify(tree, null, 2)}</pre>
        </details>
      </div>

      {/* ================= Upload Modal ================= */}
      {showUpload && (
        <div className="laModalOverlay" role="dialog" aria-modal="true">
          <div className="laModal">
            <div className="laModalHead">
              <div>
                <div className="laModalTitle">Upload ToC (CSV)</div>
                <div className="laModalSub">
                  Columns: <code>Key</code>, <code>Title</code>, <code>StartPage</code>, <code>EndPage</code>,{" "}
                  <code>PageLabel</code>, <code>AnchorId</code>, <code>Notes</code>, <code>Level</code>,{" "}
                  <code>TargetType</code>, <code>Order</code> (optional).
                </div>
              </div>

              <div className="laModalHeadActions">
                <button className="laBtn" type="button" onClick={onDownloadTemplate}>
                  Download Template
                </button>

                <button
                  className="laBtn"
                  type="button"
                  onClick={() => {
                    setShowUpload(false);
                    resetCsvPreview();
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="laModalBody">
              <div className="laModalRow">
                <label className="laTocLabel">Mode</label>
                <select className="laTocSelect" value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                  <option value="replace">replace (wipe existing and set)</option>
                  <option value="append">append (keep existing and add)</option>
                </select>
              </div>

              <div className="laModalRow laModalFileRow">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCsvFile(f);
                  }}
                />
                <div className="laTocHint">
                  Loaded: <b>{csvFileName || "none"}</b>
                </div>
              </div>

              <div className="laModalNote">
                After selecting your CSV, verify the parsed items + preview tree, then click <b>Import</b>.
              </div>

              {csvPreviewIssues.length > 0 && (
                <div className="laTocAlert err">
                  {csvPreviewIssues.slice(0, 8).map((x, i) => (
                    <div key={i}>{x}</div>
                  ))}
                </div>
              )}

              <div className="laModalSplit">
                <div>
                  <div className="laTocPaneTitle">Parsed items (first 100)</div>
                  <pre className="laTocPre">{JSON.stringify(csvPreviewItems.slice(0, 100), null, 2)}</pre>
                </div>

                <div>
                  <div className="laTocPaneTitle">Tree preview (computed)</div>
                  {!computedTreeFromPreview?.length ? (
                    <div className="laTocEmpty">No preview yet (upload a CSV).</div>
                  ) : (
                    <TocTreePreview items={computedTreeFromPreview} />
                  )}
                </div>
              </div>
            </div>

            <div className="laModalFoot">
              <button
                className="laBtnPrimary"
                type="button"
                onClick={confirmImportCsv}
                disabled={!docId || selectedKind === 2 || csvPreviewItems.length === 0}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Editable tree
========================================================= */
function AdminEditableTocTree({
  items,
  expanded,
  onToggleExpand,
  getDraftForNode,
  setDraftField,
  discardDraft,
  onSave,
  onDelete,
  onAddChild,
  onCreateFromTemp,
  onCancelTemp,
  savingId,
  deletingId,
  onDragStart,
  onDrop,
}) {
  return (
    <div className="laEditTree">
      {items.map((n, idx) => (
        <AdminEditableNode
          key={getId(n)}
          node={n}
          index={idx}
          parentId={null}
          depth={0}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          getDraftForNode={getDraftForNode}
          setDraftField={setDraftField}
          discardDraft={discardDraft}
          onSave={onSave}
          onDelete={onDelete}
          onAddChild={onAddChild}
          onCreateFromTemp={onCreateFromTemp}
          onCancelTemp={onCancelTemp}
          savingId={savingId}
          deletingId={deletingId}
          onDragStart={onDragStart}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
}

function AdminEditableNode(props) {
  const {
    node,
    index,
    parentId,
    depth,
    expanded,
    onToggleExpand,
    getDraftForNode,
    setDraftField,
    discardDraft,
    onSave,
    onDelete,
    onAddChild,
    onCreateFromTemp,
    onCancelTemp,
    savingId,
    deletingId,
    onDragStart,
    onDrop,
  } = props;

  const id = getId(node);
  const idStr = String(id);

  const children = getChildren(node);
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(idStr);

  const isNew = node.__isNew === true || String(idStr).startsWith("tmp_");
  const draft = getDraftForNode(node);

  const busySave = savingId === idStr;
  const busyDelete = deletingId === idStr;

  const rightLabel =
    norm(draft.pageLabel) ||
    (draft.startPage || draft.endPage ? `${draft.startPage || ""}${draft.endPage ? `–${draft.endPage}` : ""}` : "");

  return (
    <div className="laEditNode" style={{ "--tocDepth": depth }}>
      <div
        className="laEditRow"
        draggable
        onDragStart={() => onDragStart(parentId, index, id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDrop(parentId, index)}
      >
        <button
          className={`laEditExpand ${hasChildren ? "" : "disabled"}`}
          type="button"
          onClick={() => hasChildren && onToggleExpand(idStr)}
          disabled={!hasChildren}
          title={hasChildren ? (isOpen ? "Collapse" : "Expand") : ""}
        >
          {hasChildren ? (isOpen ? "▾" : "▸") : "•"}
        </button>

        <div className="laEditDrag" title="Drag to reorder">⠿</div>

        <div className="laEditMain">
          <div className="laEditTopLine">
            <input
              className="laEditTitle"
              placeholder="Title…"
              value={draft.title}
              onChange={(e) => setDraftField(idStr, "title", e.target.value)}
            />
            <div className="laEditRight">{rightLabel || "—"}</div>
          </div>

          <div className="laEditFields">
            <div className="laEditField">
              <label>Start</label>
              <input
                value={draft.startPage}
                onChange={(e) => setDraftField(idStr, "startPage", e.target.value)}
                placeholder="1"
              />
            </div>

            <div className="laEditField">
              <label>End</label>
              <input value={draft.endPage} onChange={(e) => setDraftField(idStr, "endPage", e.target.value)} placeholder="" />
            </div>

            <div className="laEditField">
              <label>Label</label>
              <input
                value={draft.pageLabel}
                onChange={(e) => setDraftField(idStr, "pageLabel", e.target.value)}
                placeholder="ix"
              />
            </div>

            <div className="laEditField">
              <label>AnchorId</label>
              <input
                value={draft.anchorId}
                onChange={(e) => setDraftField(idStr, "anchorId", e.target.value)}
                placeholder="optional"
              />
            </div>

            <div className="laEditField">
              <label>Level</label>
              <select value={draft.level} onChange={(e) => setDraftField(idStr, "level", e.target.value)}>
                <option value={1}>1 · Chapter</option>
                <option value={2}>2 · Section</option>
                <option value={3}>3 · Subsection</option>
              </select>
            </div>

            <div className="laEditField">
              <label>Target</label>
              <select value={draft.targetType} onChange={(e) => setDraftField(idStr, "targetType", e.target.value)}>
                <option value={1}>1 · Page</option>
                <option value={2}>2 · Anchor</option>
              </select>
            </div>

            <div className="laEditField wide">
              <label>Notes</label>
              <input
                value={draft.notes}
                onChange={(e) => setDraftField(idStr, "notes", e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>

          <div className="laEditActions">
            {isNew ? (
              <>
                <button
                  className="laBtnPrimary"
                  type="button"
                  onClick={() => onCreateFromTemp(idStr, parentId)}
                  disabled={busySave}
                >
                  {busySave ? "Creating…" : "Create"}
                </button>
                <button className="laBtn" type="button" onClick={() => onCancelTemp(idStr)} disabled={busySave}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button className="laBtnPrimary" type="button" onClick={() => onSave(idStr)} disabled={busySave}>
                  {busySave ? "Saving…" : "Save"}
                </button>
                <button className="laBtn" type="button" onClick={() => discardDraft(idStr)} disabled={busySave}>
                  Discard
                </button>

                <button className="laBtn" type="button" onClick={() => onAddChild(idStr)}>
                  + Child
                </button>

                <button className="laBtnDanger" type="button" onClick={() => onDelete(idStr)} disabled={busyDelete}>
                  {busyDelete ? "Deleting…" : "Delete"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {hasChildren && isOpen && (
        <div className="laEditChildren">
          {children.map((c, idx) => (
            <AdminEditableNode
              key={getId(c)}
              node={c}
              index={idx}
              parentId={idStr}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              getDraftForNode={getDraftForNode}
              setDraftField={setDraftField}
              discardDraft={discardDraft}
              onSave={onSave}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onCreateFromTemp={onCreateFromTemp}
              onCancelTemp={onCancelTemp}
              savingId={savingId}
              deletingId={deletingId}
              onDragStart={onDragStart}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Preview components (frontend-only)
========================================================= */
function TocTreePreview({ items }) {
  return (
    <div className="laTocTree">
      {items.map((x) => (
        <TocTreeNode key={x.id ?? x.clientId} node={x} depth={0} />
      ))}
    </div>
  );
}

function TocTreeNode({ node, depth }) {
  const children = node.children || node.Children || [];
  const title = node.title ?? node.Title ?? "";
  const pageLabel = node.pageLabel ?? node.PageLabel ?? "";
  const startPage = node.startPage ?? node.StartPage;
  const endPage = node.endPage ?? node.EndPage;

  let right = "";
  if (pageLabel) right = pageLabel;
  else if (startPage != null || endPage != null) right = `${startPage ?? ""}${endPage != null ? `–${endPage}` : ""}`;

  return (
    <div className="laTocNode" style={{ "--tocDepth": depth }}>
      <div className="laTocNodeRow">
        <div className="laTocNodeTitle">{title || "—"}</div>
        {right ? <div className="laTocNodeMeta">{right}</div> : null}
      </div>

      {children.length > 0 && (
        <div className="laTocNodeChildren">
          {children.map((c) => (
            <TocTreeNode key={c.id ?? c.clientId} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function buildTreeFromImportItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];

  const byId = new Map();
  const roots = [];

  for (const it of list) byId.set(it.clientId, { ...it, children: [] });

  for (const it of list) {
    const node = byId.get(it.clientId);
    const pid = it.parentClientId;
    if (pid && byId.has(pid)) byId.get(pid).children.push(node);
    else roots.push(node);
  }

  function sortNode(n) {
    n.children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    n.children.forEach(sortNode);
  }
  roots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  roots.forEach(sortNode);

  return roots;
}

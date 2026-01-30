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
  // ✅ Will become /api/admin/legal-documents/:id/toc via axios baseURL
  return `/admin/legal-documents/${did}/toc`;
}

async function adminGetDocsForDropdown() {
  // ✅ [Authorize(Roles="Admin")] [HttpGet("admin")] on /api/legal-documents/admin
  const res = await api.get(`/legal-documents/admin`);
  return res.data ?? [];
}

async function publicGetDocById(id) {
  // ✅ GET /api/legal-documents/{id} (includes Kind in your DTO)
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
  if (!s) return fallback;          // ✅ empty => null, not 0
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
  if (depth <= 1) return 1; // Chapter
  if (depth === 2) return 2; // Section
  return 3; // Subsection
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

  // numeric in csv
  const n = Number(s);
  if (Number.isFinite(n)) {
    const i = Math.trunc(n);
    if (i === 1 || i === 2 || i === 3) return i;
  }

  // label in csv
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

  // First pass: assign clientIds
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

  // Second pass: build payload items
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
      level, // ✅ numeric enum
      order: orderFinal,
      targetType, // ✅ numeric enum
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
   Page
========================================================= */
export default function AdminTocEditor() {
  const [docs, setDocs] = useState([]);
  const [docId, setDocId] = useState("");
  const [selectedKind, setSelectedKind] = useState(null); // 1=Standard, 2=Report
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [loadingToc, setLoadingToc] = useState(false);
  const [tree, setTree] = useState([]);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [importMode, setImportMode] = useState("replace"); // "replace" | "append"
  const [csvFileName, setCsvFileName] = useState("");
  const [csvPreviewItems, setCsvPreviewItems] = useState([]);
  const [csvPreviewIssues, setCsvPreviewIssues] = useState([]);
  const fileInputRef = useRef(null);

  const docOptions = useMemo(() => {
    return (docs || []).map((d) => ({
      id: d.id ?? d.Id,
      title: d.title ?? d.Title,
      status: d.status ?? d.Status,
      pageCount: d.pageCount ?? d.PageCount,
      kind: d.kind ?? d.Kind, // might be missing on this endpoint; we still check GetById
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
      return;
    }

    setError("");
    setInfo("");
    setLoadingToc(true);

    try {
      // ✅ 1) Check Kind via your GetById that includes Kind
      const doc = await publicGetDocById(did);
      const kind = doc?.kind ?? doc?.Kind ?? null;
      setSelectedKind(kind);

      // Block Report
      if (kind === 2) {
        setTree([]);
        setInfo("This document is Kind=Report. ToC editor is for Standard documents only.");
        return;
      }

      // ✅ 2) Load ToC from the ADMIN controller route
      const t = await adminGetTocTree(did);
      setTree(Array.isArray(t) ? t : []);
      if (!t || t.length === 0) setInfo("No ToC entries yet.");
    } catch (e) {
      const status = e?.response?.status;
      const serverMsg = e?.response?.data?.message;

      // ✅ Helpful hint for the exact bug you saw
      if (status === 405) {
        setError(
          `405 (Method Not Allowed). This usually means the request hit the wrong route (e.g. /documents/:id/toc). ` +
            `Confirm the ToC calls use: GET ${adminTocBase(did)} and POST ${adminTocBase(did)}/import.`
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

    const ok = window.confirm(
      `Import ${csvPreviewItems.length} ToC item(s) to document #${did} using mode "${importMode}"?`
    );
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
          `405 (Method Not Allowed) during import. Ensure you're posting to: ` +
            `${adminTocBase(did)}/import (admin controller), not /documents/:id/toc or /legal-documents/:id/toc.`
        );
      } else {
        setError(serverMsg || String(e?.message || e));
      }
    }
  }

  return (
    <div className="laTocPage">
      <div className="laTocTop">
        <div>
          <h1 className="laTocH1">Admin · ToC Editor (Test)</h1>
          <div className="laTocSub">
            Uses <b>GET /api/admin/legal-documents/:id/toc</b> and{" "}
            <b>POST /api/admin/legal-documents/:id/toc/import</b>.
          </div>
        </div>

        <div className="laTocActions">
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

        <div className="laTocGrid">
          <div className="laTocPane">
            <div className="laTocPaneTitle">Tree (raw)</div>
            <pre className="laTocPre">{JSON.stringify(tree, null, 2)}</pre>
          </div>

          <div className="laTocPane">
            <div className="laTocPaneTitle">Preview</div>
            {!tree?.length ? <div className="laTocEmpty">No ToC entries yet.</div> : <TocTreePreview items={tree} />}
          </div>
        </div>
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

            <div className="laModalBody">
              <div className="laModalRow">
                <label className="laTocLabel">Mode</label>
                <select className="laTocSelect" value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                  <option value="replace">replace (wipe existing and set)</option>
                  <option value="append">append (keep existing and add)</option>
                </select>
              </div>

              <div className="laModalRow">
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

              {csvPreviewIssues.length > 0 && (
                <div className="laTocAlert err">
                  {csvPreviewIssues.slice(0, 6).map((x, i) => (
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
                  <TocTreePreview items={buildTreeFromImportItems(csvPreviewItems)} />
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
    <div className="laTocNode" style={{ marginLeft: depth * 14 }}>
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

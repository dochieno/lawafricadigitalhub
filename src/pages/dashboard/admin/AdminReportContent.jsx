// src/pages/dashboard/admin/AdminReportContent.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../../../api/client";

function getApiErrorMessage(err, fallback = "Request failed.") {
  const data = err?.response?.data;

  if (data && typeof data === "object") {
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;

    if (data.errors && typeof data.errors === "object") {
      const k = Object.keys(data.errors)[0];
      const arr = data.errors[k];
      if (Array.isArray(arr) && arr[0]) return `${k}: ${arr[0]}`;
      return "Validation failed.";
    }
  }

  if (typeof data === "string") return data;
  if (typeof err?.message === "string") return err.message;
  return fallback;
}

export default function AdminReportContent() {
  const { legalDocumentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // optional state passed from list page
  const initialTitle = location.state?.title || "";

  const docIdNum = useMemo(() => Number(legalDocumentId), [legalDocumentId]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [title, setTitle] = useState(initialTitle);
  const [lawReportId, setLawReportId] = useState(null);
  const [contentText, setContentText] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const res = await api.get(`/law-reports/by-document/${docIdNum}/content`);
      setTitle(res.data?.title || initialTitle || `Report #${docIdNum}`);
      setLawReportId(res.data?.lawReportId ?? null);
      setContentText(res.data?.contentText ?? "");
      setLastSavedAt(res.data?.updatedAt ?? null);
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load report content."));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    setInfo("");

    try {
      await api.put(`/law-reports/by-document/${docIdNum}/content`, {
        contentText: contentText ?? "",
      });
      const nowIso = new Date().toISOString();
      setLastSavedAt(nowIso);
      setInfo("Saved.");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save report content."));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(docIdNum) || docIdNum <= 0) {
      setError("Invalid report id in the link.");
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docIdNum]);

  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        .rc-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .rc-title { font-size: 22px; font-weight: 900; margin: 0; }
        .rc-sub { color:#6b7280; margin-top:6px; font-size: 13px; font-weight: 700; }
        .rc-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .rc-card { margin-top: 14px; border-radius: 14px; border: 1px solid #e5e7eb; background: #fff; overflow: hidden; }
        .rc-editor { width: 100%; min-height: 70vh; resize: vertical; border: 0; outline: none; padding: 14px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 13px; line-height: 1.45; }
        .rc-meta { display:flex; gap:12px; flex-wrap:wrap; padding: 12px 14px; background: #fafafa; border-bottom: 1px solid #e5e7eb; color:#374151; font-weight: 800; font-size: 12px; }
        .rc-pill { display:inline-flex; align-items:center; gap:6px; border: 1px solid #e5e7eb; background:#fff; padding: 6px 10px; border-radius: 999px; }
      `}</style>

      <div className="rc-head">
        <div>
          <h1 className="rc-title">Report Content</h1>
          <div className="rc-sub">
            {title ? title : "—"}
          </div>

          <div className="rc-sub" style={{ marginTop: 8 }}>
            LegalDocumentId: <b>{Number.isFinite(docIdNum) ? docIdNum : "—"}</b>
            {lawReportId ? (
              <>
                {" "}
                · LawReportId: <b>{lawReportId}</b>
              </>
            ) : null}
          </div>
        </div>

        <div className="rc-actions">
          <button className="admin-btn" onClick={() => navigate(-1)} disabled={saving}>
            Back
          </button>

          <button className="admin-btn" onClick={load} disabled={loading || saving}>
            Refresh
          </button>

          <button className="admin-btn primary" onClick={save} disabled={loading || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error || info}</div>}

      <div className="rc-card">
        <div className="rc-meta">
          <span className="rc-pill">Auto-save: <span style={{ fontWeight: 900 }}>Off</span></span>
          <span className="rc-pill">
            Last saved:{" "}
            <span style={{ fontWeight: 900 }}>
              {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : "—"}
            </span>
          </span>
          <span className="rc-pill">Tip: paste text and click Save</span>
        </div>

        {loading ? (
          <div style={{ padding: 14, color: "#6b7280", fontWeight: 800 }}>Loading…</div>
        ) : (
          <textarea
            className="rc-editor"
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            placeholder="Paste or type the report content here…"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Editor } from "@tinymce/tinymce-react";
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

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function dateInputFromIso(iso) {
  if (!iso) return "";
  try {
    return String(iso).slice(0, 10);
  } catch {
    return "";
  }
}

function isoOrNullFromDateInput(yyyyMmDd) {
  const s = String(yyyyMmDd || "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export default function AdminReportContent() {
  const { id } = useParams(); // LawReportId
  const navigate = useNavigate();
  const location = useLocation();

  const initialTitle = location.state?.title || "";
  const reportId = useMemo(() => Number(id), [id]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [title, setTitle] = useState(initialTitle);
  const [legalDocumentId, setLegalDocumentId] = useState(null);

  const [dto, setDto] = useState(null);
  const [contentHtml, setContentHtml] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const editorRef = useRef(null);

  const apiKey = import.meta.env.VITE_TINYMCE_API_KEY || "no-api-key";

  async function load() {
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const res = await api.get(`/law-reports/${reportId}`);
      const d = res.data;

      setDto(d);
      setTitle(d.title || initialTitle || `Report #${reportId}`);
      setLegalDocumentId(d.legalDocumentId ?? null);

      // If you used plain text before, TinyMCE will display it as text.
      // As you start saving formatted content, this becomes HTML.
      setContentHtml(d.contentText ?? "");
      setLastSavedAt(d.updatedAt ?? null);
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load report."));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!dto) return;

    setSaving(true);
    setError("");
    setInfo("");

    try {
      const html = contentHtml ?? "";

      const payload = {
        // required fields for Upsert
        countryId: dto.countryId ?? 0,
        category: 6,
        service: toInt(dto.service, 1),

        citation: dto.citation ?? null,
        reportNumber: String(dto.reportNumber || "").trim(),
        year: dto.year ?? new Date().getUTCFullYear(),
        caseNumber: dto.caseNumber ?? null,
        decisionType: toInt(dto.decisionType, 1),
        caseType: toInt(dto.caseType, 2),
        court: dto.court ?? null,
        parties: dto.parties ?? null,
        judges: dto.judges ?? null,
        decisionDate: isoOrNullFromDateInput(dateInputFromIso(dto.decisionDate)),

        // HTML content
        contentText: String(html),
      };

      if (!payload.countryId || payload.countryId <= 0) throw new Error("Country is missing. Go back and Edit the report.");
      if (!payload.reportNumber) throw new Error("ReportNumber is missing. Go back and Edit the report.");
      if (!payload.contentText.trim()) throw new Error("ContentText is required.");

      await api.put(`/law-reports/${reportId}`, payload);

      const nowIso = new Date().toISOString();
      setLastSavedAt(nowIso);
      setInfo("Saved.");
      // light refresh to pull any server-changes (UpdatedAt etc)
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save report content."));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(reportId) || reportId <= 0) {
      setError("Invalid report id in the link.");
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  return (
    <div className="admin-page admin-page-wide" style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 60px)" }}>
      <style>{`
        .rc-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .rc-title { font-size: 22px; font-weight: 950; margin: 0; }
        .rc-sub { color:#6b7280; margin-top:6px; font-size: 13px; font-weight: 700; }
        .rc-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .rc-card { margin-top: 14px; border-radius: 18px; border: 1px solid #e5e7eb; background: #fff; overflow: hidden; display:flex; flex-direction:column; flex: 1; }
        .rc-meta { display:flex; gap:12px; flex-wrap:wrap; padding: 12px 14px; background: #fafafa; border-bottom: 1px solid #e5e7eb; color:#374151; font-weight: 800; font-size: 12px; }
        .rc-pill { display:inline-flex; align-items:center; gap:6px; border: 1px solid #e5e7eb; background:#fff; padding: 6px 10px; border-radius: 999px; }
        .editorWrap { flex: 1; min-height: 0; } /* critical for full-height editor */
        .tox-tinymce { border: 0 !important; border-radius: 0 !important; }
      `}</style>

      <div className="rc-head">
        <div>
          <h1 className="rc-title">Report Content</h1>
          <div className="rc-sub">{title ? title : "—"}</div>

          <div className="rc-sub" style={{ marginTop: 8 }}>
            LawReportId: <b>{Number.isFinite(reportId) ? reportId : "—"}</b>
            {legalDocumentId ? (
              <>
                {" "}
                · LegalDocumentId: <b>{legalDocumentId}</b>
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
          <span className="rc-pill">
            Format: <span style={{ fontWeight: 900 }}>Rich text (HTML)</span>
          </span>
          <span className="rc-pill">
            Last saved:{" "}
            <span style={{ fontWeight: 900 }}>
              {lastSavedAt ? new Date(lastSavedAt).toLocaleString() : "—"}
            </span>
          </span>
          <span className="rc-pill">Tip: paste from Word, then use “Clear formatting” if needed</span>
        </div>

        <div className="editorWrap">
          {loading ? (
            <div style={{ padding: 14, color: "#6b7280", fontWeight: 800 }}>Loading…</div>
          ) : (
            <Editor
              apiKey={apiKey}
              onInit={(_, editor) => (editorRef.current = editor)}
              value={contentHtml}
              onEditorChange={(v) => setContentHtml(v)}
              init={{
                height: "100%",
                menubar: true,
                branding: false,
                plugins:
                  "advlist autolink lists link charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount",
                toolbar:
                  "undo redo | blocks | bold italic underline forecolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link table | removeformat | code fullscreen",
                content_style:
                  "body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; }",
                // Improve Word-paste behavior
                paste_as_text: false,
                paste_webkit_styles: "none",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

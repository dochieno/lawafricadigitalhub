import { useMemo, useState } from "react";
import api, { checkDocumentAvailability, API_BASE_URL } from "../../api/client.js";
import "../../styles/qaTools.css";

function safeJsonParse(input) {
  if (!input?.trim()) return null;
  try {
    return JSON.parse(input);
  } catch {
    throw new Error("Invalid JSON body. Fix formatting and try again.");
  }
}

function pretty(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function decodeJwt(token) {
  // NOTE: This is only for QA display (no signature verification).
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function QATools() {
  // -----------------------------
  // Token / environment
  // -----------------------------
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const jwtPayload = useMemo(() => (token ? decodeJwt(token) : null), [token]);

  function refreshTokenFromStorage() {
    setToken(localStorage.getItem("token") || "");
  }

  function clearToken() {
    localStorage.removeItem("token");
    refreshTokenFromStorage();
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied.");
    } catch {
      alert("Copy failed (browser permissions).");
    }
  }

  // -----------------------------
  // Generic API runner
  // -----------------------------
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/Auth/me");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const [result, setResult] = useState(null); // { ok, status, data, headers, errorText }
  const [runnerError, setRunnerError] = useState("");

  async function runRequest(e) {
    e?.preventDefault?.();
    setRunnerError("");
    setResult(null);

    setSending(true);
    try {
      const m = method.toUpperCase();
      const config = {
        url: path.startsWith("/") ? path : `/${path}`,
        method: m,
      };

      if (m !== "GET" && m !== "DELETE") {
        config.data = safeJsonParse(body);
      }

      const res = await api.request(config);

      setResult({
        ok: true,
        status: res.status,
        headers: res.headers,
        data: res.data,
      });
    } catch (err) {
      // Axios error shape
      const status = err?.response?.status;
      const data = err?.response?.data;
      const headers = err?.response?.headers;

      setResult({
        ok: false,
        status: status ?? 0,
        headers: headers ?? null,
        data: data ?? null,
        errorText: err?.message || "Request failed",
      });
    } finally {
      setSending(false);
    }
  }

  // -----------------------------
  // Document availability checker
  // -----------------------------
  const [docId, setDocId] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [docOut, setDocOut] = useState(null);
  const [docErr, setDocErr] = useState("");

  async function checkAvailability() {
    setDocErr("");
    setDocOut(null);

    if (!docId.trim()) {
      setDocErr("Enter a documentId first.");
      return;
    }

    setDocLoading(true);
    try {
      const data = await checkDocumentAvailability(docId.trim());
      setDocOut(data);
    } catch (err) {
      setDocErr(err?.response?.data || err?.message || "Failed to check availability");
    } finally {
      setDocLoading(false);
    }
  }

  // -----------------------------
  // Quick presets (edit as needed)
  // -----------------------------
  const presets = [
    { label: "Auth: /Auth/me (GET)", method: "GET", path: "/Auth/me", body: "" },
    { label: "Health: /health (GET)", method: "GET", path: "/health", body: "" },
    // Add more, e.g. subscriptions, products, institutions, etc.
  ];

  function applyPreset(p) {
    setMethod(p.method);
    setPath(p.path);
    setBody(p.body);
    setResult(null);
    setRunnerError("");
  }

  return (
    <div className="qa-page">
      <div className="qa-header">
        <div>
          <h1 className="qa-title">QA Tools</h1>
          <p className="qa-subtitle">
            Quick utilities for testing auth, endpoints, and document availability.
          </p>
        </div>

        <div className="qa-badges">
          <span className="qa-badge">
            API: <strong>{API_BASE_URL}</strong>
          </span>
          <span className={`qa-badge ${token ? "ok" : "warn"}`}>
            Token: <strong>{token ? "Present" : "Missing"}</strong>
          </span>
        </div>
      </div>

      {/* ===================== */}
      {/* TOKEN PANEL */}
      {/* ===================== */}
      <section className="qa-card">
        <div className="qa-card-head">
          <h2>Auth / Token</h2>
          <div className="qa-actions">
            <button className="qa-btn" onClick={refreshTokenFromStorage}>
              Refresh
            </button>
            <button className="qa-btn danger" onClick={clearToken}>
              Clear Token
            </button>
            <button
              className="qa-btn"
              onClick={() => token && copyToClipboard(token)}
              disabled={!token}
              title={!token ? "No token to copy" : "Copy token"}
            >
              Copy Token
            </button>
          </div>
        </div>

        <div className="qa-grid">
          <div>
            <label className="qa-label">LocalStorage token</label>
            <textarea
              className="qa-textarea"
              value={token}
              readOnly
              placeholder="No token found in localStorage."
            />
          </div>

          <div>
            <label className="qa-label">JWT payload (decoded)</label>
            <pre className="qa-pre">
              {jwtPayload ? pretty(jwtPayload) : "No payload to display."}
            </pre>
            <p className="qa-hint">
              *Decoded client-side for QA only (no signature verification).
            </p>
          </div>
        </div>
      </section>

      {/* ===================== */}
      {/* API RUNNER */}
      {/* ===================== */}
      <section className="qa-card">
        <div className="qa-card-head">
          <h2>API Runner</h2>
          <div className="qa-actions">
            {presets.map((p) => (
              <button key={p.label} className="qa-btn ghost" onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={runRequest} className="qa-runner">
          <div className="qa-row">
            <div className="qa-field">
              <label className="qa-label">Method</label>
              <select
                className="qa-input"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
            </div>

            <div className="qa-field grow">
              <label className="qa-label">Path (relative to /api)</label>
              <input
                className="qa-input"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/Auth/me"
              />
            </div>

            <div className="qa-field">
              <label className="qa-label">&nbsp;</label>
              <button className="qa-btn primary" type="submit" disabled={sending}>
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>

          {(method !== "GET" && method !== "DELETE") && (
            <div className="qa-field">
              <label className="qa-label">JSON Body</label>
              <textarea
                className="qa-textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={`{\n  "example": true\n}`}
              />
            </div>
          )}

          {runnerError && <div className="qa-error">{runnerError}</div>}
        </form>

        <div className="qa-split">
          <div>
            <label className="qa-label">Response</label>
            <pre className="qa-pre">
              {result
                ? pretty({
                    ok: result.ok,
                    status: result.status,
                    errorText: result.errorText,
                    data: result.data,
                  })
                : "No response yet."}
            </pre>
          </div>

          <div>
            <label className="qa-label">Headers</label>
            <pre className="qa-pre">{result?.headers ? pretty(result.headers) : "—"}</pre>
          </div>
        </div>
      </section>

      {/* ===================== */}
      {/* DOC AVAILABILITY */}
      {/* ===================== */}
      <section className="qa-card">
        <div className="qa-card-head">
          <h2>Legal Document Availability</h2>
          <p className="qa-hint">
            Uses <code>checkDocumentAvailability(documentId)</code> →{" "}
            <code>/legal-documents/{`{documentId}`}/availability</code>
          </p>
        </div>

        <div className="qa-row">
          <div className="qa-field grow">
            <label className="qa-label">documentId</label>
            <input
              className="qa-input"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              placeholder="e.g. 123"
            />
          </div>
          <div className="qa-field">
            <label className="qa-label">&nbsp;</label>
            <button className="qa-btn primary" onClick={checkAvailability} disabled={docLoading}>
              {docLoading ? "Checking..." : "Check"}
            </button>
          </div>
        </div>

        {docErr && <div className="qa-error">{String(docErr)}</div>}

        <label className="qa-label">Output</label>
        <pre className="qa-pre">{docOut ? pretty(docOut) : "—"}</pre>
      </section>
    </div>
  );
}

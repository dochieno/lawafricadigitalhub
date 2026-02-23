// src/pages/dashboard/admin/AdminDashboardHome.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/client";
import "../../../styles/dashboard.css";
import "../../../styles/globalAdminDashboard.css";

// ------------------------
// utils
// ------------------------
function toISO(d) {
  return new Date(d).toISOString();
}
function rangeForDays(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - Number(days || 30));
  return { fromUtc: toISO(from), toUtc: toISO(to) };
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtInt(v) {
  return num(v).toLocaleString();
}
function fmtPct(v) {
  return `${(num(v) * 100).toFixed(1)}%`;
}
function fmtMoney(amount, currency = "KES") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(num(amount));
  } catch {
    return `${currency} ${num(amount).toLocaleString()}`;
  }
}
function friendlyApiError(e) {
  const status = e?.response?.status;
  const title = e?.response?.data?.title;
  const detail = e?.response?.data?.detail;
  if (title || detail) return `${title ? title : "Request failed"}${detail ? ` — ${detail}` : ""}`;
  if (typeof e?.response?.data === "string" && e.response.data.trim()) return e.response.data;
  if (status === 401) return "You are not authorized. Please log in again.";
  if (status === 403) return "You don’t have permission to view this dashboard.";
  if (status >= 500) return "The server hit an internal error while loading analytics.";
  if (status >= 400) return "The request could not be completed. Please try again.";
  return "Failed to load dashboard analytics.";
}

// ------------------------
// small icons (inline svg)
// ------------------------
function Icon({ children, title }) {
  return (
    <span className="ga-i" title={title} aria-label={title}>
      {children}
    </span>
  );
}
const I = {
  refresh: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M20 12a8 8 0 1 1-2.3-5.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M7 2v3M17 2v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 5h14a2 2 0 0 1 2 2v14H3V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  trendUp: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M3 17l6-6 4 4 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 8h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  reads: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 19a2 2 0 0 0 2 2h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 3h12a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 7h8M8 11h8M8 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  block: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" stroke="currentColor" strokeWidth="2" />
      <path d="M7 7l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  money: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M3 7h18v10H3V7Z" stroke="currentColor" strokeWidth="2" />
      <path d="M7 7a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3" stroke="currentColor" strokeWidth="2" />
      <path d="M7 17a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 10.5v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 10v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 7h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  arrowUp: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// ------------------------
// compact trend chart (same logic, cleaner chrome)
// ------------------------
function LineChart({ title, points, height = 176, valueSuffix = "" }) {
  const w = 860;
  const h = height;
  const pad = 28;

  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const safePoints = Array.isArray(points) ? points : [];
  const ys = safePoints.map((p) => num(p.y));
  const maxY = Math.max(1, ...ys);
  const minY = 0;

  const stepX = safePoints.length > 1 ? (w - pad * 2) / (safePoints.length - 1) : 0;

  const scaled = safePoints.map((p, idx) => {
    const x = pad + idx * stepX;
    const yNorm = (num(p.y) - minY) / (maxY - minY);
    const y = h - pad - yNorm * (h - pad * 2);
    return { ...p, _x: x, _y: y, _val: num(p.y) };
  });

  const path = scaled.length >= 2 ? scaled.map((p, i) => `${i === 0 ? "M" : "L"} ${p._x} ${p._y}`).join(" ") : "";

  const total = scaled.reduce((acc, p) => acc + num(p.y), 0);
  const last = scaled.length ? num(scaled[scaled.length - 1].y) : 0;
  const isEmpty = scaled.length === 0 || total === 0;

  function handleMove(e) {
    if (!wrapRef.current || scaled.length === 0) return;

    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = px / rect.width;
    const xSvg = ratio * w;

    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < scaled.length; i++) {
      const d = Math.abs(scaled[i]._x - xSvg);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }

    setHoverIdx(nearest);
    const pt = scaled[nearest];
    const tipX = (pt._x / w) * rect.width;
    const tipY = (pt._y / h) * rect.height;
    setHoverPos({ x: tipX, y: tipY });
  }

  const hoverPoint = hoverIdx != null ? scaled[hoverIdx] : null;

  const gridLines = [0.25, 0.5, 0.75].map((t, i) => {
    const y = h - pad - t * (h - pad * 2);
    return <line key={i} x1={pad} y1={y} x2={w - pad} y2={y} className="ga-gridline" />;
  });

  return (
    <div className="ga-panel ga-panel-modern ga-panel-compact">
      <div className="ga-panel-head ga-panel-head-modern ga-panel-head-compact">
        <div className="ga-panel-titleRow">
          <div className="ga-panel-title">{title}</div>
          <div className="ga-panel-sub">
            Total <b>{fmtInt(total)}</b>
            {valueSuffix ? ` ${valueSuffix}` : ""} • Last <b>{fmtInt(last)}</b>
            {valueSuffix ? ` ${valueSuffix}` : ""}
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div className="ga-emptyChart ga-emptyChart-compact">
          <div className="ga-emptyChartIcon">📉</div>
          <div className="ga-emptyChartText">No trend data for this period.</div>
          <div className="ga-emptyChartHint">Try 30–90 days or generate activity.</div>
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="ga-chartWrap"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <svg viewBox={`0 0 ${w} ${h}`} className="ga-chart" role="img" aria-label={title}>
            <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} />
            <line x1={pad} y1={pad} x2={pad} y2={h - pad} />
            {gridLines}

            <path d={path} fill="none" strokeWidth="2" />
            {scaled.map((p, idx) => (
              <circle key={idx} cx={p._x} cy={p._y} r="3.2" />
            ))}

            {hoverPoint ? (
              <>
                <line x1={hoverPoint._x} y1={pad} x2={hoverPoint._x} y2={h - pad} className="ga-hoverLine" />
                <circle cx={hoverPoint._x} cy={hoverPoint._y} r="6.2" className="ga-hoverDot" />
              </>
            ) : null}
          </svg>

          {hoverPoint ? (
            <div className="ga-tooltip" style={{ left: hoverPos.x, top: Math.max(12, hoverPos.y - 48) }}>
              <div className="ga-tooltipTitle">{hoverPoint.xLabel}</div>
              <div className="ga-tooltipValue">
                {fmtInt(hoverPoint._val)}
                {valueSuffix ? ` ${valueSuffix}` : ""}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ------------------------
// compact list (no long horizontal cards; still readable)
// ------------------------
function CompactList({ title, items, rightFormatter, emptyText = "No data yet.", searchable = false }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const safe = Array.isArray(items) ? items : [];
    if (!searchable) return safe;
    const s = q.trim().toLowerCase();
    if (!s) return safe;
    return safe.filter((x) => String(x.key).toLowerCase().includes(s));
  }, [items, q, searchable]);

  return (
    <div className="ga-panel ga-panel-modern ga-panel-compact">
      <div className="ga-panel-head ga-panel-head-modern ga-panel-head-split ga-panel-head-compact">
        <div className="ga-panel-title">{title}</div>
        {searchable ? (
          <div className="ga-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="ga-searchInput" />
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="ga-emptyBlock">{emptyText}</div>
      ) : (
        <div className="ga-list">
          {filtered.map((it) => (
            <div key={String(it.key)} className="ga-listRow">
              <div className="ga-listLeft" title={String(it.key)}>{String(it.key)}</div>
              <div className="ga-listRight">
                {rightFormatter ? rightFormatter(it.value) : num(it.value).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------
// KPI + Mini insights
// ------------------------
function KpiCard({ label, value, sub, icon, tone, tooltip }) {
  return (
    <div className={`ga-kpi ${tone ? `ga-kpi-${tone}` : ""}`}>
      <div className="ga-kpiTop">
        <div className="ga-kpiLabel">
          {label}
          {tooltip ? <span className="ga-help" title={tooltip}>{I.info}</span> : null}
        </div>
        <div className="ga-kpiIcon" title={tooltip || label} aria-label={tooltip || label}>
          {icon}
        </div>
      </div>
      <div className="ga-kpiValue">{value}</div>
      {sub ? <div className="ga-kpiSub">{sub}</div> : null}
    </div>
  );
}

function MiniInsight({ icon, label, value, hint }) {
  return (
    <div className="ga-miniInsight" title={hint || ""}>
      <div className="ga-miniInsightIcon">{icon}</div>
      <div className="ga-miniInsightBody">
        <div className="ga-miniInsightLabel">{label}</div>
        <div className="ga-miniInsightValue">{value}</div>
      </div>
    </div>
  );
}

function Toast({ kind = "success", text }) {
  if (!text) return null;
  return (
    <div className="toast">
      <div className={`toast-box ${kind === "success" ? "toast-success" : "toast-error"}`}>{text}</div>
    </div>
  );
}

export default function AdminDashboardHome() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [overview, setOverview] = useState(null);
  const [usage, setUsage] = useState(null);

  const [days, setDays] = useState(30);
  const range = useMemo(() => rangeForDays(days), [days]);

  const [lastUpdated, setLastUpdated] = useState(null);

  const [toast, setToast] = useState(null);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const [ovRes, usageRes] = await Promise.all([
        api.get("/admin/dashboard/overview", {
          params: { fromUtc: range.fromUtc, toUtc: range.toUtc, expiringSoonDays: 14 },
        }),
        api.get("/admin/usage/summary", {
          params: { fromUtc: range.fromUtc, toUtc: range.toUtc },
        }),
      ]);

      setOverview(ovRes.data);
      setUsage(usageRes.data);
      setLastUpdated(new Date());

      setToast({ kind: "success", text: "Analytics refreshed." });
    } catch (e) {
      console.error(e);
      const m = friendlyApiError(e);
      setErr(m);
      setToast({ kind: "error", text: m });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // ------------------------
  // mappers
  // ------------------------
  const paymentsByPurpose = useMemo(() => {
    const arr = overview?.paymentsBreakdown?.amountByPurpose || [];
    return arr
      .map((x) => ({ key: x.key ?? x.Key ?? "Unknown", value: x.value ?? x.Value ?? 0 }))
      .sort((a, b) => num(b.value) - num(a.value))
      .slice(0, 8);
  }, [overview]);

  const deniesByReason = useMemo(() => {
    const arr = usage?.deniesByReason || [];
    return arr
      .map((x) => ({ key: x.key ?? x.Key ?? "Unknown", value: x.value ?? x.Value ?? 0 }))
      .sort((a, b) => num(b.value) - num(a.value))
      .slice(0, 8);
  }, [usage]);

  const readsByDay = useMemo(() => {
    const arr = usage?.readsByDay || [];
    return arr.map((x) => {
      const d = new Date(x.dateUtc ?? x.DateUtc);
      const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
      return { xLabel: label, y: x.value ?? x.Value ?? 0 };
    });
  }, [usage]);

  const blocksByDay = useMemo(() => {
    const arr = usage?.blocksByDay || [];
    return arr.map((x) => {
      const d = new Date(x.dateUtc ?? x.DateUtc);
      const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
      return { xLabel: label, y: x.value ?? x.Value ?? 0 };
    });
  }, [usage]);

  const topDocs = useMemo(() => {
    const arr = usage?.topDocumentsByReads || usage?.topDocuments || [];
    return (arr || [])
      .map((x) => ({ key: x.key ?? x.Key ?? "Unknown", value: x.value ?? x.Value ?? 0 }))
      .sort((a, b) => num(b.value) - num(a.value))
      .slice(0, 10);
  }, [usage]);

  const topInstitutions = useMemo(() => {
    const arr = usage?.topInstitutionsByReads || usage?.topInstitutions || [];
    return (arr || [])
      .map((x) => ({ key: x.key ?? x.Key ?? "Unknown", value: x.value ?? x.Value ?? 0 }))
      .sort((a, b) => num(b.value) - num(a.value))
      .slice(0, 10);
  }, [usage]);

  // ------------------------
  // numbers
  // ------------------------
  const currency = "KES";

  const reads = num(usage?.reads);
  const blocks = num(usage?.blocks);
  const blockRate = num(usage?.blockRate);

  const paySuccess = num(overview?.payments?.successAmount);
  const payTotalCount = num(overview?.payments?.totalCount);
  const payFailed = num(overview?.payments?.failedCount);

  const institutionsTotal = num(overview?.institutions?.total);
  const institutionsActive = num(overview?.institutions?.active);

  const subsActive = num(overview?.subscriptions?.activeNow);
  const subsExpSoon = num(overview?.subscriptions?.expiringSoon);
  const expDays = overview?.subscriptions?.expiringSoonDays ?? 14;

  const topDeny = deniesByReason?.[0];
  const topDoc = topDocs?.[0];
  const topInst = topInstitutions?.[0];
  const bestDay =
    (readsByDay || []).reduce((best, p) => (num(p.y) > num(best?.y) ? p : best), null) || null;

  return (
    <div className="ga-wrap ga-wrap-modern ga-wrap-premium">
      <Toast kind={toast?.kind} text={toast?.text} />

      {/* Single header bar */}
      <header className="ga-head">
        <div className="ga-headLeft">
          <div className="ga-titleRow">
            <h1 className="ga-title">Global Admin Dashboard</h1>
            <span className="ga-badge">Analytics</span>
          </div>
          <div className="ga-subtitle">
            Institutions, subscriptions, payments & access usage — last <b>{days} days</b>.
          </div>
        </div>

        <div className="ga-headRight">
          <div className="ga-range ga-range-modern" role="tablist" aria-label="Date range">
            <button className={`ga-chip ${days === 7 ? "active" : ""}`} onClick={() => setDays(7)} type="button">
              7d
            </button>
            <button className={`ga-chip ${days === 30 ? "active" : ""}`} onClick={() => setDays(30)} type="button">
              30d
            </button>
            <button className={`ga-chip ${days === 90 ? "active" : ""}`} onClick={() => setDays(90)} type="button">
              90d
            </button>
          </div>

          <button className="ga-btn ga-btnPrimary" onClick={load} disabled={loading} type="button" title="Refresh analytics">
            <Icon title="Refresh">{I.refresh}</Icon>
            {loading ? "Refreshing…" : "Refresh"}
          </button>

          <div className="ga-updated">
            <Icon title="Last updated">{I.calendar}</Icon>
            <span>{lastUpdated ? lastUpdated.toLocaleString() : "—"}</span>
          </div>

          <button
            className="ga-btn ga-btnGhost"
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="Back to top"
          >
            <Icon title="Back to top">{I.arrowUp}</Icon>
          </button>
        </div>
      </header>

      {err ? <div className="ga-error">{err}</div> : null}

      {/* Primary KPIs (consolidated; no duplicates) */}
      <section className="ga-section ga-section-tight">
        <div className="ga-kpiGrid">
          {loading ? (
            <>
              <div className="ga-kpi ga-skelKpi" />
              <div className="ga-kpi ga-skelKpi" />
              <div className="ga-kpi ga-skelKpi" />
              <div className="ga-kpi ga-skelKpi" />
            </>
          ) : (
            <>
              <KpiCard
                label="Reads"
                value={fmtInt(reads)}
                sub={`Top doc: ${topDoc ? String(topDoc.key) : "—"}`}
                icon={<Icon title="Reads">{I.reads}</Icon>}
                tooltip="Total successful reads in the selected date range."
              />
              <KpiCard
                label="Blocks"
                value={fmtInt(blocks)}
                sub={`Top reason: ${topDeny ? String(topDeny.key) : "—"}`}
                icon={<Icon title="Blocks">{I.block}</Icon>}
                tone="danger"
                tooltip="Blocked access attempts (NotEntitled, etc.)"
              />
              <KpiCard
                label="Block rate"
                value={fmtPct(blockRate)}
                sub={reads ? `${fmtInt(blocks)} / ${fmtInt(reads)} events` : "—"}
                icon={<Icon title="Block rate">{I.trendUp}</Icon>}
                tone="danger"
                tooltip="Blocks ÷ (Reads + Blocks) as provided by your API."
              />
              <KpiCard
                label="Payments"
                value={fmtMoney(paySuccess, currency)}
                sub={`${fmtInt(payTotalCount)} total • ${fmtInt(payFailed)} failed`}
                icon={<Icon title="Payments">{I.money}</Icon>}
                tone="success"
                tooltip="Sum of successful payments in the selected date range."
              />
            </>
          )}
        </div>

        {/* Mini insights row (small, not big cards) */}
        <div className="ga-miniRow">
          <MiniInsight icon="🛑" label="Top deny" value={loading ? "…" : (topDeny ? String(topDeny.key) : "—")} hint={topDeny ? `${fmtInt(topDeny.value)} denies` : ""} />
          <MiniInsight icon="📖" label="Top document" value={loading ? "…" : (topDoc ? String(topDoc.key) : "—")} hint={topDoc ? `${fmtInt(topDoc.value)} reads` : ""} />
          <MiniInsight icon="🏫" label="Top institution" value={loading ? "…" : (topInst ? String(topInst.key) : "—")} hint={topInst ? `${fmtInt(topInst.value)} reads` : ""} />
          <MiniInsight icon="📈" label="Best day" value={loading ? "…" : (bestDay ? bestDay.xLabel : "—")} hint={bestDay ? `${fmtInt(bestDay.y)} reads` : ""} />
          <MiniInsight icon="🏛️" label="Institutions" value={loading ? "…" : `${fmtInt(institutionsTotal)}`} hint={`${fmtInt(institutionsActive)} active`} />
          <MiniInsight icon="🧾" label="Subs" value={loading ? "…" : `${fmtInt(subsActive)}`} hint={`${fmtInt(subsExpSoon)} expiring in ${expDays}d`} />
        </div>
      </section>

      {/* Trends */}
      <section className="ga-section">
        <div className="ga-sectionHead ga-sectionHead-modern ga-sectionHead-slim">
          <h2 className="ga-h2">Trends</h2>
          <div className="ga-sectionMeta">Hover charts for details</div>
        </div>

        <div className="ga-row ga-row-modern">
          <LineChart title="Reads per day" points={readsByDay} />
          <LineChart title="Blocks per day" points={blocksByDay} />
        </div>
      </section>

      {/* Top activity + breakdowns (compact lists; no bar rows) */}
      <section className="ga-section">
        <div className="ga-sectionHead ga-sectionHead-modern ga-sectionHead-slim">
          <h2 className="ga-h2">Top Activity</h2>
          <div className="ga-sectionMeta">Compact ranked lists</div>
        </div>

        <div className="ga-row ga-row-modern">
          <CompactList title="Top documents" items={topDocs} emptyText="No document reads found." searchable />
          <CompactList title="Top institutions" items={topInstitutions} emptyText="No institution reads found." searchable />
        </div>
      </section>

      <section className="ga-section">
        <div className="ga-sectionHead ga-sectionHead-modern ga-sectionHead-slim">
          <h2 className="ga-h2">Breakdowns</h2>
          <div className="ga-sectionMeta">Purpose & denies</div>
        </div>

        <div className="ga-row ga-row-modern">
          <CompactList
            title="Payments by purpose"
            items={paymentsByPurpose}
            rightFormatter={(v) => fmtMoney(v, currency)}
            emptyText="No successful payments found."
          />
          <CompactList
            title="Top deny reasons"
            items={deniesByReason}
            emptyText="No deny events found."
          />
        </div>
      </section>

      {/* Footer (quiet) */}
      <footer className="ga-footer ga-footer-modern ga-footer-quiet">
        <div className="ga-footerInner">
          <div className="ga-footerLeft">
            <div className="ga-footerBrand">LawAfrica Admin</div>
            <div className="ga-footerMeta">
              Window: <strong>Last {days} days</strong> • Updated: <strong>{lastUpdated ? lastUpdated.toLocaleString() : "—"}</strong>
            </div>
          </div>

          <div className="ga-footerRight">
            <button className="ga-footerLink" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button">
              Back to top
            </button>
            <span className="ga-footerDot">•</span>
            <span className="ga-footerHint">If numbers look off, check API logs.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
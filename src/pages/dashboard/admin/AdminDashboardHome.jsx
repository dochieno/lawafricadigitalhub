import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/client";
import "../../../styles/dashboard.css";
import "../../../styles/globalAdminDashboard.css"; // ✅ keep

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
  const n = num(v) * 100;
  return `${n.toFixed(1)}%`;
}

function fmtMoney(amount, currency = "KES") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(num(amount));
  } catch {
    return `${currency} ${num(amount).toLocaleString()}`;
  }
}

function friendlyApiError(e) {
  const status = e?.response?.status;

  const title = e?.response?.data?.title;
  const detail = e?.response?.data?.detail;

  if (title || detail) {
    return `${title ? title : "Request failed"}${detail ? ` — ${detail}` : ""}`;
  }

  if (typeof e?.response?.data === "string" && e.response.data.trim()) {
    return e.response.data;
  }

  if (status === 401) return "You are not authorized. Please log in again.";
  if (status === 403) return "You don’t have permission to view this dashboard.";
  if (status >= 500) return "The server hit an internal error while loading analytics.";
  if (status >= 400) return "The request could not be completed. Please try again.";

  return "Failed to load dashboard analytics.";
}

/**
 * ✅ Modern SVG line chart:
 * - subtle grid
 * - hover marker + tooltip
 * - accessible labels
 */
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

  const path =
    scaled.length >= 2
      ? scaled.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p._x} ${p._y}`).join(" ")
      : "";

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

  function clearHover() {
    setHoverIdx(null);
  }

  const hoverPoint = hoverIdx != null ? scaled[hoverIdx] : null;

  const gridLines = [0.25, 0.5, 0.75].map((t, i) => {
    const y = h - pad - t * (h - pad * 2);
    return <line key={i} x1={pad} y1={y} x2={w - pad} y2={y} className="ga-gridline" />;
  });

  return (
    <div className="ga-panel ga-panel-modern">
      <div className="ga-panel-head ga-panel-head-modern">
        <div>
          <div className="ga-panel-title">{title}</div>
          <div className="ga-panel-sub">
            Total: <strong>{fmtInt(total)}</strong>
            {valueSuffix ? ` ${valueSuffix}` : ""} • Last: <strong>{fmtInt(last)}</strong>
            {valueSuffix ? ` ${valueSuffix}` : ""}
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div className="ga-emptyChart">
          <div className="ga-emptyChartIcon">📉</div>
          <div className="ga-emptyChartText">No trend data yet for this period.</div>
          <div className="ga-emptyChartHint">Try a longer range (30–90 days) or generate a few reads/blocks.</div>
        </div>
      ) : (
        <div ref={wrapRef} className="ga-chartWrap" onMouseMove={handleMove} onMouseLeave={clearHover}>
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
            <div
              className="ga-tooltip"
              style={{
                left: hoverPos.x,
                top: Math.max(12, hoverPos.y - 48),
              }}
            >
              <div className="ga-tooltipTitle">{hoverPoint.xLabel}</div>
              <div className="ga-tooltipValue">
                {fmtInt(hoverPoint._val)}
                {valueSuffix ? ` ${valueSuffix}` : ""}
              </div>
            </div>
          ) : null}

          <div className="ga-xlabels">
            {scaled.slice(0, 8).map((p, idx) => (
              <div key={idx} className="ga-xlabel" title={p.xLabel}>
                {p.xLabel}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BarList({
  title,
  items,
  rightFormatter,
  emptyText = "No data yet.",
  searchable = false,
}) {
  const safe = Array.isArray(items) ? items : [];
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!searchable) return safe;
    const s = q.trim().toLowerCase();
    if (!s) return safe;
    return safe.filter((x) => String(x.key).toLowerCase().includes(s));
  }, [q, safe, searchable]);

  const max = Math.max(1, ...filtered.map((x) => num(x.value)));

  return (
    <div className="ga-panel ga-panel-modern">
      <div className="ga-panel-head ga-panel-head-modern ga-panel-head-split">
        <div className="ga-panel-title">{title}</div>

        {searchable ? (
          <div className="ga-search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="ga-searchInput"
            />
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="ga-emptyBlock">{emptyText}</div>
      ) : (
        <div className="ga-barlist">
          {filtered.map((it) => {
            const pct = (num(it.value) / max) * 100;
            return (
              <div key={String(it.key)} className="ga-barrow">
                <div className="ga-barrow-label" title={String(it.key)}>
                  {String(it.key)}
                </div>

                <div className="ga-barrow-barwrap">
                  <div className="ga-barrow-bar" style={{ width: `${pct}%` }} />
                </div>

                <div className="ga-barrow-value">
                  {rightFormatter ? rightFormatter(it.value) : num(it.value).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, tone }) {
  return (
    <div className={`ga-card ga-card-modern ${tone ? `ga-card-${tone}` : ""}`}>
      <div className="ga-cardTop">
        <div className="ga-cardTitle">{title}</div>
        <div className="ga-cardIcon" aria-hidden="true">
          {icon}
        </div>
      </div>
      <div className="ga-cardValue">{value}</div>
      {subtitle ? <div className="ga-cardSub">{subtitle}</div> : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="ga-card ga-card-modern ga-skel">
      <div className="ga-skelLine sm" />
      <div className="ga-skelLine lg" />
      <div className="ga-skelLine md" />
    </div>
  );
}

function InsightCard({ label, value, hint, icon }) {
  return (
    <div className="ga-insight ga-insight-modern">
      <div className="ga-insightTop">
        <div className="ga-insightIcon" aria-hidden="true">
          {icon}
        </div>
        <div className="ga-insightLabel">{label}</div>
      </div>
      <div className="ga-insightValue">{value}</div>
      {hint ? <div className="ga-insightHint">{hint}</div> : null}
    </div>
  );
}

function StickyMiniBar({ days, reads, blocks, blockRate, paySuccess, onTop }) {
  return (
    <div className="ga-stickyBar">
      <div className="ga-stickyInner">
        <div className="ga-stickyLeft">
          <span className="ga-stickyTitle">Analytics</span>
          <span className="ga-stickyDot">•</span>
          <span className="ga-stickyMeta">Last {days}d</span>
        </div>

        <div className="ga-stickyStats">
          <span className="ga-stickyPill">Reads: <b>{fmtInt(reads)}</b></span>
          <span className="ga-stickyPill">Blocks: <b>{fmtInt(blocks)}</b></span>
          <span className="ga-stickyPill">Block rate: <b>{fmtPct(blockRate)}</b></span>
          <span className="ga-stickyPill">Payments: <b>{fmtMoney(paySuccess, "KES")}</b></span>
        </div>

        <button className="ga-stickyTop" onClick={onTop} type="button">
          Back to top ↑
        </button>
      </div>
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

  async function load() {
    setErr("");
    setLoading(true);

    try {
      const [ovRes, usageRes] = await Promise.all([
        api.get("/admin/dashboard/overview", {
          params: {
            fromUtc: range.fromUtc,
            toUtc: range.toUtc,
            expiringSoonDays: 14,
          },
        }),
        api.get("/admin/usage/summary", {
          params: {
            fromUtc: range.fromUtc,
            toUtc: range.toUtc,
          },
        }),
      ]);

      setOverview(ovRes.data);
      setUsage(usageRes.data);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
      setErr(friendlyApiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // =========================
  // Mappers
  // =========================
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

  // =========================
  // Quick Insights
  // =========================
  const quickInsights = useMemo(() => {
    const topDeny = deniesByReason?.[0];
    const topDoc = topDocs?.[0];
    const topInst = topInstitutions?.[0];

    const bestDay =
      (readsByDay || []).reduce((best, p) => (num(p.y) > num(best?.y) ? p : best), null) || null;

    return { topDeny, topDoc, topInst, bestDay };
  }, [deniesByReason, topDocs, topInstitutions, readsByDay]);

  // =========================
  // Numbers
  // =========================
  const currencyGuess = "KES";

  const institutionsTotal = num(overview?.institutions?.total);
  const institutionsActive = num(overview?.institutions?.active);
  const institutionsLocked = num(overview?.institutions?.lockedBySubscription);

  const subsActive = num(overview?.subscriptions?.activeNow);
  const subsExpSoon = num(overview?.subscriptions?.expiringSoon);
  const expDays = overview?.subscriptions?.expiringSoonDays ?? 14;

  const studentUsed = num(overview?.seats?.studentUsed);
  const staffUsed = num(overview?.seats?.staffUsed);
  const atCapacity = num(overview?.seats?.institutionsAtCapacity);
  const seatBlocked = num(overview?.seats?.institutionsSeatBlocked);

  const paySuccess = num(overview?.payments?.successAmount);
  const payTotalCount = num(overview?.payments?.totalCount);
  const payFailed = num(overview?.payments?.failedCount);
  const payInst = num(overview?.payments?.institutionAmount);
  const payInd = num(overview?.payments?.individualAmount);

  const reads = num(usage?.reads);
  const blocks = num(usage?.blocks);
  const blockRate = num(usage?.blockRate);

  return (
    <div className="ga-wrap ga-wrap-modern">
      {/* Sticky mini bar (UX) */}
      <StickyMiniBar
        days={days}
        reads={reads}
        blocks={blocks}
        blockRate={blockRate}
        paySuccess={paySuccess}
        onTop={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      />

      {/* Header */}
      <header className="ga-hero ga-hero-modern">
        <div className="ga-heroLeft">
          <div className="ga-titleRow">
            <h1 className="ga-title">Global Admin Dashboard</h1>
            <span className="ga-badge">Analytics</span>
          </div>

          <p className="ga-subtitle">
            Institutions, subscriptions, payments and access usage (last {days} days).
          </p>

          <div className="ga-controls ga-controls-modern">
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

            <button className="ga-refresh ga-refresh-modern" onClick={load} disabled={loading} type="button">
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            <div className="ga-updated">
              {lastUpdated ? (
                <>
                  Updated <b>{lastUpdated.toLocaleString()}</b>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>

          {err ? <div className="ga-error">{err}</div> : null}
        </div>

        <div className="ga-heroRight">
          <div className="ga-mini ga-mini-modern">
            <div className="ga-miniLabel">Access block rate</div>
            <div className="ga-miniValue ga-miniValue-red">{fmtPct(blockRate)}</div>
            <div className="ga-miniHint">
              {fmtInt(blocks)} blocks • {fmtInt(reads)} reads
            </div>
          </div>
        </div>
      </header>

      {/* Quick Insights */}
      <section className="ga-section">
        <div className="ga-sectionHead ga-sectionHead-modern">
          <h2 className="ga-h2">Quick Insights</h2>
        </div>

        <div className="ga-insightsRow ga-insightsRow-modern">
          <InsightCard
            icon="🛑"
            label="Most denied reason"
            value={loading ? "Loading…" : quickInsights.topDeny ? String(quickInsights.topDeny.key) : "—"}
            hint={
              loading
                ? ""
                : quickInsights.topDeny
                ? `${fmtInt(quickInsights.topDeny.value)} denies`
                : "No denies in this period"
            }
          />

          <InsightCard
            icon="📖"
            label="Most read document"
            value={loading ? "Loading…" : quickInsights.topDoc ? String(quickInsights.topDoc.key) : "—"}
            hint={
              loading
                ? ""
                : quickInsights.topDoc
                ? `${fmtInt(quickInsights.topDoc.value)} reads`
                : "No reads in this period"
            }
          />

          <InsightCard
            icon="🏫"
            label="Most active institution"
            value={loading ? "Loading…" : quickInsights.topInst ? String(quickInsights.topInst.key) : "—"}
            hint={
              loading
                ? ""
                : quickInsights.topInst
                ? `${fmtInt(quickInsights.topInst.value)} reads`
                : "No institution reads yet"
            }
          />

          <InsightCard
            icon="📈"
            label="Best day for reads"
            value={loading ? "Loading…" : quickInsights.bestDay ? quickInsights.bestDay.xLabel : "—"}
            hint={
              loading
                ? ""
                : quickInsights.bestDay
                ? `${fmtInt(quickInsights.bestDay.y)} reads`
                : "No daily data yet"
            }
          />
        </div>
      </section>

      {/* KPI cards */}
      <section className="ga-section">
        <div className="ga-sectionHead ga-sectionHead-modern">
          <h2 className="ga-h2">Key Metrics</h2>
        </div>

        <div className="ga-grid ga-grid-modern">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              <StatCard
                title="Institutions"
                icon="🏛️"
                value={fmtInt(institutionsTotal)}
                subtitle={`${fmtInt(institutionsActive)} active • ${fmtInt(institutionsLocked)} locked`}
              />

              <StatCard
                title="Subscriptions"
                icon="🧾"
                value={`${fmtInt(subsActive)} active`}
                subtitle={`${fmtInt(subsExpSoon)} expiring in ${expDays} days`}
              />

              <StatCard
                title="Seats"
                icon="👥"
                value={`${fmtInt(studentUsed)} students • ${fmtInt(staffUsed)} staff`}
                subtitle={`${fmtInt(atCapacity)} at capacity • ${fmtInt(seatBlocked)} seat-blocked`}
              />

              <StatCard
                title="Payments (Success)"
                icon="💳"
                tone="green"
                value={fmtMoney(paySuccess, currencyGuess)}
                subtitle={`${fmtInt(payTotalCount)} total • ${fmtInt(payFailed)} failed`}
              />

              <StatCard
                title="Usage"
                icon="📚"
                tone="red"
                value={`${fmtInt(reads)} reads`}
                subtitle={`${fmtInt(blocks)} blocks • ${fmtPct(blockRate)} block rate`}
              />

              <StatCard
                title="Payments Split"
                icon="⚖️"
                value={`${fmtMoney(payInst, currencyGuess)} institution`}
                subtitle={`${fmtMoney(payInd, currencyGuess)} individual`}
              />
            </>
          )}
        </div>
      </section>

      {/* Usage trends */}
      <section className="ga-section">
        <div className="ga-sectionHead ga-sectionHead-modern">
          <h2 className="ga-h2">Usage Trends</h2>
        </div>

        <div className="ga-row ga-row-modern">
          <LineChart title="Reads per day" points={readsByDay} />
          <LineChart title="Blocks per day" points={blocksByDay} />
        </div>
      </section>

      {/* Top Activity */}
      <section className="ga-section">
        <div className="ga-sectionHead ga-sectionHead-modern">
          <h2 className="ga-h2">Top Activity</h2>
        </div>

        <div className="ga-row ga-row-modern">
          <BarList
            title="Top documents by reads"
            items={topDocs}
            emptyText="No document reads found in this period."
            searchable
          />
          <BarList
            title="Top institutions by reads"
            items={topInstitutions}
            emptyText="No institution reads found in this period."
            searchable
          />
        </div>
      </section>

      {/* Breakdowns */}
      <section className="ga-section">
        <div className="ga-sectionHead ga-sectionHead-modern">
          <h2 className="ga-h2">Breakdowns</h2>
        </div>

        <div className="ga-row ga-row-modern">
          <BarList
            title="Payment amount by purpose (Success)"
            items={paymentsByPurpose}
            rightFormatter={(v) => fmtMoney(v, currencyGuess)}
            emptyText="No successful payments found in this period."
          />

          <BarList
            title="Top deny reasons"
            items={deniesByReason}
            emptyText="No deny events found in this period."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="ga-footer ga-footer-modern">
        <div className="ga-footerInner">
          <div className="ga-footerLeft">
            <div className="ga-footerBrand">LawAfrica Admin</div>
            <div className="ga-footerMeta">
              Data window: <strong>Last {days} days</strong> • Updated:{" "}
              <strong>{new Date().toLocaleString()}</strong>
            </div>
          </div>

          <div className="ga-footerRight">
            <button
              className="ga-footerLink"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              type="button"
            >
              Back to top ↑
            </button>
            <span className="ga-footerDot">•</span>
            <span className="ga-footerHint">Need help? Check server logs for detailed errors.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

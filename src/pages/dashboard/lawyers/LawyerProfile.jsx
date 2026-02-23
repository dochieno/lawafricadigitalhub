// src/pages/dashboard/lawyers/LawyerProfile.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createLawyerInquiry, getLawyer } from "../../../api/lawyers";
import "../../../styles/explore.css";

function formatErr(e) {
  return e?.response?.data?.message || e?.message || "Something went wrong. Please try again.";
}

function formatMoney(currency, n) {
  if (n == null || n === "") return null;
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  const cur = (currency || "").trim() || "KES";
  return `${cur} ${num.toLocaleString()}`;
}

function Badge({ children, kind = "neutral" }) {
  const cls =
    kind === "premium"
      ? "badge premium"
      : kind === "free"
      ? "badge free"
      : "badge";
  return <span className={cls}>{children}</span>;
}

export default function LawyerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [x, setX] = useState(null);

  const [summary, setSummary] = useState("");
  const [preferred, setPreferred] = useState("call");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setErr("");
      setLoading(true);
      try {
        const data = await getLawyer(id);
        if (!alive) return;
        setX(data);
      } catch (e) {
        if (!alive) return;
        setErr(formatErr(e));
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [id]);

  const serviceRows = useMemo(() => {
    const list = x?.serviceOfferings || [];
    if (!Array.isArray(list)) return [];
    return list.map((s) => {
      const min = formatMoney(s.currency, s.minFee);
      const max = formatMoney(s.currency, s.maxFee);
      const unit = (s.billingUnit || "").trim() || "—";
      const price = min && max ? `${min} – ${max}` : min ? `${min}` : max ? `${max}` : "Negotiable";
      return { ...s, price, unit };
    });
  }, [x]);

  async function send() {
    setSendErr("");
    const s = (summary ?? "").trim();
    if (!s) {
      setSendErr("Problem summary is required.");
      return;
    }

    setSending(true);
    try {
      const created = await createLawyerInquiry({
        lawyerProfileId: Number(id),
        problemSummary: s,
        preferredContactMethod: preferred,
      });

      const newId = created?.id;
      navigate(newId ? `/dashboard/lawyers/inquiries?open=${newId}` : "/dashboard/lawyers/inquiries");
    } catch (e) {
      setSendErr(formatErr(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="explore-container">
      <div className="explore-header">
        <div className="explore-titleRow">
          <div className="explore-brandTitle">
            <div className="explore-brandKicker">LawAfrica</div>
            <h1 className="explore-title">
              Lawyer <span className="explore-titleDot">•</span>{" "}
              <span className="explore-titleAccent">Profile</span>
            </h1>
            <p className="explore-subtitle">View lawyer details and send an inquiry.</p>
          </div>

          <div className="explore-headerActions" style={{ gap: 10 }}>
            <button
              className="explore-btn explore-btn-hotOutline"
              onClick={() => navigate("/dashboard/lawyers")}
              title="Back to Find a Lawyer"
            >
              ← Back
            </button>

            {/* ✅ Quick access to the workflow */}
            <button
              className="explore-btn"
              onClick={() => navigate("/dashboard/lawyers/inquiries")}
              title="View your inquiries"
            >
              My Inquiries
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="explore-loading">Loading…</div>
      ) : err ? (
        <div className="explore-error" style={{ marginTop: 14 }}>
          {err}
        </div>
      ) : !x ? (
        <div className="explore-empty" style={{ marginTop: 14 }}>
          Not found.
        </div>
      ) : (
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1.6fr 0.9fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* LEFT: Profile card */}
          <div
            className="explore-empty"
            style={{
              marginTop: 0,
              background: "#fff",
              borderRadius: 18,
              border: "1px solid rgba(15,23,42,0.10)",
              boxShadow: "0 10px 26px rgba(15,23,42,0.08)",
            }}
          >
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 18,
                  background: "rgba(15,23,42,0.06)",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {x.profileImageUrl ? (
                  <img
                    src={x.profileImageUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : null}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>{x.displayName}</h2>
                  {x.isVerified ? <Badge kind="premium">Verified</Badge> : <Badge>Unverified</Badge>}
                  {x.highestCourtName ? <Badge>{x.highestCourtName}</Badge> : null}
                </div>

                <div style={{ marginTop: 6, color: "rgba(15,23,42,0.70)", fontWeight: 700 }}>
                  {x.firmName ? x.firmName : "—"}
                </div>

                <div style={{ marginTop: 6, color: "rgba(15,23,42,0.62)", fontWeight: 650, fontSize: 12.5 }}>
                  {(x.primaryTownName || "—")} <span className="explore-titleDot">•</span>{" "}
                  {(x.countryName || "—")}
                </div>
              </div>
            </div>

            {/* About */}
            <div style={{ marginTop: 16 }}>
              <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                About
              </div>
              <div style={{ color: "rgba(15,23,42,0.78)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {x.bio ? x.bio : <span style={{ opacity: 0.75 }}>—</span>}
              </div>
            </div>

            {/* Practice areas */}
            <div style={{ marginTop: 16 }}>
              <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                Practice areas
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(x.practiceAreas || []).length ? (
                  x.practiceAreas.map((p) => (
                    <span key={p} className="explore-chip" style={{ cursor: "default" }}>
                      <span className="explore-chipText">{p}</span>
                    </span>
                  ))
                ) : (
                  <span style={{ opacity: 0.7 }}>—</span>
                )}
              </div>
            </div>

            {/* Services */}
            <div style={{ marginTop: 16 }}>
              <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                Services & Fees
              </div>
              {serviceRows.length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {serviceRows.map((s) => (
                    <div
                      key={s.lawyerServiceId}
                      style={{
                        border: "1px solid rgba(15,23,42,0.10)",
                        borderRadius: 14,
                        padding: 12,
                        background: "linear-gradient(135deg, rgba(107,35,59,0.04), rgba(255,255,255,0.95))",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{s.serviceName}</div>
                      <div style={{ marginTop: 4, color: "rgba(15,23,42,0.75)", fontWeight: 700, fontSize: 12.5 }}>
                        {s.price} <span style={{ opacity: 0.6 }}>•</span> {s.unit}
                      </div>
                      {s.notes ? (
                        <div style={{ marginTop: 6, color: "rgba(15,23,42,0.65)", fontSize: 12.5 }}>
                          {s.notes}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ opacity: 0.75 }}>No service pricing provided.</div>
              )}
            </div>

            {/* Towns served */}
            <div style={{ marginTop: 16 }}>
              <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                Towns served
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(x.townsServed || []).length ? (
                  x.townsServed.map((t) => (
                    <span key={t} className="explore-chip" style={{ cursor: "default" }}>
                      <span className="explore-chipText">{t}</span>
                    </span>
                  ))
                ) : (
                  <span style={{ opacity: 0.7 }}>—</span>
                )}
              </div>
            </div>

            {/* Address */}
            {x.googleFormattedAddress ? (
              <div style={{ marginTop: 16 }}>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                  Address
                </div>
                <div style={{ color: "rgba(15,23,42,0.78)" }}>{x.googleFormattedAddress}</div>
              </div>
            ) : null}
          </div>

          {/* RIGHT: Inquiry card (scroll-safe) */}
          <div style={{ position: "sticky", top: 92, alignSelf: "start" }}>
            <div
              style={{
                background: "#fff",
                borderRadius: 18,
                padding: 16,
                border: "1px solid rgba(15,23,42,0.10)",
                boxShadow: "0 10px 26px rgba(15,23,42,0.08)",
                maxHeight: "calc(100vh - 120px)",
                overflow: "auto",
              }}
            >
              <div className="explore-filterSectionTitle" style={{ marginBottom: 10 }}>
                Request help
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <div className="explore-hint" style={{ marginTop: 0 }}>Preferred contact method</div>
                <select className="explore-select" value={preferred} onChange={(e) => setPreferred(e.target.value)}>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
                <div className="explore-hint" style={{ marginTop: 0 }}>Problem summary</div>
                <textarea
                  className="explore-sidebarSearch"
                  style={{ minHeight: 160 }}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Explain your issue briefly…"
                />
              </label>

              {sendErr ? (
                <div style={{ color: "#b42318", marginTop: 10, fontWeight: 700 }}>
                  {sendErr}
                </div>
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                <button className="explore-cta-btn" onClick={send} disabled={sending} title="Send inquiry">
                  {sending ? "Sending…" : "Send inquiry"}
                </button>
              </div>

              <div className="explore-hint" style={{ marginTop: 12 }}>
                Your inquiry will appear under <b>My Inquiries</b>.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
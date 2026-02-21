// src/pages/dashboard/lawyers/LawyerProfile.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createLawyerInquiry, getLawyer } from "../../../api/lawyers";

function formatErr(e) {
  return (
    e?.response?.data?.message ||
    e?.message ||
    "Something went wrong. Please try again."
  );
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
    async function load() {
      setErr("");
      setLoading(true);
      try {
        const data = await getLawyer(id);
        setX(data);
      } catch (e) {
        setErr(formatErr(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function send() {
    setSendErr("");
    const s = (summary ?? "").trim();
    if (!s) {
      setSendErr("Problem summary is required.");
      return;
    }

    setSending(true);
    try {
      await createLawyerInquiry({
        lawyerProfileId: Number(id),
        problemSummary: s,
        preferredContactMethod: preferred,
      });
      navigate("/dashboard/lawyers/inquiries");
    } catch (e) {
      setSendErr(formatErr(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ padding: "18px 18px 26px" }}>
      <button className="modal-btn secondary" onClick={() => navigate("/dashboard/lawyers")}>
        ← Back to search
      </button>

      {loading ? (
        <div style={{ marginTop: 12, opacity: 0.7 }}>Loading…</div>
      ) : err ? (
        <div style={{ marginTop: 12, color: "#b42318" }}>{err}</div>
      ) : !x ? (
        <div style={{ marginTop: 12 }}>Not found.</div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.6fr 0.9fr", gap: 16 }}>
          {/* Left */}
          <div style={{ background: "white", borderRadius: 16, padding: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ width: 64, height: 64, borderRadius: 14, background: "#f3f4f6", overflow: "hidden" }}>
                {x.profileImageUrl ? (
                  <img src={x.profileImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : null}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <h2 style={{ margin: 0 }}>{x.displayName}</h2>
                  {x.isVerified ? (
                    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "rgba(46,125,87,0.12)", color: "#2E7D57" }}>
                      Verified
                    </span>
                  ) : null}
                </div>
                {x.firmName ? <div style={{ opacity: 0.8, marginTop: 4 }}>{x.firmName}</div> : null}
                <div style={{ opacity: 0.75, marginTop: 6 }}>
                  {(x.primaryTownName || "—")} • {(x.countryName || "—")}
                </div>
                {x.highestCourtName ? (
                  <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
                    Highest court: <b>{x.highestCourtName}</b>
                  </div>
                ) : null}
              </div>
            </div>

            {x.bio ? (
              <div style={{ marginTop: 14 }}>
                <h3 style={{ margin: "0 0 8px" }}>About</h3>
                <div style={{ opacity: 0.85, lineHeight: 1.5 }}>{x.bio}</div>
              </div>
            ) : null}

            <div style={{ marginTop: 14 }}>
              <h3 style={{ margin: "0 0 8px" }}>Practice areas</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(x.practiceAreas || []).length ? (
                  x.practiceAreas.map((p) => (
                    <span key={p} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 999, background: "#f3f4f6" }}>
                      {p}
                    </span>
                  ))
                ) : (
                  <span style={{ opacity: 0.7 }}>—</span>
                )}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <h3 style={{ margin: "0 0 8px" }}>Towns served</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(x.townsServed || []).length ? (
                  x.townsServed.map((t) => (
                    <span key={t} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 999, background: "#f3f4f6" }}>
                      {t}
                    </span>
                  ))
                ) : (
                  <span style={{ opacity: 0.7 }}>—</span>
                )}
              </div>
            </div>

            {x.googleFormattedAddress ? (
              <div style={{ marginTop: 14 }}>
                <h3 style={{ margin: "0 0 8px" }}>Address</h3>
                <div style={{ opacity: 0.85 }}>{x.googleFormattedAddress}</div>
              </div>
            ) : null}
          </div>

          {/* Right */}
          <div style={{ position: "sticky", top: 92, alignSelf: "start" }}>
            <div style={{ background: "white", borderRadius: 16, padding: 16, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}>
              <h3 style={{ marginTop: 0 }}>Request help</h3>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Preferred contact method</div>
                <select className="la-input" style={{ height: 42 }} value={preferred} onChange={(e) => setPreferred(e.target.value)}>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Problem summary</div>
                <textarea
                  className="la-input"
                  style={{ minHeight: 140, paddingTop: 10 }}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Explain your issue briefly…"
                />
              </label>

              {sendErr ? <div style={{ color: "#b42318", marginTop: 10 }}>{sendErr}</div> : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                <button className="modal-btn" onClick={send} disabled={sending}>
                  {sending ? "Sending..." : "Send inquiry"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
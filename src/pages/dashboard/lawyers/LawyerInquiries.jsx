// src/pages/dashboard/lawyers/LawyerInquiries.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLawyerInquiriesForMe, getMyLawyerInquiries } from "../../../api/lawyers";

function formatErr(e) {
  return (
    e?.response?.data?.message ||
    e?.message ||
    "Something went wrong. Please try again."
  );
}

function Pill({ children }) {
  return (
    <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "#f3f4f6" }}>
      {children}
    </span>
  );
}

export default function LawyerInquiries() {
  const navigate = useNavigate();

  const [tab, setTab] = useState("mine"); // mine | forMe
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res =
        tab === "mine"
          ? await getMyLawyerInquiries({ take: 60, skip: 0 })
          : await getLawyerInquiriesForMe({ take: 60, skip: 0 });

      setItems(res?.items ?? []);
    } catch (e) {
      setErr(formatErr(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div style={{ padding: "18px 18px 26px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Inquiries</h2>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Manage requests sent to lawyers and requests sent to you (if you’re a lawyer).
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="modal-btn secondary" onClick={() => navigate("/dashboard/lawyers")}>
            ← Back
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button
          className={`modal-btn ${tab === "mine" ? "" : "secondary"}`}
          onClick={() => setTab("mine")}
        >
          My inquiries
        </button>

        <button
          className={`modal-btn ${tab === "forMe" ? "" : "secondary"}`}
          onClick={() => setTab("forMe")}
          title="Shows inquiries addressed to your lawyer profile (if you have one)"
        >
          For me (lawyer inbox)
        </button>

        <button className="modal-btn secondary" onClick={load}>
          Refresh
        </button>
      </div>

      {err ? <div style={{ marginTop: 12, color: "#b42318" }}>{err}</div> : null}

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <div style={{ opacity: 0.7 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No inquiries found.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((x) => (
              <div
                key={x.id}
                style={{
                  background: "white",
                  borderRadius: 16,
                  padding: 14,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Pill>Status: {x.status}</Pill>
                    {x.practiceAreaName ? <Pill>{x.practiceAreaName}</Pill> : null}
                    {x.townName ? <Pill>{x.townName}</Pill> : null}
                    {x.lawyerProfileId ? <Pill>To lawyer #{x.lawyerProfileId}</Pill> : <Pill>General</Pill>}
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 13 }}>
                    {x.createdAt ? new Date(x.createdAt).toLocaleString() : ""}
                  </div>
                </div>

                <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {x.problemSummary}
                </div>

                {/* Lawyer inbox shows requester details */}
                {tab === "forMe" ? (
                  <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>
                    <div><b>Requester:</b> {x.requesterName || `User #${x.requesterUserId}`}</div>
                    {x.requesterPhone ? <div><b>Phone:</b> {x.requesterPhone}</div> : null}
                    {x.requesterEmail ? <div><b>Email:</b> {x.requesterEmail}</div> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
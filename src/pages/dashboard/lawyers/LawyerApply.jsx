// src/pages/dashboard/lawyers/LawyerApply.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMyLawyerProfile,
  upsertMyLawyerProfile,
  lookupPracticeAreas,
  lookupTowns,
  lookupCourts,
} from "../../../api/lawyers";

import "../../../styles/explore.css";
import "../../../styles/lawyersDropdown.css";

function formatErr(e) {
  return e?.response?.data?.message || e?.message || "Something went wrong.";
}

function uniqById(list) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    if (!x || !x.id) continue;
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

function LookupDropdown({ label, disabled, value, onChange, fetcher, placeholder }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onPointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  async function load(searchText) {
    if (!fetcher) return;
    setLoading(true);
    try {
      const res = await fetcher({ q: searchText });
      setItems(Array.isArray(res) ? res : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load(q.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(q.trim()), 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  return (
    <div className="lw-popWrap" ref={wrapRef}>
      <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>{label}</div>

      <button
        type="button"
        className="lw-popBtn"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
      >
        {value?.name ? <span className="lw-popValue">{value.name}</span> : <span className="lw-popHint">{disabled ? "Select country first" : "Select..."}</span>}
      </button>

      {open ? (
        <div className="lw-popPanel">
          <div className="lw-popTopRow">
            <input
              className="explore-miniSearch"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder || "Type to search..."}
              autoFocus
            />
            <button type="button" className="lw-popClear" onClick={() => { onChange(null); setOpen(false); }}>
              Clear
            </button>
          </div>

          <div className="explore-checkList" style={{ maxHeight: 260 }}>
            {loading ? (
              <div className="lw-popEmpty">Loading…</div>
            ) : items.length === 0 ? (
              <div className="lw-popEmpty">No results.</div>
            ) : (
              items.map((it) => (
                <label
                  key={it.id}
                  className="explore-check"
                  onClick={() => { onChange({ id: it.id, name: it.name, postCode: it.postCode, code: it.code }); setOpen(false); }}
                >
                  <input type="radio" checked={value?.id === it.id} readOnly />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span>{it.name}</span>
                    {it.postCode ? <span style={{ opacity: 0.65 }}>{it.postCode}</span> : null}
                    {it.code ? <span style={{ opacity: 0.65 }}>{it.code}</span> : null}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function LawyerApply() {
  const navigate = useNavigate();

  // Countries seeded
  const countryOptions = useMemo(() => ([
    { id: 1, name: "Kenya" },
    { id: 2, name: "Uganda" },
    { id: 3, name: "Tanzania" },
    { id: 4, name: "Rwanda" },
    { id: 5, name: "South Africa" },
  ]), []);

  const [country, setCountry] = useState(countryOptions[0]);
  const [primaryTown, setPrimaryTown] = useState(null);
  const [highestCourt, setHighestCourt] = useState(null);

  const [displayName, setDisplayName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [bio, setBio] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [publicEmail, setPublicEmail] = useState("");

  const [townsServed, setTownsServed] = useState([]);       // [{id,name}]
  const [practiceAreas, setPracticeAreas] = useState([]);   // [{id,name}]
  const [pickTown, setPickTown] = useState(null);
  const [pickArea, setPickArea] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);

useEffect(() => {
  let alive = true;

  async function load() {
    setErr("");
    setLoading(true);

    try {
      const me = await getMyLawyerProfile();
      if (!alive) return;

      if (me) {
        setDisplayName(me.displayName || "");
        setFirmName(me.firmName || "");
        setBio(me.bio || "");
        setPrimaryPhone(me.primaryPhone || "");
        setPublicEmail(me.publicEmail || "");

        const cid = me.countryId || 1;
        setCountry(countryOptions.find((c) => c.id === cid) || countryOptions[0]);

        if (me.primaryTownId)
          setPrimaryTown({ id: me.primaryTownId, name: me.primaryTownName || `Town #${me.primaryTownId}` });

        if (me.highestCourtAllowedId)
          setHighestCourt({ id: me.highestCourtAllowedId, name: me.highestCourtAllowedName || `Court #${me.highestCourtAllowedId}` });

        if (Array.isArray(me.townIdsServed))
          setTownsServed(me.townIdsServed.map((id) => ({ id, name: `Town #${id}` })));

        if (Array.isArray(me.practiceAreaIds))
          setPracticeAreas(me.practiceAreaIds.map((id) => ({ id, name: `Area #${id}` })));
      }
    } catch (e) {
      if (alive) setErr(formatErr(e));
    } finally {
      if (alive) setLoading(false);
    }
  }

  load();
  return () => {
    alive = false;
  };
}, [countryOptions]);

  // When user selects a town to add
  useEffect(() => {
    if (!pickTown) return;
    setTownsServed((cur) => uniqById([...cur, pickTown]));
    setPickTown(null);
  }, [pickTown]);

  // When user selects a practice area to add
  useEffect(() => {
    if (!pickArea) return;
    setPracticeAreas((cur) => uniqById([...cur, pickArea]));
    setPickArea(null);
  }, [pickArea]);

  function removeTown(id) {
    setTownsServed((cur) => cur.filter(x => x.id !== id));
  }
  function removeArea(id) {
    setPracticeAreas((cur) => cur.filter(x => x.id !== id));
  }

  async function save() {
    setErr("");
    setToast(null);

    if (!displayName.trim()) {
      setErr("Display name is required.");
      return;
    }
    if (!primaryTown?.id) {
      setErr("Primary town is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        displayName: displayName.trim(),
        firmName: firmName.trim() || null,
        bio: bio.trim() || null,
        primaryPhone: primaryPhone.trim() || null,
        publicEmail: publicEmail.trim() || null,

        primaryTownId: primaryTown.id,
        highestCourtAllowedId: highestCourt?.id ?? null,

        townIdsServed: uniqById([...(townsServed || []), primaryTown]).map(x => x.id),
        practiceAreaIds: uniqById(practiceAreas || []).map(x => x.id),
      };

      const res = await upsertMyLawyerProfile(payload);
      setToast({ kind: "success", text: res?.message || "Submitted successfully." });

      // Optional: go back to directory after a moment
      setTimeout(() => navigate("/dashboard/lawyers"), 700);
    } catch (e) {
      setErr(formatErr(e));
      setToast({ kind: "error", text: formatErr(e) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="explore-loading">Loading…</div>;

  return (
    <div className="explore-container">
      {toast ? (
        <div className={`toast ${toast.kind === "success" ? "toast-success" : "toast-error"}`}>
          {toast.text}
        </div>
      ) : null}

      <div className="explore-shell">
        {/* Sidebar */}
        <div className="explore-shellLeft">
          <aside className="explore-sidebar">
            <div className="explore-sidebarTop">
              <div className="explore-sidebarTitleRow">
                <div>
                  <div className="explore-sidebarTitle">Apply</div>
                  <div className="explore-sidebarSub">Become a lawyer on LawAfrica</div>
                </div>
                <button className="explore-linkBtn" onClick={() => navigate("/dashboard/lawyers")}>
                  Back
                </button>
              </div>
            </div>

            <div className="explore-sidebarBody">
              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>Country</div>
                <select
                  className="explore-select"
                  value={country.id}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const c = countryOptions.find(x => x.id === id) || countryOptions[0];
                    setCountry(c);
                    setPrimaryTown(null);
                    setHighestCourt(null);
                    setTownsServed([]);
                  }}
                >
                  {countryOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="explore-hint">Used to filter towns and courts.</div>
              </div>

              <div className="explore-filterSection">
                <LookupDropdown
                  label="Primary town"
                  value={primaryTown}
                  onChange={setPrimaryTown}
                  disabled={!country?.id}
                  fetcher={({ q }) => lookupTowns({ countryId: country.id, q })}
                  placeholder="Type town name or post code…"
                />
                <div className="explore-hint">Required. Must match selected country.</div>
              </div>

              <div className="explore-filterSection">
                <LookupDropdown
                  label="Highest court allowed"
                  value={highestCourt}
                  onChange={setHighestCourt}
                  disabled={!country?.id}
                  fetcher={({ q }) => lookupCourts({ countryId: country.id, q })}
                  placeholder="Type court name or code…"
                />
              </div>

              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>Add towns served</div>
                <LookupDropdown
                  label=""
                  value={pickTown}
                  onChange={setPickTown}
                  disabled={!country?.id}
                  fetcher={({ q }) => lookupTowns({ countryId: country.id, q })}
                  placeholder="Search and add town…"
                />
                <div className="explore-checkList" style={{ marginTop: 10 }}>
                  {townsServed.length === 0 ? (
                    <div className="explore-muted">No towns added yet.</div>
                  ) : townsServed.map(t => (
                    <div key={t.id} className="explore-check">
                      <input type="checkbox" checked readOnly />
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span>{t.name}</span>
                        <button className="explore-linkBtn" onClick={() => removeTown(t.id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>Add practice areas</div>
                <LookupDropdown
                  label=""
                  value={pickArea}
                  onChange={setPickArea}
                  disabled={false}
                  fetcher={({ q }) => lookupPracticeAreas({ q })}
                  placeholder="Search and add area…"
                />
                <div className="explore-checkList" style={{ marginTop: 10 }}>
                  {practiceAreas.length === 0 ? (
                    <div className="explore-muted">No practice areas added yet.</div>
                  ) : practiceAreas.map(a => (
                    <div key={a.id} className="explore-check">
                      <input type="checkbox" checked readOnly />
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span>{a.name}</span>
                        <button className="explore-linkBtn" onClick={() => removeArea(a.id)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="explore-filterSection">
                <div className="explore-drawerActions" style={{ marginTop: 0 }}>
                  <button className="explore-cta-btn" onClick={save} disabled={saving}>
                    {saving ? "Submitting…" : "Submit application"}
                  </button>
                  <button className="explore-btn explore-btn-hotOutline" onClick={() => navigate("/dashboard/lawyers")}>
                    Cancel
                  </button>
                </div>

                {err ? <div className="explore-error" style={{ marginTop: 12 }}>{err}</div> : null}
              </div>
            </div>
          </aside>
        </div>

        {/* Main form */}
        <section>
          <div className="explore-header">
            <div className="explore-titleRow">
              <div className="explore-brandTitle">
                <div className="explore-brandKicker">LawAfrica</div>
                <h1 className="explore-title">
                  Apply to be a <span className="explore-titleAccent">Lawyer</span>
                </h1>
                <p className="explore-subtitle">
                  Fill in your profile. Your application will be marked <b>Pending</b> until verified.
                </p>
              </div>
            </div>

            <div className="explore-chipsRow">
              <div className="explore-chips">
                <span className="explore-chip"><span className="explore-chipText">Country: {country.name}</span></span>
                {primaryTown?.name ? <span className="explore-chip"><span className="explore-chipText">Primary: {primaryTown.name}</span></span> : null}
                {highestCourt?.name ? <span className="explore-chip"><span className="explore-chipText">Court: {highestCourt.name}</span></span> : null}
              </div>
            </div>
          </div>

          <div className="explore-empty" style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Display name</div>
                <input className="explore-sidebarSearch" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g., Jane Doe" />
              </div>

              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Firm name (optional)</div>
                <input className="explore-sidebarSearch" value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="e.g., Doe & Co Advocates" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Phone (optional)</div>
                  <input className="explore-sidebarSearch" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} placeholder="+254..." />
                </div>
                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Public email (optional)</div>
                  <input className="explore-sidebarSearch" value={publicEmail} onChange={(e) => setPublicEmail(e.target.value)} placeholder="email@example.com" />
                </div>
              </div>

              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Bio (optional)</div>
                <textarea
                  className="explore-sidebarSearch"
                  style={{ minHeight: 140 }}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Brief professional bio…"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
// src/pages/dashboard/lawyers/LawyerApply.jsx
import { useEffect,useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";

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

function normalizeCountry(c) {
  const id = c?.id ?? c?.Id ?? 0;
  const name = c?.name ?? c?.Name ?? "";
  return { id: Number(id), name: String(name || "") };
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

function SmallIcon({ children }) {
  return (
    <span style={{ display: "inline-flex", width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
      {children}
    </span>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path
        d="M12 2 20 6v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function IconSave() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path d="M5 4h12l2 2v14H5V4Z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 4v6h8V4" stroke="currentColor" strokeWidth="2" />
      <path d="M8 20v-6h8v6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Explore-style searchable dropdown:
 * - button shows selected
 * - panel has mini search + list
 */
function LookupDropdown({ label, disabled, value, onChange, fetcher, placeholder }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
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
    setErr("");
    setLoading(true);
    try {
      const res = await fetcher({ q: searchText });
      setItems(Array.isArray(res) ? res : []);
    } catch (e) {
      setErr(formatErr(e));
      setItems([]);
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
      {label ? <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>{label}</div> : null}

      <button
        type="button"
        className="lw-popBtn"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        {value?.name ? (
          <span className="lw-popValue">{value.name}</span>
        ) : (
          <span className="lw-popHint">{disabled ? "Select country first" : "Select..."}</span>
        )}
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
            <button
              type="button"
              className="lw-popClear"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </button>
          </div>

          {err ? <div className="explore-error" style={{ padding: 10 }}>{err}</div> : null}

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
                  onClick={() => {
                    onChange({ id: it.id, name: it.name, postCode: it.postCode, code: it.code });
                    setOpen(false);
                  }}
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
  const { user } = useAuth();

  // Countries from backend /api/country
  const [countryOptions, setCountryOptions] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesErr, setCountriesErr] = useState("");

  const [country, setCountry] = useState(null);

  // Primary selectors
  const [primaryTown, setPrimaryTown] = useState(null);
  const [highestCourt, setHighestCourt] = useState(null);

  // Profile fields (prefill from User)
  const [displayName, setDisplayName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [bio, setBio] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [publicEmail, setPublicEmail] = useState("");

  // Location fields (new)
  const [googleFormattedAddress, setGoogleFormattedAddress] = useState("");
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  // Multi lists
  const [townsServed, setTownsServed] = useState([]);       // [{id,name}]
  const [practiceAreas, setPracticeAreas] = useState([]);   // [{id,name}]
  const [pickTown, setPickTown] = useState(null);
  const [pickArea, setPickArea] = useState(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);

  // Load countries
  useEffect(() => {
    let alive = true;

    async function loadCountries() {
      setCountriesErr("");
      setCountriesLoading(true);
      try {
        const res = await api.get("/country"); // ✅ your controller
        const raw = Array.isArray(res.data) ? res.data : [];
        const list = raw.map(normalizeCountry).filter((x) => x.id > 0 && x.name);
        list.sort((a, b) => a.name.localeCompare(b.name));

        if (alive) {
          setCountryOptions(list);
          // default Kenya if exists
          const kenya = list.find((x) => x.name.toLowerCase() === "kenya");
          setCountry((cur) => cur ?? kenya ?? list[0] ?? null);
        }
      } catch (e) {
        if (alive) setCountriesErr(formatErr(e));
      } finally {
        if (alive) setCountriesLoading(false);
      }
    }

    loadCountries();
    return () => { alive = false; };
  }, []);

  // Load existing lawyer profile (if any) + prefill from user if none
  useEffect(() => {
    let alive = true;

    async function loadMe() {
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

          setGoogleFormattedAddress(me.googleFormattedAddress || "");
          setGooglePlaceId(me.googlePlaceId || "");
          setLatitude(me.latitude != null ? String(me.latitude) : "");
          setLongitude(me.longitude != null ? String(me.longitude) : "");

          // Country from primaryTown countryId (if controller returns it)
          const cid = me.countryId || null;
          if (cid && countryOptions.length) {
            const c = countryOptions.find((x) => x.id === cid);
            if (c) setCountry(c);
          }

          if (me.primaryTownId)
            setPrimaryTown({ id: me.primaryTownId, name: me.primaryTownName || `Town #${me.primaryTownId}` });

          if (me.highestCourtAllowedId)
            setHighestCourt({ id: me.highestCourtAllowedId, name: me.highestCourtAllowedName || `Court #${me.highestCourtAllowedId}` });

          // IDs only; show placeholders until user re-picks
          if (Array.isArray(me.townIdsServed))
            setTownsServed(me.townIdsServed.map((id) => ({ id, name: `Town #${id}` })));

          if (Array.isArray(me.practiceAreaIds))
            setPracticeAreas(me.practiceAreaIds.map((id) => ({ id, name: `Area #${id}` })));
        } else {
          // ✅ Prefill from user table (editable)
          const fn = (user?.firstName || user?.FirstName || "").trim();
          const ln = (user?.lastName || user?.LastName || "").trim();
          const full = `${fn} ${ln}`.trim();

          setDisplayName((cur) => (cur && cur.trim() ? cur : (full || user?.name || "")));
          setPublicEmail((cur) => (cur && cur.trim() ? cur : (user?.email || "")));
          setPrimaryPhone((cur) => (cur && cur.trim() ? cur : (user?.phoneNumber || user?.PhoneNumber || "")));
        }
      } catch (e) {
        if (alive) setErr(formatErr(e));
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadMe();
    return () => { alive = false; };
  }, [user, countryOptions]);

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
    setTownsServed((cur) => cur.filter((x) => x.id !== id));
  }
  function removeArea(id) {
    setPracticeAreas((cur) => cur.filter((x) => x.id !== id));
  }

  // Buttons: compact premium
  const compactBtn = {
    padding: "8px 10px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 850,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };

  async function save() {
    setErr("");
    setToast(null);

    if (!displayName.trim()) {
      setErr("Display name is required.");
      return;
    }
    if (!country?.id) {
      setErr("Country is required.");
      return;
    }
    if (!primaryTown?.id) {
      setErr("Primary town is required.");
      return;
    }

    const lat = latitude.trim();
    const lng = longitude.trim();
    if ((lat && !Number.isFinite(Number(lat))) || (lng && !Number.isFinite(Number(lng)))) {
      setErr("Latitude/Longitude must be numeric (or leave them blank).");
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

        // Location fields
        googleFormattedAddress: googleFormattedAddress.trim() || null,
        googlePlaceId: googlePlaceId.trim() || null,
        latitude: lat ? Number(lat) : null,
        longitude: lng ? Number(lng) : null,

        // Ensure primary town is included
        townIdsServed: uniqById([...(townsServed || []), primaryTown]).map((x) => x.id),
        practiceAreaIds: uniqById(practiceAreas || []).map((x) => x.id),
      };

      const res = await upsertMyLawyerProfile(payload);

      setToast({ kind: "success", text: res?.message || "Submitted successfully." });

      setTimeout(() => navigate("/dashboard/lawyers"), 700);
    } catch (e) {
      const m = formatErr(e);
      setErr(m);
      setToast({ kind: "error", text: m });
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

                <button
                  className="explore-linkBtn"
                  onClick={() => navigate("/dashboard/lawyers")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <IconBack /> Back
                </button>
              </div>
            </div>

            <div className="explore-sidebarBody">
              {/* Country */}
              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>Country</div>

                {countriesLoading ? (
                  <div className="explore-muted">Loading countries…</div>
                ) : countriesErr ? (
                  <div className="explore-error">{countriesErr}</div>
                ) : (
                  <select
                    className="explore-select"
                    value={country?.id ?? ""}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      const c = countryOptions.find((x) => x.id === id) || null;
                      setCountry(c);

                      // Reset dependent fields
                      setPrimaryTown(null);
                      setHighestCourt(null);
                      setTownsServed([]);
                    }}
                  >
                    {countryOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}

                <div className="explore-hint">Used to filter towns and courts.</div>
              </div>

              {/* Primary town */}
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

              {/* Court */}
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

              {/* Towns served */}
              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                  Towns served <span style={{ opacity: 0.6 }}>(optional)</span>
                </div>

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
                  ) : (
                    townsServed.map((t) => (
                      <div key={t.id} className="explore-check">
                        <input type="checkbox" checked readOnly />
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span>{t.name}</span>
                          <button className="explore-linkBtn" onClick={() => removeTown(t.id)}>Remove</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Practice areas */}
              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                  Areas of expertise <span style={{ opacity: 0.6 }}>(Practice Areas)</span>
                </div>

                <LookupDropdown
                  label=""
                  value={pickArea}
                  onChange={setPickArea}
                  disabled={false}
                  fetcher={({ q }) => lookupPracticeAreas({ q })}
                  placeholder="Search and add practice area…"
                />

                <div className="explore-checkList" style={{ marginTop: 10 }}>
                  {practiceAreas.length === 0 ? (
                    <div className="explore-muted">No practice areas added yet.</div>
                  ) : (
                    practiceAreas.map((a) => (
                      <div key={a.id} className="explore-check">
                        <input type="checkbox" checked readOnly />
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span>{a.name}</span>
                          <button className="explore-linkBtn" onClick={() => removeArea(a.id)}>Remove</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Services + Rate cards (MVP note) */}
              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle">Services & Rate cards</div>
                <div className="explore-hint">
                  Next step: define services (e.g. consultation, drafting, litigation) and add estimated fees per service.
                  We’ll add this once the backend model is added (so it can persist).
                </div>
              </div>

              {/* Actions */}
              <div className="explore-filterSection">
                <div className="explore-drawerActions" style={{ marginTop: 0 }}>
                  <button
                    className="explore-cta-btn"
                    onClick={save}
                    disabled={saving}
                    style={compactBtn}
                    title="Submit application"
                  >
                    <SmallIcon><IconShield /></SmallIcon>
                    {saving ? "Submitting…" : "Submit application"}
                  </button>

                  <button
                    className="explore-btn explore-btn-hotOutline"
                    onClick={() => navigate("/dashboard/lawyers")}
                    style={compactBtn}
                    type="button"
                  >
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
                  Your application will be marked <b>Pending</b> until verified.
                </p>
              </div>
            </div>

            <div className="explore-chipsRow">
              <div className="explore-chips">
                <span className="explore-chip"><span className="explore-chipText">Country: {country?.name || "—"}</span></span>
                {primaryTown?.name ? <span className="explore-chip"><span className="explore-chipText">Primary: {primaryTown.name}</span></span> : null}
                {highestCourt?.name ? <span className="explore-chip"><span className="explore-chipText">Court: {highestCourt.name}</span></span> : null}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="explore-btn explore-btn-hotOutline"
                  onClick={() => navigate("/dashboard/lawyers")}
                  style={compactBtn}
                >
                  <SmallIcon><IconBack /></SmallIcon>
                  Back
                </button>

                <button
                  className="explore-cta-btn"
                  onClick={save}
                  disabled={saving}
                  style={compactBtn}
                >
                  <SmallIcon><IconSave /></SmallIcon>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>

          <div className="explore-empty" style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Display name</div>
                <input
                  className="explore-sidebarSearch"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g., Jane Doe"
                />
                <div className="explore-hint">
                  Default is your account name, but you can change how clients address you (e.g., “Snr. Counsel …”).
                </div>
              </div>

              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Firm name (optional)</div>
                <input
                  className="explore-sidebarSearch"
                  value={firmName}
                  onChange={(e) => setFirmName(e.target.value)}
                  placeholder="e.g., Doe & Co Advocates"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Phone (optional)</div>
                  <input
                    className="explore-sidebarSearch"
                    value={primaryPhone}
                    onChange={(e) => setPrimaryPhone(e.target.value)}
                    placeholder="+254..."
                  />
                </div>
                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Public email (optional)</div>
                  <input
                    className="explore-sidebarSearch"
                    value={publicEmail}
                    onChange={(e) => setPublicEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              {/* Location */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr", gap: 12 }}>
                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Location / Address (optional)</div>
                  <input
                    className="explore-sidebarSearch"
                    value={googleFormattedAddress}
                    onChange={(e) => setGoogleFormattedAddress(e.target.value)}
                    placeholder="e.g., ABC Building, 3rd Floor, Nairobi"
                  />
                  <div className="explore-hint">Shown publicly on your lawyer profile.</div>
                </div>

                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Latitude</div>
                  <input
                    className="explore-sidebarSearch"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="-1.2864"
                  />
                </div>

                <div>
                  <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Longitude</div>
                  <input
                    className="explore-sidebarSearch"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="36.8172"
                  />
                </div>
              </div>

              <div>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>Google Place Id (optional)</div>
                <input
                  className="explore-sidebarSearch"
                  value={googlePlaceId}
                  onChange={(e) => setGooglePlaceId(e.target.value)}
                  placeholder="Paste your Google Place ID (optional)"
                />
              </div>

              {/* Bio */}
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

              {/* Expertise reminder */}
              <div style={{ marginTop: 2 }}>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>
                  Expertise & towns served
                </div>
                <div className="explore-hint">
                  Use the sidebar to add your <b>areas of expertise</b> and <b>towns served</b>.
                </div>
              </div>

              {/* Services + Rate cards - placeholder */}
              <div style={{ marginTop: 2 }}>
                <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>
                  Services & estimated fees (next)
                </div>
                <div className="explore-hint">
                  We can add a “Rate Card” section once we define the backend model:
                  e.g. Consultation fee, Hourly rate, and per-service pricing.
                </div>
                <button
                  className="explore-btn explore-btn-hotOutline"
                  type="button"
                  style={compactBtn}
                  onClick={() => setToast({ kind: "success", text: "Next: we’ll add services & rate cards once backend fields are ready." })}
                >
                  <SmallIcon><IconPlus /></SmallIcon>
                  Add services (coming next)
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
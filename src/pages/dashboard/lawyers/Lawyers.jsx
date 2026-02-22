// src/pages/dashboard/lawyers/Lawyers.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../../api/client";
import {
  createLawyerInquiry,
  searchLawyers,
  lookupPracticeAreas,
  lookupTowns,
  lookupCourts,
  getMyLawyerProfile,
} from "../../../api/lawyers";

import "../../../styles/explore.css";          // ✅ reuse Explore premium filter styles
import "../../../styles/lawyersDropdown.css"; // ✅ dropdown popover polish

function formatErr(e) {
  return e?.response?.data?.message || e?.message || "Something went wrong. Please try again.";
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="modal-btn secondary" onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Explore-style searchable dropdown:
 * - button shows selected
 * - panel has mini search + list
 */
function LookupDropdown({
  label,
  placeholder = "Type to search...",
  disabled = false,
  value,
  onChange,
  fetcher, // async ({ q }) => [{id, name}]
  hint,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  const wrapRef = useRef(null);

  useEffect(() => {
    function onPointerDown(e) {
      const inside = wrapRef.current && wrapRef.current.contains(e.target);
      if (!inside) setOpen(false);
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

  const selectedText = value?.name || "";

  return (
    <div className="lw-popWrap" ref={wrapRef}>
      <div className="explore-filterSectionTitle" style={{ marginBottom: 6 }}>{label}</div>

      <button
        type="button"
        className="lw-popBtn"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-expanded={open}
      >
        {selectedText ? (
          <span className="lw-popValue">{selectedText}</span>
        ) : (
          <span className="lw-popHint">{disabled ? "Select country first" : "Select..."}</span>
        )}
        {hint ? <span className="lw-popHint">{hint}</span> : null}
      </button>

      {open ? (
        <div className="lw-popPanel">
          <div className="lw-popTopRow">
            <input
              className="explore-miniSearch"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
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
                    onChange({ id: it.id, name: it.name, code: it.code, postCode: it.postCode });
                    setOpen(false);
                  }}
                >
                  <input type="radio" checked={value?.id === it.id} readOnly />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span>{it.name}</span>
                    {it.code ? <span style={{ opacity: 0.65 }}>{it.code}</span> : null}
                    {it.postCode ? <span style={{ opacity: 0.65 }}>{it.postCode}</span> : null}
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

function normalizeCountry(c) {
  // supports {id,name} or {Id,Name}
  const id = c?.id ?? c?.Id ?? 0;
  const name = c?.name ?? c?.Name ?? "";
  return { id: Number(id), name: String(name || "") };
}

export default function Lawyers() {
  const navigate = useNavigate();

  // Sidebar search
  const [q, setQ] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(true);

  // Countries from backend
  const [countryOptions, setCountryOptions] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesErr, setCountriesErr] = useState("");

  // Dropdown selections (store objects)
  const [country, setCountry] = useState(null); // ✅ now from API
  const [town, setTown] = useState(null);
  const [practiceArea, setPracticeArea] = useState(null);
  const [court, setCourt] = useState(null);

  // Me lawyer status
  const [meLawyer, setMeLawyer] = useState(null);
  const [meLawyerLoading, setMeLawyerLoading] = useState(true);

  // Results
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  // Inquiry modal
  const [inqOpen, setInqOpen] = useState(false);
  const [inqLawyer, setInqLawyer] = useState(null);
  const [inqSummary, setInqSummary] = useState("");
  const [inqPreferred, setInqPreferred] = useState("call");
  const [inqSubmitting, setInqSubmitting] = useState(false);
  const [inqError, setInqError] = useState("");

  // Load countries from /api/country (your controller)
  useEffect(() => {
    let alive = true;

    async function loadCountries() {
      setCountriesErr("");
      setCountriesLoading(true);
      try {
        const res = await api.get("/country");
        const raw = Array.isArray(res.data) ? res.data : [];
        const list = raw.map(normalizeCountry).filter((x) => x.id > 0 && x.name);
        list.sort((a, b) => a.name.localeCompare(b.name));
        if (alive) {
          setCountryOptions(list);

          // Default to Kenya if present, else first country
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
    return () => {
      alive = false;
    };
  }, []);

  // Load me lawyer profile status
  useEffect(() => {
    let alive = true;

    async function loadMe() {
      setMeLawyerLoading(true);
      try {
        const me = await getMyLawyerProfile();
        if (alive) setMeLawyer(me);
      } catch {
        if (alive) setMeLawyer(null);
      } finally {
        if (alive) setMeLawyerLoading(false);
      }
    }

    loadMe();
    return () => { alive = false; };
  }, []);

  const params = useMemo(() => {
    return {
      q: (q ?? "").trim() || undefined,
      verifiedOnly,
      countryId: country?.id || undefined,
      townId: town?.id || undefined,
      practiceAreaId: practiceArea?.id || undefined,
      highestCourtAllowedId: court?.id || undefined,
      take: 30,
      skip: 0,
    };
  }, [q, verifiedOnly, country, town, practiceArea, court]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await searchLawyers(params);
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
  }, []);

  function clearFilters() {
    setQ("");
    setVerifiedOnly(true);

    // reset to Kenya if present
    const kenya = countryOptions.find((x) => x.name.toLowerCase() === "kenya");
    setCountry(kenya ?? countryOptions[0] ?? null);

    setTown(null);
    setPracticeArea(null);
    setCourt(null);
  }

  function openInquiry(lawyer) {
    setInqLawyer(lawyer);
    setInqSummary("");
    setInqPreferred("call");
    setInqError("");
    setInqOpen(true);
  }

  async function submitInquiry() {
    setInqError("");
    const summary = (inqSummary ?? "").trim();
    if (!summary) {
      setInqError("Problem summary is required.");
      return;
    }

    setInqSubmitting(true);
    try {
      await createLawyerInquiry({
        lawyerProfileId: inqLawyer?.id,
        practiceAreaId: practiceArea?.id ?? null,
        townId: town?.id ?? null,
        problemSummary: summary,
        preferredContactMethod: inqPreferred,
      });

      setInqOpen(false);
      navigate("/dashboard/lawyers/inquiries");
    } catch (e) {
      setInqError(formatErr(e));
    } finally {
      setInqSubmitting(false);
    }
  }

  const resultCount = items.length;

  return (
    <div className="explore-container">
      <div className="explore-shell">
        {/* ========== LEFT FILTER SIDEBAR (Explore style) ========== */}
        <div className="explore-shellLeft">
          <aside className="explore-sidebar">
            <div className="explore-sidebarTop">
              <div className="explore-sidebarTitleRow">
                <div>
                  <div className="explore-sidebarTitle">Filters</div>
                  <div className="explore-sidebarSub">{resultCount} results</div>
                </div>

                <button className="explore-linkBtn" onClick={clearFilters}>
                  Clear all
                </button>
              </div>

              <div className="explore-sidebarSearchWrap">
                <input
                  className="explore-sidebarSearch"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, firm..."
                />
              </div>
            </div>

            <div className="explore-sidebarBody">
              {/* Access */}
              <div className="explore-filterSection">
                <button className="explore-filterSectionHeader" type="button">
                  <div className="explore-filterSectionTitle">Access</div>
                  <div className="explore-filterSectionRight">
                    <span className="explore-pill">{verifiedOnly ? "Verified" : "All"}</span>
                  </div>
                </button>

                <div className="explore-filterSectionBody">
                  <label className="explore-toggle">
                    <input
                      type="checkbox"
                      checked={verifiedOnly}
                      onChange={(e) => setVerifiedOnly(e.target.checked)}
                    />
                    Verified only
                  </label>
                </div>
              </div>

              {/* Country */}
              <div className="explore-filterSection">
                <div className="explore-filterSectionTitle" style={{ marginBottom: 8 }}>
                  Country
                </div>

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
                      setTown(null);
                      setCourt(null);
                    }}
                  >
                    {countryOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Town */}
              <div className="explore-filterSection">
                <LookupDropdown
                  label="Town"
                  value={town}
                  onChange={setTown}
                  disabled={!country?.id}
                  fetcher={({ q }) => lookupTowns({ countryId: country.id, q })}
                  placeholder="Type town name or post code..."
                  hint={town?.postCode ? `Post code: ${town.postCode}` : null}
                />
              </div>

              {/* Practice area */}
              <div className="explore-filterSection">
                <LookupDropdown
                  label="Practice area"
                  value={practiceArea}
                  onChange={setPracticeArea}
                  fetcher={({ q }) => lookupPracticeAreas({ q })}
                  placeholder="Type practice area..."
                />
              </div>

              {/* Court */}
              <div className="explore-filterSection">
                <LookupDropdown
                  label="Highest court allowed"
                  value={court}
                  onChange={setCourt}
                  disabled={!country?.id}
                  fetcher={({ q }) => lookupCourts({ countryId: country.id, q })}
                  placeholder="Type court name or code..."
                />
              </div>

              <div className="explore-filterSection">
                <div className="explore-drawerActions" style={{ marginTop: 0 }}>
                  <button className="explore-cta-btn" onClick={load} disabled={loading}>
                    {loading ? "Searching..." : "Search"}
                  </button>
                  <button
                    className="explore-btn explore-btn-hotOutline"
                    type="button"
                    onClick={() => navigate("/dashboard/lawyers/inquiries")}
                  >
                    My Inquiries
                  </button>
                </div>

                {err ? (
                  <div className="explore-error" style={{ marginTop: 12 }}>
                    {err}
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </div>

        {/* ========== MAIN CONTENT ========== */}
        <section>
          <div className="explore-header">
            <div className="explore-titleRow">
              <div className="explore-brandTitle">
                <div className="explore-brandKicker">LawAfrica</div>
                <h1 className="explore-title">
                  Find a Lawyer <span className="explore-titleDot">•</span>{" "}
                  <span className="explore-titleAccent">Directory</span>
                </h1>
                <p className="explore-subtitle">
                  Premium directory of verified legal professionals. Filter by town, court level, and specialization.
                </p>

                <div className="explore-brandBadges">
                  <span className="explore-brandBadge">Verified professionals</span>
                  <span className="explore-brandBadge">Fast inquiry</span>
                  <span className="explore-brandBadge">Nationwide coverage</span>
                </div>
              </div>

              <div className="explore-headerActions">
                <div className="explore-resultsPill">{resultCount} results</div>

                <button
                  className="explore-btn explore-btn-hotOutline"
                  onClick={() => navigate("/dashboard/lawyers/inquiries")}
                >
                  My Inquiries
                </button>

                <button
                  className="explore-cta-btn"
                  onClick={() => navigate("/dashboard/lawyers/apply")}
                  disabled={meLawyerLoading}
                  title={meLawyer ? "Update your lawyer profile" : "Apply to be listed as a lawyer"}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {meLawyerLoading ? "Loading..." : meLawyer ? "My Lawyer Profile" : "Register as Lawyer"}
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {loading ? (
              <div className="explore-loading">Loading lawyers…</div>
            ) : resultCount === 0 ? (
              <div className="explore-empty">No lawyers found. Try adjusting your filters.</div>
            ) : (
              <div className="explore-grid">
                {items.map((x) => (
                  <div key={x.id} className="explore-card" style={{ cursor: "default" }}>
                    <div className="explore-info">
                      <div className="explore-badges">
                        {x.isVerified ? <span className="badge premium">Verified</span> : <span className="badge">Unverified</span>}
                        {x.highestCourtName ? <span className="badge">{x.highestCourtName}</span> : null}
                      </div>

                      <h3 className="explore-doc-title" title={x.displayName}>
                        {x.displayName}
                      </h3>

                      <div className="explore-meta">
                        {(x.firmName || "—")} <span className="explore-titleDot">•</span>{" "}
                        {(x.primaryTownName || "—")} / {(x.countryName || "—")}
                      </div>

                      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                        <Link
                          className="explore-btn explore-btn-hotOutline"
                          to={`/dashboard/lawyers/${x.id}`}
                          style={{ textDecoration: "none", textAlign: "center" }}
                        >
                          View profile
                        </Link>
                        <button className="explore-btn explore-btn-hot" onClick={() => openInquiry(x)}>
                          Request help
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inquiry modal */}
          <Modal
            open={inqOpen}
            title={inqLawyer ? `Request help from ${inqLawyer.displayName}` : "Request help"}
            onClose={() => setInqOpen(false)}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ opacity: 0.8, fontSize: 13 }}>
                Describe your issue and we’ll send it to the lawyer.
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Preferred contact method</div>
                <select className="explore-select" value={inqPreferred} onChange={(e) => setInqPreferred(e.target.value)}>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Problem summary</div>
                <textarea
                  className="explore-sidebarSearch"
                  style={{ minHeight: 120 }}
                  value={inqSummary}
                  onChange={(e) => setInqSummary(e.target.value)}
                  placeholder="Explain your issue briefly…"
                />
              </label>

              {inqError ? <div style={{ color: "#b42318" }}>{inqError}</div> : null}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
                <button className="explore-btn" onClick={() => setInqOpen(false)} disabled={inqSubmitting}>
                  Cancel
                </button>
                <button className="explore-cta-btn" onClick={submitInquiry} disabled={inqSubmitting}>
                  {inqSubmitting ? "Sending..." : "Send inquiry"}
                </button>
              </div>
            </div>
          </Modal>
        </section>
      </div>
    </div>
  );
}
// src/pages/LandingPage.jsx
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import "../styles/lawAfricaLanding.css";

function IcPin(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 13.2a3.2 3.2 0 110-6.4 3.2 3.2 0 010 6.4z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IcMail(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 6.5h16v11H4v-11z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4.8 7.2l7.2 6 7.2-6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IcPhone(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6.5 4.5l3.2-.8 1.4 4.7-2.2 1.5c1.3 2.7 3.5 4.9 6.2 6.2l1.5-2.2 4.7 1.4-.8 3.2c-.2.9-1 1.5-1.9 1.4-8.4-1.1-15-7.7-16.1-16.1-.1-.9.5-1.7 1.3-1.9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcPaperclip(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M21 11.5l-8.6 8.6a6 6 0 01-8.5-8.5l9.2-9.2a4.2 4.2 0 016 6l-9.5 9.5a2.4 2.4 0 01-3.4-3.4l8.6-8.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IcX(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IcChevronDown(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6.5 9.5l5.5 5.5 5.5-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function scrollToTopSmooth() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export default function LandingPage() {
  const year = useMemo(() => new Date().getFullYear(), []);
  const [publishOpen, setPublishOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const [topic, setTopic] = useState("Publish with us");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);

  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function openPublishModal(defaultTopic = "Publish with us") {
    setTopic(defaultTopic);
    setPublishOpen(true);
  }
  function closePublishModal() {
    setPublishOpen(false);
  }
  function onOverlayClick(e) {
    if (e.target === e.currentTarget) closePublishModal();
  }

  const mailtoHref = useMemo(() => {
    const to = "info@lawafrica.com";
    const subject = `[Website] ${topic}`;
    const bodyLines = [
      `Topic: ${topic}`,
      `Name: ${name || "-"}`,
      `Email: ${email || "-"}`,
      `Phone: ${phone || "-"}`,
      `Manuscript: ${file?.name || "-"}`,
      "",
      "Message:",
      message || "-",
      "",
      file?.name ? "Note: Please attach your manuscript in your email client before sending." : "",
    ].filter(Boolean);

    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
  }, [topic, name, email, phone, message, file]);

  const canSend = Boolean(email.trim()) && Boolean(message.trim());

  return (
    <div className="la1 la1-scroll">
      {/* Header (sticky, like modern product sites) */}
      <header className="la1-top la1-top-sticky">
        <div className="la1-container la1-top-inner">
          <Link to="/" className="la1-brand" aria-label="LawAfrica home">
            <img src="/logo.png" alt="LawAfrica" className="la1-logo" loading="eager" decoding="async" draggable="false" />
          </Link>

          <div className="la1-top-cta">
            <Link className="la1-btn la1-btn-ghost" to="/login">
              Login
            </Link>
            <Link className="la1-btn la1-btn-primary" to="/register">
              Create account
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <main className="la1-main la1-main-scroll">
        <div className="la1-hero">
          <div className="la1-container">
            <div className="la1-grid">
              {/* Left */}
              <section className="la1-left">
                <div className="la1-badge">
                  <span className="la1-dot" aria-hidden="true" />
                  Trusted legal &amp; paralegal publishing — 10+ years
                </div>

                <h1 className="la1-title">
                  Know. Do. Be More.
                  <span className="la1-sub">
                    Up-to-date legal information for professionals, institutions, researchers and students.
                  </span>
                </h1>

                <p className="la1-lead">
                  LawAfrica is the regional giant in legal and paralegal publishing serving governments, universities,
                  banks, NGOs and law firms worldwide, and expanding into South Sudan. We consolidate, update, index and
                  publish Statutes, Law Reports, Commentaries and Journals in print and digital formats.
                </p>

                <div className="la1-actions">
                  <Link className="la1-btn la1-btn-primary la1-btn-lg" to="/register">
                    Get started free
                  </Link>

                  <Link className="la1-btn la1-btn-ghost la1-btn-lg" to="/login">
                    Sign in
                  </Link>
                </div>

                <div className="la1-tertiary">
                  <button type="button" className="la1-tertiary-link" onClick={() => openPublishModal("Publish with us")}>
                    Publish with us <span aria-hidden="true">→</span>
                  </button>
                  <span className="la1-tertiary-sep" aria-hidden="true">•</span>
                  <button
                    type="button"
                    className="la1-tertiary-link"
                    onClick={() => openPublishModal("Institution subscription")}
                  >
                    Institution subscription <span aria-hidden="true">→</span>
                  </button>
                </div>

                <div className="la1-stats">
                  <div className="la1-stat">
                    <span className="la1-stat-num">10,000+</span>
                    <span className="la1-stat-label">Subscribers</span>
                  </div>
                  <div className="la1-stat">
                    <span className="la1-stat-num">Fast</span>
                    <span className="la1-stat-label">Decision support</span>
                  </div>
                  <div className="la1-stat">
                    <span className="la1-stat-num">Accurate</span>
                    <span className="la1-stat-label">Trusted content</span>
                  </div>
                </div>

                <div className="la1-more">
                  <button
                    type="button"
                    className="la1-more-toggle"
                    onClick={() => setAboutOpen((v) => !v)}
                    aria-expanded={aboutOpen}
                  >
                    Our mission &amp; values
                    <span className="la1-more-ic" aria-hidden="true">
                      <IcChevronDown className={aboutOpen ? "la1-rot" : ""} />
                    </span>
                  </button>

                  {aboutOpen && (
                    <div className="la1-more-panel">
                      <div className="la1-minirow">
                        <div className="la1-mini">
                          <div className="la1-mini-title">Mission</div>
                          <div className="la1-mini-text">To be the principal legal information provider in Africa.</div>
                        </div>

                        <div className="la1-mini">
                          <div className="la1-mini-title">Vision</div>
                          <div className="la1-mini-text">
                            To uplift legal research standards through up-to-date, relevant decision support information.
                          </div>
                        </div>
                      </div>

                      <div className="la1-values la1-values-inpanel">
                        <span className="la1-chip">Passion for Excellence</span>
                        <span className="la1-chip">Customer Satisfaction</span>
                        <span className="la1-chip">Respect &amp; Integrity</span>
                        <span className="la1-chip">Teamwork</span>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Right */}
              <aside className="la1-right">
                <div className="la1-card">
                  <div className="la1-card-title">What you get</div>

                  <div className="la1-service">
                    <div className="la1-ico" aria-hidden="true">⚖️</div>
                    <div>
                      <div className="la1-service-name">Statutes</div>
                      <div className="la1-service-desc">Consolidated, updated and indexed legal materials.</div>
                    </div>
                  </div>

                  <div className="la1-service">
                    <div className="la1-ico" aria-hidden="true">📚</div>
                    <div>
                      <div className="la1-service-name">Law Reports</div>
                      <div className="la1-service-desc">Reliable reporting for research and precedent-based work.</div>
                    </div>
                  </div>

                  <div className="la1-service">
                    <div className="la1-ico" aria-hidden="true">🧩</div>
                    <div>
                      <div className="la1-service-name">Commentaries</div>
                      <div className="la1-service-desc">Expert analysis for deeper understanding.</div>
                    </div>
                  </div>

                  <div className="la1-service">
                    <div className="la1-ico" aria-hidden="true">📝</div>
                    <div>
                      <div className="la1-service-name">Journals</div>
                      <div className="la1-service-desc">Scholarly insights for academics and practitioners.</div>
                    </div>
                  </div>

                  <div className="la1-divider" />

                  <div className="la1-card-cta">
                    <Link className="la1-btn la1-btn-primary la1-btn-full" to="/register">
                      Create account
                    </Link>
                    <div className="la1-card-hint">
                      Already have an account? <Link to="/login">Login</Link>
                    </div>
                  </div>
                </div>

                <div className="la1-note">Major assignments for governments, parastatals, banks, universities and NGOs.</div>
              </aside>
            </div>

            <div className="la1-scrollcue">
              <span className="la1-scrollcue-pill">Scroll for more</span>
            </div>
          </div>
        </div>

        {/* BELOW-FOLD CONTENT (Lexis-style structure) */}
        <section className="la1-section la1-section-soft">
          <div className="la1-container">
            <div className="la1-split">
              <div className="la1-split-left">
                <div className="la1-kicker">Featured</div>
                <h2 className="la1-h2">Legal resources that keep pace with practice.</h2>
                <p className="la1-p">
                  Discover curated collections, faster research workflows, and trusted updates—built for law firms,
                  institutions, students and researchers.
                </p>

                <div className="la1-bullets">
                  <div className="la1-bullet">✓ Updated content and indexing</div>
                  <div className="la1-bullet">✓ Built for precedent-based research</div>
                  <div className="la1-bullet">✓ Strong institutional support</div>
                </div>

                <div className="la1-row">
                  <Link className="la1-btn la1-btn-primary" to="/register">Start free</Link>
                  <button type="button" className="la1-btn la1-btn-ghost" onClick={() => openPublishModal("General enquiry")}>
                    Talk to us
                  </button>
                </div>
              </div>

              <div className="la1-split-right">
                {/* ✅ Put your attached banner image in: /public/landing-legal.jpg */}
                <div className="la1-heroimg">
                  <img
                    src="/landing-legal.jpg"
                    alt="LawAfrica legal library"
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                  <div className="la1-heroimg-glow" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="la1-section">
          <div className="la1-container">
            <div className="la1-headrow">
              <div>
                <div className="la1-kicker">Explore</div>
                <h2 className="la1-h2">Everything you need, in one platform.</h2>
              </div>
              <div className="la1-headrow-cta">
                <Link className="la1-link" to="/register">Create an account →</Link>
              </div>
            </div>

            <div className="la1-cards">
              <div className="la1-fcard">
                <div className="la1-fcard-top">
                  <div className="la1-ficon" aria-hidden="true">⚖️</div>
                  <div className="la1-fcard-title">Statutes</div>
                </div>
                <div className="la1-fcard-text">
                  Consolidated, updated, and indexed legal materials designed for fast referencing.
                </div>
              </div>

              <div className="la1-fcard">
                <div className="la1-fcard-top">
                  <div className="la1-ficon" aria-hidden="true">📚</div>
                  <div className="la1-fcard-title">Law Reports</div>
                </div>
                <div className="la1-fcard-text">
                  Reliable reporting for research, citations, and precedent-based work.
                </div>
              </div>

              <div className="la1-fcard">
                <div className="la1-fcard-top">
                  <div className="la1-ficon" aria-hidden="true">🧩</div>
                  <div className="la1-fcard-title">Commentaries</div>
                </div>
                <div className="la1-fcard-text">
                  Expert interpretation and analysis to support deeper legal understanding.
                </div>
              </div>

              <div className="la1-fcard">
                <div className="la1-fcard-top">
                  <div className="la1-ficon" aria-hidden="true">📝</div>
                  <div className="la1-fcard-title">Journals</div>
                </div>
                <div className="la1-fcard-text">
                  Scholarly insights for academics, policy work, and legal practitioners.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="la1-section la1-section-soft">
          <div className="la1-container">
            <div className="la1-why">
              <div className="la1-why-left">
                <div className="la1-kicker">Why LawAfrica</div>
                <h2 className="la1-h2">Designed for speed, clarity, and trust.</h2>
                <p className="la1-p">
                  A clean reading experience, consistent formatting, and content you can cite confidently built for
                  real world legal work and serious research.
                </p>
              </div>

              <div className="la1-why-right">
                <div className="la1-whygrid">
                  <div className="la1-wtile">
                    <div className="la1-wtitle">Fast discovery</div>
                    <div className="la1-wtext">Find relevant material quicker through structured collections.</div>
                  </div>
                  <div className="la1-wtile">
                    <div className="la1-wtitle">Trusted updates</div>
                    <div className="la1-wtext">Stay current with consolidated and updated references.</div>
                  </div>
                  <div className="la1-wtile">
                    <div className="la1-wtitle">Institution-ready</div>
                    <div className="la1-wtext">Support for institutions, teams, and structured access.</div>
                  </div>
                  <div className="la1-wtile">
                    <div className="la1-wtitle">Clear citations</div>
                    <div className="la1-wtext">Built for precedent work and academic-grade referencing.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="la1-ctaBar">
              <div>
                <div className="la1-ctaTitle">Ready to get started?</div>
                <div className="la1-ctaText">Create an account in minutes and explore your content.</div>
              </div>
              <div className="la1-ctaBtns">
                <Link className="la1-btn la1-btn-primary" to="/register">Create account</Link>
                <Link className="la1-btn la1-btn-ghost" to="/login">Sign in</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer (expanded) */}
      <footer className="la1-foot la1-foot-big">
        <div className="la1-container">
          <div className="la1-foot-grid">
            <div className="la1-foot-brandcol">
              <div className="la1-foot-tag">Know. Do. Be More.</div>
              <div className="la1-foot-sub">
                Up-to-date legal information for professionals, institutions, researchers and students.
              </div>

              <div className="la1-foot-contact" aria-label="Contact details">
                <div className="la1-foot-line">
                  <IcPin className="la1-ic" />
                  <span>
                    P.O Box 4260-00100
                    <br />
                    Nairobi, Kenya
                  </span>
                </div>

                <div className="la1-foot-line">
                  <IcMail className="la1-ic" />
                  <span>info@lawafrica.com</span>
                </div>

                <div className="la1-foot-line">
                  <IcPhone className="la1-ic" />
                  <span>+254797734012</span>
                </div>

                <a
                  className="la1-foot-link"
                  href="https://maps.app.goo.gl/f8M2336mrWCQ59wU8"
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg className="la1-ic" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 21s7-5.2 7-11.2A7 7 0 1 0 5 9.8C5 15.8 12 21 12 21Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <path
                      d="M12 12.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                  Find us on Google Maps
                </a>

                <div className="la1-foot-actions">
                  <button type="button" className="la1-foot-pill" onClick={() => openPublishModal("General enquiry")}>
                    Contact us
                  </button>
                  <button type="button" className="la1-foot-pill" onClick={scrollToTopSmooth}>
                    Back to top ↑
                  </button>
                </div>
              </div>
            </div>

            <div className="la1-foot-col">
              <div className="la1-foot-h">Products</div>
              <div className="la1-foot-list">
                <span className="la1-foot-item">Statutes</span>
                <span className="la1-foot-item">Law Reports</span>
                <span className="la1-foot-item">Commentaries</span>
                <span className="la1-foot-item">Journals</span>
              </div>
            </div>

            <div className="la1-foot-col">
              <div className="la1-foot-h">Company</div>
              <div className="la1-foot-list">
                <button className="la1-foot-itembtn" type="button" onClick={() => setAboutOpen(true)}>
                  Mission &amp; values
                </button>
                <button className="la1-foot-itembtn" type="button" onClick={() => openPublishModal("Publish with us")}>
                  Publish with us
                </button>
                <button className="la1-foot-itembtn" type="button" onClick={() => openPublishModal("Institution subscription")}>
                  Institution subscription
                </button>
              </div>
            </div>

            <div className="la1-foot-col">
              <div className="la1-foot-h">Support</div>
              <div className="la1-foot-list">
                <button className="la1-foot-itembtn" type="button" onClick={() => openPublishModal("Technical support")}>
                  Technical support
                </button>
                <button className="la1-foot-itembtn" type="button" onClick={() => openPublishModal("General enquiry")}>
                  General enquiry
                </button>
                <Link className="la1-foot-link2" to="/login">
                  Account login
                </Link>
              </div>
            </div>

            <div className="la1-foot-col">
              <div className="la1-foot-h">Legal</div>
              <div className="la1-foot-list">
                <span className="la1-foot-item">Terms</span>
                <span className="la1-foot-item">Privacy</span>
                <span className="la1-foot-item">Cookies</span>
              </div>
            </div>
          </div>

          <div className="la1-foot-bottom">
            <div className="la1-foot-muted">© {year} LawAfrica</div>
          </div>
        </div>
      </footer>

      {/* Floating back-to-top */}
      {showTop && (
        <button type="button" className="la1-floatTop" onClick={scrollToTopSmooth} aria-label="Back to top">
          ↑
        </button>
      )}

      {/* Publish Modal (UNCHANGED logic) */}
      {publishOpen && (
        <div className="la1-modal-overlay" onMouseDown={onOverlayClick} role="presentation">
          <div className="la1-modal" role="dialog" aria-modal="true" aria-label="Publish with us">
            <div className="la1-modal-brandbar" aria-hidden="true" />

            <div className="la1-modal-head">
              <div>
                <div className="la1-modal-title">{topic}</div>
                <div className="la1-modal-sub">
                  Send details to <span className="la1-modal-key">info@lawafrica.com</span>. Manuscript is optional.
                </div>
              </div>

              <button type="button" className="la1-modal-x" onClick={closePublishModal} aria-label="Close">
                <IcX className="la1-modal-xic" />
              </button>
            </div>

            <div className="la1-modal-grid">
              <label className="la1-field">
                <span className="la1-field-label">Topic</span>
                <select className="la1-input" value={topic} onChange={(e) => setTopic(e.target.value)}>
                  <option>Publish with us</option>
                  <option>General enquiry</option>
                  <option>Institution subscription</option>
                  <option>Technical support</option>
                </select>
              </label>

              <label className="la1-field">
                <span className="la1-field-label">Name</span>
                <input className="la1-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </label>

              <label className="la1-field">
                <span className="la1-field-label">
                  Email <span className="la1-req">*</span>
                </span>
                <input className="la1-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>

              <label className="la1-field">
                <span className="la1-field-label">Phone</span>
                <input className="la1-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254..." />
              </label>

              <label className="la1-field la1-field-full">
                <span className="la1-field-label">
                  Message <span className="la1-req">*</span>
                </span>
                <textarea
                  className="la1-input la1-textarea"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your manuscript / enquiry..."
                />
              </label>

              <label className="la1-field la1-field-full">
                <span className="la1-field-label">Attach manuscript (optional)</span>

                <div className="la1-file">
                  <span className="la1-file-ic">
                    <IcPaperclip className="la1-file-ic-svg" />
                  </span>

                  <div className="la1-file-meta">
                    <div className="la1-file-name">{file ? file.name : "No file selected"}</div>
                    <div className="la1-file-hint">
                      We’ll include the filename in the email. Please attach the file in your email client before sending.
                    </div>
                  </div>

                  <input
                    type="file"
                    className="la1-file-input"
                    accept=".pdf,.doc,.docx,.rtf,.txt"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />

                  <button
                    type="button"
                    className="la1-file-btn"
                    onClick={() => document.querySelector(".la1-file-input")?.click()}
                  >
                    Choose file
                  </button>
                </div>
              </label>
            </div>

            <div className="la1-modal-actions">
              <button type="button" className="la1-btn la1-btn-ghost" onClick={closePublishModal}>
                Cancel
              </button>

              <a
                className={`la1-btn la1-btn-primary ${!canSend ? "la1-btn-disabled" : ""}`}
                href={canSend ? mailtoHref : undefined}
                onClick={(e) => {
                  if (!canSend) e.preventDefault();
                  else closePublishModal();
                }}
              >
                Send email
              </a>
            </div>

            {!canSend && (
              <div className="la1-modal-hint">
                Please enter your <span className="la1-modal-key">email</span> and a{" "}
                <span className="la1-modal-key">message</span>.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
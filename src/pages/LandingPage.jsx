// src/pages/LandingPage.jsx
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import "../styles/lawAfricaLanding.css";

function IcPin(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 13.2a3.2 3.2 0 110-6.4 3.2 3.2 0 010 6.4z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function IcMail(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 6.5h16v11H4v-11z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M4.8 7.2l7.2 6 7.2-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
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

function IcMap(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9 18l-6 2V6l6-2 6 2 6-2v14l-6 2-6-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 4v14M15 6v14"
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
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LandingPage() {
  const year = useMemo(() => new Date().getFullYear(), []);

  const [publishOpen, setPublishOpen] = useState(false);
  const [topic, setTopic] = useState("Publish with us");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);

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

    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      bodyLines.join("\n")
    )}`;
  }, [topic, name, email, phone, message, file]);

  const canSend = Boolean(email.trim()) && Boolean(message.trim());

  return (
    <div className="la1">
      {/* Header */}
      <header className="la1-top">
        <div className="la1-container la1-top-inner">
          <Link to="/" className="la1-brand" aria-label="LawAfrica home">
            <img
              src="/logo.png"
              alt="LawAfrica"
              className="la1-logo"
              loading="eager"
              decoding="async"
              draggable="false"
            />
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

      {/* Main */}
      <main className="la1-main">
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

              {/* ✅ ALL 3 BUTTONS SAME ROW */}
              <div className="la1-actions">
                <Link className="la1-btn la1-btn-primary la1-btn-lg" to="/register">
                  Get started free
                </Link>

                <Link className="la1-btn la1-btn-ghost la1-btn-lg" to="/login">
                  Sign in
                </Link>

                <button
                  type="button"
                  className="la1-btn la1-btn-ghost la1-btn-lg"
                  onClick={() => openPublishModal("Publish with us")}
                >
                  Publish with us
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

              <div className="la1-values">
                <span className="la1-chip">Passion for Excellence</span>
                <span className="la1-chip">Customer Satisfaction</span>
                <span className="la1-chip">Respect &amp; Integrity</span>
                <span className="la1-chip">Teamwork</span>
              </div>
            </section>

            {/* Right */}
            <aside className="la1-right">
              <div className="la1-card">
                <div className="la1-card-title">What you get</div>

                <div className="la1-service">
                  <div className="la1-ico" aria-hidden="true">
                    ⚖️
                  </div>
                  <div>
                    <div className="la1-service-name">Statutes</div>
                    <div className="la1-service-desc">Consolidated, updated and indexed legal materials.</div>
                  </div>
                </div>

                <div className="la1-service">
                  <div className="la1-ico" aria-hidden="true">
                    📚
                  </div>
                  <div>
                    <div className="la1-service-name">Law Reports</div>
                    <div className="la1-service-desc">
                      Reliable reporting for research and precedent-based work.
                    </div>
                  </div>
                </div>

                <div className="la1-service">
                  <div className="la1-ico" aria-hidden="true">
                    🧩
                  </div>
                  <div>
                    <div className="la1-service-name">Commentaries</div>
                    <div className="la1-service-desc">Expert analysis for deeper understanding.</div>
                  </div>
                </div>

                <div className="la1-service">
                  <div className="la1-ico" aria-hidden="true">
                    📝
                  </div>
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

              <div className="la1-note">
                Major assignments for governments, parastatals, banks, universities and NGOs.
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="la1-foot">
        <div className="la1-container la1-foot-inner">
          <div className="la1-foot-left">
            <div className="la1-foot-tag">Know. Do. Be More</div>

            <div className="la1-foot-contact" aria-label="Contact details">
              <div className="la1-foot-block">
                <div className="la1-foot-line">
                  <IcPin className="la1-ic" />
                  <span>
                    P.O Box 4260-00100
                    <br />
                    Nairobi, Kenya
                  </span>
                </div>

                    <a
                    className="la1-foot-link"
                    href="https://maps.app.goo.gl/Tup9dcD6JoKnrAZo9"
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
                    Find us here (Google Maps)
                    </a>
              </div>

              <div className="la1-foot-block">
                <div className="la1-foot-line">
                  <IcMail className="la1-ic" />
                  <span>info@lawafrica.com</span>
                </div>

                <div className="la1-foot-line">
                  <IcPhone className="la1-ic" />
                  <span>+254797734012</span>
                </div>
              </div>
            </div>
          </div>

          <div className="la1-foot-muted">© {year} LawAfrica</div>
        </div>
      </footer>

      {/* Publish Modal */}
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
                <input
                  className="la1-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </label>

              <label className="la1-field">
                <span className="la1-field-label">
                  Email <span className="la1-req">*</span>
                </span>
                <input
                  className="la1-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              <label className="la1-field">
                <span className="la1-field-label">Phone</span>
                <input
                  className="la1-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+254..."
                />
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
                Please enter your <span className="la1-modal-key">email</span> and a <span className="la1-modal-key">message</span>.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
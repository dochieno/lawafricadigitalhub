// src/components/AdminPageFooter.jsx
import "../styles/adminFooter.css";

export default function AdminPageFooter({ left, right, subtle = true }) {
  const year = new Date().getFullYear();

  return (
    <footer className={`admin-footer ${subtle ? "subtle" : ""}`}>
      <div className="admin-footer-inner">
        <div className="admin-footer-left">
          {left ?? (
            <>
              <span className="admin-footer-brand">
                Law<span>A</span>frica
              </span>
              <span className="admin-footer-dot">•</span>
              <span className="admin-footer-muted">Admin Console</span>
              <span className="admin-footer-dot">•</span>
              <span className="admin-footer-muted">© {year}</span>
            </>
          )}
        </div>

        <div className="admin-footer-right">
          {right ?? (
            <span className="admin-footer-muted">
              Tip: Use search to filter quickly.
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext";
import "./styles/theme.css";
import "./index.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

const rootEl = document.getElementById("root");

console.log("[LA DEBUG] main.jsx executing", location.href);
console.log("[LA DEBUG] root element exists:", !!rootEl);

// ✅ Mount checkpoint (if you don't see the next log, something is blocking render)
console.log("[LA DEBUG] about to mount React");

// ✅ KEY FIX: StrictMode can double-run effects in dev AND can expose timing bugs.
// For production stability (especially around payment return redirects), disable StrictMode outside DEV.
const Wrapper = import.meta.env.DEV ? React.StrictMode : React.Fragment;

try {
  ReactDOM.createRoot(rootEl).render(
    <Wrapper>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Wrapper>
  );

  console.log("[LA DEBUG] ReactDOM.render() returned");
} catch (e) {
  console.error("[LA DEBUG] FATAL mount error:", e);

  // ✅ If React never mounts, show a visible fallback so you're not stuck on white screen
  if (rootEl) {
    rootEl.innerHTML = `
      <div style="padding:16px;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">
        <div style="font-weight:900;margin-bottom:6px;">LawAfrica: App failed to mount</div>
        <div style="opacity:.8;margin-bottom:10px;">Check Console for: <b>[LA DEBUG] FATAL mount error</b></div>
        <div style="white-space:pre-wrap;color:#7f1d1d;">${String(e?.stack || e?.message || e)}</div>
      </div>
    `;
  }
}

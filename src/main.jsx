// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext";
import "./styles/theme.css";
import "./index.css";
import "./styles/lawAfricaBrand.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";

const rootEl = document.getElementById("root");

console.log("[LA DEBUG] main.jsx executing", location.href);
console.log("[LA DEBUG] root element exists:", !!rootEl);

// ------------------------------
// ✅ Ignore common resource errors (like IMG 404) so debug overlay doesn’t treat them as runtime crashes
// ------------------------------
function isResourceLoadErrorEvent(e) {
  const t = e?.target;
  if (!t) return false;

  const tag = String(t.tagName || "").toUpperCase();
  if (tag === "IMG" || tag === "SCRIPT" || tag === "LINK") return true;

  // fallback checks
  if (typeof t.src === "string" && t.src) return true;
  if (typeof t.href === "string" && t.href) return true;

  return false;
}

// Capture phase to see errors early, but FILTER OUT resource load errors.
window.addEventListener(
  "error",
  (e) => {
    if (isResourceLoadErrorEvent(e)) return;
    console.log("[LA DEBUG] window.error:", e);
  },
  true
);

window.addEventListener("unhandledrejection", (e) => {
  console.log("[LA DEBUG] unhandledrejection:", e?.reason || e);
});

// ✅ Mount checkpoint
console.log("[LA DEBUG] about to mount React");

// StrictMode in dev only
const Wrapper = import.meta.env.DEV ? React.StrictMode : React.Fragment;

try {
  if (!rootEl) throw new Error("Root element #root not found.");

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

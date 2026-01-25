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

/** microtask helper (works everywhere) */
function runSoon(fn) {
  try {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(fn);
      return;
    }
  } catch {
    // intentionally ignored
  }

  try {
    Promise.resolve().then(fn);
    return;
  } catch {
    // intentionally ignored
  }

  setTimeout(fn, 0);
}

// ------------------------------
// Ignore common resource errors (IMG/CSS/JS 404)
// ------------------------------
function isResourceLoadErrorEvent(e) {
  const t = e?.target;
  if (!t) return false;

  const tag = String(t.tagName || "").toUpperCase();
  if (tag === "IMG" || tag === "SCRIPT" || tag === "LINK") return true;

  if (typeof t.src === "string" && t.src) return true;
  if (typeof t.href === "string" && t.href) return true;

  return false;
}

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

// ------------------------------
// Mount React
// ------------------------------
console.log("[LA DEBUG] about to mount React");

const Wrapper = import.meta.env.DEV ? React.StrictMode : React.Fragment;

try {
  if (!rootEl) throw new Error("Root element #root not found.");

  window.__LA_APP_MOUNTED__ = false;
  window.__LA_APP_MOUNTED_AT__ = null;

  ReactDOM.createRoot(rootEl).render(
    <Wrapper>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Wrapper>
  );

  runSoon(() => {
    window.__LA_APP_MOUNTED__ = true;
    window.__LA_APP_MOUNTED_AT__ = Date.now();
    console.log("[LA DEBUG] React mounted flag set:", window.__LA_APP_MOUNTED_AT__);
  });

  console.log("[LA DEBUG] ReactDOM.render() returned");
} catch (fatal) {
  console.error("[LA DEBUG] FATAL mount error:", fatal);

  window.__LA_APP_MOUNTED__ = false;
  window.__LA_APP_MOUNTED_AT__ = null;

  try {
    const msg = String(fatal?.stack || fatal?.message || fatal);
    if (rootEl) {
      rootEl.innerHTML =
        '<div style="padding:16px;font-family:ui-monospace,monospace;">' +
        '<div style="font-weight:900;margin-bottom:6px;">LawAfrica: App failed to mount</div>' +
        '<div style="opacity:.8;margin-bottom:10px;">Check Console for: <b>[LA DEBUG] FATAL mount error</b></div>' +
        '<pre style="white-space:pre-wrap;color:#7f1d1d;margin:0;">' +
        msg.replace(/</g, "&lt;").replace(/>/g, "&gt;") +
        "</pre></div>";
    }
  } catch {
    // intentionally ignored (last resort)
  }
}
// src/api/aiCommentary.js
import api from "./client";

export async function askCommentary(
  {
    question,
    mode = "basic",
    allowExternalContext = true,
    jurisdictionHint = null,
    threadId = null,
  } = {},
  axiosConfig = {}, // ✅ NEW: allow { signal } etc.
) {
  const payload = {
    question,
    mode,
    allowExternalContext,
    jurisdictionHint,
    threadId,
  };

  // ✅ Known-working route under /ai/law-reports
  const res = await api.post("/ai/law-reports/commentary/ask", payload, axiosConfig);
  return res.data;
}

export async function listCommentaryThreads({ take = 30, skip = 0 } = {}) {
  const res = await api.get("/ai/commentary/threads", { params: { take, skip } });
  return res.data;
}

export async function getCommentaryThread(threadId, { takeMessages = 80 } = {}) {
  if (!threadId) throw new Error("threadId is required");
  const res = await api.get(`/ai/commentary/threads/${threadId}`, {
    params: { takeMessages },
  });
  return res.data;
}

export async function deleteCommentaryThread(threadId) {
  if (!threadId) throw new Error("threadId is required");
  const res = await api.post(`/ai/commentary/threads/${threadId}/delete`);
  return res.data;
}

export async function pingCommentaryThreads() {
  return listCommentaryThreads({ take: 1, skip: 0 });
}
// ✅ SSE streaming helper (Web)
// Uses fetch because axios doesn't stream SSE reliably.
// Emits { type: "delta"|"done"|"error", data }
export async function askCommentaryStream(
  {
    question,
    mode = "basic",
    allowExternalContext = true,
    jurisdictionHint = null,
    threadId = null,
  } = {},
  { signal, onEvent } = {},
) {
  const payload = { question, mode, allowExternalContext, jurisdictionHint, threadId };

  // NOTE: Must match your backend route (same baseURL domain as api)
  // We derive absolute URL from axios baseURL to avoid hardcoding.
  const base = (api?.defaults?.baseURL || "").replace(/\/$/, "");
  const url = `${base}/ai/law-reports/commentary/ask-stream`;

  // If your auth token is in axios headers/interceptors, fetch won't auto-attach it.
  // We copy it from axios defaults, and also from localStorage if you store it there.
  const auth =
    api?.defaults?.headers?.common?.Authorization ||
    api?.defaults?.headers?.Authorization ||
    "";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    let msg = `Stream HTTP ${res.status}`;
    try {
      msg = await res.text();
    } catch {
      //
    }
    throw new Error(msg);
  }

  const reader = res.body?.getReader?.();
  if (!reader) throw new Error("Streaming not supported by this browser/runtime.");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let eventName = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = block.split("\n");
      let data = "";

      for (const ln of lines) {
        if (ln.startsWith("event:")) eventName = ln.slice(6).trim();
        if (ln.startsWith("data:")) data += ln.slice(5).trim();
      }

      const type = eventName || "message";
      eventName = "";

      let parsed = null;
      try {
        parsed = data ? JSON.parse(data) : null;
      } catch {
        parsed = data;
      }

      onEvent?.({ type, data: parsed });

      if (type === "error") {
        throw new Error(parsed?.message || "Stream error");
      }

      if (type === "done") {
        return parsed; // { threadId }
      }
    }
  }

  return null;
}
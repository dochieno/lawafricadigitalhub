// src/api/aiCommentary.js
import api from "./client";
import { getToken } from "../auth/auth";

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

  // baseURL is already `${BASE}/api` in your axios client
  const base = String(api?.defaults?.baseURL || "").replace(/\/$/, "");
  const url = `${base}/ai/law-reports/commentary/ask-stream`;

  // ✅ IMPORTANT: use the same token source as axios interceptor
  const token = getToken(); // may return null on blocked public-flow pages

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Stream HTTP ${res.status}`);
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

      if (type === "error") throw new Error(parsed?.message || "Stream error");
      if (type === "done") return parsed; // { threadId }
    }
  }

  return null;
}
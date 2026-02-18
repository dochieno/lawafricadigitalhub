// src/api/aiCommentary.js
import api from "./client";

/**
 * AI Commentary API (matches backend routes under /api/ai/commentary)
 * Routes:
 *  POST   /api/ai/commentary/ask
 *  GET    /api/ai/commentary/threads
 *  GET    /api/ai/commentary/threads/{threadId}
 *  POST   /api/ai/commentary/threads/{threadId}/delete
 */

export async function askCommentary({
  question,
  mode = "basic",
  allowExternalContext = true,
  jurisdictionHint = null,
  threadId = null,
} = {}) {
  const payload = { question, mode, allowExternalContext, jurisdictionHint, threadId };
  const res = await api.post("/api/ai/commentary/ask", payload);
  return res.data;
}

export async function listCommentaryThreads({ take = 30, skip = 0 } = {}) {
  const res = await api.get("/api/ai/commentary/threads", { params: { take, skip } });
  return res.data;
}

export async function getCommentaryThread(threadId, { takeMessages = 80 } = {}) {
  if (!threadId) throw new Error("threadId is required");
  const res = await api.get(`/api/ai/commentary/threads/${threadId}`, {
    params: { takeMessages },
  });
  return res.data;
}

export async function deleteCommentaryThread(threadId) {
  if (!threadId) throw new Error("threadId is required");
  const res = await api.post(`/api/ai/commentary/threads/${threadId}/delete`);
  return res.data;
}

/**
 * Optional debug helper: call from console to confirm routing works.
 */
export async function pingCommentaryThreads() {
  return listCommentaryThreads({ take: 1, skip: 0 });
}

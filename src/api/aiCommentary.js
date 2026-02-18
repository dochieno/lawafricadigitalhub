// src/api/aiCommentary.js
import api from "./client";

export async function askCommentary({
  question,
  mode = "basic",
  allowExternalContext = true,
  jurisdictionHint = null,
  threadId = null,
} = {}) {
  const payload = { question, mode, allowExternalContext, jurisdictionHint, threadId };
  const res = await api.post("/ai/commentary/ask", payload);
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

/**
 * Optional debug helper: call from console to confirm routing works.
 */
export async function pingCommentaryThreads() {
  return listCommentaryThreads({ take: 1, skip: 0 });
}

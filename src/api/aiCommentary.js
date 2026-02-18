// src/api/aiCommentary.js
import api from "./client"; // your axios instance

export async function askCommentary(payload) {
  // payload: { question, mode?, allowExternalContext?, jurisdictionHint?, threadId? }
  const res = await api.post("/ai/commentary/ask", payload);
  return res.data; // { replyMarkdown, disclaimerMarkdown, mode, model, sources, declined, declineReason, threadId }
}

export async function listCommentaryThreads({ take = 30, skip = 0 } = {}) {
  const res = await api.get("/ai/commentary/threads", { params: { take, skip } });
  return res.data; // { total, take, skip, items }
}

export async function getCommentaryThread(threadId, { takeMessages = 80 } = {}) {
  const res = await api.get(`/ai/commentary/threads/${threadId}`, {
    params: { takeMessages },
  });
  return res.data; // { thread, messages:[{... sources:[]}] }
}

export async function deleteCommentaryThread(threadId) {
  // ✅ Prefer POST soft-delete to avoid DELETE 405 in some deployments/proxies
  const res = await api.post(`/ai/commentary/threads/${threadId}/delete`);
  return res.data; // { threadId, deleted:true }
}

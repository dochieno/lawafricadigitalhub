// src/reader/ai/parseAiSummary.js

/**
 * Output shape:
 * [
 *   { title: "OVERVIEW", blocks: [{ kind:"ul", items:[...] }, {kind:"p", text:"..."}] },
 *   ...
 * ]
 */

function isHeadingLine(raw) {
  const line = String(raw || "").trim();
  if (!line) return false;

  // Common heading patterns:
  // "OVERVIEW:", "KEY POINTS:", "IMPORTANT TERMS:", "HOLDING/DECISION:"
  // Also tolerate "Overview:" etc
  if (/^[A-Za-z0-9 /&()_-]{3,}:\s*$/.test(line)) return true;

  // Tolerate headings without colon (rare), but ALL CAPS
  if (/^[A-Z][A-Z0-9 /&()_-]{2,}$/.test(line)) return true;

  return false;
}

function normalizeHeading(raw) {
  let t = String(raw || "").trim();

  // Remove trailing colon
  t = t.replace(/:\s*$/, "");

  // Collapse spaces
  t = t.replace(/\s+/g, " ").trim();

  // Keep original case if it's Title Case, but if it looks like a key heading, uppercase it
  const looksLikeKey =
    /^(overview|key points|facts|issues|holding|holding\/decision|decision|reasoning|important terms|practical takeaways|takeaways)$/i.test(
      t
    );

  if (looksLikeKey) {
    return t.toUpperCase();
  }

  // If already mostly uppercase, keep
  const upperRatio =
    t.length > 0 ? (t.replace(/[^A-Z]/g, "").length / t.replace(/[^A-Za-z]/g, "").length || 0) : 0;

  if (upperRatio > 0.7) return t.toUpperCase();

  // Otherwise keep as-is
  return t;
}

function flushParagraph(buf, blocks) {
  const text = buf.join(" ").replace(/\s+/g, " ").trim();
  if (text) blocks.push({ kind: "p", text });
  buf.length = 0;
}

function flushList(listItems, blocks) {
  const items = listItems.map((x) => String(x || "").trim()).filter(Boolean);
  if (items.length) blocks.push({ kind: "ul", items });
  listItems.length = 0;
}

export function parseAiSummary(summaryText) {
  const text = String(summaryText || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  const sections = [];
  let current = null;

  let paraBuf = [];
  let listBuf = [];

  function ensureSection(title) {
    const t = normalizeHeading(title);
    current = { title: t, blocks: [] };
    sections.push(current);
  }

  function ensureDefaultOverview() {
    if (!current) ensureSection("OVERVIEW");
  }

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();

    // blank line => flush buffers
    if (!line) {
      if (current) {
        flushList(listBuf, current.blocks);
        flushParagraph(paraBuf, current.blocks);
      }
      continue;
    }

    // Heading line
    if (isHeadingLine(line)) {
      // Close previous section buffers
      if (current) {
        flushList(listBuf, current.blocks);
        flushParagraph(paraBuf, current.blocks);
      }

      ensureSection(line);
      continue;
    }

    // If content appears before any heading => becomes OVERVIEW
    ensureDefaultOverview();

    // Bullet detection
    const bulletMatch = line.match(/^[-•\u2022]\s+(.*)$/);
    if (bulletMatch) {
      // moving from paragraph -> list
      flushParagraph(paraBuf, current.blocks);
      listBuf.push(bulletMatch[1]);
      continue;
    }

    // Normal paragraph line
    flushList(listBuf, current.blocks);
    paraBuf.push(line);
  }

  // final flush
  if (current) {
    flushList(listBuf, current.blocks);
    flushParagraph(paraBuf, current.blocks);
  }

  // Safety: if still empty, return a single overview with raw text
  if (!sections.length && String(summaryText || "").trim()) {
    return [{ title: "OVERVIEW", blocks: [{ kind: "p", text: String(summaryText || "").trim() }] }];
  }

  return sections;
}

export function formatAiSummaryForCopy(summaryText) {
  const sections = parseAiSummary(summaryText);

  // Copy exactly what user sees: headings + bullets/paragraphs
  const out = [];
  for (const s of sections) {
    const title = String(s.title || "").trim();
    if (title) out.push(`${title}:`);

    for (const b of s.blocks || []) {
      if (b.kind === "ul") {
        for (const it of b.items || []) out.push(`- ${it}`);
      } else if (b.kind === "p") {
        if (b.text) out.push(b.text);
      }
    }
    out.push(""); // blank line between sections
  }
  return out.join("\n").trim();
}

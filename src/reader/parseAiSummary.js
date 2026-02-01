// src/reader/parseAiSummary.js

const DEFAULT_HEADINGS = [
  "OVERVIEW",
  "KEY POINTS",
  "FACTS",
  "ISSUES",
  "HOLDING",
  "REASONING",
  "DECISION",
  "ANALYSIS",
  "KEY TAKEAWAYS",
  "WARNINGS",
  "NOTES",
];

/**
 * Turns AI plain text into renderable sections:
 * [
 *   { title: "OVERVIEW", blocks: [{ kind:"p", text:"..." }, { kind:"ul", items:[...] }] },
 *   ...
 * ]
 */
export function parseAiSummary(text, headings = DEFAULT_HEADINGS) {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  const lines = raw.split("\n");
  const sections = [];
  let current = { title: "SUMMARY", blocks: [] };

  const isHeadingLine = (line) => {
    const t = line.trim();
    if (!t) return false;

    const upper = t.toUpperCase();

    // Known headings: "OVERVIEW", "OVERVIEW:", "OVERVIEW -"
    for (const h of headings) {
      if (upper === h) return true;
      if (upper.startsWith(h + ":")) return true;
      if (upper.startsWith(h + " -")) return true;
      if (upper.startsWith(h + " —")) return true;
    }

    // Generic all-caps heading-like lines
    if (t.length <= 40 && /^[A-Z0-9][A-Z0-9\s/&(),.'-]{2,}$/.test(t) && !t.endsWith(".")) {
      return true;
    }

    return false;
  };

  const normalizeHeading = (line) => {
    const t = line.trim();
    const upper = t.toUpperCase();
    for (const h of headings) {
      if (upper === h) return h;
      if (upper.startsWith(h + ":")) return h;
      if (upper.startsWith(h + " -")) return h;
      if (upper.startsWith(h + " —")) return h;
    }
    return t.replace(/[:—-]\s*$/, "").trim();
  };

  const pushCurrent = () => {
    const hasContent = current.blocks.some(
      (b) => (b.items?.length || 0) > 0 || (b.text || "").trim()
    );
    if (hasContent) sections.push(current);
  };

  const flushParagraph = (buf) => {
    const t = buf.join(" ").trim();
    if (t) current.blocks.push({ kind: "p", text: t });
    buf.length = 0;
  };

  let paragraphBuf = [];

  for (const line of lines) {
    const t = line.trim();

    if (isHeadingLine(t)) {
      flushParagraph(paragraphBuf);
      pushCurrent();
      current = { title: normalizeHeading(t), blocks: [] };
      continue;
    }

    if (!t) {
      flushParagraph(paragraphBuf);
      continue;
    }

    const bulletMatch = /^(-|\*|•)\s+(.*)$/.exec(t);
    if (bulletMatch) {
      flushParagraph(paragraphBuf);
      const item = bulletMatch[2].trim();
      const last = current.blocks[current.blocks.length - 1];
      if (last && last.kind === "ul") last.items.push(item);
      else current.blocks.push({ kind: "ul", items: [item] });
      continue;
    }

    paragraphBuf.push(t);
  }

  flushParagraph(paragraphBuf);
  pushCurrent();

  return sections.length ? sections : [{ title: "SUMMARY", blocks: [{ kind: "p", text: raw }] }];
}

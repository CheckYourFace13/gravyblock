/** Minimal, safe markdown -> HTML for generated articles (headings, emphasis, lists, quotes, links, paragraphs). Input is escaped first. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

export function markdownToHtml(md: string): string {
  // Already HTML? Leave it alone.
  if (/<(h[1-6]|p|ul|ol|div)\b/i.test(md) && !/^#{1,6}\s/m.test(md)) return md;
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^=+$/.test(line) || /^-{3,}$/.test(line)) {
      flushPara();
      closeList();
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      const level = Math.min(6, Math.max(2, h[1]!.length)); // the page supplies its own H1
      out.push(`<h${level}>${inline(h[2]!.replace(/#+$/, "").trim())}</h${level}>`);
      continue;
    }
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ol || ul) {
      flushPara();
      const kind = ol ? "ol" : "ul";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ol ?? ul)![1]!.replace(/^\d+\.\s*/, ""))}</li>`);
      continue;
    }
    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(q[1]!)}</blockquote>`);
      continue;
    }
    closeList();
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join("\n");
}

export function wordCount(md: string): number {
  return md.replace(/<[^>]+>/g, " ").replace(/[#*_>`\[\]()]/g, " ").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

import { VIDEO } from "../config";

/** Word-wraps to the caption width. Returns null when it cannot fit in the allowed lines (QA then fails the caption). */
export function wrapCaption(text: string): string[] | null {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (w.length > VIDEO.captionMaxCharsPerLine) return null;
    if ((cur + " " + w).trim().length > VIDEO.captionMaxCharsPerLine) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length <= VIDEO.captionMaxLines ? lines : null;
}


export type WallPostRichTextSegment = {
  value: string;
  bold: boolean;
};

export const splitWallPostTextIntoBoldSegments = (
  value: string
): WallPostRichTextSegment[] => {
  const segments: WallPostRichTextSegment[] = [];
  const pattern = /\*\*([\s\S]+?)\*\*/g;
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    const boldValue = match[1] ?? "";
    if (start > cursor) {
      segments.push({ value: value.slice(cursor, start), bold: false });
    }
    segments.push({ value: boldValue, bold: true });
    cursor = start + (match[0] ?? "").length;
  }

  if (cursor < value.length) {
    segments.push({ value: value.slice(cursor), bold: false });
  }

  return segments.length ? segments : [{ value, bold: false }];
};

export const wallPostRichTextSegmentsToText = (
  segments: WallPostRichTextSegment[]
): string =>
  segments
    .map((segment) =>
      segment.bold && segment.value ? `**${segment.value}**` : segment.value
    )
    .join("");

const escapeEditorHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br>");

export const wallPostTextToEditorHtml = (value: string): string =>
  splitWallPostTextIntoBoldSegments(value)
    .map((segment) => {
      const escaped = escapeEditorHtml(segment.value);
      return segment.bold && escaped ? `<strong>${escaped}</strong>` : escaped;
    })
    .join("");

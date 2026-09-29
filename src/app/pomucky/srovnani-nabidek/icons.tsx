type Point = [number, number];
export type IconShape = { points: Point[]; closed?: boolean } | { circle: [number, number, number] };
type IconDefinition = { id: string; label: string; shapes: IconShape[] };
// Shared geometry keeps the editor and the vector icons in the PDF identical.
export const COMPARISON_ICONS: IconDefinition[] = [
  { id: "none", label: "Bez ikony", shapes: [] },
  { id: "shield", label: "Pojištění", shapes: [{ points: [[12, 3], [21, 7], [20, 15], [17, 19], [12, 22], [7, 19], [4, 15], [3, 7]], closed: true }] },
  { id: "heart", label: "Zdraví", shapes: [{ points: [[12, 21], [3, 12], [2, 8], [4, 4], [8, 3], [12, 7], [16, 3], [20, 4], [22, 8], [21, 12]], closed: true }] },
  { id: "home", label: "Domov", shapes: [{ points: [[3, 11], [12, 3], [21, 11]] }, { points: [[5, 10], [5, 21], [10, 21], [10, 15], [14, 15], [14, 21], [19, 21], [19, 10]] }] },
  { id: "car", label: "Vozidlo", shapes: [{ points: [[3, 17], [3, 11], [6, 5], [18, 5], [21, 11], [21, 17]], closed: true }, { points: [[3, 11], [21, 11]] }, { points: [[5, 17], [5, 20]] }, { points: [[19, 17], [19, 20]] }, { circle: [7, 14, 1] }, { circle: [17, 14, 1] }] },
  { id: "activity", label: "Úraz / zdraví", shapes: [{ points: [[2, 12], [7, 12], [10, 3], [14, 21], [17, 12], [22, 12]] }] },
  { id: "umbrella", label: "Odpovědnost", shapes: [{ points: [[2, 12], [3, 8], [7, 4], [12, 3], [17, 4], [21, 8], [22, 12]], closed: true }, { points: [[12, 12], [12, 20], [14, 22], [16, 20]] }] },
  { id: "wallet", label: "Peníze", shapes: [{ points: [[21, 8], [21, 4], [3, 4], [3, 20], [21, 20], [21, 8], [15, 8], [15, 16], [21, 16]] }, { circle: [18, 12, .6] }] },
  { id: "clock", label: "Lhůta", shapes: [{ circle: [12, 12, 9] }, { points: [[12, 6], [12, 12], [16, 14]] }] },
  { id: "briefcase", label: "Práce", shapes: [{ points: [[8, 6], [8, 3], [16, 3], [16, 6]] }, { points: [[3, 6], [21, 6], [21, 21], [3, 21]], closed: true }, { points: [[3, 12], [21, 12]] }, { points: [[12, 10], [12, 14]] }] },
  { id: "check", label: "Zahrnuto", shapes: [{ points: [[4, 12], [9, 17], [20, 6]] }] },
  { id: "cross", label: "Nezahrnuto", shapes: [{ points: [[5, 5], [19, 19]] }, { points: [[19, 5], [5, 19]] }] },
  { id: "alert", label: "Upozornění", shapes: [{ points: [[12, 3], [22, 21], [2, 21]], closed: true }, { points: [[12, 9], [12, 14]] }, { circle: [12, 17.5, .5] }] },
  { id: "star", label: "Výhoda", shapes: [{ points: [[12, 2], [15, 8], [22, 9], [17, 14], [18, 21], [12, 18], [6, 21], [7, 14], [2, 9], [9, 8]], closed: true }] },
  { id: "info", label: "Informace", shapes: [{ circle: [12, 12, 9] }, { points: [[12, 11], [12, 17]] }, { circle: [12, 7, .5] }] },
];

export function ComparisonIcon({ name, size = 19 }: { name: string; size?: number }) {
  const definition = COMPARISON_ICONS.find(icon => icon.id === name);
  if (!definition || !definition.shapes.length) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {definition.shapes.map((shape, index) => "circle" in shape
      ? <circle key={index} cx={shape.circle[0]} cy={shape.circle[1]} r={shape.circle[2]} />
      : <path key={index} d={`${shape.points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")}${shape.closed ? " Z" : ""}`} />)}
  </svg>;
}

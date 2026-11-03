import { Geometry, type OGLRenderingContext } from "ogl";

export type OutlinePoint = readonly [number, number];

const cross = (a: OutlinePoint, b: OutlinePoint, c: OutlinePoint) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Ear clipping supports the heart's concave outline without a triangulation dependency. */
function triangulate(points: readonly OutlinePoint[]): number[] {
  const remaining = points.map((_, index) => index);
  const triangles: number[] = [];
  let attempts = points.length * points.length;
  while (remaining.length > 3 && attempts-- > 0) {
    let clipped = false;
    for (let index = 0; index < remaining.length; index++) {
      const a = remaining[(index + remaining.length - 1) % remaining.length];
      const b = remaining[index];
      const c = remaining[(index + 1) % remaining.length];
      if (cross(points[a], points[b], points[c]) <= 1e-8) continue;
      const containsPoint = remaining.some(candidate => candidate !== a && candidate !== b && candidate !== c
        && cross(points[a], points[b], points[candidate]) >= -1e-8
        && cross(points[b], points[c], points[candidate]) >= -1e-8
        && cross(points[c], points[a], points[candidate]) >= -1e-8);
      if (containsPoint) continue;
      triangles.push(a, b, c);
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (remaining.length === 3) triangles.push(...remaining);
  return triangles;
}

export function roundedRectangle(radius = .18, steps = 6): OutlinePoint[] {
  const points: OutlinePoint[] = [];
  const centers = [[.5 - radius, .5 - radius], [-.5 + radius, .5 - radius], [-.5 + radius, -.5 + radius], [.5 - radius, -.5 + radius]];
  centers.forEach(([x, y], corner) => {
    for (let step = 0; step <= steps; step++) {
      const angle = (corner + step / steps) * Math.PI / 2;
      points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
    }
  });
  return points;
}

export function roundedPolygon(points: readonly OutlinePoint[], amount = .15): OutlinePoint[] {
  const result: OutlinePoint[] = [];
  points.forEach((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const start = [point[0] + (previous[0] - point[0]) * amount, point[1] + (previous[1] - point[1]) * amount];
    const end = [point[0] + (next[0] - point[0]) * amount, point[1] + (next[1] - point[1]) * amount];
    for (let step = 0; step <= 4; step++) {
      const t = step / 4;
      result.push([(1 - t) ** 2 * start[0] + 2 * (1 - t) * t * point[0] + t * t * end[0],
        (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * point[1] + t * t * end[1]]);
    }
  });
  return result;
}

/** A solid extrusion with smooth chamfers and a flat face for crisp studio reflections. */
export function beveledExtrusion(gl: OGLRenderingContext, outline: readonly OutlinePoint[], depth = 1, inset = .1): Geometry {
  let points = [...outline];
  const signedArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (signedArea < 0) points = points.reverse();
  const count = points.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const bevel = Math.min(depth * .26, .085);
  const rings = [
    { scale: 1 - inset, z: -depth / 2, radial: .58, normalZ: -.815 },
    { scale: 1, z: -depth / 2 + bevel, radial: 1, normalZ: 0 },
    { scale: 1, z: depth / 2 - bevel, radial: 1, normalZ: 0 },
    { scale: 1 - inset, z: depth / 2, radial: .58, normalZ: .815 },
  ];
  rings.forEach(ring => {
    points.forEach((point, index) => {
      const previous = points[(index + count - 1) % count];
      const next = points[(index + 1) % count];
      const dx = next[0] - previous[0];
      const dy = next[1] - previous[1];
      const length = Math.hypot(dx, dy) || 1;
      positions.push(point[0] * ring.scale, point[1] * ring.scale, ring.z);
      normals.push(dy / length * ring.radial, -dx / length * ring.radial, ring.normalZ);
    });
  });
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % count;
      const a = ring * count + index, b = ring * count + next;
      const c = (ring + 1) * count + index, d = (ring + 1) * count + next;
      indices.push(a, b, c, b, d, c);
    }
  }
  const faceTriangles = triangulate(points);
  [-1, 1].forEach(side => {
    const start = positions.length / 3;
    points.forEach(point => {
      positions.push(point[0] * (1 - inset), point[1] * (1 - inset), side * depth / 2);
      normals.push(0, 0, side);
    });
    for (let index = 0; index < faceTriangles.length; index += 3) {
      const triangle = faceTriangles.slice(index, index + 3);
      if (side < 0) triangle.reverse();
      indices.push(...triangle.map(vertex => start + vertex));
    }
  });
  return new Geometry(gl, {
    position: { size: 3, data: new Float32Array(positions) },
    normal: { size: 3, data: new Float32Array(normals) },
    index: { data: new Uint16Array(indices) },
  });
}

/** A lathed, softly bevelled unit cylinder whose axis runs along Y. */
export function beveledCylinder(gl: OGLRenderingContext): Geometry {
  const profile = [[0, -.5], [.42, -.5], [.485, -.465], [.5, -.4], [.5, .4], [.485, .465], [.42, .5], [0, .5]];
  const segments = 32;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  profile.forEach(([radius, y], ring) => {
    const before = profile[Math.max(0, ring - 1)], after = profile[Math.min(profile.length - 1, ring + 1)];
    const radialNormal = after[1] - before[1], yNormal = before[0] - after[0];
    const length = Math.hypot(radialNormal, yNormal) || 1;
    for (let index = 0; index <= segments; index++) {
      const angle = index / segments * Math.PI * 2;
      positions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
      normals.push(Math.sin(angle) * radialNormal / length, yNormal / length, Math.cos(angle) * radialNormal / length);
      if (ring < profile.length - 1 && index < segments) {
        const a = ring * (segments + 1) + index, b = a + segments + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  });
  return new Geometry(gl, {
    position: { size: 3, data: new Float32Array(positions) },
    normal: { size: 3, data: new Float32Array(normals) },
    index: { data: new Uint16Array(indices) },
  });
}

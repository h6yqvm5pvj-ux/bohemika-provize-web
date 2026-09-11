import { Camera, Cylinder, Geometry, Mesh, Program, Renderer, Sphere, Transform, Vec3 } from "ogl";

type Point = [number, number, number];
export type TravelScene = { setPaused: (paused: boolean) => void; dispose: () => void };

const vertex = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform vec3 color;
  uniform float water;
  uniform float time;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    float sun = max(dot(n, normalize(vec3(-0.5, 0.85, 0.65))), 0.0);
    float fill = max(dot(n, normalize(vec3(0.8, 0.25, 0.3))), 0.0);
    vec3 surface = color * (0.55 + 0.43 * sun + 0.12 * fill);
    if (water > 0.5 && vPosition.y > 0.01) {
      float radius = length(vPosition.xz);
      float ripple = sin(radius * 15.0 - time * 1.5 + sin(vPosition.x * 3.0) * 0.35);
      float foam = smoothstep(0.955, 1.0, ripple);
      surface = mix(surface, vec3(0.62, 0.88, 0.84), foam * 0.32);
    }
    gl_FragColor = vec4(surface, 1.0);
  }
`;

/** Geometry is authored here; no image textures, downloaded models or AI assets. */
export function createTravelScene(canvas: HTMLCanvasElement, onUnavailable: () => void): TravelScene {
  const renderer = new Renderer({ canvas, alpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio || 1, 2), powerPreference: "low-power" });
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);
  const geometries = new Set<Geometry>();
  const programs = new Map<string, Program>();
  const scene = new Transform();
  const world = new Transform();
  world.setParent(scene);
  const camera = new Camera(gl, { near: 0.1, far: 50 });
  camera.position.set(7, 5.6, 9);
  camera.lookAt([0, 1.25, 0]);

  const keep = <T extends Geometry>(geometry: T): T => { geometries.add(geometry); return geometry; };
  const sphere = keep(new Sphere(gl, { radius: 1, widthSegments: 24, heightSegments: 16 }));
  const pebble = keep(new Sphere(gl, { radius: 1, widthSegments: 7, heightSegments: 5 }));
  const cylinder = keep(new Cylinder(gl, { radiusTop: 0.86, radiusBottom: 1, height: 1, radialSegments: 10 }));

  function material(hex: string, water = false) {
    const key = `${hex}-${water}`;
    if (!programs.has(key)) {
      const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
      programs.set(key, new Program(gl, { vertex, fragment, cullFace: false, uniforms: { color: { value: rgb }, water: { value: water ? 1 : 0 }, time: { value: 0 } } }));
    }
    return programs.get(key)!;
  }

  function mesh(geometry: Geometry, hex: string, position: Point, scale: Point, parent = world, water = false) {
    const model = new Mesh(gl, { geometry, program: material(hex, water) });
    model.position.set(...position);
    model.scale.set(...scale);
    model.setParent(parent);
    return model;
  }

  // Separate triangles preserve the intentional facets on leaves and airfoils.
  function facets(triangles: Point[][]) {
    const positions: number[] = [];
    const normals: number[] = [];
    for (const [a, b, c] of triangles) {
      const normal = new Vec3(...b).sub(new Vec3(...a)).cross(new Vec3(...c).sub(new Vec3(...a))).normalize();
      for (const point of [a, b, c]) { positions.push(...point); normals.push(...normal); }
    }
    return keep(new Geometry(gl, { position: { size: 3, data: new Float32Array(positions) }, normal: { size: 3, data: new Float32Array(normals) } }));
  }

  function rod(a: Point, b: Point, radius: number, hex: string, parent: Transform) {
    const direction = new Vec3(...b).sub(new Vec3(...a));
    const length = direction.len();
    const middle = new Vec3(...a).add(new Vec3(...b)).scale(0.5);
    const model = mesh(cylinder, hex, [middle.x, middle.y, middle.z], [radius, length, radius], parent);
    const axis = new Vec3(direction.z, 0, -direction.x);
    if (axis.len() > 0.0001) model.quaternion.fromAxisAngle(axis.normalize(), Math.acos(direction.y / length));
    return model;
  }

  const oceanGeometry = keep(new Cylinder(gl, { radiusTop: 3.05, radiusBottom: 2.98, height: 0.12, radialSegments: 80 }));
  mesh(oceanGeometry, "#218e9f", [0, 0, 0], [1, 1, 0.76], world, true);
  mesh(sphere, "#67bdb6", [-0.15, 0.08, 0], [1.94, 0.1, 1.35]);
  mesh(sphere, "#d8c397", [-0.15, 0.16, 0], [1.68, 0.23, 1.14]);
  mesh(sphere, "#f2dfb4", [-0.23, 0.27, -0.07], [1.53, 0.21, 1.03]);
  // Restrained contact shadows help the miniature read as solid geometry.
  mesh(sphere, "#b5ad83", [-0.48, 0.455, -0.11], [0.7, 0.014, 0.39]);

  const leafTriangles: Point[][] = [];
  function leafSection(t: number): [Point, Point, Point] {
    const center: Point = [t * 1.24, Math.sin(t * Math.PI) * 0.24 - t * t * 0.43, 0];
    const width = Math.sin(t * Math.PI) * 0.23;
    return [[center[0], center[1] - width * 0.35, -width], [center[0], center[1] + width * 0.18, 0], [center[0], center[1] - width * 0.35, width]];
  }
  for (let i = 0; i < 7; i++) {
    const a = leafSection(i / 7), b = leafSection((i + 1) / 7);
    leafTriangles.push([a[0], b[0], a[1]], [a[1], b[0], b[1]], [a[1], b[1], a[2]], [a[2], b[1], b[2]]);
  }
  const leafGeometry = facets(leafTriangles);
  const palms: Transform[] = [];
  function palm(position: Point, height: number, lean: number, direction: number) {
    const tree = new Transform();
    tree.position.set(...position);
    tree.rotation.y = direction;
    tree.setParent(world);
    palms.push(tree);
    const trunk = (t: number): Point => [lean * t * t, t * height, 0];
    for (let i = 0; i < 9; i++) rod(trunk(i / 9), trunk((i + 1) / 9), 0.095 - i * 0.0045, i % 2 ? "#bca478" : "#c9b389", tree);
    const crown = new Transform();
    crown.position.set(...trunk(1));
    crown.setParent(tree);
    for (let i = 0; i < 7; i++) {
      const leaf = mesh(leafGeometry, i % 2 ? "#87b78c" : "#4a9874", [0, 0, 0], [1, 1, 1], crown);
      leaf.rotation.y = i * Math.PI * 2 / 7;
      leaf.rotation.z = 0.05 + (i % 3) * 0.08;
    }
    for (let i = 0; i < 3; i++) mesh(sphere, "#867859", [Math.cos(i * 2.1) * 0.105, -0.05, Math.sin(i * 2.1) * 0.105], [0.09, 0.1, 0.09], crown);
  }
  palm([-0.72, 0.43, -0.27], 1.98, -0.31, -0.25);
  palm([0.2, 0.4, 0.16], 1.38, 0.28, 0.3);
  mesh(pebble, "#c4baa1", [-0.98, 0.45, 0.41], [0.27, 0.2, 0.2]);
  mesh(pebble, "#e5d5b0", [0.63, 0.43, -0.32], [0.23, 0.16, 0.19]);
  mesh(pebble, "#b8b69a", [0.93, 0.34, 0.27], [0.14, 0.1, 0.12]);

  // Airplane authored along +Z; tapered fuselage, swept wings and two engines.
  const aircraft = new Transform();
  aircraft.scale.set(0.82);
  aircraft.setParent(world);
  mesh(sphere, "#f4f5ec", [0, 0, 0], [0.19, 0.18, 1.13], aircraft);
  mesh(sphere, "#233f50", [0, 0.09, 0.86], [0.155, 0.08, 0.19], aircraft);

  function wing(points: [number, number][], thickness: number, hex: string, parent: Transform) {
    const triangles: Point[][] = [];
    const top = points.map(([x, z]): Point => [x, thickness / 2, z]);
    const bottom = points.map(([x, z]): Point => [x, -thickness / 2, z]);
    for (let i = 1; i < points.length - 1; i++) {
      triangles.push([top[0], top[i], top[i + 1]], [bottom[0], bottom[i + 1], bottom[i]]);
    }
    for (let i = 0; i < points.length; i++) {
      const next = (i + 1) % points.length;
      triangles.push([top[i], bottom[i], top[next]], [bottom[i], bottom[next], top[next]]);
    }
    return mesh(facets(triangles), hex, [0, 0, 0], [1, 1, 1], parent);
  }
  wing([[-0.1, 0.29], [-1.18, -0.39], [-1.17, -0.58], [-0.1, -0.29]], 0.065, "#d8e4df", aircraft);
  wing([[0.1, 0.29], [1.18, -0.39], [1.17, -0.58], [0.1, -0.29]], 0.065, "#f0f2e8", aircraft);
  wing([[-0.07, -0.61], [-0.5, -0.95], [-0.49, -1.05], [0.49, -1.05], [0.5, -0.95], [0.07, -0.61]], 0.045, "#d7e4df", aircraft);
  const tail = wing([[0, -0.56], [0.5, -0.94], [0.5, -1.09], [0, -1.06]], 0.055, "#6fa89c", aircraft);
  tail.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    mesh(sphere, "#e2e9e2", [side * 0.56, -0.12, -0.02], [0.13, 0.13, 0.34], aircraft);
    mesh(sphere, "#244656", [side * 0.56, -0.12, 0.283], [0.086, 0.085, 0.025], aircraft);
    for (let i = 0; i < 6; i++) mesh(sphere, "#416075", [side * 0.181, 0.048, 0.52 - i * 0.17], [0.017, 0.029, 0.043], aircraft);
  }

  let frame = 0, time = 0, lastTime = 0, lastDraw = 0;
  let paused = false, visible = false, disposed = false, lost = false;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const host = canvas.parentElement!;
  const shouldAnimate = () => !disposed && !lost && visible && !document.hidden && !paused && !motion.matches && document.documentElement.dataset.motion !== "off";

  function draw() {
    const phase = time * 0.24 - 0.8;
    aircraft.position.set(Math.cos(phase) * 2.55, 2.98 + Math.sin(phase * 2) * 0.09, Math.sin(phase) * 1.63);
    aircraft.rotation.set(0, Math.atan2(-Math.sin(phase) * 2.55, Math.cos(phase) * 1.63), -0.12);
    palms.forEach((tree, i) => { tree.rotation.z = Math.sin(time * 0.85 + i) * 0.017; });
    programs.forEach(program => { program.uniforms.time.value = time; });
    renderer.render({ scene, camera });
  }

  function tick(now: number) {
    frame = 0;
    if (!shouldAnimate()) return;
    // Cap decorative rendering at 30 fps; elapsed time excludes paused periods.
    if (now - lastDraw >= 1000 / 30) {
      time += lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0;
      lastTime = now; lastDraw = now;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function updateMotion() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastTime = 0; lastDraw = 0;
    if (shouldAnimate()) frame = requestAnimationFrame(tick);
  }

  function resize() {
    if (disposed || lost) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    const aspect = width / height;
    const halfHeight = Math.max(2.65, 3.6 / aspect);
    camera.orthographic({ left: -halfHeight * aspect, right: halfHeight * aspect, bottom: -halfHeight, top: halfHeight });
    draw();
  }

  function contextLost(event: Event) {
    event.preventDefault(); lost = true; updateMotion(); onUnavailable();
  }

  const sizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; updateMotion(); });
  const settingsObserver = new MutationObserver(updateMotion);
  sizeObserver.observe(host);
  visibilityObserver.observe(canvas);
  settingsObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  motion.addEventListener("change", updateMotion);
  document.addEventListener("visibilitychange", updateMotion);
  canvas.addEventListener("webglcontextlost", contextLost);
  resize();

  return {
    setPaused(value) { paused = value; updateMotion(); },
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      sizeObserver.disconnect(); visibilityObserver.disconnect(); settingsObserver.disconnect();
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateMotion);
      canvas.removeEventListener("webglcontextlost", contextLost);
      geometries.forEach(geometry => geometry.remove());
      programs.forEach(program => program.remove());
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

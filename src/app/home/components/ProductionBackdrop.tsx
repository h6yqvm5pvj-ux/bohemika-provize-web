"use client";

import { useEffect, useRef } from "react";
import type { Geometry, Mesh, Program, Renderer } from "ogl";

type Props = {
  running: boolean;
  enabled: boolean;
  className: string;
};

const vertex = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec4 positionInView = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vPosition = positionInView.xyz;
    gl_Position = projectionMatrix * positionInView;
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 view = normalize(-vPosition);
    vec3 reflection = reflect(-view, normal);
    float sweep = sin(uTime * 0.24) * 0.14;

    // Broad studio panels and a thin white strip travel across real mesh normals.
    float panel = exp(-pow((reflection.x + 0.38 - sweep) * 8.0, 2.0));
    float strip = exp(-pow((reflection.x - 0.58 + sweep * 0.5) * 18.0, 2.0));
    float overhead = pow(max(dot(reflection, normalize(vec3(-0.3, 0.85, 0.55))), 0.0), 18.0);
    float bottom = exp(-pow((reflection.y + 0.42) * 12.0, 2.0));
    vec3 environment = vec3(0.14, 0.07, 0.19);
    environment += vec3(0.25, 0.14, 0.32) * smoothstep(-0.8, 0.8, reflection.y);
    environment += vec3(4.3, 3.8, 4.6) * panel;
    environment += vec3(1.6, 1.0, 1.9) * strip;
    environment += vec3(2.5, 2.3, 2.7) * overhead;
    environment += vec3(0.55, 0.34, 0.7) * bottom;

    float diffuse = max(dot(normal, normalize(vec3(-0.5, 0.8, 0.9))), 0.0);
    float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 4.0);
    vec3 color = uColor * (0.28 + diffuse * 0.42);
    color += environment * (uColor * 0.8 + vec3(0.12)) * (0.62 + fresnel * 0.7);
    color += vec3(0.35) * exp(-pow((reflection.x + 0.38 - sweep) * 26.0, 2.0));
    color = color / (color + vec3(1.0));
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
  }
`;

/** One viewport-sized scene supplies depth behind the whole home page. */
export function ProductionBackdrop({ running, enabled, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runningRef = useRef(running);
  const invalidateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    runningRef.current = running;
    invalidateRef.current?.();
  }, [running]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !host || !canvas) return;

    let disposed = false;
    let renderer: Renderer | undefined;
    let observer: ResizeObserver | undefined;
    let frame: number | undefined;
    let lastRender = 0;
    let elapsed = 0;
    let frameCount = 0;
    let width = 0;
    let height = 0;
    const programs: Program[] = [];
    const geometries: Geometry[] = [];
    const meshes: Mesh[] = [];

    const cancelFrame = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) cancelFrame();
      else {
        lastRender = 0;
        invalidateRef.current?.();
      }
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cancelFrame();
      invalidateRef.current = null;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      delete host.dataset.productionRenderer;
      meshes.forEach(mesh => mesh.setParent(null));
      geometries.forEach(geometry => geometry.remove());
      programs.forEach(program => program.remove());
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      dispose();
    };

    // The optional scene is downloaded after the cards, and never in lite mode.
    void import("ogl").then(({ Camera, Mesh, Program, Renderer, Sphere, Torus, Transform }) => {
      if (disposed) return;
      const attributes: WebGLContextAttributes = {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        powerPreference: "low-power",
      };
      const webgl2 = canvas.getContext("webgl2", attributes);
      const context = webgl2 || canvas.getContext("webgl", attributes);
      if (!context) {
        dispose();
        return;
      }

      canvas.addEventListener("webglcontextlost", onContextLost);
      renderer = new Renderer({
        canvas,
        ...attributes,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
        webgl: webgl2 ? 2 : 1,
      });
      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      const scene = new Transform();
      const camera = new Camera(gl, { near: 1, far: 2000, left: -1, right: 1, bottom: -1, top: 1 });
      camera.position.z = 1000;
      const material = (color: [number, number, number]) => {
        const program = new Program(gl, {
          vertex,
          fragment,
          uniforms: { uColor: { value: color }, uTime: { value: 0 } },
          cullFace: false,
        });
        programs.push(program);
        if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) throw new Error("Unavailable production shader");
        return program;
      };
      const purple = material([0.32, 0.1, 0.46]);
      const pearl = material([0.67, 0.43, 0.77]);
      const ringGeometry = new Torus(gl, { radius: 0.68, tube: 0.23, radialSegments: 20, tubularSegments: 64 });
      geometries.push(ringGeometry);
      const sphereGeometry = new Sphere(gl, { radius: 0.5, widthSegments: 32, heightSegments: 24 });
      geometries.push(sphereGeometry);
      const add = (geometry: Geometry, program: Program) => {
        const mesh = new Mesh(gl, { geometry, program, frustumCulled: false });
        mesh.setParent(scene);
        meshes.push(mesh);
        return mesh;
      };
      const ring = add(ringGeometry, purple);
      const orb = add(sphereGeometry, pearl);
      const orbit = add(ringGeometry, pearl);

      const render = (now: number) => {
        frame = undefined;
        if (disposed || !renderer || document.hidden) return;
        const animate = runningRef.current;
        if (animate && now - lastRender < 1000 / 30) {
          frame = window.requestAnimationFrame(render);
          return;
        }
        if (animate) elapsed += Math.min(lastRender ? now - lastRender : 0, 50) / 1000;
        lastRender = now;
        const compact = width < 650;
        const phase = elapsed * 0.28;
        const viewportScale = Math.min(width, height);
        const ringSize = compact
          ? Math.min(138, Math.max(92, width * 0.32))
          : Math.min(210, Math.max(140, viewportScale * 0.23));
        ring.position.set(width * (compact ? -0.46 : -0.42), -height * 0.28 + Math.sin(phase) * 11, 0);
        ring.scale.set(ringSize);
        ring.rotation.set(0.42 + Math.sin(phase * 0.7) * 0.14, -0.48 + Math.cos(phase) * 0.22, -0.35 + phase * 0.12);
        const orbSize = compact
          ? Math.min(104, Math.max(82, width * 0.25))
          : Math.min(158, Math.max(110, viewportScale * 0.17));
        orb.position.set(width * 0.39, height * 0.34 + Math.cos(phase + 1) * 8, 0);
        orb.scale.set(orbSize);
        orb.rotation.set(0, phase * 0.4, 0);
        const orbitSize = compact
          ? Math.min(82, Math.max(64, width * 0.19))
          : Math.min(148, Math.max(108, viewportScale * 0.16));
        orbit.position.set(width * (compact ? 0.47 : 0.39), -height * 0.08 + Math.sin(phase + 2) * 9, 0);
        orbit.scale.set(orbitSize);
        orbit.rotation.set(-0.55 + Math.cos(phase) * 0.12, 0.65 + Math.sin(phase * 0.8) * 0.18, 0.45 - phase * 0.1);
        programs.forEach(program => { program.uniforms.uTime.value = elapsed; });
        try {
          renderer.render({ scene, camera, frustumCull: false });
        } catch {
          dispose();
          return;
        }
        host.dataset.productionRenderer = "ready";
        canvas.dataset.productionFrame = String(++frameCount);
        if (animate) frame = window.requestAnimationFrame(render);
      };
      const invalidate = () => {
        if (!disposed && frame === undefined && !document.hidden) frame = window.requestAnimationFrame(render);
      };
      const measure = () => {
        if (disposed || !renderer) return;
        const box = host.getBoundingClientRect();
        // The sticky host fills one viewport even when the home page is very long.
        const nextWidth = Math.max(1, Math.round(Math.min(box.width, window.innerWidth)));
        const nextHeight = Math.max(1, Math.round(Math.min(box.height, window.innerHeight)));
        if (nextWidth !== width || nextHeight !== height) {
          width = nextWidth;
          height = nextHeight;
          renderer.setSize(width, height);
          camera.orthographic({ left: -width / 2, right: width / 2, bottom: -height / 2, top: height / 2 });
        }
        invalidate();
      };
      observer = new ResizeObserver(measure);
      observer.observe(host);
      document.addEventListener("visibilitychange", onVisibility);
      invalidateRef.current = invalidate;
      measure();
    }).catch(dispose);

    return dispose;
  }, [enabled]);

  return (
    <div ref={hostRef} className={className} aria-hidden="true">
      <div data-production-artwork-fallback="">
        <span data-shape="ring" />
        <span data-shape="pearl" />
        <span data-shape="orbit" />
      </div>
      <canvas ref={canvasRef} data-production-artwork-canvas="" />
    </div>
  );
}

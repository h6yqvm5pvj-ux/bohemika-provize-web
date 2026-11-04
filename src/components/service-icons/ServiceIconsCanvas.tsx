"use client";

import { Camera, Mesh, Renderer, Transform, type Program } from "ogl";
import { useEffect, useRef, type RefObject } from "react";
import { createServiceIconMaterials } from "./serviceIconMaterials";
import { createServiceIconModel } from "./serviceIconModels";

type ServiceIconsCanvasProps = {
  hostRef: RefObject<HTMLDivElement | null>;
  rowRef: RefObject<HTMLDivElement | null>;
  running: boolean;
  className: string;
};

type IconBounds = { x: number; y: number; scale: number; visible: boolean };

/** One shared WebGL context keeps the whole service collection inexpensive. */
export function ServiceIconsCanvas({ hostRef, rowRef, running, className }: ServiceIconsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runningRef = useRef(running);
  const invalidateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    runningRef.current = running;
    invalidateRef.current?.();
  }, [running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    const row = rowRef.current;
    if (!canvas || !host || !row) return;

    const attributes: WebGLContextAttributes = { alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: "low-power" };
    // Probe before OGL initialization, which assumes a valid context.
    let webgl2: WebGL2RenderingContext | null;
    let context: WebGL2RenderingContext | WebGLRenderingContext | null;
    try {
      webgl2 = canvas.getContext("webgl2", attributes);
      context = webgl2 || canvas.getContext("webgl", attributes);
    } catch {
      return;
    }
    if (!context) return;

    let renderer: Renderer | undefined;
    let materials: ReturnType<typeof createServiceIconMaterials> | undefined;
    const models: ReturnType<typeof createServiceIconModel>[] = [];
    let bounds: IconBounds[] = [];
    let width = 0;
    let height = 0;
    let frame: number | undefined;
    let frameCount = 0;
    let stopped = false;
    let lastRender = 0;
    let time = 0;
    let teardown: (() => void) | undefined;

    const cancelFrame = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
    };
    const showFallback = () => {
      delete host.dataset.serviceRenderer;
      stopped = true;
      cancelFrame();
      teardown?.();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      showFallback();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    try {
      renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        powerPreference: "low-power",
        dpr: Math.min(window.devicePixelRatio || 1, 1.75),
        webgl: webgl2 ? 2 : 1,
      });
      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      materials = createServiceIconMaterials(gl);
      if (Object.values(materials).some(program => !gl.getProgramParameter(program.program, gl.LINK_STATUS))) throw new Error("Invalid icon shader");
      const scene = new Transform();
      const camera = new Camera(gl, { near: 1, far: 2000, left: -1, right: 1, bottom: -1, top: 1 });
      camera.position.z = 1000;
      const serviceIconCount = row.querySelectorAll("[data-service-icon]").length;
      for (let index = 0; index < serviceIconCount; index++) {
        const model = createServiceIconModel(gl, index, materials);
        model.root.setParent(scene);
        model.root.traverse(node => {
          if (!(node instanceof Mesh)) return;
          node.onBeforeRender(() => {
            node.program.uniforms.uIconCenter.value = model.root.position;
            node.program.uniforms.uViewDistance.value = model.root.scale.z * 5;
          });
        });
        models.push(model);
      }

      const render = (now: number) => {
        frame = undefined;
        if (stopped || !renderer || !materials || document.hidden) return;
        const animate = runningRef.current;
        if (animate && now - lastRender < 1000 / 30) {
          frame = window.requestAnimationFrame(render);
          return;
        }
        if (animate) time += Math.min(50, lastRender ? now - lastRender : 0) / 1000;
        lastRender = now;
        models.forEach((model, index) => {
          const box = bounds[index];
          model.root.visible = Boolean(box?.visible);
          if (!box) return;
          const phase = time * .7 + index * .72;
          model.root.position.set(box.x, box.y + Math.sin(phase) * 1.8, 0);
          model.root.scale.set(box.scale);
          model.root.rotation.set(-.30 + Math.sin(phase * .8) * .035, -.50 + Math.sin(phase) * .22, Math.sin(phase * .65) * .025);
        });
        Object.values(materials).forEach((program: Program) => { program.uniforms.uTime.value = time; });
        try {
          renderer.render({ scene, camera, frustumCull: false });
        } catch {
          showFallback();
          return;
        }
        host.dataset.serviceRenderer = "ready";
        canvas.dataset.serviceFrame = String(++frameCount);
        if (animate) frame = window.requestAnimationFrame(render);
      };
      const invalidate = () => {
        if (!stopped && frame === undefined && !document.hidden) frame = window.requestAnimationFrame(render);
      };
      const measure = () => {
        if (stopped || !renderer) return;
        const hostBox = host.getBoundingClientRect();
        const nextWidth = Math.max(1, Math.round(hostBox.width));
        const nextHeight = Math.max(1, Math.round(hostBox.height));
        if (nextWidth !== width || nextHeight !== height) {
          width = nextWidth;
          height = nextHeight;
          renderer.setSize(width, height);
          camera.orthographic({ left: -width / 2, right: width / 2, bottom: -height / 2, top: height / 2 });
        }
        bounds = Array.from(row.querySelectorAll<HTMLElement>("[data-service-icon]")).map(element => {
          const box = element.getBoundingClientRect();
          return {
            x: box.left - hostBox.left + box.width / 2 - width / 2,
            y: height / 2 - (box.top - hostBox.top + box.height / 2),
            scale: Math.min(box.width, box.height) * .43,
            visible: box.right > hostBox.left && box.left < hostBox.right,
          };
        });
        invalidate();
      };
      const resize = new ResizeObserver(measure);
      resize.observe(host);
      resize.observe(row);
      row.addEventListener("scroll", measure, { passive: true });
      window.addEventListener("resize", measure, { passive: true });
      const onVisibility = () => {
        if (document.hidden) cancelFrame();
        else { lastRender = 0; invalidate(); }
      };
      document.addEventListener("visibilitychange", onVisibility);
      invalidateRef.current = invalidate;
      measure();

      let disposed = false;
      teardown = () => {
        if (disposed) return;
        disposed = true;
        stopped = true;
        cancelFrame();
        invalidateRef.current = null;
        resize.disconnect();
        row.removeEventListener("scroll", measure);
        window.removeEventListener("resize", measure);
        document.removeEventListener("visibilitychange", onVisibility);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        delete host.dataset.serviceRenderer;
        models.forEach(model => model.dispose());
        Object.values(materials ?? {}).forEach(program => program.remove());
      };
      return teardown;
    } catch {
      showFallback();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      models.forEach(model => model.dispose());
      Object.values(materials ?? {}).forEach(program => program.remove());
    }
  }, [hostRef, rowRef]);

  return <canvas ref={canvasRef} className={className} data-service-icons-canvas="" aria-hidden="true" />;
}

import { Geometry, Mesh, Sphere, Torus, Transform, type OGLRenderingContext, type Program } from "ogl";

import { beveledCylinder, beveledExtrusion, roundedPolygon, roundedRectangle, type OutlinePoint } from "./serviceIconGeometry";

export type ServiceIconMaterials = { blue: Program; chrome: Program; gold: Program; dark: Program };
export type ServiceIconModel = { root: Transform; dispose: () => void };
type Vector = readonly [number, number, number];

const SHIELD: OutlinePoint[] = [[-.73, .67], [0, .94], [.73, .67], [.66, -.18], [.42, -.66], [0, -.98], [-.42, -.66], [-.66, -.18]];
const HOUSE: OutlinePoint[] = [[-.6, -.5], [.6, -.5], [.6, .23], [0, .75], [-.6, .23]];

/** Genuine mesh silhouettes, shared by the row's single WebGL renderer. */
export function createServiceIconModel(gl: OGLRenderingContext, index: number, materials: ServiceIconMaterials): ServiceIconModel {
  const root = new Transform();
  const body = new Transform();
  body.setParent(root);
  const geometries = new Map<string, Geometry>();
  const meshes: Mesh[] = [];
  const geometry = (name: string, create: () => Geometry) => {
    let value = geometries.get(name);
    if (!value) { value = create(); geometries.set(name, value); }
    return value;
  };
  const box = () => geometry("box", () => beveledExtrusion(gl, roundedRectangle(), 1, .09));
  const cylinder = () => geometry("cylinder", () => beveledCylinder(gl));
  const torus = () => geometry("torus", () => new Torus(gl, { radius: .5, tube: .045, radialSegments: 8, tubularSegments: 36 }));
  const sphere = () => geometry("sphere", () => new Sphere(gl, { radius: .5, widthSegments: 20, heightSegments: 12 }));
  const shape = (name: string, outline: readonly OutlinePoint[]) => geometry(name, () => beveledExtrusion(gl, outline, 1, .1));
  const add = (geo: Geometry, material: keyof ServiceIconMaterials, scale: Vector, position: Vector = [0, 0, 0], rotation: Vector = [0, 0, 0]) => {
    const mesh = new Mesh(gl, { geometry: geo, program: materials[material], frustumCulled: false });
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.setParent(body);
    meshes.push(mesh);
    return mesh;
  };
  const block = (material: keyof ServiceIconMaterials, scale: Vector, position: Vector = [0, 0, 0], rotation: Vector = [0, 0, 0]) => add(box(), material, scale, position, rotation);

  switch (index) {
    case 0: {
      const shield = shape("shield", roundedPolygon(SHIELD));
      add(shield, "chrome", [1.06, 1.06, .3]);
      add(shield, "blue", [.94, .94, .24], [0, 0, .085]);
      const heart: OutlinePoint[] = Array.from({ length: 48 }, (_, point) => {
        const angle = point / 48 * Math.PI * 2;
        return [Math.sin(angle) ** 3, (13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle)) / 16 + .15];
      });
      add(shape("heart", heart), "chrome", [.45, .45, .2], [0, .06, .3]);
      break;
    }
    case 1: {
      block("chrome", [1.22, 1.06, .9], [0, -.22, 0]);
      const roof = shape("roof", roundedPolygon([[-.81, 0], [.81, 0], [0, .7]], .04));
      add(roof, "blue", [1, 1, 1.12], [0, .29, 0]);
      block("blue", [.21, .46, .23], [.42, .77, -.15]);
      block("blue", [.31, .69, .06], [.22, -.39, .48]);
      block("dark", [.31, .35, .06], [-.32, -.11, .48]);
      block("chrome", [.025, .36, .075], [-.32, -.11, .49]);
      block("chrome", [.32, .025, .075], [-.32, -.11, .49]);
      add(sphere(), "gold", [.045, .045, .045], [.31, -.39, .53]);
      break;
    }
    case 2: {
      const silhouette = shape("car-body", roundedPolygon([
        [-.99, -.31], [.98, -.31], [1.02, -.08], [.91, .055],
        [.58, .13], [.26, .49], [-.37, .52], [-.68, .28], [-.92, .21], [-1, .015],
      ], .12));
      add(silhouette, "blue", [1, 1, .82]);
      block("chrome", [1.77, .065, .85], [0, -.27, 0]);
      const frontWindow = shape("car-front-window", roundedPolygon([[-.045, .14], [.45, .14], [.225, .415], [-.045, .435]], .09));
      const rearWindow = shape("car-rear-window", roundedPolygon([[-.56, .14], [-.13, .14], [-.13, .435], [-.35, .445]], .09));
      add(frontWindow, "chrome", [1.04, 1.04, .035], [0, 0, .425]);
      add(rearWindow, "chrome", [1.04, 1.04, .035], [0, 0, .425]);
      add(frontWindow, "dark", [.96, .96, .035], [0, 0, .45]);
      add(rearWindow, "dark", [.96, .96, .035], [0, 0, .45]);
      block("chrome", [1.08, .024, .035], [-.045, .09, .445]);
      for (const x of [-.62, .62]) {
        for (const z of [-.43, .43]) {
          add(cylinder(), "dark", [.46, .17, .46], [x, -.31, z], [Math.PI / 2, 0, 0]);
          add(cylinder(), "chrome", [.25, .185, .25], [x, -.31, z], [Math.PI / 2, 0, 0]);
        }
      }
      block("chrome", [.065, .1, .21], [.99, -.035, .25]);
      break;
    }
    case 3: {
      block("chrome", [1.05, 1.39, .6], [0, -.08, 0]);
      block("blue", [.98, 1.33, .62], [0, -.08, .03]);
      for (const x of [-.27, 0, .27]) block("chrome", [.022, 1.03, .025], [x, -.08, .355]);
      for (const x of [-.23, .23]) block("chrome", [.075, .4, .075], [x, .78, 0]);
      block("blue", [.57, .1, .13], [0, .99, 0]);
      for (const x of [-.34, .34]) add(sphere(), "dark", [.2, .2, .22], [x, -.82, 0]);
      break;
    }
    case 4: {
      block("chrome", [1.13, 1.46, .24]);
      block("blue", [1.08, 1.42, .25], [0, 0, .035]);
      block("blue", [.1, 1.42, .3], [-.51, 0, .025]);
      add(torus(), "chrome", [.65, .65, .65], [0, .18, .21]);
      add(torus(), "chrome", [.26, .65, .65], [0, .18, .21]);
      add(torus(), "chrome", [.65, .22, .65], [0, .18, .21]);
      block("chrome", [.39, .025, .045], [0, -.35, .19]);
      block("chrome", [.26, .022, .045], [0, -.43, .19]);
      add(shape("shield", roundedPolygon(SHIELD)), "chrome", [.36, .37, .16], [.47, -.5, .24]);
      add(shape("shield", roundedPolygon(SHIELD)), "blue", [.3, .31, .16], [.47, -.49, .28]);
      block("chrome", [.055, .25, .035], [.47, -.47, .38]);
      block("chrome", [.2, .055, .035], [.47, -.47, .38]);
      break;
    }
    case 5: {
      [.63, 1.03, 1.48].forEach((height, column) => {
        const x = (column - 1) * .51;
        add(cylinder(), "blue", [.39, height, .39], [x, -.75 + height / 2, 0]);
        add(cylinder(), "chrome", [.385, .045, .385], [x, -.75 + height - .035, 0]);
      });
      add(cylinder(), "chrome", [.55, .11, .55], [-.01, -.68, .39], [.3, 0, -.12]);
      add(cylinder(), "gold", [.59, .11, .59], [.44, -.58, .43], [Math.PI / 2 - .2, 0, -.2]);
      add(torus(), "gold", [.49, .49, .49], [.44, -.58, .505], [-.2, 0, -.2]);
      break;
    }
    case 6: {
      body.rotation.z = -.48;
      const house = shape("house", roundedPolygon(HOUSE, .08));
      add(house, "chrome", [.98, .85, .22], [0, .5, 0]);
      add(house, "blue", [.88, .77, .22], [0, .5, .06]);
      block("dark", [.24, .24, .055], [0, .51, .21]);
      block("chrome", [.18, 1.08, .18], [0, -.43, 0]);
      block("chrome", [.37, .17, .18], [.12, -.68, 0]);
      block("chrome", [.34, .17, .18], [.105, -.95, 0]);
      break;
    }
  }

  // Normalize the complete silhouette, including wheels, handle and key teeth.
  root.updateMatrixWorld(true);
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  meshes.forEach(mesh => {
    const position = mesh.geometry.attributes.position.data;
    if (!position) return;
    const matrix = mesh.worldMatrix;
    for (let index = 0; index < position.length; index += 3) {
      const x = Number(position[index]), y = Number(position[index + 1]), z = Number(position[index + 2]);
      const world = [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12], matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13], matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
      world.forEach((coordinate, axis) => { minimum[axis] = Math.min(minimum[axis], coordinate); maximum[axis] = Math.max(maximum[axis], coordinate); });
    }
  });
  const scale = 1.95 / Math.max(...maximum.map((value, axis) => value - minimum[axis]));
  body.scale.set(scale, scale, scale);
  body.position.set(...minimum.map((value, axis) => -(value + maximum[axis]) / 2 * scale) as [number, number, number]);

  let disposed = false;
  return {
    root,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      meshes.forEach(mesh => mesh.setParent(null));
      geometries.forEach(value => value.remove());
      body.setParent(null);
      root.setParent(null);
    },
  };
}

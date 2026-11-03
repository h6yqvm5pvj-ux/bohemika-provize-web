import { Program, type OGLRenderingContext } from "ogl";

const vertex = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  uniform mat4 modelMatrix;
  uniform float uCurvature;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    // A softly domed clear coat catches long reflections across broad faces,
    // while the underlying bevels and silhouette remain real mesh geometry.
    vec3 coatedNormal = normal;
    coatedNormal.xy += position.xy * uCurvature * pow(abs(normal.z), 4.0);
    vNormal = normalize(normalMatrix * normalize(coatedNormal));
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uReflectivity;
  uniform vec3 uIconCenter;
  uniform float uViewDistance;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  float softbox(vec3 reflection, vec3 direction, float sharpness) {
    return pow(max(dot(reflection, normalize(direction)), 0.0), sharpness);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDirection = normalize(uIconCenter + vec3(0.0, 0.0, uViewDistance) - vWorldPosition);
    vec3 reflection = reflect(-viewDirection, n);
    float sweep = sin(uTime * 0.34) * 0.22;

    // Broad studio panels and a narrow cyan strip are reflected by the actual
    // mesh normals. They move over the bevels as each sculpture turns.
    vec3 environment = vec3(0.006, 0.015, 0.025);
    environment += vec3(0.02, 0.05, 0.09) * smoothstep(-0.8, 0.65, reflection.y);
    float leftPanel = exp(-pow((reflection.x + 0.55 - sweep) * 7.5, 2.0));
    float rightPanel = exp(-pow((reflection.x - 0.48 + sweep * 0.5) * 15.0, 2.0));
    environment += vec3(5.0, 5.5, 6.0) * leftPanel;
    environment += vec3(1.6, 3.1, 4.0) * rightPanel;
    environment += vec3(2.1, 2.4, 2.7) * softbox(reflection, vec3(-0.3, 0.8, 0.6), 14.0);
    environment += vec3(0.9, 1.6, 2.0) * exp(-pow((reflection.y - 0.28) * 22.0, 2.0));

    float diffuse = max(dot(n, normalize(vec3(-0.45, 0.8, 0.85))), 0.0);
    float fresnel = pow(1.0 - max(dot(n, viewDirection), 0.0), 4.0);
    vec3 color = uColor * (0.12 + diffuse * 0.32);
    // Tinted metal and its thin neutral clear coat are separate: broad light
    // reflections preserve cobalt/gold instead of washing every face silver.
    color += environment * (uColor * 0.95 + 0.03) * uReflectivity * (0.68 + fresnel * 0.9);
    float clearcoat = exp(-pow((reflection.x + 0.55 - sweep) * 24.0, 2.0));
    color += vec3(clearcoat * 0.18 * uReflectivity);
    color += vec3(0.01, 0.2, 0.33) * pow(1.0 - max(n.z, 0.0), 3.0) * uReflectivity;
    color = color / (color + vec3(1.0));
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
  }
`;

export function createServiceIconMaterials(gl: OGLRenderingContext) {
  const material = (color: [number, number, number], reflectivity: number, curvature: number) => new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uColor: { value: color },
      uReflectivity: { value: reflectivity },
      uCurvature: { value: curvature },
      uIconCenter: { value: [0, 0, 0] },
      uViewDistance: { value: 250 },
      uTime: { value: 0 },
    },
    cullFace: false,
  });

  return {
    blue: material([0.006, 0.075, 0.32], 0.82, 0.38),
    chrome: material([0.72, 0.82, 0.92], 1.0, 0.16),
    gold: material([0.95, 0.40, 0.055], 0.92, 0.22),
    dark: material([0.008, 0.02, 0.03], 0.09, 0.06),
  };
}

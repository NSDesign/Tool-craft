import { hexToRgb01, isWaterPigment, isWhitePigment } from "./pigments";

export type BrushShape = "round" | "filbert" | "square";
export type HairType = "sable" | "hog";

export type WatercolorParams = {
  backgroundColor: string;
  brushHairType: HairType;
  brushShape: BrushShape;
  brushSize: number;
  dryingSpeed: number;
  edgeDarkening: number;
  granulation: number;
  includeBackground: boolean;
  paintAbsorption: number;
  pigmentHex: string;
  pigmentOpacity: number;
  reliefHeight: number;
  roughness: number;
  strokeSpacing: number;
  tilt: number;
  waterAbsorption: number;
  wetnessSpread: number;
};

// Simulation model after David Small, "Modeling Watercolor by Simulating
// Diffusion, Pigment, and Paper Fibers" (MIT Media Lab, Visible Language
// Workshop). Each cell carries a SURFACE layer (paint sitting on top of the
// paper, still mobile: CMY pigment in rgb, water in a) and an INFUSED layer
// (paint soaked into the fibers: CMY in rgb, water in a). Per frame:
//   1. force-field pass — per-axis displacement force on the surface water:
//      D = g·water (tilt gravity) + s·Σ(water±n)/n (surface tension)
//      + sp·(water−1 − water+1) (spreading), eq [1] of the paper.
//   2. simulation pass (MRT) — surface advection by the force field (eqs
//      [2]–[5], pigment rides with the water), brush deposit (additive CMY —
//      no per-pigment asymptote, so repeated strokes keep darkening), infused
//      diffusion gated by dampness and paper absorbency (eqs [6]–[8]),
//      absorption surface→infused with capacity clamp and granulation-weighted
//      settling (eqs [9]–[10]), evaporation ∝ drying speed.
//   3. composite pass — subtractive render: paper − (CMY_surface + CMY_infused),
//      eqs [11]–[13], plus relief shading, wet sheen, and soft edge darkening.

// Multiply/fract-based hash: avoids sin()/trig, which is comparatively
// expensive on both mobile GPUs and software (SwiftShader-class) renderers.
const NOISE_GLSL = `
float toolcraftHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float toolcraftNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = toolcraftHash(i);
  float b = toolcraftHash(i + vec2(1.0, 0.0));
  float c = toolcraftHash(i + vec2(0.0, 1.0));
  float d = toolcraftHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
`;

// Only needed where the paper heightmap is actually computed from noise (the
// precomputed paper-height pass below); the simulation/composite passes
// instead sample the cached uPaperHeight texture. Height doubles as the
// paper-fiber absorbency field: cavities (low height) soak up more paint.
const PAPER_HEIGHT_GLSL = `
float toolcraftPaperHeight(vec2 uv, float roughness, float relief, vec2 resolution) {
  float aspect = resolution.x / max(resolution.y, 1.0);
  float freq = mix(6.0, 46.0, roughness);
  vec2 p = vec2(uv.x * aspect, uv.y);
  float n = toolcraftNoise(p * freq);
  n += 0.5 * toolcraftNoise(p * freq * 2.07 + 11.0);
  n /= 1.5;
  return n * mix(0.15, 1.0, relief);
}
`;

const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// GLSL ES 3.00 twin of the vertex shader, required by the MRT simulation
// program (multiple render targets need #version 300 es fragment outputs, and
// both shaders in a program must share the version).
const VERTEX_SHADER_300_SOURCE = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const PAPER_HEIGHT_FRAGMENT_SHADER_SOURCE = `
precision highp float;
varying vec2 vUv;

uniform vec2 uResolution;
uniform float uRoughness;
uniform float uReliefHeight;

${NOISE_GLSL}
${PAPER_HEIGHT_GLSL}

void main() {
  float height = toolcraftPaperHeight(vUv, uRoughness, uReliefHeight, uResolution);
  gl_FragColor = vec4(height, height, height, 1.0);
}
`;

// Displacement-force pass (paper eq [1]) over the surface-water field.
// Writes (Dx, Dy) per cell: the signed fraction of this cell's surface
// material that wants to move one texel along each axis this step.
const FORCE_FRAGMENT_SHADER_SOURCE = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uSurface;
uniform vec2 uTexel;
uniform float uDt;
uniform float uTilt;
uniform float uWetnessSpread;

float surfaceWater(vec2 offset) {
  return texture2D(uSurface, vUv + offset * uTexel).a;
}

void main() {
  float w0 = surfaceWater(vec2(0.0));

  // Normalize to a 60 steps/second reference so flow speed is frame-rate
  // independent; the outflow clamp below keeps large steps stable.
  float timeScale = clamp(uDt * 60.0, 0.25, 6.0);

  // Coefficients: tension pulls water toward nearby water (balls up / merges
  // adjacent wet strokes); spreading pushes from high to low (pressure);
  // gravity pulls down-screen (vUv.y = 1 is the top of the canvas).
  float tension = 0.050 * (0.35 + uWetnessSpread) * timeScale;
  float spread = 0.11 * (0.30 + uWetnessSpread) * timeScale;
  float gravity = 0.42 * uTilt * timeScale;

  float dx = 0.0;
  float dy = 0.0;

  for (int n = 1; n <= 4; n += 1) {
    float fn = float(n);
    float inv = 1.0 / fn;
    dx += tension * inv * (surfaceWater(vec2(fn, 0.0)) - surfaceWater(vec2(-fn, 0.0)));
    dy += tension * inv * (surfaceWater(vec2(0.0, fn)) - surfaceWater(vec2(0.0, -fn)));
  }

  dx += spread * (surfaceWater(vec2(-1.0, 0.0)) - surfaceWater(vec2(1.0, 0.0)));
  dy += spread * (surfaceWater(vec2(0.0, -1.0)) - surfaceWater(vec2(0.0, 1.0)));
  dy -= gravity * w0;

  // A cell cannot move more material than it holds: cap total outflow.
  float total = abs(dx) + abs(dy);
  if (total > 0.9) {
    float scale = 0.9 / total;
    dx *= scale;
    dy *= scale;
  }

  gl_FragColor = vec4(dx, dy, 0.0, 1.0);
}
`;

// Combined update pass (MRT): advects the surface layer by the force field,
// deposits from the brush, diffuses the infused layer (dampness-gated),
// transfers surface → infused (absorption), and evaporates water.
// Brush deposit is distance-based: the CPU walks the pointer path and places a
// dab every uDabSpacing of arc length (carried across frames), then hands this
// frame's new dab centres to the shader. Because dabs are spaced by distance,
// not per animation frame, an idle-but-held brush deposits nothing (no beading
// dots at pointer samples), and the spacing is directly user-controllable.
const MAX_DABS = 64;

const SIMULATION_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
#define MAX_DABS ${MAX_DABS}
in vec2 vUv;
layout(location = 0) out vec4 outSurface;
layout(location = 1) out vec4 outInfused;

uniform sampler2D uSurface;
uniform sampler2D uInfused;
uniform sampler2D uForce;
uniform sampler2D uPaperHeight;
uniform vec2 uTexel;
uniform vec2 uResolution;
uniform float uDt;

uniform float uWetnessSpread;
uniform float uGranulation;
uniform float uPigmentOpacity;
uniform float uDryingSpeed;
uniform float uWaterAbsorption;
uniform float uPaintAbsorption;

uniform int uDabCount;
uniform vec2 uDabCenters[MAX_DABS];
uniform float uBrushRadius;
uniform int uBrushShape;
uniform float uBrushHairNoise;
uniform float uBrushCharge;
uniform vec3 uDepositCmy;
uniform bool uDepositIsWater;
uniform bool uDepositIsWhite;

${NOISE_GLSL}

void main() {
  vec2 dx = vec2(uTexel.x, 0.0);
  vec2 dy = vec2(0.0, uTexel.y);

  vec4 surface0 = texture(uSurface, vUv);
  vec4 infused0 = texture(uInfused, vUv);
  float height = texture(uPaperHeight, vUv).r;

  // Absorbency: cavities (low height) soak faster than ridges — the per-cell
  // variation of this field is what makes the paper texture show in a wash.
  float absorbency = mix(1.2, 0.65, height);

  // --- 1. Surface advection (paper eqs [2]-[5]) ------------------------------
  vec2 force0 = texture(uForce, vUv).rg;
  float outFrac = min(abs(force0.x) + abs(force0.y), 0.95);
  vec4 surface1 = surface0 * (1.0 - outFrac);

  vec2 forceL = texture(uForce, vUv - dx).rg;
  vec2 forceR = texture(uForce, vUv + dx).rg;
  vec2 forceD = texture(uForce, vUv - dy).rg;
  vec2 forceU = texture(uForce, vUv + dy).rg;

  surface1 += texture(uSurface, vUv - dx) * max(forceL.x, 0.0);
  surface1 += texture(uSurface, vUv + dx) * max(-forceR.x, 0.0);
  surface1 += texture(uSurface, vUv - dy) * max(forceD.y, 0.0);
  surface1 += texture(uSurface, vUv + dy) * max(-forceU.y, 0.0);

  // --- 2. Brush deposit (distance-based dabs) --------------------------------
  // Each dab is deposited exactly once (in the one frame it is placed), so the
  // total pigment along a stroke depends on path length and dab spacing, not on
  // frame rate. Overlapping dabs accumulate additively: tight spacing overlaps
  // into a smooth continuous wash, wide spacing leaves separated dry-brush dots.
  if (uBrushCharge > 0.001 && uDabCount > 0) {
    float shapeRadius = uBrushShape == 1 ? uBrushRadius * 0.82 : uBrushRadius;
    // Low-frequency bristle variation: hog breaks the stroke subtly without the
    // per-pixel high-frequency noise that made edges look grainy.
    float hairJitter =
      (toolcraftNoise(vUv * uResolution * 0.16) - 0.5) * uBrushHairNoise * shapeRadius;

    float acc = 0.0;
    for (int i = 0; i < MAX_DABS; i += 1) {
      if (i >= uDabCount) {
        break;
      }
      vec2 c = uDabCenters[i];
      float d;
      if (uBrushShape == 2) {
        vec2 rel = vUv - c;
        d = max(abs(rel.x) * uResolution.x, abs(rel.y) * uResolution.y) / uResolution.x;
      } else {
        d = length(vUv - c);
      }
      acc += clamp(1.0 - smoothstep(shapeRadius * 0.45, shapeRadius + hairJitter, d), 0.0, 1.0);
    }
    acc *= uBrushCharge;

    if (acc > 0.0) {
      if (uDepositIsWater) {
        // Clear water: wets the paper and re-dissolves a little settled
        // pigment back into the mobile surface layer (re-wetting dry paint).
        surface1.a = min(surface1.a + acc * 0.85, 2.5);
        vec3 lifted = infused0.rgb * min(acc * 0.10, 0.5);
        infused0.rgb -= lifted;
        surface1.rgb += lifted;
      } else if (uDepositIsWhite) {
        // Body-colour white: lifts/covers pigment rather than adding to it
        // (subtractive white would be a no-op).
        float strength = clamp(acc * mix(0.22, 0.9, uPigmentOpacity), 0.0, 0.9);
        surface1.rgb *= (1.0 - strength);
        infused0.rgb *= (1.0 - strength * 0.5);
      } else {
        // Additive pigment concentration — repeated strokes keep building
        // density instead of chasing a per-pigment asymptote.
        float concentration = mix(0.16, 0.6, uPigmentOpacity);
        surface1.rgb += uDepositCmy * (acc * concentration);
        surface1.a = min(surface1.a + acc * 0.6, 2.5);
      }
    }
  }

  // --- 3. Infused diffusion (paper eqs [6]-[8], dampness-gated) --------------
  vec4 infusedN = texture(uInfused, vUv + dy);
  vec4 infusedS = texture(uInfused, vUv - dy);
  vec4 infusedE = texture(uInfused, vUv + dx);
  vec4 infusedW = texture(uInfused, vUv - dx);

  float heightN = texture(uPaperHeight, vUv + dy).r;
  float heightS = texture(uPaperHeight, vUv - dy).r;
  float heightE = texture(uPaperHeight, vUv + dx).r;
  float heightW = texture(uPaperHeight, vUv - dx).r;

  // Frame-rate independent diffusion, clamped for explicit-step stability
  // (4-neighbour exchange must keep the per-pair coefficient well below 0.25).
  float timeScale = clamp(uDt * 60.0, 0.25, 6.0);
  float diffusion = min((0.028 + 0.085 * uWetnessSpread) * timeScale, 0.16);
  vec4 infused1 = infused0;

  // Symmetric pair coefficients keep flux antisymmetric between neighbours so
  // total water/pigment mass is conserved by the exchange.
  float aN = mix(1.2, 0.65, 0.5 * (height + heightN));
  float aS = mix(1.2, 0.65, 0.5 * (height + heightS));
  float aE = mix(1.2, 0.65, 0.5 * (height + heightE));
  float aW = mix(1.2, 0.65, 0.5 * (height + heightW));

  infused1.a += diffusion * (
    aN * (infusedN.a - infused0.a) +
    aS * (infusedS.a - infused0.a) +
    aE * (infusedE.a - infused0.a) +
    aW * (infusedW.a - infused0.a)
  );

  // Pigment only moves through damp fiber: gate each pair by the drier side.
  float dampN = clamp(min(infused0.a, infusedN.a) * 3.0, 0.0, 1.0);
  float dampS = clamp(min(infused0.a, infusedS.a) * 3.0, 0.0, 1.0);
  float dampE = clamp(min(infused0.a, infusedE.a) * 3.0, 0.0, 1.0);
  float dampW = clamp(min(infused0.a, infusedW.a) * 3.0, 0.0, 1.0);

  infused1.rgb += diffusion * (
    aN * dampN * (infusedN.rgb - infused0.rgb) +
    aS * dampS * (infusedS.rgb - infused0.rgb) +
    aE * dampE * (infusedE.rgb - infused0.rgb) +
    aW * dampW * (infusedW.rgb - infused0.rgb)
  );

  // --- 4. Absorption surface -> infused (paper eqs [9]-[10]) -----------------
  // Two independent, user-controlled rates. Water absorption (uWaterAbsorption)
  // soaks the surface puddle into the fibers; paint absorption (uPaintAbsorption)
  // fixes mobile pigment into the fibers. Pigment settling is gated by dryness
  // so that WHILE the paper is wet the pigment stays on the mobile surface layer
  // and keeps flowing and bleeding (wet-on-wet blooms into a wet area), and only
  // sets as the water leaves (so wet-on-dry stays crisp). Capacity is generous
  // so already-damp paper under a wash still has headroom to keep absorbing.
  float capacity = mix(2.8, 1.5, height);
  float waterRate = mix(0.012, 0.14, uWaterAbsorption);
  float absorbed = min(waterRate * timeScale, 0.3) * absorbency * surface1.a;
  absorbed = min(absorbed, max(0.0, capacity - infused1.a));

  float dryness = 1.0 - clamp(surface1.a, 0.0, 1.0);
  float paintRate = mix(0.02, 0.5, uPaintAbsorption);
  // Granulation: pigment preferentially settles into cavities as it sets —
  // dried-wash texture instead of grainy wet edges.
  float settleFrac = min(
    paintRate * (0.1 + 0.9 * dryness) * timeScale *
      mix(1.0, clamp(1.7 - 1.4 * height, 0.4, 1.7), uGranulation),
    1.0
  );

  vec3 settled = surface1.rgb * settleFrac;
  infused1.a += absorbed;
  infused1.rgb += settled;
  surface1.a -= absorbed;
  surface1.rgb -= settled;

  // Paint left on the surface after its water is gone dries onto the paper.
  if (surface1.a < 0.02) {
    vec3 driedOn = surface1.rgb * min(0.12 * timeScale, 0.5);
    infused1.rgb += driedOn;
    surface1.rgb -= driedOn;
  }

  // --- 5. Evaporation --------------------------------------------------------
  // Gentle by default so a wash stays wet for several seconds (long enough to
  // paint wet-on-wet and have pigment bleed through the damp fibers); Drying
  // speed scales it up toward a fast dry.
  float evaporation = uDt * mix(0.006, 0.6, uDryingSpeed);
  surface1.a = max(surface1.a - evaporation * 0.8, 0.0);
  infused1.a = max(infused1.a - evaporation * 0.18, 0.0);

  outSurface = clamp(surface1, vec4(0.0), vec4(vec3(4.0), 2.5));
  outInfused = clamp(infused1, vec4(0.0), vec4(vec3(4.0), 2.0));
}
`;

// uBackgroundColor is the user-facing paper tint (appearance.background); uIncludeBackground
// toggles whether the product-rendered paper background is composited at all (export.includeBackground).
// When it is false, only the painted pigment ink remains, with alpha equal to pigment coverage, so
// live preview reveals the runtime canvas shell/backing and PNG export produces a transparent paper.
const COMPOSITE_FRAGMENT_SHADER_SOURCE = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uSurface;
uniform sampler2D uInfused;
uniform sampler2D uPaperHeight;
uniform vec2 uTexel;
uniform vec3 uBackgroundColor;
uniform bool uIncludeBackground;
uniform float uEdgeDarkening;

void main() {
  vec4 surface = texture2D(uSurface, vUv);
  vec4 infused = texture2D(uInfused, vUv);
  float height = texture2D(uPaperHeight, vUv).r;

  vec3 pigment = surface.rgb + infused.rgb;

  // Soft edge darkening at the wet/dry boundary of the infused layer:
  // scales the pigment already present instead of injecting noise.
  float wetGrad =
    abs(texture2D(uInfused, vUv + vec2(0.0, uTexel.y)).a - texture2D(uInfused, vUv - vec2(0.0, uTexel.y)).a) +
    abs(texture2D(uInfused, vUv + vec2(uTexel.x, 0.0)).a - texture2D(uInfused, vUv - vec2(uTexel.x, 0.0)).a);
  pigment *= 1.0 + uEdgeDarkening * min(wetGrad * 2.2, 1.0) * 0.55;

  if (uIncludeBackground) {
    // Relief shading strong enough that the paper texture reads on a blank
    // canvas, not only through a wash.
    vec3 paperColor = uBackgroundColor * mix(0.88, 1.08, height);
    vec3 color = clamp(paperColor - pigment, 0.0, 1.0);
    color += min(surface.a, 1.0) * 0.05;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  } else {
    float coverage = clamp(max(pigment.r, max(pigment.g, pigment.b)) * 1.25, 0.0, 1.0);
    vec3 inkColor = clamp(vec3(1.0) - pigment, 0.0, 1.0) + min(surface.a, 1.0) * 0.04;
    gl_FragColor = vec4(clamp(inkColor, 0.0, 1.0), coverage);
  }
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Toolcraft watercolour renderer could not create a shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Toolcraft watercolour shader failed to compile: ${info ?? "unknown error"}`);
  }

  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Toolcraft watercolour renderer could not create a program.");
  }

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Toolcraft watercolour program failed to link: ${info ?? "unknown error"}`);
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}

function createPaperHeightTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("Toolcraft watercolour renderer could not create a texture.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return texture;
}

// Simulation state lives in half-float textures: additive pigment mass and
// small per-step displacement fluxes both quantize away at 8 bits.
function createStateTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("Toolcraft watercolour renderer could not create a texture.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return texture;
}

function createFramebuffer(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
): WebGLFramebuffer {
  const framebuffer = gl.createFramebuffer();

  if (!framebuffer) {
    throw new Error("Toolcraft watercolour renderer could not create a framebuffer.");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return framebuffer;
}

function createMrtFramebuffer(
  gl: WebGL2RenderingContext,
  surfaceTexture: WebGLTexture,
  infusedTexture: WebGLTexture,
): WebGLFramebuffer {
  const framebuffer = gl.createFramebuffer();

  if (!framebuffer) {
    throw new Error("Toolcraft watercolour renderer could not create a framebuffer.");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, surfaceTexture, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, infusedTexture, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return framebuffer;
}

type SimulationTarget = {
  framebuffer: WebGLFramebuffer;
  infusedTexture: WebGLTexture;
  surfaceTexture: WebGLTexture;
};

const brushShapeCode: Record<BrushShape, number> = {
  filbert: 1,
  round: 0,
  square: 2,
};

export class WatercolorEngine {
  private gl: WebGL2RenderingContext;

  private quadBuffer: WebGLBuffer;

  private simulationProgram: WebGLProgram;

  private compositeProgram: WebGLProgram;

  private forceProgram: WebGLProgram;

  private paperProgram: WebGLProgram;

  private paperHeightTexture: WebGLTexture;

  private paperHeightFramebuffer: WebGLFramebuffer;

  private paperRoughness: number;

  private paperReliefHeight: number;

  private targets: [SimulationTarget, SimulationTarget];

  private forceTexture: WebGLTexture;

  private forceFramebuffer: WebGLFramebuffer;

  private readIndex = 0;

  private width = 0;

  private height = 0;

  private params: WatercolorParams;

  private brushActive = false;

  private brushPos: [number, number] = [0, 0];

  private brushCharge = 1;

  // Distance-based dab queue: pending dab centres (flat [x0,y0,x1,y1,...] in UV)
  // to deposit next frame, and the UV position of the last placed dab so arc
  // length carries across pointer events and frames.
  private pendingDabs: number[] = [];

  private lastDabUv: [number, number] | null = null;

  private hasContent = false;

  private lastStrokeTime = 0;

  private lastFrameTime = 0;

  private rafHandle: number | null = null;

  private destroyed = false;

  constructor(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    initialParams: WatercolorParams,
  ) {
    if (!document.createElement("canvas").getContext("webgl2")) {
      throw new Error("Toolcraft watercolour renderer requires WebGL2 support.");
    }

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      // Required so external code (browser tests, screenshots) can read the live canvas via
      // drawImage/getImageData at an arbitrary time; without it the backbuffer can be cleared
      // between our own draw calls and an external read.
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      throw new Error("Toolcraft watercolour renderer requires WebGL2.");
    }

    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error(
        "Toolcraft watercolour renderer requires the EXT_color_buffer_float WebGL2 extension for half-float simulation state.",
      );
    }

    this.gl = gl;
    this.params = initialParams;

    const quadBuffer = gl.createBuffer();

    if (!quadBuffer) {
      throw new Error("Toolcraft watercolour renderer could not create a vertex buffer.");
    }

    this.quadBuffer = quadBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.simulationProgram = createProgram(
      gl,
      VERTEX_SHADER_300_SOURCE,
      SIMULATION_FRAGMENT_SHADER_SOURCE,
    );
    this.compositeProgram = createProgram(
      gl,
      VERTEX_SHADER_SOURCE,
      COMPOSITE_FRAGMENT_SHADER_SOURCE,
    );
    this.forceProgram = createProgram(
      gl,
      VERTEX_SHADER_SOURCE,
      FORCE_FRAGMENT_SHADER_SOURCE,
    );
    this.paperProgram = createProgram(
      gl,
      VERTEX_SHADER_SOURCE,
      PAPER_HEIGHT_FRAGMENT_SHADER_SOURCE,
    );

    this.targets = this.createTargets(width, height);
    this.forceTexture = createStateTexture(gl, width, height);
    this.forceFramebuffer = createFramebuffer(gl, this.forceTexture);
    this.width = width;
    this.height = height;

    this.paperHeightTexture = createPaperHeightTexture(gl, width, height);
    this.paperHeightFramebuffer = createFramebuffer(gl, this.paperHeightTexture);
    this.paperRoughness = initialParams.roughness;
    this.paperReliefHeight = initialParams.reliefHeight;
    this.renderPaperHeight();

    this.lastFrameTime = performance.now();
    this.tick();
  }

  /** Recomputes the cached paper heightmap texture. Only roughness/reliefHeight/size affect it. */
  private renderPaperHeight(): void {
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.paperHeightFramebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.paperProgram);
    this.bindQuad(this.paperProgram);

    gl.uniform2f(gl.getUniformLocation(this.paperProgram, "uResolution"), this.width, this.height);
    gl.uniform1f(gl.getUniformLocation(this.paperProgram, "uRoughness"), this.paperRoughness);
    gl.uniform1f(
      gl.getUniformLocation(this.paperProgram, "uReliefHeight"),
      this.paperReliefHeight,
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private createTargets(width: number, height: number): [SimulationTarget, SimulationTarget] {
    const gl = this.gl;
    const makeTarget = (): SimulationTarget => {
      const surfaceTexture = createStateTexture(gl, width, height);
      const infusedTexture = createStateTexture(gl, width, height);
      const framebuffer = createMrtFramebuffer(gl, surfaceTexture, infusedTexture);
      return { framebuffer, infusedTexture, surfaceTexture };
    };

    return [makeTarget(), makeTarget()];
  }

  private deleteTargets(): void {
    const gl = this.gl;

    for (const target of this.targets) {
      gl.deleteFramebuffer(target.framebuffer);
      gl.deleteTexture(target.surfaceTexture);
      gl.deleteTexture(target.infusedTexture);
    }

    gl.deleteFramebuffer(this.forceFramebuffer);
    gl.deleteTexture(this.forceTexture);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    if (width === this.width && height === this.height) {
      return;
    }

    const gl = this.gl;
    this.deleteTargets();
    gl.deleteFramebuffer(this.paperHeightFramebuffer);
    gl.deleteTexture(this.paperHeightTexture);

    this.targets = this.createTargets(width, height);
    this.forceTexture = createStateTexture(gl, width, height);
    this.forceFramebuffer = createFramebuffer(gl, this.forceTexture);
    this.width = width;
    this.height = height;
    this.readIndex = 0;

    this.paperHeightTexture = createPaperHeightTexture(gl, width, height);
    this.paperHeightFramebuffer = createFramebuffer(gl, this.paperHeightTexture);
    this.renderPaperHeight();
  }

  setParams(params: WatercolorParams): void {
    this.params = params;

    if (params.roughness !== this.paperRoughness || params.reliefHeight !== this.paperReliefHeight) {
      this.paperRoughness = params.roughness;
      this.paperReliefHeight = params.reliefHeight;
      this.renderPaperHeight();
    }
  }

  setBrushCharge(charge: number): void {
    this.brushCharge = Math.max(0, Math.min(1, charge));
  }

  getBrushCharge(): number {
    return this.brushCharge;
  }

  beginStroke(uvX: number, uvY: number): void {
    this.brushPos = [uvX, uvY];
    this.brushActive = true;
    this.hasContent = true;
    this.lastStrokeTime = performance.now();
    // Re-dip the brush at the start of every stroke. Charge depletes over a
    // single continuous stroke (dry-brush fade), but each new stroke must start
    // fully loaded — otherwise consecutive same-pigment strokes deposit nothing
    // once the first one has drained the charge.
    this.brushCharge = 1;
    // Lay the first dab of the stroke; subsequent dabs are spaced by distance.
    this.pendingDabs = [];
    this.lastDabUv = [uvX, uvY];
    this.pushDab(uvX, uvY);
  }

  moveStroke(uvX: number, uvY: number): void {
    this.brushPos = [uvX, uvY];
    this.brushActive = true;
    this.lastStrokeTime = performance.now();

    if (this.lastDabUv === null) {
      this.lastDabUv = [uvX, uvY];
      this.pushDab(uvX, uvY);
      return;
    }

    const spacing = Math.max(0.0015, this.dabSpacingUv());
    let [lx, ly] = this.lastDabUv;
    let dist = Math.hypot(uvX - lx, uvY - ly);

    if (dist < 1e-6) {
      return;
    }

    const ux = (uvX - lx) / dist;
    const uy = (uvY - ly) / dist;
    let placed = 0;

    // Walk toward the new pointer position, stamping a dab every `spacing` of
    // arc length; the leftover (< spacing) is carried in lastDabUv so the next
    // move/frame continues the same even cadence.
    while (dist >= spacing && placed < MAX_DABS) {
      lx += ux * spacing;
      ly += uy * spacing;
      this.pushDab(lx, ly);
      dist -= spacing;
      placed += 1;
    }

    this.lastDabUv = [lx, ly];
  }

  endStroke(): void {
    this.brushActive = false;
    this.lastDabUv = null;
  }

  private pushDab(x: number, y: number): void {
    if (this.pendingDabs.length / 2 < MAX_DABS) {
      this.pendingDabs.push(x, y);
    }
  }

  /** UV-space brush stamp radius, matching uBrushRadius in the deposit shader. */
  private brushRadiusUv(): number {
    return Math.max(0.002, (this.params.brushSize / 10) * 0.05 + 0.006);
  }

  /** UV-space arc-length spacing between brush dabs, driven by Stroke spacing. */
  private dabSpacingUv(): number {
    // strokeSpacing 0 → tight overlap (smooth wash); 1 → ~2 radii apart (dotty).
    return this.brushRadiusUv() * (0.25 + 1.75 * this.params.strokeSpacing);
  }

  clear(): void {
    const gl = this.gl;
    this.hasContent = false;
    this.pendingDabs = [];
    this.lastDabUv = null;

    for (const target of this.targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, this.width, this.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.forceFramebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private drawForceField(dt: number): void {
    const gl = this.gl;
    const readTarget = this.targets[this.readIndex];

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.forceFramebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.forceProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTarget.surfaceTexture);

    const program = this.forceProgram;
    this.bindQuad(program);

    gl.uniform1i(gl.getUniformLocation(program, "uSurface"), 0);
    gl.uniform2f(gl.getUniformLocation(program, "uTexel"), 1 / this.width, 1 / this.height);
    gl.uniform1f(gl.getUniformLocation(program, "uDt"), dt);
    gl.uniform1f(gl.getUniformLocation(program, "uTilt"), this.params.tilt);
    gl.uniform1f(gl.getUniformLocation(program, "uWetnessSpread"), this.params.wetnessSpread);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawSimulationStep(dt: number): void {
    const gl = this.gl;
    const readTarget = this.targets[this.readIndex];
    const writeTarget = this.targets[this.readIndex === 0 ? 1 : 0];

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeTarget.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.simulationProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTarget.surfaceTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTarget.infusedTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.forceTexture);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.paperHeightTexture);

    const program = this.simulationProgram;
    this.bindQuad(program);

    gl.uniform1i(gl.getUniformLocation(program, "uSurface"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uInfused"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "uForce"), 2);
    gl.uniform1i(gl.getUniformLocation(program, "uPaperHeight"), 3);
    gl.uniform2f(gl.getUniformLocation(program, "uTexel"), 1 / this.width, 1 / this.height);
    gl.uniform2f(gl.getUniformLocation(program, "uResolution"), this.width, this.height);
    gl.uniform1f(gl.getUniformLocation(program, "uDt"), dt);

    gl.uniform1f(gl.getUniformLocation(program, "uWetnessSpread"), this.params.wetnessSpread);
    gl.uniform1f(gl.getUniformLocation(program, "uGranulation"), this.params.granulation);
    gl.uniform1f(gl.getUniformLocation(program, "uPigmentOpacity"), this.params.pigmentOpacity);
    gl.uniform1f(gl.getUniformLocation(program, "uDryingSpeed"), this.params.dryingSpeed);
    gl.uniform1f(gl.getUniformLocation(program, "uWaterAbsorption"), this.params.waterAbsorption);
    gl.uniform1f(gl.getUniformLocation(program, "uPaintAbsorption"), this.params.paintAbsorption);

    const dabCount = Math.min(MAX_DABS, Math.floor(this.pendingDabs.length / 2));
    gl.uniform1i(gl.getUniformLocation(program, "uDabCount"), dabCount);
    if (dabCount > 0) {
      gl.uniform2fv(
        gl.getUniformLocation(program, "uDabCenters"),
        new Float32Array(this.pendingDabs.slice(0, dabCount * 2)),
      );
    }
    gl.uniform1f(gl.getUniformLocation(program, "uBrushRadius"), this.brushRadiusUv());
    gl.uniform1i(gl.getUniformLocation(program, "uBrushShape"), brushShapeCode[this.params.brushShape]);
    gl.uniform1f(
      gl.getUniformLocation(program, "uBrushHairNoise"),
      this.params.brushHairType === "hog" ? 0.6 : 0.1,
    );
    gl.uniform1f(gl.getUniformLocation(program, "uBrushCharge"), this.brushCharge);

    // uDepositCmy is the pigment's subtractive concentration per channel: the
    // complement of its visible hue (paper eq [11]-[13] renders paper − CMY).
    const [r, g, b] = hexToRgb01(this.params.pigmentHex);
    gl.uniform3f(gl.getUniformLocation(program, "uDepositCmy"), 1 - r, 1 - g, 1 - b);
    gl.uniform1i(
      gl.getUniformLocation(program, "uDepositIsWater"),
      isWaterPigment(this.params.pigmentHex) ? 1 : 0,
    );
    gl.uniform1i(
      gl.getUniformLocation(program, "uDepositIsWhite"),
      isWhitePigment(this.params.pigmentHex) ? 1 : 0,
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Each dab is deposited once; consume this frame's queue so idle frames (no
    // new pointer motion) deposit nothing rather than re-stamping in place.
    this.pendingDabs = [];
    this.readIndex = this.readIndex === 0 ? 1 : 0;
  }

  private drawComposite(target: WebGLFramebuffer | null, width: number, height: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.compositeProgram);

    const readTarget = this.targets[this.readIndex];
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTarget.surfaceTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTarget.infusedTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.paperHeightTexture);

    const program = this.compositeProgram;
    this.bindQuad(program);

    gl.uniform1i(gl.getUniformLocation(program, "uSurface"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uInfused"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "uPaperHeight"), 2);
    gl.uniform2f(gl.getUniformLocation(program, "uTexel"), 1 / this.width, 1 / this.height);
    gl.uniform1f(gl.getUniformLocation(program, "uEdgeDarkening"), this.params.edgeDarkening);

    const [bgR, bgG, bgB] = hexToRgb01(this.params.backgroundColor);
    gl.uniform3f(gl.getUniformLocation(program, "uBackgroundColor"), bgR, bgG, bgB);
    gl.uniform1i(
      gl.getUniformLocation(program, "uIncludeBackground"),
      this.params.includeBackground ? 1 : 0,
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private bindQuad(program: WebGLProgram): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const location = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  }

  private tick = (): void => {
    if (this.destroyed) {
      return;
    }

    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    // Idle skip: once every stroke has fully dried the simulation state is
    // frozen (all rates are gated by water), so the force/simulation passes
    // only run while there is content and recent stroke activity. 90 s covers
    // full evaporation even at the slowest drying speed.
    const simulationActive =
      this.hasContent && (this.brushActive || now - this.lastStrokeTime < 90_000);

    if (simulationActive) {
      this.drawForceField(dt);
      this.drawSimulationStep(dt);
    }

    this.drawComposite(null, this.width, this.height);

    this.rafHandle = requestAnimationFrame(this.tick);
  };

  /** Returns the current painted state as a 2D canvas at simulation backing resolution, for export compositing. */
  getCompositeCanvas(): HTMLCanvasElement {
    const gl = this.gl;

    this.drawComposite(null, this.width, this.height);

    const pixels = new Uint8Array(this.width * this.height * 4);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = this.width;
    sourceCanvas.height = this.height;
    const sourceContext = sourceCanvas.getContext("2d");

    if (!sourceContext) {
      throw new Error("Toolcraft watercolour export requires a 2D canvas context.");
    }

    const imageData = sourceContext.createImageData(this.width, this.height);

    for (let y = 0; y < this.height; y += 1) {
      const srcRowStart = (this.height - 1 - y) * this.width * 4;
      const dstRowStart = y * this.width * 4;
      imageData.data.set(
        pixels.subarray(srcRowStart, srcRowStart + this.width * 4),
        dstRowStart,
      );
    }

    sourceContext.putImageData(imageData, 0, 0);

    return sourceCanvas;
  }

  destroy(): void {
    this.destroyed = true;

    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
    }

    const gl = this.gl;
    this.deleteTargets();
    gl.deleteFramebuffer(this.paperHeightFramebuffer);
    gl.deleteTexture(this.paperHeightTexture);
    gl.deleteProgram(this.simulationProgram);
    gl.deleteProgram(this.compositeProgram);
    gl.deleteProgram(this.forceProgram);
    gl.deleteProgram(this.paperProgram);
    gl.deleteBuffer(this.quadBuffer);
  }
}

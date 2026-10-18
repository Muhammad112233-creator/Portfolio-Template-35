/* ════════════════════════════════════════════════════════════════
   2007 background — ColorBends.
   Vanilla port of the React-Bits ColorBends shader, matched to the
   site's lifecycle pattern (init once at module parse, start/stop
   the RAF loop on theme switch). The renderer, scene, full-screen
   quad and ShaderMaterial are built ONCE and never disposed. The
   container (#bg2007) is shown/hidden by CSS; the RAF is paused
   when not in the 2007 theme to avoid GPU work off-screen.

   Tweakables: see the constants at the top. The original nebula
   palette seeds COLORS. To restore the original nebula instead,
   see public/legacy/nebula.html.bak for revival instructions.
   ════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/* ── Tweakable constants ────────────────────────────────────────── */
const COLORS = ['#AA44FF', '#8B00FF', '#5522CC', '#FF6600', '#1A0A2E'];
const ROTATION = 90;        // degrees
const AUTO_ROTATE = 0;      // degrees / second
const SPEED = 0.2;
const SCALE = 1;
const FREQUENCY = 1;
const WARP_STRENGTH = 1;
const MOUSE_INFLUENCE = 1;
const PARALLAX = 0.5;
const NOISE = 0.15;
const ITERATIONS = 1;       // 1..5
const INTENSITY = 1.5;
const BAND_WIDTH = 6;
const TRANSPARENT = false;  // full-screen background — opaque is cheaper
const POINTER_SMOOTHING = 8;
const MAX_COLORS = 8;

/* ── Shaders (verbatim from the React-Bits source) ──────────────── */
const vert = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const frag = /* glsl */`
#define MAX_COLORS ${MAX_COLORS}
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
uniform int uIterations;
uniform float uIntensity;
uniform float uBandWidth;
varying vec2 vUv;

void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;
  vec2 rp = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;
  vec2 toward = (uPointer - rp);
  q += toward * uMouseInfluence * 0.2;

  for (int j = 0; j < 5; j++) {
    if (j >= uIterations - 1) break;
    vec2 rr = sin(1.5 * (q.yx * uFrequency) + 2.0 * cos(q * uFrequency));
    q += (rr - q) * 0.15;
  }

  vec3 col = vec3(0.0);
  float a = 1.0;

  if (uColorCount > 0) {
    vec2 s = q;
    vec3 sumCol = vec3(0.0);
    float cover = 0.0;
    for (int i = 0; i < MAX_COLORS; ++i) {
      if (i >= uColorCount) break;
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float m = mix(m0, m1, kMix);
      float w = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
      sumCol += uColors[i] * w;
      cover = max(cover, w);
    }
    col = clamp(sumCol, 0.0, 1.0);
    a = uTransparent > 0 ? cover : 1.0;
  } else {
    vec2 s = q;
    for (int k = 0; k < 3; ++k) {
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float m = mix(m0, m1, kMix);
      col[k] = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
    }
    a = uTransparent > 0 ? max(max(col.r, col.g), col.b) : 1.0;
  }

  col *= uIntensity;

  if (uNoise > 0.0001) {
    float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
    col += (n - 0.5) * uNoise;
    col = clamp(col, 0.0, 1.0);
  }

  vec3 rgb = (uTransparent > 0) ? col * a : col;
  gl_FragColor = vec4(rgb, a);
}
`;

/* ── Init (once) ────────────────────────────────────────────────── */
const container = document.getElementById('bg2007');
if (!container) {
  // No container — nothing to do. Resolve the preloader so boot proceeds.
  window.__bendsReady = Promise.resolve();
} else {
  if (window.__debugWebGL) console.log('[WebGL:bends] init');

  const hexToVec3 = (hex) => {
    const h = hex.replace('#', '').trim();
    const v = h.length === 3
      ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    return new THREE.Vector3(v[0] / 255, v[1] / 255, v[2] / 255);
  };
  const colorVecs = Array.from({ length: MAX_COLORS }, (_, i) =>
    i < COLORS.length ? hexToVec3(COLORS[i]) : new THREE.Vector3(0, 0, 0)
  );

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);

  const material = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uCanvas:         { value: new THREE.Vector2(1, 1) },
      uTime:           { value: 0 },
      uSpeed:          { value: SPEED },
      uRot:            { value: new THREE.Vector2(
        Math.cos((ROTATION * Math.PI) / 180),
        Math.sin((ROTATION * Math.PI) / 180),
      ) },
      uColorCount:     { value: COLORS.length },
      uColors:         { value: colorVecs },
      uTransparent:    { value: TRANSPARENT ? 1 : 0 },
      uScale:          { value: SCALE },
      uFrequency:      { value: FREQUENCY },
      uWarpStrength:   { value: WARP_STRENGTH },
      uPointer:        { value: new THREE.Vector2(0, 0) },
      /* uMouseInfluence + uParallax start at 0 so the warm-up render
         and the first RAF frame both produce the "no-pointer" shape.
         The loop eases them up to their targets during the entry,
         giving a smooth slide into the cursor-influenced shape. */
      uMouseInfluence: { value: 0 },
      uParallax:       { value: 0 },
      uNoise:          { value: NOISE },
      uIterations:     { value: ITERATIONS },
      uIntensity:      { value: INTENSITY },
      uBandWidth:      { value: BAND_WIDTH },
    },
    premultipliedAlpha: true,
    transparent: TRANSPARENT,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    alpha: TRANSPARENT,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, TRANSPARENT ? 0 : 1);
  const dom = renderer.domElement;
  dom.style.width = '100%';
  dom.style.height = '100%';
  dom.style.display = 'block';
  container.appendChild(dom);

  const handleResize = () => {
    const w = window.innerWidth || container.clientWidth || 1;
    const h = window.innerHeight || container.clientHeight || 1;
    renderer.setSize(w, h, false);
    dom.style.width = w + 'px';
    dom.style.height = h + 'px';
    material.uniforms.uCanvas.value.set(w, h);
  };
  handleResize();
  window.addEventListener('resize', handleResize);

  /* Pointer (smoothed). Listen on window so it works regardless of
     container hit-testing (the canvas itself has pointer-events:none). */
  const pointerTarget = new THREE.Vector2(0, 0);
  const pointerCurrent = new THREE.Vector2(0, 0);
  window.addEventListener('pointermove', (e) => {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    const x = (e.clientX / w) * 2 - 1;
    const y = -((e.clientY / h) * 2 - 1);
    pointerTarget.set(x, y);
  });

  /* RAF lifecycle — matches the bg-canvas / tunnel / (former) nebula
     pattern. The renderer/scene/material are kept alive forever; we
     just stop the RAF when out of the 2007 theme. */
  let running = false;
  let animId = null;
  /* Manual time accumulator. Persists across stop/start so the shader
     phase resumes exactly where it paused — no visible jump when
     returning to the 2007 theme. */
  let elapsed = 0;
  let lastFrame = 0;
  /* First-activation fade-in for the pointer parallax + warp. Without
     this, on the very first time the theme becomes 2007, the bends
     "jump" from the (0,0) default to whatever the user's cursor is.
     We ease uMouseInfluence + uParallax from 0 → target over ~1.2s
     instead. After the first reveal the influence stays at target,
     so subsequent re-entries are instant (matching the existing
     elapsed-time continuity). */
  const ENTRY_DURATION = 1.2;  // seconds
  let entryProgress = 0;       // 0 → 1, only ramps once per session
  let entryDone = false;

  function loop() {
    if (!running) return;
    animId = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000); // clamp to avoid huge jumps
    lastFrame = now;
    elapsed += dt;
    material.uniforms.uTime.value = elapsed;

    const deg = (ROTATION % 360) + AUTO_ROTATE * elapsed;
    const rad = (deg * Math.PI) / 180;
    material.uniforms.uRot.value.set(Math.cos(rad), Math.sin(rad));

    const amt = Math.min(1, dt * POINTER_SMOOTHING);
    pointerCurrent.lerp(pointerTarget, amt);
    material.uniforms.uPointer.value.copy(pointerCurrent);

    /* First-visit entry: ramp uMouseInfluence + uParallax from 0 up
       to their targets. The warm-up render (and the first RAF frame)
       use 0, so the visible state before/right-after activation is
       identical — then the bends visibly bend toward the cursor over
       ENTRY_DURATION instead of snapping. */
    if (!entryDone) {
      entryProgress = Math.min(1, entryProgress + dt / ENTRY_DURATION);
      const e = 1 - Math.pow(1 - entryProgress, 3); // easeOutCubic
      material.uniforms.uMouseInfluence.value = MOUSE_INFLUENCE * e;
      material.uniforms.uParallax.value = PARALLAX * e;
      if (entryProgress >= 1) entryDone = true;
    }

    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    if (window.__debugWebGL) console.log('[WebGL:bends] start');
    running = true;
    lastFrame = performance.now();
    animId = requestAnimationFrame(loop);
  }

  function stop() {
    if (!running) return;
    if (window.__debugWebGL) console.log('[WebGL:bends] stop');
    running = false;
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  window.__bendsStart = start;
  window.__bendsStop = stop;

  /* Warm up the pipeline with one render so the canvas isn't blank
     until the RAF kicks in. Then resolve __bendsReady for preloader. */
  try { renderer.render(scene, camera); } catch (_) { /* swallow */ }
  window.__bendsReady = Promise.resolve();

  // Start immediately if the page loaded directly into 2007.
  if (document.documentElement.getAttribute('data-theme') === '2007') {
    start();
  }
}

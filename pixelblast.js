/* ════════════════════════════════════════════════════════════════
   1998 background — PixelBlast (Bayer-dithered animated pixels).
   Vanilla port of the React-Bits PixelBlast shader, matched to the
   site's lifecycle pattern (init once at module parse, start/stop
   the RAF loop on theme switch). The renderer, scene, full-screen
   quad and ShaderMaterial are built ONCE and never disposed.

   Container #bg1998 is shown/hidden by CSS; the RAF is paused
   when not in the 1998 theme to avoid GPU work off-screen. A
   manual time accumulator keeps the shader phase continuous
   across pause/resume so returning to 1998 doesn't snap.

   Tweakables: see the constants at the top. To restore the
   original arkanoid game, see legacy/arkanoid.html.bak.

   Component inspired by github.com/zavalit/bayer-dithering-webgl-demo
   ════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/* ── Tweakable constants ────────────────────────────────────────── */
const VARIANT = 'circle';            // 'square' | 'circle' | 'triangle' | 'diamond'
const COLOR = '#C5A0D8';             // 1998 lavender, on the #F2D5D5 base
const PIXEL_SIZE = 6;
const PATTERN_SCALE = 3;
const PATTERN_DENSITY = 1.2;
const PIXEL_SIZE_JITTER = 0.5;
const ENABLE_RIPPLES = true;
const RIPPLE_SPEED = 0.4;
const RIPPLE_THICKNESS = 0.12;
const RIPPLE_INTENSITY_SCALE = 1.5;
const SPEED = 0.6;
const EDGE_FADE = 0.25;
const TRANSPARENT = true;            // pastel pink #F2D5D5 base shows through
const ANTIALIAS = true;
const MAX_CLICKS = 10;

const SHAPE_MAP = { square: 0, circle: 1, triangle: 2, diamond: 3 };

/* ── Shaders (verbatim from the React-Bits source) ──────────────── */
const VERTEX_SRC = /* glsl */`
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

const FRAGMENT_SRC = /* glsl */`
uniform vec3  uColor;
uniform vec2  uResolution;
uniform float uTime;
uniform float uPixelSize;
uniform float uScale;
uniform float uDensity;
uniform float uPixelJitter;
uniform int   uEnableRipples;
uniform float uRippleSpeed;
uniform float uRippleThickness;
uniform float uRippleIntensity;
uniform float uEdgeFade;

uniform int   uShapeType;
const int SHAPE_SQUARE   = 0;
const int SHAPE_CIRCLE   = 1;
const int SHAPE_TRIANGLE = 2;
const int SHAPE_DIAMOND  = 3;

const int   MAX_CLICKS = ${MAX_CLICKS};

uniform vec2  uClickPos  [MAX_CLICKS];
uniform float uClickTimes[MAX_CLICKS];

out vec4 fragColor;

float Bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2. + a.y * a.y * .75);
}
#define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

#define FBM_OCTAVES     3
#define FBM_LACUNARITY  1.25
#define FBM_GAIN        1.0

float hash11(float n){ return fract(sin(n)*43758.5453); }

float vnoise(vec3 p){
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float n000 = hash11(dot(ip + vec3(0.0,0.0,0.0), vec3(1.0,57.0,113.0)));
  float n100 = hash11(dot(ip + vec3(1.0,0.0,0.0), vec3(1.0,57.0,113.0)));
  float n010 = hash11(dot(ip + vec3(0.0,1.0,0.0), vec3(1.0,57.0,113.0)));
  float n110 = hash11(dot(ip + vec3(1.0,1.0,0.0), vec3(1.0,57.0,113.0)));
  float n001 = hash11(dot(ip + vec3(0.0,0.0,1.0), vec3(1.0,57.0,113.0)));
  float n101 = hash11(dot(ip + vec3(1.0,0.0,1.0), vec3(1.0,57.0,113.0)));
  float n011 = hash11(dot(ip + vec3(0.0,1.0,1.0), vec3(1.0,57.0,113.0)));
  float n111 = hash11(dot(ip + vec3(1.0,1.0,1.0), vec3(1.0,57.0,113.0)));
  vec3 w = fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);
  float x00 = mix(n000, n100, w.x);
  float x10 = mix(n010, n110, w.x);
  float x01 = mix(n001, n101, w.x);
  float x11 = mix(n011, n111, w.x);
  float y0  = mix(x00, x10, w.y);
  float y1  = mix(x01, x11, w.y);
  return mix(y0, y1, w.z) * 2.0 - 1.0;
}

float fbm2(vec2 uv, float t){
  vec3 p = vec3(uv * uScale, t);
  float amp = 1.0;
  float freq = 1.0;
  float sum = 1.0;
  for (int i = 0; i < FBM_OCTAVES; ++i){
    sum  += amp * vnoise(p * freq);
    freq *= FBM_LACUNARITY;
    amp  *= FBM_GAIN;
  }
  return sum * 0.5 + 0.5;
}

float maskCircle(vec2 p, float cov){
  float r = sqrt(cov) * .25;
  float d = length(p - 0.5) - r;
  float aa = 0.5 * fwidth(d);
  return cov * (1.0 - smoothstep(-aa, aa, d * 2.0));
}

float maskTriangle(vec2 p, vec2 id, float cov){
  bool flip = mod(id.x + id.y, 2.0) > 0.5;
  if (flip) p.x = 1.0 - p.x;
  float r = sqrt(cov);
  float d  = p.y - r*(1.0 - p.x);
  float aa = fwidth(d);
  return cov * clamp(0.5 - d/aa, 0.0, 1.0);
}

float maskDiamond(vec2 p, float cov){
  float r = sqrt(cov) * 0.564;
  return step(abs(p.x - 0.49) + abs(p.y - 0.49), r);
}

void main(){
  float pixelSize = uPixelSize;
  vec2 fragCoord = gl_FragCoord.xy - uResolution * .5;
  float aspectRatio = uResolution.x / uResolution.y;

  vec2 pixelId = floor(fragCoord / pixelSize);
  vec2 pixelUV = fract(fragCoord / pixelSize);

  float cellPixelSize = 8.0 * pixelSize;
  vec2 cellId = floor(fragCoord / cellPixelSize);
  vec2 cellCoord = cellId * cellPixelSize;
  vec2 uv = cellCoord / uResolution * vec2(aspectRatio, 1.0);

  float base = fbm2(uv, uTime * 0.05);
  /* FBM_OCTAVES was reduced from 5 to 3; with FBM_GAIN=1.0 each
     octave contributes equally, so the noise amplitude shrank ~5/3x.
     Rescale base here to preserve the original feed distribution so
     the post-Bayer pixel density matches the 5-octave version. */
  base = base * 0.83 - 1.08;

  float feed = base + (uDensity - 0.5) * 0.3;

  float speed     = uRippleSpeed;
  float thickness = uRippleThickness;
  const float dampT     = 1.0;
  const float dampR     = 10.0;

  if (uEnableRipples == 1) {
    for (int i = 0; i < MAX_CLICKS; ++i){
      vec2 pos = uClickPos[i];
      if (pos.x < 0.0) continue;
      float cellPixelSize = 8.0 * pixelSize;
      vec2 cuv = (((pos - uResolution * .5 - cellPixelSize * .5) / (uResolution))) * vec2(aspectRatio, 1.0);
      float t = max(uTime - uClickTimes[i], 0.0);
      float r = distance(uv, cuv);
      float waveR = speed * t;
      float ring  = exp(-pow((r - waveR) / thickness, 2.0));
      float atten = exp(-dampT * t) * exp(-dampR * r);
      feed = max(feed, ring * atten * uRippleIntensity);
    }
  }

  float bayer = Bayer8(fragCoord / uPixelSize) - 0.5;
  float bw = step(0.5, feed + bayer);

  float h = fract(sin(dot(floor(fragCoord / uPixelSize), vec2(127.1, 311.7))) * 43758.5453);
  float jitterScale = 1.0 + (h - 0.5) * uPixelJitter;
  float coverage = bw * jitterScale;
  float M;
  if      (uShapeType == SHAPE_CIRCLE)   M = maskCircle (pixelUV, coverage);
  else if (uShapeType == SHAPE_TRIANGLE) M = maskTriangle(pixelUV, pixelId, coverage);
  else if (uShapeType == SHAPE_DIAMOND)  M = maskDiamond(pixelUV, coverage);
  else                                   M = coverage;

  if (uEdgeFade > 0.0) {
    vec2 norm = gl_FragCoord.xy / uResolution;
    float edge = min(min(norm.x, norm.y), min(1.0 - norm.x, 1.0 - norm.y));
    float fade = smoothstep(0.0, uEdgeFade, edge);
    M *= fade;
  }

  vec3 color = uColor;

  // sRGB gamma correction - linear -> sRGB
  vec3 srgbColor = mix(
    color * 12.92,
    1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, color)
  );

  fragColor = vec4(srgbColor, M);
}
`;

/* ── Init (once) ────────────────────────────────────────────────── */
/* Resolve __blastReady up-front so the preloader can never stall on
   us, even if WebGL init throws below. */
window.__blastReady = Promise.resolve();

const container = document.getElementById('bg1998');
if (container) try {
  if (window.__debugWebGL) console.log('[WebGL:blast] init');

  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: ANTIALIAS,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  if (TRANSPARENT) renderer.setClearAlpha(0);
  else renderer.setClearColor(0x000000, 1);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  /* The canvas inherits the SPA's pointer-events: none rule for
     #bg1998 from CSS so it never steals clicks from windows. */
  container.appendChild(canvas);

  const uniforms = {
    uResolution: { value: new THREE.Vector2(0, 0) },
    uTime:       { value: 0 },
    uColor:      { value: new THREE.Color(COLOR) },
    uClickPos:   { value: Array.from({ length: MAX_CLICKS }, () => new THREE.Vector2(-1, -1)) },
    uClickTimes: { value: new Float32Array(MAX_CLICKS) },
    uShapeType:  { value: SHAPE_MAP[VARIANT] ?? 0 },
    uPixelSize:  { value: PIXEL_SIZE * renderer.getPixelRatio() },
    uScale:      { value: PATTERN_SCALE },
    uDensity:    { value: PATTERN_DENSITY },
    uPixelJitter:{ value: PIXEL_SIZE_JITTER },
    uEnableRipples:   { value: ENABLE_RIPPLES ? 1 : 0 },
    uRippleSpeed:     { value: RIPPLE_SPEED },
    uRippleThickness: { value: RIPPLE_THICKNESS },
    uRippleIntensity: { value: RIPPLE_INTENSITY_SCALE },
    uEdgeFade:        { value: EDGE_FADE },
  };

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SRC,
    fragmentShader: FRAGMENT_SRC,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    glslVersion: THREE.GLSL3,
  });
  const quadGeom = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(quadGeom, material);
  scene.add(quad);

  /* ── Sizing ──────────────────────────────────────────────────── */
  function handleResize() {
    const w = window.innerWidth || container.clientWidth || 1;
    const h = window.innerHeight || container.clientHeight || 1;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    uniforms.uResolution.value.set(canvas.width, canvas.height);
    uniforms.uPixelSize.value = PIXEL_SIZE * renderer.getPixelRatio();
  }
  handleResize();
  window.addEventListener('resize', handleResize);

  /* ── Pointer / click for ripple bursts. Listen on window so we
       capture even though the canvas is pointer-events: none (the
       SPA needs clicks to fall through to windows). ──────────── */
  let clickIx = 0;
  function mapClient(e) {
    const x = e.clientX * (canvas.width  / (window.innerWidth  || 1));
    const y = (window.innerHeight - e.clientY) * (canvas.height / (window.innerHeight || 1));
    return { fx: x, fy: y };
  }
  window.addEventListener('pointerdown', (e) => {
    const { fx, fy } = mapClient(e);
    uniforms.uClickPos.value[clickIx].set(fx, fy);
    uniforms.uClickTimes.value[clickIx] = uniforms.uTime.value;
    clickIx = (clickIx + 1) % MAX_CLICKS;
  }, { passive: true });

  /* ── RAF lifecycle with manual time accumulator. Elapsed time
       persists across stop/start so the shader phase resumes
       exactly where it paused — no visible jump when returning
       to the 1998 theme. ─────────────────────────────────────── */
  const TIME_OFFSET = Math.random() * 1000;
  let running = false;
  let animId = null;
  let elapsed = 0;
  let lastFrame = 0;

  function loop() {
    if (!running) return;
    animId = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    elapsed += dt * SPEED;
    uniforms.uTime.value = TIME_OFFSET + elapsed;
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    if (window.__debugWebGL) console.log('[WebGL:blast] start');
    running = true;
    lastFrame = performance.now();
    animId = requestAnimationFrame(loop);
  }

  function stop() {
    if (!running) return;
    if (window.__debugWebGL) console.log('[WebGL:blast] stop');
    running = false;
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  window.__blastStart = start;
  window.__blastStop = stop;

  /* Warm up so the canvas isn't blank until the first RAF tick. */
  try { renderer.render(scene, camera); } catch (_) { /* swallow */ }

  // Auto-start if the page loaded directly into 1998.
  if (document.documentElement.getAttribute('data-theme') === '1998') {
    start();
  }
} catch (err) {
  console.error('[blast] PixelBlast init failed:', err);
}

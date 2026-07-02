// ---------------------------------------------------------------
// post.js — premium shader pipeline (custom post-processing)
//   mode 0: off (direct render)
//   mode 1: Fancy  — color grade, warmth, vignette
//   mode 2: Ultra  — Fancy + bloom (bright pass + separable blur)
// ---------------------------------------------------------------
import * as THREE from 'three';

const QUAD_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAG = `
uniform sampler2D tScene;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 b = c * smoothstep(0.62, 0.95, l);
  gl_FragColor = vec4(b, 1.0);
}`;

const BLUR_FRAG = `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 sum = vec3(0.0);
  float w[5];
  w[0] = 0.227; w[1] = 0.194; w[2] = 0.121; w[3] = 0.054; w[4] = 0.016;
  sum += texture2D(tSrc, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = uDir * float(i);
    sum += texture2D(tSrc, vUv + off).rgb * w[i];
    sum += texture2D(tSrc, vUv - off).rgb * w[i];
  }
  gl_FragColor = vec4(sum, 1.0);
}`;

const COMPOSITE_FRAG = `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uSat;
uniform float uContrast;
uniform float uWarm;
uniform float uVig;
uniform float uUnderwater;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  if (uUnderwater > 0.5) {
    uv.x += sin(uv.y * 22.0 + uTime * 1.8) * 0.004;
    uv.y += cos(uv.x * 18.0 + uTime * 1.5) * 0.004;
  }
  vec3 c = texture2D(tScene, uv).rgb;
  c += texture2D(tBloom, uv).rgb * uBloom;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  c *= vec3(1.0 + uWarm * 0.09, 1.0 + uWarm * 0.03, 1.0 - uWarm * 0.07);
  c = c / (1.0 + max(vec3(0.0), c - 1.0));      // soft rolloff for hot highlights
  float d = distance(uv, vec2(0.5));
  c *= 1.0 - uVig * smoothstep(0.38, 0.86, d);
  gl_FragColor = vec4(c, 1.0);
}`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.mode = 0;
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
    this.rtScene = new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: true });
    this.rtA = new THREE.WebGLRenderTarget(2, 2, opts);
    this.rtB = new THREE.WebGLRenderTarget(2, 2, opts);

    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quadScene.add(this.quad);

    this.matBright = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null } },
      vertexShader: QUAD_VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
    });
    this.matBlur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.matComposite = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null },
        uBloom: { value: 0 }, uSat: { value: 1.12 }, uContrast: { value: 1.05 },
        uWarm: { value: 0.3 }, uVig: { value: 0.35 }, uUnderwater: { value: 0 }, uTime: { value: 0 },
      },
      vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
    });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(w, h) {
    const pr = this.renderer.getPixelRatio();
    this.rtScene.setSize(w * pr, h * pr);
    this.rtA.setSize(Math.max(2, w * pr / 4 | 0), Math.max(2, h * pr / 4 | 0));
    this.rtB.setSize(Math.max(2, w * pr / 4 | 0), Math.max(2, h * pr / 4 | 0));
  }

  render(scene, camera, opts = {}) {
    const r = this.renderer;
    if (this.mode === 0) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);

    let bloomTex = this.black, bloomAmt = 0;
    if (this.mode === 2) {
      this.quad.material = this.matBright;
      this.matBright.uniforms.tScene.value = this.rtScene.texture;
      r.setRenderTarget(this.rtA);
      r.render(this.quadScene, this.quadCam);

      this.quad.material = this.matBlur;
      this.matBlur.uniforms.tSrc.value = this.rtA.texture;
      this.matBlur.uniforms.uDir.value.set(1 / this.rtA.width, 0);
      r.setRenderTarget(this.rtB);
      r.render(this.quadScene, this.quadCam);
      this.matBlur.uniforms.tSrc.value = this.rtB.texture;
      this.matBlur.uniforms.uDir.value.set(0, 1 / this.rtB.height);
      r.setRenderTarget(this.rtA);
      r.render(this.quadScene, this.quadCam);
      bloomTex = this.rtA.texture;
      bloomAmt = 0.85;
    }

    this.quad.material = this.matComposite;
    const u = this.matComposite.uniforms;
    u.tScene.value = this.rtScene.texture;
    u.tBloom.value = bloomTex;
    u.uBloom.value = bloomAmt;
    u.uUnderwater.value = opts.underwater ? 1 : 0;
    u.uTime.value = opts.time || 0;
    u.uWarm.value = 0.22 + (opts.dusk || 0) * 0.55;
    u.uSat.value = this.mode === 2 ? 1.16 : 1.1;
    u.uVig.value = this.mode === 2 ? 0.4 : 0.3;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}

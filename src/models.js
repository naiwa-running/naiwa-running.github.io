import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export { mergeVertices };
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;
const V2 = THREE.Vector2, V3 = THREE.Vector3;
export const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif';

/* ---------------- 几何/材质小工具 ---------------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new V3(), _s = new V3(), _c = new THREE.Color();
export function xf(geo, t = {}) {
  const p = t.p || [0, 0, 0], r = t.r || [0, 0, 0], s = t.s || [1, 1, 1];
  _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e);
  _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  geo.applyMatrix4(_m);
  return geo;
}
export function tint(geo, hex) {
  _c.set(hex);
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
export const P = (geo, hex, t) => tint(xf(geo, t), hex);
function clean(g) {
  const n = g.index ? g.toNonIndexed() : g;
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', n.attributes.position);
  o.setAttribute('normal', n.attributes.normal);
  o.setAttribute('color', n.attributes.color);
  o.setAttribute('uv', n.attributes.uv || new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return o;
}
export function merge(list) {
  const g = mergeGeometries(list.map(clean), false);
  g.computeBoundingSphere();
  return g;
}
export const vcMat = (rough = 0.55, metal = 0, extra) =>
  new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: rough, metalness: metal }, extra || {}));
export const std = (color, rough = 0.5, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough }, extra || {}));
export function off(m, u) { m.polygonOffset = true; m.polygonOffsetFactor = -u; m.polygonOffsetUnits = -u; return m; }

// 平滑的车床轮廓
export function profile(pts, n = 48) {
  const c = new THREE.SplineCurve(pts.map((p) => new V2(p[0], p[1])));
  return c.getPoints(n).map((v) => new V2(Math.max(0.0005, v.x), v.y));
}
export function radiusAt(prof, y) {
  for (let i = 1; i < prof.length; i++) {
    const a = prof[i - 1], b = prof[i];
    if ((a.y <= y && b.y >= y) || (a.y >= y && b.y <= y)) {
      const t = (y - a.y) / (b.y - a.y || 1);
      return a.x + (b.x - a.x) * t;
    }
  }
  return 0;
}
// 把平面图形"贴"到车床体正面，做出贴合曲面的嘴巴/腮红
function decal(geo, prof, zs, cx, cy, eps) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, y = pos.getY(i) + cy;
    const R = radiusAt(prof, y);
    pos.setXYZ(i, x, y, zs * Math.sqrt(Math.max(0, R * R - x * x)) + eps);
  }
  geo.computeVertexNormals();
  return geo;
}

/* ---------------- 贴图 ---------------- */
export function textTexture(text, o = {}) {
  const w = o.w || 256, h = o.h || 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
  g.font = o.font || `900 ${h * 0.7}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.strokeW || 12; g.strokeStyle = o.stroke; g.strokeText(text, w / 2, h * (o.y || 0.54)); }
  g.fillStyle = o.color || '#fff'; g.fillText(text, w / 2, h * (o.y || 0.54));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function glowTexture(rgb = '255,240,170') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},0.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- 奶蛋 ---------------- */
export function eggGeometry() {
  const N = 26, H = 0.62, R = 0.235, pts = [];
  for (let i = 0; i <= N; i++) {
    const th = Math.PI * i / N;
    pts.push(new V2(Math.max(5e-4, Math.sin(th) * R * (1 + 0.15 * Math.cos(th))), (1 - Math.cos(th)) / 2 * H));
  }
  const parts = [P(new THREE.LatheGeometry(pts, 32).rotateY(Math.PI), '#F4CF7E')];
  const ER = 0.037, y = 0.475, z = 0.152;
  const cap = (r, th, col, s) => P(new THREE.SphereGeometry(r, 20, 8, 0, TAU, 0, th).rotateX(Math.PI / 2).rotateY(s * 0.3), col, { p: [s * 0.078, y, z] });
  for (const s of [-1, 1]) {
    parts.push(P(new THREE.SphereGeometry(ER, 20, 14), '#E6EDD2', { p: [s * 0.078, y, z] }));
    parts.push(cap(ER + 0.0004, 0.95, '#8DAA4A', s));
    parts.push(cap(ER + 0.0009, 0.56, '#0A0A0A', s));
    parts.push(P(new THREE.SphereGeometry(0.0065, 8, 6), '#FFFFFF', { p: [s * 0.078 + s * 0.006 - 0.006, y + 0.011, z + ER * 0.95] }));
    parts.push(P(new THREE.TorusGeometry(ER - 0.001, 0.0045, 6, 24).rotateY(s * 0.3), '#4A3B1E', { p: [s * 0.078 + s * 0.004, y, z + 0.011] }));
  }
  parts.push(P(new THREE.SphereGeometry(1, 16, 10), '#B4843A', { p: [0, 0.428, 0.201], s: [0.026, 0.009, 0.018] }));
  const g = merge(parts); g.translate(0, -0.31, 0);
  return g;
}

/* ---------------- 障碍物 ---------------- */
export function cheeseGeometry() {
  const parts = [P(new RoundedBoxGeometry(1.25, 0.62, 0.9, 3, 0.07), '#FFC93E', { p: [0, 0.31, 0] })];
  const hole = (x, y, z, r, rot) => parts.push(P(new THREE.CylinderGeometry(r, r, 0.02, 22), '#DE961F', { p: [x, y, z], r: rot }));
  for (const [x, y, r] of [[-0.36, 0.38, 0.11], [0.17, 0.21, 0.13], [0.43, 0.46, 0.07], [-0.06, 0.48, 0.06], [-0.43, 0.15, 0.05]]) hole(x, y, 0.451, r, [Math.PI / 2, 0, 0]);
  for (const [x, z, r] of [[-0.3, -0.1, 0.1], [0.25, 0.18, 0.08], [0.36, -0.26, 0.06], [-0.05, 0.25, 0.05]]) hole(x, 0.621, z, r, [0, 0, 0]);
  for (const s of [-1, 1]) for (const [y, z, r] of [[0.3, 0.15, 0.09], [0.42, -0.22, 0.07]]) hole(s * 0.626, y, z, r, [0, 0, Math.PI / 2]);
  return merge(parts);
}
export function wheelGeometry() {
  const T = 0.8, parts = [P(new THREE.CylinderGeometry(0.48, 0.48, T, 40), '#F2B132', { r: [0, 0, Math.PI / 2] })];
  for (const s of [-1, 1]) {
    parts.push(P(new THREE.CylinderGeometry(0.44, 0.44, 0.02, 40), '#FFD660', { p: [s * (T / 2 + 0.002), 0, 0], r: [0, 0, Math.PI / 2] }));
    for (const [y, z, r] of [[0.15, 0.1, 0.07], [-0.18, -0.05, 0.09], [0.05, -0.25, 0.05], [-0.1, 0.25, 0.06], [0.28, -0.12, 0.05]])
      parts.push(P(new THREE.CylinderGeometry(r, r, 0.02, 16), '#D99528', { p: [s * (T / 2 + 0.012), y, z], r: [0, 0, Math.PI / 2] }));
  }
  // 轮面上的奶酪洞（滚动时能看出在转）
  for (let k = 0; k < 14; k++) {
    const a = k * 2.399, x = ((k * 37) % 7 - 3) * 0.1, r = 0.05 + (k % 3) * 0.025;
    parts.push(P(new THREE.CylinderGeometry(r, r, 0.02, 16), '#D3901F', { p: [x, Math.cos(a) * 0.482, Math.sin(a) * 0.482], r: [a, 0, 0] }));
  }
  parts.push(P(new THREE.TorusGeometry(0.47, 0.025, 8, 40), '#E39E25', { p: [T / 2 - 0.02, 0, 0], r: [0, Math.PI / 2, 0] }));
  parts.push(P(new THREE.TorusGeometry(0.47, 0.025, 8, 40), '#E39E25', { p: [-T / 2 + 0.02, 0, 0], r: [0, Math.PI / 2, 0] }));
  return merge(parts);
}
export function gateGeometry() {
  const parts = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 10; k++) parts.push(P(new THREE.CylinderGeometry(0.075, 0.075, 0.262, 16), k % 2 ? '#FFFFFF' : '#FF6F91', { p: [s * 0.72, 0.131 + k * 0.262, 0] }));
    parts.push(P(new THREE.SphereGeometry(0.11, 18, 12), '#FF6F91', { p: [s * 0.72, 2.68, 0] }));
    parts.push(P(new THREE.CylinderGeometry(0.14, 0.16, 0.08, 18), '#E0557A', { p: [s * 0.72, 0.04, 0] }));
  }
  for (let k = 0; k < 7; k++) parts.push(P(new RoundedBoxGeometry(0.205, 0.28, 0.16, 1, 0.02), k % 2 ? '#FFFFFF' : '#FF5C86', { p: [-0.615 + k * 0.205, 1.2, 0] }));
  parts.push(P(new RoundedBoxGeometry(1.32, 0.62, 0.1, 2, 0.04), '#FFF3D6', { p: [0, 2.0, 0] }));
  parts.push(P(new RoundedBoxGeometry(1.42, 0.72, 0.06, 2, 0.03), '#B0702F', { p: [0, 2.0, -0.03] }));
  return merge(parts);
}
export const CART_L = 5.0;
export function truckGeometry(front, ramped) {
  const L = CART_L, parts = [], C1 = ramped ? '#A6E39A' : '#8DCBFF', C2 = ramped ? '#4CBF5A' : '#4FAEF2';
  parts.push(P(new RoundedBoxGeometry(1.3, 1.72, L, 3, 0.14), '#F7FAFF', { p: [0, 1.18, 0] }));
  parts.push(P(new RoundedBoxGeometry(1.2, 0.1, L - 0.25, 2, 0.04), C1, { p: [0, 2.06, 0] }));
  parts.push(P(new THREE.BoxGeometry(1.316, 0.3, L - 0.4), C2, { p: [0, 0.78, 0] }));
  parts.push(P(new THREE.BoxGeometry(1.08, 0.24, L - 0.7), '#5B6876', { p: [0, 0.2, 0] }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(P(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 24), '#30353D', { p: [sx * 0.6, 0.28, sz * (L / 2 - 0.85)], r: [0, 0, Math.PI / 2] }));
    parts.push(P(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 16), '#D5DDE5', { p: [sx * 0.695, 0.28, sz * (L / 2 - 0.85)], r: [0, 0, Math.PI / 2] }));
  }
  const spots = [[1.5, 1.3, 0.32, 0.22], [1.22, -0.7, 0.26, 0.2], [1.6, -1.75, 0.2, 0.16], [1.15, 0.25, 0.16, 0.13]];
  for (const sx of [-1, 1]) for (const [y, z, a, b] of spots) parts.push(P(new THREE.SphereGeometry(1, 18, 10), '#262626', { p: [sx * 0.652, y, z * sx], s: [0.02, b, a] }));
  for (const [x, z, a, b] of [[0.25, 1.2, 0.2, 0.3], [-0.3, -1.1, 0.22, 0.26]]) parts.push(P(new THREE.SphereGeometry(1, 18, 10), '#262626', { p: [x, 2.112, z], s: [b, 0.012, a] }));
  if (front) {
    parts.push(P(new RoundedBoxGeometry(1.04, 0.5, 0.06, 2, 0.03), '#2E5C86', { p: [0, 1.63, L / 2 + 0.005] }));
    parts.push(P(new RoundedBoxGeometry(0.18, 0.4, 0.02, 1, 0.01), '#A9D3F5', { p: [-0.25, 1.64, L / 2 + 0.035], r: [0, 0, -0.5] }));
    for (const sx of [-1, 1]) parts.push(P(new THREE.SphereGeometry(0.1, 18, 12), '#FFF4B0', { p: [sx * 0.43, 0.62, L / 2 - 0.01], s: [1, 1, 0.6] }));
    parts.push(P(new RoundedBoxGeometry(0.6, 0.14, 0.06, 2, 0.03), '#CFD8E0', { p: [0, 0.45, L / 2 + 0.01] }));
    parts.push(P(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 30), ramped ? '#3FAF4F' : '#3FA2F0', { p: [0, 1.07, L / 2 + 0.012], r: [Math.PI / 2, 0, 0] }));
    parts.push(P(new THREE.CylinderGeometry(0.305, 0.305, 0.03, 30), '#FFFFFF', { p: [0, 1.07, L / 2 + 0.002], r: [Math.PI / 2, 0, 0] }));
  }
  return merge(parts);
}
export const RAMP_L = 4.2;
export function rampGeometry(H) {
  const L = RAMP_L, W = 1.3, parts = [];
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(L, 0); sh.lineTo(L, H); sh.closePath();
  const ex = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false });
  ex.rotateY(Math.PI / 2); ex.translate(-W / 2, 0, L / 2);
  parts.push(tint(ex, '#E7A85F'));
  const ang = Math.atan2(H, L), hyp = Math.hypot(L, H);
  for (let k = 0; k < 9; k++) {
    const t = (k + 0.5) / 9;
    parts.push(P(new THREE.BoxGeometry(W - 0.1, 0.035, 0.16), k % 2 ? '#C9853F' : '#F3C987', { p: [0, H * t + 0.02, L / 2 - t * L], r: [ang, 0, 0] }));
  }
  for (const s of [-1, 1]) parts.push(P(new THREE.BoxGeometry(0.08, 0.12, hyp), '#FF7FA0', { p: [s * (W / 2 - 0.04), H / 2 + 0.06, 0], r: [ang, 0, 0] }));
  return merge(parts);
}

/* ---------------- 路边装饰 ---------------- */
export function lolliGeometry() {
  const parts = [P(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 10), '#FFF3DD', { p: [0, 0.75, 0] })];
  parts.push(P(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 44), '#FF8FB1', { p: [0, 1.75, 0], r: [Math.PI / 2, 0, 0] }));
  for (const z of [0.085, -0.085]) {
    const pts = [];
    for (let a = 0.2; a < 5.6 * Math.PI; a += 0.12) { const rr = 0.03 + a * 0.027; pts.push(new V3(Math.cos(a) * rr, 1.75 + Math.sin(a) * rr, z)); }
    parts.push(tint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 180, 0.032, 6), '#FFFFFF'));
  }
  return merge(parts);
}
export function treeGeometry() {
  const parts = [P(new THREE.CylinderGeometry(0.12, 0.17, 1.1, 12), '#A9733F', { p: [0, 0.55, 0] })];
  for (const [x, y, z, r] of [[0, 1.55, 0, 0.66], [-0.45, 1.22, 0.1, 0.45], [0.45, 1.22, -0.05, 0.48], [0, 1.2, 0.38, 0.42], [0.05, 1.95, -0.05, 0.4]])
    parts.push(P(new THREE.IcosahedronGeometry(r, 2), '#76C657', { p: [x, y, z] }));
  for (const [x, y, z] of [[0.3, 1.7, 0.52], [-0.35, 1.45, 0.48], [0.55, 1.3, 0.3], [-0.1, 2.05, 0.33], [0.1, 1.15, 0.78]])
    parts.push(P(new THREE.SphereGeometry(0.07, 10, 8), '#FF7FA5', { p: [x, y, z] }));
  return merge(parts);
}
export function bottleGeometry() {
  const prof = profile([[0, 0], [0.32, 0.02], [0.34, 0.15], [0.34, 0.7], [0.3, 0.86], [0.17, 0.98], [0.15, 1.08], [0, 1.09]], 40);
  const parts = [P(new THREE.LatheGeometry(prof, 32), '#FFFFFF')];
  parts.push(P(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 24), '#4AA8F0', { p: [0, 1.1, 0] }));
  parts.push(P(new THREE.CylinderGeometry(0.345, 0.345, 0.3, 32, 1, true), '#7CC8FF', { p: [0, 0.42, 0] }));
  return merge(parts);
}
export function mushGeometry() {
  const parts = [P(new THREE.CylinderGeometry(0.38, 0.46, 0.86, 24), '#FFF1D6', { p: [0, 0.43, 0] })];
  parts.push(P(new THREE.SphereGeometry(0.78, 32, 16, 0, TAU, 0, Math.PI / 2), '#FF5E5E', { p: [0, 0.8, 0], s: [1, 0.8, 1] }));
  parts.push(P(new THREE.CylinderGeometry(0.76, 0.76, 0.04, 32), '#FBE3C2', { p: [0, 0.8, 0] }));
  for (const [a, e] of [[0.3, 0.5], [1.6, 0.9], [2.6, 0.45], [3.9, 0.8], [5.1, 0.55], [0.9, 1.25], [4.4, 1.3], [2.0, 1.4]]) {
    const r = 0.78, x = Math.sin(a) * Math.cos(e) * r, z = Math.cos(a) * Math.cos(e) * r, y = 0.8 + Math.sin(e) * r * 0.8;
    parts.push(P(new THREE.SphereGeometry(0.11, 14, 10), '#FFFFFF', { p: [x, y, z], s: [1, 0.55, 1] }));
  }
  parts.push(P(new RoundedBoxGeometry(0.28, 0.44, 0.1, 2, 0.05), '#C27C48', { p: [0, 0.22, 0.42] }));
  parts.push(P(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 18), '#BFE6FF', { p: [0.25, 0.56, 0.37], r: [Math.PI / 2, 0, 0] }));
  return merge(parts);
}
export function bushGeometry() {
  const parts = [];
  for (const [x, y, z, r] of [[0, 0.3, 0, 0.42], [-0.45, 0.22, 0.05, 0.32], [0.45, 0.22, -0.05, 0.34], [0.15, 0.45, 0.1, 0.3]])
    parts.push(P(new THREE.IcosahedronGeometry(r, 2), '#62B84A', { p: [x, y, z] }));
  const cols = ['#FFFFFF', '#FFE14D', '#FF8FB1'];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, x = Math.sin(a) * 0.5, z = Math.cos(a) * 0.3 + 0.12, y = 0.42 + (i % 3) * 0.08;
    parts.push(P(new THREE.SphereGeometry(0.07, 10, 8), cols[i % 3], { p: [x, y, z] }));
  }
  return merge(parts);
}
export function hedgeGeometry() {
  return merge([P(new RoundedBoxGeometry(0.55, 0.5, 2.2, 3, 0.2), '#5DB345', { p: [0, 0.25, 0] })]);
}
export function cloudGeometry() {
  const parts = [];
  for (const [x, y, z, r] of [[0, 0, 0, 3.2], [3.4, -0.6, 0.3, 2.4], [-3.2, -0.8, 0, 2.2], [1.4, 1.3, -0.4, 2.2], [-1.4, 1.0, 0.4, 2.0]])
    parts.push(P(new THREE.IcosahedronGeometry(r, 2), '#FFFFFF', { p: [x, y, z] }));
  return merge(parts);
}
export function castleGeometry() {
  const parts = [];
  const prof = profile([[0, 0], [1, 0], [1, 0.62], [0.82, 0.78], [0.55, 0.84], [0.55, 0.95], [0, 0.95]], 30);
  for (const [x, h, w] of [[-14, 9, 2.4], [-7.5, 13, 2.9], [0, 19, 3.6], [7.5, 12, 2.9], [14, 8, 2.3]]) {
    parts.push(P(new THREE.LatheGeometry(prof, 24), '#ECE6FF', { p: [x, 0, 0], s: [w, h, w] }));
    parts.push(P(new THREE.CylinderGeometry(w * 0.62, w * 0.62, h * 0.08, 24), '#9FD2FF', { p: [x, h * 0.98, 0] }));
    parts.push(P(new THREE.SphereGeometry(w * 0.32, 16, 12), '#C9BEF5', { p: [x, h * 0.45, w * 0.85], s: [1, 1.4, 0.4] }));
  }
  parts.push(P(new THREE.CylinderGeometry(0.15, 0.15, 5, 8), '#C9BEF5', { p: [0, 21.6, 0] }));
  parts.push(P(new THREE.BoxGeometry(3, 1.8, 0.2), '#FF8FB1', { p: [1.5, 23.2, 0] }));
  return merge(parts);
}

/* ---------------- 奶蛙 ---------------- */
export function buildFrog() {
  const mats = {
    y: new THREE.MeshPhysicalMaterial({ color: '#FFD640', roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.45, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color('#FFF4B8') }),
    belly: new THREE.MeshPhysicalMaterial({ color: '#FBF0D4', roughness: 0.6, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }),
    hand: std('#7B6B57', 0.75),
    foot: std('#7B6B57', 0.75),
    eye: std('#EDF5DC', 0.08),
    iris: std('#87B44A', 0.12),
    pupil: std('#0C0C0C', 0.05),
    line: off(std('#5A3714', 0.6), 2),
    mouth: off(std('#4A1111', 0.85), 2),
    tongue: off(std('#FF7B8B', 0.5), 4),
    teeth: off(std('#FFFFFF', 0.25), 6),
    blush: off(new THREE.MeshBasicMaterial({ color: '#FF8E8E', transparent: true, opacity: 0.45, depthWrite: false }), 2),
  };
  const root = new THREE.Group(), lift = new THREE.Group(), pivot = new THREE.Group(), body = new THREE.Group();
  root.add(lift); lift.add(pivot); pivot.add(body);
  pivot.position.y = 0.55; body.position.y = -0.55;
  const add = (geo, mat, p, s, par) => {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (s) m.scale.set(s[0], s[1], s[2]);
    (par || body).add(m);
    return m;
  };
  const prof = profile([[0, 0.1], [0.33, 0.12], [0.5, 0.27], [0.56, 0.5], [0.52, 0.72], [0.44, 0.9], [0.39, 1.04], [0.33, 1.16], [0.21, 1.27], [0, 1.31]], 60);
  const ZS = 0.9;
  add(new THREE.LatheGeometry(prof, 48).rotateY(Math.PI), mats.y, null, [1, 1, ZS]);
  add(new THREE.SphereGeometry(1, 40, 28), mats.belly, [0, 0.52, 0.31], [0.42, 0.38, 0.22]);
  add(new THREE.SphereGeometry(0.09, 16, 12), mats.y, [0, 0.3, -0.47]);

  const eyes = [], eyesClosed = [];
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.17, 32, 24), mats.y, [s * 0.21, 1.2, 0.07]);
    const eg = new THREE.Group(); eg.position.set(s * 0.245, 1.23, 0.145); eg.rotation.y = s * 0.22; body.add(eg);
    add(new THREE.SphereGeometry(0.13, 32, 24), mats.eye, [0, 0, 0], null, eg);
    add(new THREE.SphereGeometry(0.105, 28, 18), mats.iris, [s * 0.005, 0.004, 0.1], [1, 1, 0.35], eg);
    add(new THREE.SphereGeometry(0.056, 20, 14), mats.pupil, [s * 0.008, 0.006, 0.122], [1, 1, 0.35], eg);
    eyes.push(eg);
    const cl = add(new THREE.TorusGeometry(0.085, 0.022, 8, 24, Math.PI), mats.line, [s * 0.215, 1.2, 0.24]);
    cl.rotation.x = -0.3; cl.visible = false; eyesClosed.push(cl);
  }
  // 平时的嘴：一道微笑
  const a0 = Math.PI * 1.18, a1 = Math.PI * 1.82, sm = new THREE.Shape();
  sm.moveTo(Math.cos(a0) * 0.165, Math.sin(a0) * 0.165);
  sm.absarc(0, 0, 0.165, a0, a1, false); sm.absarc(0, 0, 0.143, a1, a0, true);
  const mouthClosed = add(decal(new THREE.ShapeGeometry(sm, 24), prof, ZS, 0, 1.17, 0.004), mats.line);
  // 大笑时的嘴：张大的嘴、舌头、上下两排牙
  const MCY = 0.975, mrx = 0.205, mry = 0.155, zc = ZS * radiusAt(prof, MCY);
  const mo = new THREE.Group(); mo.position.set(0, MCY, zc); body.add(mo); mo.visible = false;
  const shift = (g) => { g.translate(0, -MCY, -zc); return g; };
  add(shift(decal(new THREE.CircleGeometry(1, 56).scale(mrx, mry, 1), prof, ZS, 0, MCY, 0.006)), mats.mouth, null, null, mo);
  add(shift(decal(new THREE.CircleGeometry(1, 32).scale(0.115, 0.068, 1), prof, ZS, 0, MCY - 0.085, 0.01)), mats.tongue, null, null, mo);
  const ts = [];
  for (let i = 0; i < 7; i++) {
    const x = -0.15 + i * 0.05, yt = MCY + mry * Math.sqrt(Math.max(0, 1 - (x / mrx) ** 2)) - 0.006;
    const sh = new THREE.Shape(); sh.moveTo(x - 0.022, yt); sh.lineTo(x + 0.022, yt); sh.lineTo(x, yt - 0.052); sh.closePath(); ts.push(sh);
  }
  for (let i = 0; i < 4; i++) {
    const x = -0.075 + i * 0.05, yb = MCY - mry * Math.sqrt(Math.max(0, 1 - (x / mrx) ** 2)) + 0.006;
    const sh = new THREE.Shape(); sh.moveTo(x - 0.02, yb); sh.lineTo(x + 0.02, yb); sh.lineTo(x, yb + 0.044); sh.closePath(); ts.push(sh);
  }
  add(shift(decal(new THREE.ShapeGeometry(ts), prof, ZS, 0, 0, 0.012)), mats.teeth, null, null, mo);
  const blush = new THREE.Group(); body.add(blush); blush.visible = false;
  for (const s of [-1, 1]) add(decal(new THREE.CircleGeometry(1, 28).scale(0.07, 0.042, 1), prof, ZS, s * 0.275, 1.03, 0.006), mats.blush, null, null, blush);

  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.45, 0.8, 0.04); sh.rotation.z = s * 0.35; body.add(sh);
    add(new THREE.CapsuleGeometry(0.085, 0.27, 8, 16), mats.y, [0, -0.17, 0], null, sh);
    const hand = new THREE.Group(); hand.position.set(0, -0.38, 0.02); sh.add(hand);
    add(new THREE.SphereGeometry(0.1, 22, 16), mats.hand, [0, 0, 0], [1, 0.82, 0.85], hand);
    for (const [fx, fy, fz] of [[-0.052, -0.07, 0.04], [0, -0.085, 0.05], [0.052, -0.07, 0.04]]) add(new THREE.SphereGeometry(0.043, 14, 10), mats.hand, [fx, fy, fz], null, hand);
    arms.push(sh);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.21, 0.27, 0.02); body.add(hp);
    add(new THREE.SphereGeometry(0.14, 24, 16), mats.y, [0, -0.07, 0], [1, 1.15, 1], hp);
    add(new THREE.SphereGeometry(0.1, 22, 14), mats.foot, [0, -0.215, 0.07], [1.55, 0.55, 2.1], hp);
    for (const dx of [-0.08, 0, 0.08]) add(new THREE.SphereGeometry(0.046, 14, 10), mats.foot, [dx, -0.222, 0.27], [1, 0.75, 1], hp);
    legs.push(hp);
  }
  // 附加件：护罩、眩晕星星、背包挂点、头顶挂点
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.0, 40, 28), new THREE.MeshPhysicalMaterial({
    color: '#CFEFFF', transparent: true, opacity: 0.24, roughness: 0.04, metalness: 0, clearcoat: 1, depthWrite: false, envMapIntensity: 2,
    emissive: '#7FD0FF', emissiveIntensity: 0.12,
  }));
  bubble.position.y = 0.7; bubble.visible = false; root.add(bubble);
  const stars = new THREE.Group(); stars.position.y = 1.6; stars.visible = false; root.add(stars);
  const st = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? 0.045 : 0.105; if (i) st.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else st.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const sg = new THREE.ExtrudeGeometry(st, { depth: 0.035, bevelEnabled: false });
  const smat = std('#FFE14D', 0.3, { emissive: '#FFB000', emissiveIntensity: 0.5 });
  for (let i = 0; i < 3; i++) stars.add(new THREE.Mesh(sg, smat));
  const back = new THREE.Group(); back.position.set(0, 0.8, -0.46); body.add(back);
  const head = new THREE.Group(); head.position.set(0, 1.85, 0); root.add(head);
  root.traverse((o) => { if (o.isMesh && o !== bubble && o.material !== mats.blush) o.castShadow = true; });
  return { root, lift, pivot, body, arms, legs, eyes, eyesClosed, mouthClosed, mouthOpen: mo, blush, bubble, stars, back, head, mats };
}

/* ---------------- 肥嘟嘟 ---------------- */
export function buildFei() {
  const mats = {
    y: new THREE.MeshPhysicalMaterial({ color: '#FFCB12', roughness: 0.72, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color('#FFE98A') }),
    cream: new THREE.MeshPhysicalMaterial({ color: '#FFF0AE', roughness: 0.75, sheen: 0.6, sheenColor: new THREE.Color('#ffffff') }),
    muzzle: new THREE.MeshPhysicalMaterial({ color: '#FFE05A', roughness: 0.72, sheen: 0.8, sheenColor: new THREE.Color('#FFF3B0') }),
    inner: std('#F2A000', 0.7),
    nose: std('#86290E', 0.16),
    eye: std('#FFFFFF', 0.1),
    pupil: std('#140C06', 0.05),
    line: std('#5A2A0A', 0.5),
  };
  const root = new THREE.Group(), pivot = new THREE.Group(), body = new THREE.Group();
  root.add(pivot); pivot.add(body); pivot.position.y = 0.6; body.position.y = -0.6;
  const add = (geo, mat, p, s, par) => {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (s) m.scale.set(s[0], s[1], s[2]);
    (par || body).add(m);
    return m;
  };
  const prof = profile([[0, 0.12], [0.36, 0.14], [0.55, 0.35], [0.58, 0.58], [0.5, 0.86], [0.38, 1.08], [0.27, 1.22], [0, 1.27]], 56);
  add(new THREE.LatheGeometry(prof, 44).rotateY(Math.PI), mats.y, null, [1, 1, 0.9]);
  add(new THREE.SphereGeometry(1, 36, 24), mats.cream, [0, 0.58, 0.3], [0.42, 0.46, 0.24]);
  const legs = [];
  for (const s of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(s * 0.3, 0.32, -0.02); body.add(lg);
    add(new THREE.SphereGeometry(0.27, 24, 18), mats.y, [s * 0.06, 0, -0.02], null, lg);
    add(new THREE.SphereGeometry(1, 22, 14), mats.y, [-s * 0.06, -0.25, 0.19], [0.16, 0.085, 0.36], lg);
    legs.push(lg);
  }
  const head = new THREE.Group(); head.position.set(0, 1.43, 0.04); body.add(head);
  add(new THREE.SphereGeometry(0.38, 36, 26), mats.y, [0, 0, 0], [1, 0.92, 0.95], head);
  add(new THREE.SphereGeometry(0.2, 28, 18), mats.muzzle, [0, -0.11, 0.28], [1.15, 0.78, 0.9], head);
  add(new THREE.SphereGeometry(0.088, 24, 16), mats.nose, [0, -0.045, 0.465], [1.25, 0.9, 0.9], head);
  const eyes = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.13, 0.08, 0.31); head.add(eg);
    add(new THREE.SphereGeometry(0.066, 20, 14), mats.eye, [0, 0, 0], null, eg);
    add(new THREE.SphereGeometry(0.04, 16, 12), mats.pupil, [s * 0.006, 0.004, 0.058], [1, 1, 0.5], eg);
    eyes.push(eg);
  }
  const mouth = add(new THREE.TorusGeometry(0.05, 0.011, 6, 16, Math.PI), mats.line, [0, -0.165, 0.43], null, head);
  mouth.rotation.z = Math.PI; mouth.rotation.x = -0.35;
  const ears = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.16, 0.27, -0.03); eg.rotation.z = -s * 0.18; head.add(eg);
    add(new THREE.SphereGeometry(1, 24, 16), mats.y, [0, 0.24, 0], [0.1, 0.29, 0.07], eg);
    add(new THREE.SphereGeometry(1, 20, 14), mats.inner, [0, 0.23, 0.045], [0.055, 0.2, 0.03], eg);
    ears.push(eg);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.43, 1.02, 0.12); sh.rotation.z = s * 0.3; body.add(sh);
    add(new THREE.CapsuleGeometry(0.08, 0.22, 8, 14), mats.y, [0, -0.15, 0], null, sh);
    add(new THREE.SphereGeometry(0.095, 18, 14), mats.y, [0, -0.32, 0.02], null, sh);
    arms.push(sh);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.42, -0.38); body.add(tail);
  const curve = new THREE.CatmullRomCurve3([new V3(0, 0, 0), new V3(0, -0.16, -0.32), new V3(0.05, -0.3, -0.62), new V3(0.12, -0.35, -0.88)]);
  for (let i = 0; i < 11; i++) {
    const t = i / 10, p = curve.getPoint(t);
    add(new THREE.SphereGeometry(0.17 - t * 0.1, 18, 12), mats.y, [p.x, p.y, p.z], null, tail);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, pivot, body, head, eyes, ears, arms, legs, tail, mats };
}

/* ---------------- 道具模型 ---------------- */
export function puModel(type) {
  const g = new THREE.Group();
  const add = (geo, mat, p, r, s) => {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (r) m.rotation.set(r[0], r[1], r[2]);
    if (s) m.scale.set(s[0], s[1], s[2]);
    g.add(m); return m;
  };
  if (type === 'magnet') {
    const red = std('#FFF6E2', 0.35), sil = std('#F4CF7E', 0.3, { emissive: '#3A2A08', emissiveIntensity: 0.3 });   // 吸奶石：奶白色的马蹄石，两头是奶蛋色
    add(new THREE.TorusGeometry(0.2, 0.08, 16, 32, Math.PI), red, [0, -0.02, 0], [0, 0, Math.PI]);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 20), red, [s * 0.2, 0.05, 0]);
      add(new THREE.CylinderGeometry(0.082, 0.082, 0.11, 20), sil, [s * 0.2, 0.175, 0]);
    }
  } else if (type === 'shoes') {   // 跳蛋：一颗奶蛋，底下一根红弹簧
    const egg = new THREE.Mesh(eggGeometry(), vcMat(0.42, 0, { emissive: '#3A2A08', emissiveIntensity: 0.35 }));
    egg.scale.setScalar(0.85); egg.position.y = 0.12; g.add(egg);
    const spr = std('#FF5A4F', 0.35, { metalness: 0.3 });
    for (let k = 0; k < 4; k++) add(new THREE.TorusGeometry(0.075, 0.017, 8, 20), spr, [0, -0.17 - k * 0.04, 0], [Math.PI / 2, 0, 0]);
  } else if (type === 'double') {
    const gold = std('#FFC83D', 0.28, { metalness: 0.65 });
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 40), gold, [0, 0, 0], [Math.PI / 2, 0, 0]);
    add(new THREE.TorusGeometry(0.29, 0.03, 10, 40), std('#E6A20E', 0.3, { metalness: 0.7 }), [0, 0, 0]);
    const tm = new THREE.MeshStandardMaterial({ map: textTexture('×2', { color: '#B5520A', font: `900 150px ${FONT}` }), transparent: true, roughness: 0.4 });
    add(new THREE.PlaneGeometry(0.42, 0.42), tm, [0, 0, 0.042]);
    add(new THREE.PlaneGeometry(0.42, 0.42), tm, [0, 0, -0.042], [0, Math.PI, 0]);
  } else if (type === 'shield') {
    const prof = profile([[0, 0], [0.09, 0.03], [0.12, 0.11], [0.08, 0.22], [0.02, 0.3], [0, 0.32]], 24);
    add(new THREE.LatheGeometry(prof, 24), std('#FFFFFF', 0.25), [0, -0.15, 0]);
    add(new THREE.SphereGeometry(0.3, 32, 24), new THREE.MeshPhysicalMaterial({ color: '#BDE6FF', transparent: true, opacity: 0.38, roughness: 0.05, clearcoat: 1, depthWrite: false, envMapIntensity: 2 }));
    add(new THREE.TorusGeometry(0.3, 0.02, 8, 40), std('#7FD0FF', 0.2, { emissive: '#7FD0FF', emissiveIntensity: 0.4 }), [0, 0, 0], [0.4, 0, 0]);
  } else if (type === 'rocket') {
    const prof = profile([[0, -0.2], [0.13, -0.19], [0.14, -0.05], [0.14, 0.1], [0.1, 0.18], [0.06, 0.22], [0, 0.23]], 28);
    add(new THREE.LatheGeometry(prof, 28), std('#FFFFFF', 0.25));
    add(new THREE.CylinderGeometry(0.143, 0.143, 0.09, 28, 1, true), std('#4AA8F0', 0.35), [0, 0, 0]);
    add(new THREE.ConeGeometry(0.075, 0.14, 24), std('#FF4F5E', 0.3), [0, 0.29, 0]);
    for (let k = 0; k < 3; k++) {
      const a = k * TAU / 3;
      const f = add(new RoundedBoxGeometry(0.02, 0.14, 0.12, 1, 0.008), std('#FF4F5E', 0.3), [Math.sin(a) * 0.15, -0.15, Math.cos(a) * 0.15]);
      f.rotation.y = a;
    }
    const fl = add(new THREE.ConeGeometry(0.08, 0.26, 20), new THREE.MeshBasicMaterial({ color: '#FFB347', transparent: true, opacity: 0.9 }), [0, -0.34, 0], [Math.PI, 0, 0]);
    fl.name = 'flame';
  }
  return g;
}

/* ---------------- 奶金：长着奶蛙眼睛的金条 ---------------- */
let GOLD_MAT = null;
export function goldBar() {
  const g = new THREE.Group();
  GOLD_MAT = GOLD_MAT || new THREE.MeshStandardMaterial({ color: '#F7C948', metalness: 0.88, roughness: 0.26, emissive: '#6A4300', emissiveIntensity: 0.22 });
  const geo = new RoundedBoxGeometry(0.58, 0.22, 0.34, 3, 0.05), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + 0.11) / 0.22;
    pos.setX(i, pos.getX(i) * (1 - 0.2 * t)); pos.setZ(i, pos.getZ(i) * (1 - 0.3 * t));
  }
  geo.computeVertexNormals();
  const bar = new THREE.Mesh(geo, GOLD_MAT); bar.position.y = 0.11; g.add(bar);
  const eyeW = std('#E6EED2', 0.12), iris = std('#A6C35F', 0.22), pupil = std('#070707', 0.08), rim = std('#3B3A22', 0.6);
  const cap = (r, th) => new THREE.SphereGeometry(r, 24, 8, 0, TAU, 0, th).rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.105, 0.225, 0.02);
    eg.quaternion.setFromUnitVectors(new V3(0, 0, 1), new V3(s * 0.35, 0.55, 1).normalize()); g.add(eg);
    eg.add(new THREE.Mesh(new THREE.SphereGeometry(0.062, 24, 18), eyeW));
    eg.add(new THREE.Mesh(cap(0.0626, 0.95), iris));
    eg.add(new THREE.Mesh(cap(0.063, 0.58), pupil));
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); hl.position.set(-0.02, 0.022, 0.058); eg.add(hl);
    const rm = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.008, 8, 28), rim); rm.position.z = 0.02; eg.add(rm);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.066, 20, 10, 0, TAU, 0, 1.0), GOLD_MAT); lid.rotation.x = -0.25; eg.add(lid);
  }
  const sm = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 20, Math.PI * 0.8), std('#6B4300', 0.5));
  sm.rotation.set(-0.2, 0, Math.PI * 1.1); sm.position.set(0, 0.15, 0.156); g.add(sm);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/* ---------------- 增强药水 ---------------- */
export function potionModel() {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: '#F4FBFF', transparent: true, opacity: 0.2, roughness: 0.04, clearcoat: 1, depthWrite: false, envMapIntensity: 2.2 });
  const liquid = new THREE.MeshStandardMaterial({ color: '#FF8C00', emissive: '#FF6A00', emissiveIntensity: 1.1, roughness: 0.3, toneMapped: false });
  const prof = profile([[0, 0], [0.18, 0.01], [0.235, 0.1], [0.235, 0.21], [0.18, 0.31], [0.085, 0.37], [0.075, 0.47], [0.092, 0.495], [0.0, 0.5]], 40);
  const lq = profile([[0, 0.02], [0.165, 0.025], [0.218, 0.1], [0.218, 0.2], [0.17, 0.27], [0, 0.272]], 30);
  const lm = new THREE.Mesh(new THREE.LatheGeometry(lq, 32), liquid); g.add(lm);
  const gm = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), glass); gm.renderOrder = 2; g.add(gm);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.062, 0.1, 18), std('#B9813F', 0.8)); cork.position.y = 0.52; g.add(cork);
  const tm = new THREE.MeshStandardMaterial({ map: textTexture('力', { color: '#B5520A', bg: '#FFF4D6', font: `900 170px ${FONT}` }), roughness: 0.6 });
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.238, 0.238, 0.13, 32, 1, true, -0.75, 1.5), tm); lab.position.y = 0.16; g.add(lab);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.02 + i * 0.004, 10, 8), std('#FFE9A0', 0.2, { emissive: '#FFC94A', emissiveIntensity: 0.6 })); b.position.set(Math.sin(i * 2.3) * 0.09, 0.06 + i * 0.05, Math.cos(i * 2.3) * 0.09); b.name = 'bub' + i; g.add(b); }
  g.traverse((o) => { if (o.isMesh && o !== gm) o.castShadow = true; });
  return g;
}


import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { tint, merge, FONT, profile, radiusAt } from './models.js';
import { IMG } from './statueImgs.js';

/* 奶国雕像：奶狗、奶马、奶猫、西格奶、卷毛奶
   角色本体直接用用户给的原图：抠图后把轮廓"鼓"成有厚度的浮雕，贴上原图，
   神情、动作、朝向都和原图一模一样；底座、拱门、铭牌是 3D 建模。 */

const V3 = THREE.Vector3, TAU = Math.PI * 2, Z = new V3(0, 0, 1);
const LINE = '#3A2612';
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const v3 = (p) => (p.isVector3 ? p.clone() : new V3(p[0], p[1], p[2]));

// 椭球：中心、半径、旋转
function E(c, r, rot) {
  return { c: v3(c), r: v3(r), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]))) };
}
// 椭球表面一点：th 绕 y 轴（0 = 正前方 +z，正值偏 +x），ph 仰角
function on(e, th, ph, off = 0, outN) {
  if (e.prof) return onL(e, th, ph, off, outN);
  const d = new V3(Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph));
  const p = d.clone().multiply(e.r);
  const n = new V3(d.x / e.r.x, d.y / e.r.y, d.z / e.r.z).normalize();
  p.addScaledVector(n, off).applyQuaternion(e.q).add(e.c);
  if (outN) outN.copy(n.applyQuaternion(e.q));
  return p;
}
// 车床体（用于奶猫这种馒头形）：th 同上，y 为高度
function L(pts, o = {}) { return { prof: profile(pts, 60), zs: o.zs || 1, c: v3(o.c || [0, 0, 0]) }; }
function onL(S, th, y, off = 0, outN) {
  const R = radiusAt(S.prof, y), dR = (radiusAt(S.prof, y + 0.004) - radiusAt(S.prof, y - 0.004)) / 0.008;
  const p = new V3(R * Math.sin(th), y, R * Math.cos(th) * S.zs);
  const n = new V3(Math.sin(th), -dR, Math.cos(th) / S.zs).normalize();
  p.addScaledVector(n, off).add(S.c);
  if (outN) outN.copy(n);
  return p;
}
function taperTube(curve, r0, r1, segs, rad, prof) {
  const g = new THREE.TubeGeometry(curve, segs, 1, rad, false);
  const pos = g.attributes.position, c = new V3(), v = new V3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, r = prof ? prof(t, r0, r1) : lerp(r0, r1, t);
    curve.getPointAt(t, c);
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
// 简单的确定性随机数（每次生成的雕像都一样）
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

class B {
  constructor() { this.parts = []; }
  push(g, col) { if (col) tint(g, col); this.parts.push(g); return g; }
  ell(e, col, seg) {
    const g = new THREE.SphereGeometry(1, seg ? seg[0] : 28, seg ? seg[1] : 18);
    g.scale(e.r.x, e.r.y, e.r.z); g.applyQuaternion(e.q); g.translate(e.c.x, e.c.y, e.c.z);
    return this.push(g, col);
  }
  lathe(S, col, segs = 64) {
    const g = new THREE.LatheGeometry(S.prof, segs).rotateY(Math.PI);
    g.scale(1, 1, S.zs); g.translate(S.c.x, S.c.y, S.c.z);
    return this.push(g, col);
  }
  sph(c, r, col, rot, seg) { return this.ell(E(c, Array.isArray(r) ? r : [r, r, r], rot), col, seg); }
  tube(pts, r0, r1, col, o = {}) {
    const P = pts.map(v3), curve = new THREE.CatmullRomCurve3(P);
    const g = this.push(taperTube(curve, r0, r1, o.segs || 26, o.rad || 14, o.prof), col);
    if (o.caps !== false) {
      const cs = (r) => (r > 0.09 ? [16, 12] : r > 0.035 ? [10, 7] : [6, 4]);
      this.sph(P[0], r0 * (o.c0 || 1), col, null, cs(r0)); if (r1 > 0.012) this.sph(P[P.length - 1], r1 * (o.c1 || 1), col, null, cs(r1));
    }
    return g;
  }
  box(s, p, col, rot, rad = 0.05) {
    const g = new RoundedBoxGeometry(s[0], s[1], s[2], 3, Math.min(rad, s[0] / 2.01, s[1] / 2.01, s[2] / 2.01));
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
    g.translate(p[0], p[1], p[2]);
    return this.push(g, col);
  }
  cyl(rt, rb, h, p, col, rot, seg = 36) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
    g.translate(p[0], p[1], p[2]);
    return this.push(g, col);
  }
  // 贴在椭球表面的一块（嘴巴、肚皮、牙齿）：f(u, w) -> [th, ph]，u 左→右，w 下→上
  patch(e, f, nu, nv, col, off) {
    const g = new THREE.PlaneGeometry(1, 1, nu, nv), pos = g.attributes.position, n = new V3(), outs = [];
    for (let i = 0; i < pos.count; i++) {
      const [th, ph] = f(pos.getX(i) + 0.5, pos.getY(i) + 0.5);
      const p = on(e, th, ph, off, n); pos.setXYZ(i, p.x, p.y, p.z); outs.push(n.clone());
    }
    g.computeVertexNormals();
    const nr = g.attributes.normal; let dot = 0;
    for (let i = 0; i < pos.count; i++) dot += outs[i].x * nr.getX(i) + outs[i].y * nr.getY(i) + outs[i].z * nr.getZ(i);
    if (dot < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } }
    for (let i = 0; i < pos.count; i++) nr.setXYZ(i, outs[i].x, outs[i].y, outs[i].z);
    return this.push(g, col);
  }
  // 椭圆形的一块
  oval(e, th0, ph0, a, b, col, off, rot = 0) {
    return this.patch(e, (u, w) => {
      const ang = u * TAU, rr = w;
      const x = Math.cos(ang) * a * rr, y = Math.sin(ang) * b * rr;
      return [th0 + x * Math.cos(rot) - y * Math.sin(rot), ph0 + x * Math.sin(rot) + y * Math.cos(rot)];
    }, 40, 6, col, off);
  }
  // 沿着椭球表面画线（闭着的眼睛、微笑）
  line(e, pts, r, col, off = 0.004) {
    return this.tube(pts.map(([th, ph]) => on(e, th, ph, off)), r, r, col, { segs: 24, rad: 8 });
  }
  eye(c, look, R, o) {
    const q = new THREE.Quaternion().setFromUnitVectors(Z, look.clone().normalize());
    this.sph(c, R, o.white || '#F2F5E6', null, [30, 22]);
    const cap = (rr, th, col) => { const g = new THREE.SphereGeometry(rr, 32, 10, 0, TAU, 0, th).rotateX(Math.PI / 2); g.applyQuaternion(q); g.translate(c.x, c.y, c.z); this.push(g, col); };
    if (o.ring) cap(R * 1.006, o.ia + 0.14, o.ring);
    cap(R * 1.012, o.ia, o.iris);
    if (o.inner) cap(R * 1.016, o.pa + 0.09, o.inner);
    cap(R * 1.02, o.pa, '#070707');
    const hl = new V3(-0.38, 0.42, 0.82).normalize().applyQuaternion(q).multiplyScalar(R * 1.0).add(c);
    this.sph(hl, R * 0.13, '#FFFFFF', null, [10, 8]);
    if (o.lid) { // 眼皮：盖住上半只眼睛
      const g = new THREE.SphereGeometry(R * 1.05, 32, 14, 0, TAU, 0, 1.62).rotateX(o.lid);
      g.applyQuaternion(q); g.translate(c.x, c.y, c.z); this.push(g, o.lidCol);
      const rim = new THREE.TorusGeometry(R * 1.03, R * 0.07, 8, 32, Math.PI).rotateX(Math.PI / 2 + o.lid - 0.04);
      rim.applyQuaternion(q); rim.translate(c.x, c.y, c.z); this.push(rim, o.lidLine || '#9C7A10');
    }
  }
  // 按位置/法线给最近加入的几块重新上色
  paint(from, fn) {
    const p = new V3(), n = new V3(), c = new THREE.Color();
    for (let k = from; k < this.parts.length; k++) {
      const g = this.parts[k], pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i); c.fromBufferAttribute(col, i);
        fn(p, n, c); col.setXYZ(i, c.r, c.g, c.b);
      }
    }
  }
  geo() { return merge(this.parts); }
}

/* ======================= 底座、铭牌 ======================= */
const MARBLE = '#F3ECDE', TRIM = '#E4B95C';
function pedestal(b, w, h, d, o = {}) {
  b.box([w + 0.14, 0.1, d + 0.14], [0, 0.05, 0], o.trim || TRIM, null, 0.03);
  b.box([w, h - 0.2, d], [0, 0.1 + (h - 0.2) / 2, 0], o.body || MARBLE, null, 0.04);
  b.box([w + 0.1, 0.1, d + 0.1], [0, h - 0.05, 0], o.trim || TRIM, null, 0.03);
}
function plaqueCanvas(lines, w = 512, h = 192) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  drawPlaque(c, lines);
  return c;
}
function drawPlaque(c, lines) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  const r = 26;
  g.fillStyle = '#C8933A'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, w - 8, h - 8, r) : g.rect(4, 4, w - 8, h - 8); g.fill();
  g.fillStyle = '#F1CF79'; g.beginPath(); g.roundRect ? g.roundRect(14, 14, w - 28, h - 28, r - 8) : g.rect(14, 14, w - 28, h - 28); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#6B3D0E';
  if (lines.length === 1) { g.font = `900 ${h * 0.5}px ${FONT}`; g.fillText(lines[0], w / 2, h * 0.53); }
  else { g.font = `900 ${h * 0.36}px ${FONT}`; g.fillText(lines[0], w / 2, h * 0.34); g.font = `800 ${h * 0.27}px ${FONT}`; g.fillText(lines[1], w / 2, h * 0.72); }
}
function plaqueMat(canvas) {
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.35, metalness: 0.25 });
}

/* ======================= 原图浮雕 ======================= */
const IMGS = {}, TEXS = {}, RMATS = {};
let ready = false;
export function loadStatueImages() {
  return Promise.all(Object.keys(IMG).map((k) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { IMGS[k] = im; res(); };
    im.onerror = () => res();
    im.src = IMG[k];
  }))).then(() => { ready = Object.keys(IMG).every((k) => IMGS[k]); return ready; });
}
export const isReady = () => ready;
function reliefMat(k) {
  if (RMATS[k]) return RMATS[k];
  const t = new THREE.Texture(IMGS[k]); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  TEXS[k] = t;
  return (RMATS[k] = new THREE.MeshStandardMaterial({
    map: t, alphaTest: 0.45, roughness: 0.62, metalness: 0,
    emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.3,
  }));
}
// 把抠好的图按透明度"充气"成浮雕：越往轮廓里面越厚，边缘圆润
const RGEO = {};
function reliefGeo(k, H, o = {}) {
  const key = k + H + (o.thick || 0);
  if (RGEO[key]) return RGEO[key];
  const img = IMGS[k], GH = o.grid || 60, GW = Math.max(8, Math.round((GH * img.width) / img.height));
  const W = (H * img.width) / img.height;
  const c = document.createElement('canvas'); c.width = GW; c.height = GH;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, GW, GH);
  const px = g.getImageData(0, 0, GW, GH).data, N = GW * GH;
  let ins = new Uint8Array(N);
  for (let i = 0; i < N; i++) ins[i] = px[i * 4 + 3] > 24 ? 1 : 0;
  const dil = new Uint8Array(N);   // 往外扩一格，保证网格盖住整张图（多出来的由透明度裁掉）
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < GW && yy < GH && ins[yy * GW + xx]) { v = 1; break; } }
    dil[y * GW + x] = v;
  }
  ins = dil;
  // 距离场（3-4 倒角距离）
  const D = new Float32Array(N), BIG = 1e6;
  for (let i = 0; i < N; i++) D[i] = ins[i] ? BIG : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH ? 0 : D[y * GW + x]);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const i = y * GW + x; if (!D[i]) continue; D[i] = Math.min(D[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4); }
  for (let y = GH - 1; y >= 0; y--) for (let x = GW - 1; x >= 0; x--) { const i = y * GW + x; if (!D[i]) continue; D[i] = Math.min(D[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4); }
  let dmax = 1; for (let i = 0; i < N; i++) { D[i] /= 3; if (D[i] > dmax) dmax = D[i]; }
  const T = (o.thick || 0.11) * Math.min(W, H), RB = Math.max(2, dmax * 0.55);
  const hOf = (d) => { const b = Math.min(d / RB, 1); return T * (0.82 * Math.sqrt(1 - (1 - b) * (1 - b)) + 0.18 * Math.pow(d / dmax, 0.6)); };
  // 网格节点
  const NW = GW + 1, NH = GH + 1, nodeH = new Float32Array(NW * NH), used = new Uint8Array(NW * NH);
  for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) {
    let sum = 0, cnt = 0, edge = false;
    for (const [cx, cy] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
      const inside = cx >= 0 && cy >= 0 && cx < GW && cy < GH && ins[cy * GW + cx];
      if (inside) { sum += hOf(D[cy * GW + cx] - 0.5); cnt++; } else edge = true;
    }
    if (cnt) { used[y * NW + x] = 1; nodeH[y * NW + x] = edge ? 0 : sum / cnt; }
  }
  const pos = [], uv = [], idx = [], fmap = new Int32Array(NW * NH).fill(-1), bmap = new Int32Array(NW * NH).fill(-1);
  for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) {
    const n = y * NW + x; if (!used[n]) continue;
    const X = (x / GW - 0.5) * W, Y = (1 - y / GH) * H, h = nodeH[n];
    fmap[n] = pos.length / 3; pos.push(X, Y, h); uv.push(x / GW, 1 - y / GH);
    bmap[n] = pos.length / 3; pos.push(X, Y, -h * (o.back || 0.8)); uv.push(x / GW, 1 - y / GH);
  }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (!ins[y * GW + x]) continue;
    const a = y * NW + x, b = a + 1, cc = a + NW, d = cc + 1;
    idx.push(fmap[a], fmap[cc], fmap[b], fmap[b], fmap[cc], fmap[d]);
    idx.push(bmap[a], bmap[b], bmap[cc], bmap[b], bmap[d], bmap[cc]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  geo.userData = { W, H, T };
  return (RGEO[key] = geo);
}
function relief(k, H, o) {
  const m = new THREE.Mesh(reliefGeo(k, H, o), reliefMat(k)); m.castShadow = true; m.receiveShadow = true; return m;
}

/* ======================= 对外接口 ======================= */
export const NAMES = { dog: '奶狗', horse: '奶马', cat: '奶猫', curly: '卷毛奶', sigma: '西格奶',
  rat: '奶鼠', ox: '奶牛', tiger: '奶虎', rabbit: '奶兔', dragon: '奶龙', snake: '奶蛇', goat: '奶羊', monkey: '奶猴', rooster: '奶鸡', pig: '奶猪' };
// 十二生肖雕像的高度（趴着的矮一些）
const ZH = { rat: 1.3, ox: 1.35, tiger: 1.3, rabbit: 1.45, dragon: 1.35, snake: 1.4, goat: 0.95, monkey: 1.3, rooster: 1.3, pig: 1.0 };
// 障碍物的碰撞盒（宽、长、底、顶）
export const STATUE_DIM = {
  cat: { w: 1.0, d: 0.7, y0: 0, y1: 0.86 },
  dog: { w: 1.5, d: 0.56, y0: 1.06, y1: 2.9 },     // 奶狗站在拱门上：趴下从底下滑过去
  horse: { w: 1.2, d: 0.8, y0: 0, y1: 1.9 },
  curly: { w: 1.2, d: 0.8, y0: 0, y1: 1.95 },
  sigma: { w: 1.2, d: 0.8, y0: 0, y1: 1.85 },     // 药水关卡里的西格奶半身像
};
let MAT = null;
const CACHE = {}, PLAQ = {};
export function statueMat() {
  if (!MAT) MAT = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  return MAT;
}
function plaqueFor(kind) { return PLAQ[kind] || (PLAQ[kind] = plaqueMat(plaqueCanvas([NAMES[kind]]))); }
function withPlaque(grp, kind, w, h, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), plaqueFor(kind)); m.position.set(0, y, z); grp.add(m); return m;
}
function solid(key, build) {
  if (!CACHE[key]) { const b = new B(); build(b); CACHE[key] = b.geo(); }
  const m = new THREE.Mesh(CACHE[key], statueMat()); m.castShadow = true; m.receiveShadow = true; return m;
}
// 奶马是腾空的，底座上立一根铜杆托着
function rod(b, y0, y1, z = -0.02) {
  b.cyl(0.035, 0.035, y1 - y0, [0, (y0 + y1) / 2, z], '#C9963C', null, 16);
  b.cyl(0.09, 0.11, 0.05, [0, y0 + 0.025, z], '#C9963C', null, 24);
}
const HORSE_ROD_X = 0.04;   // 托杆在马肚子下面的位置（相对图宽）

// 跑道上的障碍物版本（原点在底面中心，面朝 +z 也就是朝向玩家）
export function obstacleStatue(kind) {
  const g = new THREE.Group();
  if (kind === 'cat') {
    g.add(solid('ocat', (b) => b.box([1.0, 0.07, 0.62], [0, 0.035, 0], MARBLE, null, 0.025)));
    const r = relief('cat', 0.9, { thick: 0.16 }); r.position.y = 0.06; g.add(r);
  } else if (kind === 'dog') {
    g.add(solid('odog', (b) => {
      for (const s of [-1, 1]) {
        b.box([0.26, 0.08, 0.5], [s * 0.64, 0.04, 0], TRIM, null, 0.02);
        b.box([0.2, 1.02, 0.42], [s * 0.64, 0.57, 0], MARBLE, null, 0.04);
      }
      b.box([1.5, 0.08, 0.56], [0, 1.1, 0], TRIM, null, 0.025);
      b.box([1.42, 0.24, 0.5], [0, 1.26, 0], MARBLE, null, 0.04);
      b.box([1.5, 0.07, 0.56], [0, 1.41, 0], TRIM, null, 0.025);
    }));
    withPlaque(g, 'dog', 0.46, 0.17, 1.26, 0.256);
    const r = relief('dog', 1.45, { thick: 0.12 }); r.position.y = 1.43; g.add(r);
  } else if (kind === 'horse') {
    g.add(solid('ohorse', (b) => { pedestal(b, 1.08, 0.42, 0.78); rod(b, 0.42, 0.95); }));
    withPlaque(g, 'horse', 0.48, 0.18, 0.21, 0.392);
    const r = relief('horse', 1.15, { thick: 0.1 }); r.position.set(-HORSE_ROD_X * 1.15, 0.58, 0); g.add(r);
  } else if (kind === 'sigma') {
    g.add(solid('osigma', (b) => pedestal(b, 1.12, 0.42, 0.78, { trim: '#E7B547', body: '#F6EFE2' })));
    withPlaque(g, 'sigma', 0.5, 0.19, 0.21, 0.392);
    const r = relief('sigma', 1.36, { thick: 0.1 }); r.position.y = 0.42; g.add(r);
  } else if (kind === 'curly') {
    g.add(solid('ocurly', (b) => pedestal(b, 1.08, 0.45, 0.78)));
    withPlaque(g, 'curly', 0.5, 0.19, 0.22, 0.392);
    const r = relief('curly', 1.42, { thick: 0.12 }); r.position.set(0.04, 0.44, 0); g.add(r);
  }
  return g;
}
// 路边的雕像（带底座和铭牌）
export function decoStatue(kind) {
  const g = new THREE.Group();
  if (kind === 'dog') {
    g.add(solid('ddog', (b) => pedestal(b, 1.5, 0.5, 0.8)));
    const r = relief('dog', 1.6, { thick: 0.12 }); r.position.y = 0.5; g.add(r);
  } else if (kind === 'horse') {
    g.add(solid('dhorse', (b) => { pedestal(b, 1.4, 0.5, 0.8); rod(b, 0.5, 1.12); }));
    const r = relief('horse', 1.35, { thick: 0.1 }); r.position.set(-HORSE_ROD_X * 1.35, 0.7, 0); g.add(r);
  } else if (kind === 'cat') {
    g.add(solid('dcat', (b) => pedestal(b, 1.35, 0.5, 0.8)));
    const r = relief('cat', 1.2, { thick: 0.16 }); r.position.y = 0.48; g.add(r);
  } else if (kind === 'sigma') {
    g.add(solid('dsigma', (b) => pedestal(b, 1.7, 0.55, 0.9, { trim: '#E7B547', body: '#F6EFE2' })));
    const r = relief('sigma', 1.9, { thick: 0.1 }); r.position.y = 0.54; g.add(r);
  } else if (kind === 'curly') {
    g.add(solid('dcurly', (b) => pedestal(b, 1.3, 0.5, 0.8)));
    const r = relief('curly', 1.55, { thick: 0.12 }); r.position.set(0.04, 0.49, 0); g.add(r);
  } else {   // 十二生肖
    g.add(solid('dzod', (b) => pedestal(b, 1.35, 0.5, 0.8)));
    const r = relief(kind, ZH[kind] || 1.3, { thick: 0.13 }); r.position.y = 0.49; g.add(r);
  }
  withPlaque(g, kind, 0.56, 0.21, kind === 'sigma' ? 0.3 : 0.27, kind === 'sigma' ? 0.456 : 0.406);
  return g;
}
// 西格奶：每 1000 米一座的巨型里程碑雕像
export function sigmaStatue() {
  const g = new THREE.Group();
  g.add(solid('sigma', (b) => {
    pedestal(b, 3.9, 1.3, 1.5, { trim: '#E7B547', body: '#F6EFE2' });
    b.box([3.7, 0.1, 1.3], [0, 1.35, 0], '#E9BE55', null, 0.04);
  }));
  const r = relief('sigma', 4.0, { thick: 0.1, grid: 100 }); r.position.y = 1.36; g.add(r);
  const cv = plaqueCanvas(['西格奶', ''], 512, 256), mat = plaqueMat(cv);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), mat); pl.position.set(0, 0.65, 0.756); g.add(pl);
  g.userData.setDist = (m) => { drawPlaque(cv, ['西格奶', `${m} 米`]); mat.map.needsUpdate = true; };
  g.userData.setDist(1000);
  return g;
}

// 路上能捡的小雕像（收进图鉴）：金色小底座 + 原图浮雕，原点在底座底面
export function figurine(kind) {
  const g = new THREE.Group();
  g.add(solid('figbase', (b) => {
    b.cyl(0.3, 0.34, 0.08, [0, 0.04, 0], '#E2AE3E', null, 36);
    b.cyl(0.27, 0.27, 0.02, [0, 0.09, 0], '#FFE08A', null, 36);
  }));
  const r = relief(kind, kind === 'sigma' ? 0.92 : 0.84, { thick: 0.13, grid: 56 }); r.position.y = 0.09; g.add(r);
  return g;
}
export { IMG };


import * as THREE from 'three';
import { profile, radiusAt, std, off, mergeVertices, textTexture, FONT } from './models.js';

const V3 = THREE.Vector3, TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const Z = new V3(0, 0, 1);

// 车床体 + 形变（前后压扁、头部前倾）+ 顶点色肚皮（无缝过渡、微微鼓起）
function shapedLathe(prof, segs, o) {
  let geo = new THREE.LatheGeometry(prof, segs).rotateY(Math.PI);
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo, 1e-4);
  const pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3), wArr = new Float32Array(n);
  const cA = new THREE.Color(o.base), cB = new THREE.Color(o.patch || o.base), tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    let z = pos.getZ(i);
    const R = Math.max(1e-4, Math.hypot(x, z));
    let w = 0;
    if (o.patch) {
      const d = Math.hypot(x / o.rx, (y - o.cy) / o.ry);
      w = (1 - smooth(o.edge || 0.78, 1.0, d)) * smooth(0.05, 0.45, z / R);
    }
    z = z * o.zs(y) + o.lean(y) + w * (o.bulge || 0);
    pos.setXYZ(i, x, y, z); wArr[i] = w;
    tmp.copy(cA).lerp(cB, w);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.userData.w = wArr;
  return geo;
}
const makeSurf = (prof, zs, lean) => (x, y) => { const R = radiusAt(prof, y); return zs(y) * Math.sqrt(Math.max(0, R * R - x * x)) + lean(y); };
// 平面图形贴到身体表面
function decal(geo, surf, cx, cy, eps) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, y = pos.getY(i) + cy;
    pos.setXYZ(i, x, y, surf(x, y) + eps);
  }
  geo.computeVertexNormals();
  return geo;
}
const disc = (rx, ry) => new THREE.RingGeometry(0.0001, 1, 48, 6).scale(rx, ry, 1);
// 眼球上的虹膜/瞳孔：贴合球面的球冠
const capGeo = (r, th) => new THREE.SphereGeometry(r, 28, 10, 0, TAU, 0, th).rotateX(Math.PI / 2);
function makeAdder(def) {
  return (geo, mat, p, s, par) => {
    const m = new THREE.Mesh(geo, mat);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (s) m.scale.set(s[0], s[1], s[2]);
    (par || def).add(m);
    return m;
  };
}

// 由粗到细的管子（尾巴）
function taperTube(curve, r0, r1, segs = 40, rad = 16, tip = 0.35) {
  const g = new THREE.TubeGeometry(curve, segs, 1, rad, false);
  const pos = g.attributes.position, c = new V3(), v = new V3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, r = lerp(r0, r1, t) * (i === segs ? tip : 1);
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
const seg = (r0, r1, len) => taperTube(new THREE.LineCurve3(new V3(0, 0, 0), new V3(0, -len, 0)), r0, r1, 6, 20, 1);
const NY = new V3(0, -1, 0), _a = new V3(), _b = new V3(), _ep = new V3(), _qi = new THREE.Quaternion();
// 两段式手臂朝目标摆放（身体坐标）
function aim(sh, el, elbow, hand) {
  _a.set(elbow[0], elbow[1], elbow[2]).sub(sh.position).normalize();
  sh.quaternion.setFromUnitVectors(NY, _a);
  if (!el || !hand) return;
  _ep.copy(el.position).applyQuaternion(sh.quaternion).add(sh.position);
  _b.set(hand[0], hand[1], hand[2]).sub(_ep).normalize();
  _qi.copy(sh.quaternion).invert(); _b.applyQuaternion(_qi);
  el.quaternion.setFromUnitVectors(NY, _b);
}

/* ======================= 奶蛙 ======================= */
export const FROG_S = 0.655; // 模型按 2.0 高设计，缩放后约 1.32
export function buildFrog() {
  const Y = '#EFCF56', CREAM = '#EAE1CA', BR = '#6C604E';
  const sheen = { sheen: 0.3, sheenRoughness: 0.7, sheenColor: new THREE.Color('#FFF7D8') };
  const mats = {
    skin: new THREE.MeshPhysicalMaterial(Object.assign({ vertexColors: true, roughness: 0.58 }, sheen)),
    y: new THREE.MeshPhysicalMaterial(Object.assign({ color: Y, roughness: 0.58 }, sheen)),
    hand: std(BR, 0.8), foot: std(BR, 0.8),
    armU: new THREE.MeshPhysicalMaterial(Object.assign({ color: Y, roughness: 0.58 }, sheen)),
    armL: new THREE.MeshPhysicalMaterial(Object.assign({ color: Y, roughness: 0.58 }, sheen)),
    legU: new THREE.MeshPhysicalMaterial(Object.assign({ color: Y, roughness: 0.58 }, sheen)),
    legL: new THREE.MeshPhysicalMaterial(Object.assign({ color: Y, roughness: 0.58 }, sheen)),
    eye: std('#E6EED2', 0.12), iris: std('#A6C35F', 0.22), pupil: std('#070707', 0.08), rim: std('#3B3A22', 0.6),
    line: off(std('#4A3216', 0.6), 2), mouth: off(std('#3A0C0F', 0.85), 2), tongue: off(std('#E86A7A', 0.5), 4), teeth: off(std('#FFFFFF', 0.3), 6),
  };
  const root = new THREE.Group(), lift = new THREE.Group(), sg = new THREE.Group(), pivot = new THREE.Group(), body = new THREE.Group();
  root.add(lift); lift.add(sg); sg.scale.setScalar(FROG_S); sg.add(pivot); pivot.add(body);
  pivot.position.y = 1.0; body.position.y = -1.0;
  const add = makeAdder(body);

  // 身体：梨形大肚子，头小、往前探（像海豹）
  const prof = profile([[0, 0.4], [0.33, 0.42], [0.51, 0.5], [0.6, 0.66], [0.625, 0.84], [0.6, 1.02], [0.54, 1.18], [0.455, 1.32], [0.355, 1.46],
    [0.275, 1.58], [0.238, 1.7], [0.222, 1.8], [0.182, 1.91], [0.1, 1.99], [0, 2.01]], 100);
  const zs = (y) => lerp(0.92, 1.13, smooth(1.45, 1.78, y));
  const lean = (y) => 0.13 * smooth(1.35, 1.8, y);
  const surf = makeSurf(prof, zs, lean);
  const torso = add(shapedLathe(prof, 96, { base: Y, patch: CREAM, cy: 1.03, rx: 0.46, ry: 0.42, bulge: 0.012, edge: 0.9, zs, lean }), mats.skin);
  torso.frustumCulled = false;
  const restP = torso.geometry.attributes.position.array.slice(), restN = torso.geometry.attributes.normal.array.slice();
  const headG = new THREE.Group(); body.add(headG);   // 头部（眼睛、嘴）跟着"仰头"一起转
  const tc = new THREE.CatmullRomCurve3([new V3(0, 0.62, -0.45), new V3(0, 0.5, -0.6), new V3(0, 0.38, -0.7)]);
  add(taperTube(tc, 0.09, 0.05, 16, 12), mats.y);

  // 眼睛：头两侧往外鼓的小绿眼，细黑边
  const eyes = [], eyesClosed = [], eyeSets = [];
  const EY = 1.83, ER = radiusAt(prof, EY), th = 0.98, EYR = 0.066;
  for (const s of [-1, 1]) {
    const n = new V3(s * Math.sin(th), 0.16, Math.cos(th) * zs(EY)).normalize();
    const sp = new V3(s * ER * Math.sin(th), EY, zs(EY) * ER * Math.cos(th) + lean(EY));
    const c = sp.clone().addScaledVector(n, -0.012);
    const look = new V3(s * Math.sin(0.55), 0.06, Math.cos(0.55)).normalize();
    const set = new THREE.Group(); headG.add(set); eyeSets.push(set);
    const eg = new THREE.Group(); eg.position.copy(c); eg.quaternion.setFromUnitVectors(Z, look); set.add(eg);
    add(new THREE.SphereGeometry(EYR, 28, 20), mats.eye, [0, 0, 0], null, eg);
    add(capGeo(EYR + 0.0006, 0.95), mats.iris, null, null, eg);
    add(capGeo(EYR + 0.0012, 0.6), mats.pupil, null, null, eg);
    add(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), [-0.018, 0.022, EYR - 0.002], null, eg).castShadow = false;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(EYR - 0.002, 0.008, 8, 36), mats.rim);
    rim.position.copy(c).addScaledVector(n, 0.012); rim.quaternion.setFromUnitVectors(Z, n); set.add(rim);
    eyes.push(eg);
    const ca = new THREE.Shape(), b0 = Math.PI * 0.12, b1 = Math.PI * 0.88;
    ca.moveTo(Math.cos(b0) * 0.068, Math.sin(b0) * 0.068); ca.absarc(0, 0, 0.068, b0, b1, false); ca.absarc(0, 0, 0.048, b1, b0, true);
    const cl = add(decal(new THREE.ShapeGeometry(ca, 20), surf, s * 0.125, 1.86, 0.005), mats.line, null, null, headG);
    cl.visible = false; eyesClosed.push(cl);
  }
  // 平时的嘴：细细一道，带一点鸭子似的上唇
  const MY = 1.715, a0 = Math.PI * 1.28, a1 = Math.PI * 1.72, rO = 0.16, rI = 0.149, cy0 = MY + rO;
  const sm = new THREE.Shape();
  sm.moveTo(Math.cos(a0) * rO, Math.sin(a0) * rO); sm.absarc(0, 0, rO, a0, a1, false); sm.absarc(0, 0, rI, a1, a0, true);
  const mouthClosed = new THREE.Group(); headG.add(mouthClosed);
  add(decal(new THREE.ShapeGeometry(sm, 28), surf, 0, cy0, 0.003), mats.line, null, null, mouthClosed);
  add(new THREE.SphereGeometry(1, 24, 12), mats.y, [0, MY + 0.026, surf(0, MY + 0.026) - 0.014], [0.09, 0.02, 0.034], mouthClosed);
  // 大笑的嘴
  const MCY = 1.725, mrx = 0.18, mry = 0.155, zc = surf(0, MCY);
  const mo = new THREE.Group(); mo.position.set(0, MCY, zc); headG.add(mo); mo.visible = false;
  const shift = (g) => g.translate(0, -MCY, -zc);
  add(shift(decal(disc(mrx, mry), surf, 0, MCY, 0.006)), mats.mouth, null, null, mo);
  add(shift(decal(disc(0.1, 0.055), surf, 0, MCY - 0.092, 0.01)), mats.tongue, null, null, mo);
  const ts = [];
  const tooth = (x, y, w, h, up) => { const t = new THREE.Shape(); t.moveTo(x - w, y); t.lineTo(x + w, y); t.lineTo(x, y + (up ? h : -h)); t.closePath(); ts.push(t); };
  for (let i = 0; i < 10; i++) { const x = -0.144 + i * 0.032; tooth(x, MCY + mry * Math.sqrt(Math.max(0, 1 - (x / mrx) ** 2)) - 0.004, 0.015, 0.042, false); }
  for (let i = 0; i < 8; i++) { const x = -0.112 + i * 0.032; tooth(x, MCY - mry * Math.sqrt(Math.max(0, 1 - (x / mrx) ** 2)) + 0.004, 0.014, 0.036, true); }
  add(shift(decal(new THREE.ShapeGeometry(ts), surf, 0, 0, 0.012)), mats.teeth, null, null, mo);
  const blush = new THREE.Group(); headG.add(blush); blush.visible = false;

  // 手臂：粗粗的上臂 + 前臂 + 灰褐色的手
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.44, 1.33, 0.02); body.add(sh);
    add(new THREE.SphereGeometry(0.128, 20, 14), mats.armU, [0, 0, 0], null, sh);
    add(seg(0.128, 0.108, 0.38), mats.armU, null, null, sh);
    const el = new THREE.Group(); el.position.set(0, -0.38, 0); sh.add(el);
    add(new THREE.SphereGeometry(0.108, 18, 14), mats.armL, [0, 0, 0], null, el);
    add(seg(0.108, 0.088, 0.3), mats.armL, null, null, el);
    const hd = new THREE.Group(); hd.position.set(0, -0.35, 0); el.add(hd);
    add(new THREE.SphereGeometry(0.098, 20, 14), mats.hand, [0, -0.02, 0], [1.05, 1, 0.66], hd);
    for (let k = 0; k < 4; k++) {
      const f = add(new THREE.CapsuleGeometry(0.027, 0.07, 4, 8), mats.hand, [(k - 1.5) * 0.043, -0.11 + Math.abs(k - 1.5) * 0.014, 0], null, hd);
      f.rotation.z = (k - 1.5) * 0.12;
    }
    const thumb = add(new THREE.CapsuleGeometry(0.028, 0.05, 4, 8), mats.hand, [-s * 0.09, -0.04, 0.03], null, hd);
    thumb.rotation.z = -s * 0.9;
    sh.userData.el = el; sh.userData.hd = hd; sh.userData.rest = sh.position.clone();
    arms.push(sh);
  }
  // 腿：粗壮的大腿 + 小腿 + 扁平的蹼脚
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.25, 0.62, 0.0); body.add(hp);
    add(new THREE.SphereGeometry(0.2, 20, 14), mats.legU, [0, 0, 0], null, hp);
    add(seg(0.2, 0.158, 0.3), mats.legU, null, null, hp);
    const kn = new THREE.Group(); kn.position.set(0, -0.3, 0); hp.add(kn);
    add(new THREE.SphereGeometry(0.158, 20, 14), mats.legL, [0, 0, 0], null, kn);
    add(seg(0.158, 0.122, 0.22), mats.legL, null, null, kn);
    add(new THREE.SphereGeometry(0.122, 18, 12), mats.legL, [0, -0.22, 0], null, kn);
    const ft = new THREE.Group(); ft.position.set(0, -0.25, 0.02); kn.add(ft);
    add(new THREE.SphereGeometry(1, 24, 14), mats.foot, [0, -0.015, 0.09], [0.15, 0.06, 0.23], ft);
    for (const dx of [-0.09, 0, 0.09]) add(new THREE.SphereGeometry(0.052, 14, 10), mats.foot, [dx, -0.025, 0.3], [1, 0.62, 1.3], ft);
    hp.userData.kn = kn; hp.userData.ft = ft;
    legs.push(hp);
  }

  // ---------- 皮肤（衣服）和西格奶形态的附加件 ----------
  const bendGroups = [], acc = { student: [], suit: [], knight: [], college: [], god: [], sigma: [] };
  const bgAt = (y) => { let e = bendGroups.find((b) => Math.abs(b.y - y) < 1e-3); if (!e) { e = { y, g: new THREE.Group() }; body.add(e.g); bendGroups.push(e); } return e.g; };
  const A = (k, geo, mat, p, sc, par) => { const m = add(geo, mat, p, sc, par); m.visible = false; acc[k].push(m); return m; };
  const ring = (y, off) => {   // 贴着身体一圈的椭圆
    const R = radiusAt(prof, y) + off, pts = [];
    for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; pts.push(new V3(Math.sin(a) * R, y, Math.cos(a) * R * zs(y) + lean(y))); }
    return new THREE.CatmullRomCurve3(pts, true);
  };
  const front = (x, y, off) => new V3(x, y, surf(x, y) + off);
  const M = (c, r = 0.6) => new THREE.MeshPhysicalMaterial({ color: c, roughness: r, sheen: 0.25, sheenColor: new THREE.Color('#ffffff') });
  // 学生装：蓝白校服 + 红领巾
  const BLUE = M('#2E5DB5'), WHITE = M('#F3F5F8', 0.5), RED = M('#E5283A', 0.55);
  A('student', new THREE.TubeGeometry(ring(1.5, 0.006), 64, 0.04, 10, true), BLUE, null, null, bgAt(1.5));
  A('student', new THREE.TubeGeometry(ring(1.455, 0.012), 64, 0.022, 8, true), RED, null, null, bgAt(1.455));
  A('student', new THREE.SphereGeometry(0.055, 16, 12), RED, [0, 1.43, surf(0, 1.43) + 0.035], [1.2, 1, 0.8], bgAt(1.43));
  for (const s of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([front(s * 0.02, 1.42, 0.035), front(s * 0.06, 1.32, 0.025), front(s * 0.1, 1.2, 0.02)]);
    A('student', taperTube(c, 0.04, 0.03, 12, 8, 1), RED, null, null, bgAt(1.32));
  }
  // 西服：衣扣、白衬衫袖口
  const DARK = M('#15171D', 0.35);
  for (const y of [0.9, 0.77]) A('suit', new THREE.SphereGeometry(0.03, 12, 10), DARK, [0, y, surf(0, y) + 0.008], [1, 1, 0.6]);
  // 袖子上的条纹 / 袖口
  for (const a of arms) {
    const { el } = a.userData;
    for (const y of [-0.13, -0.19]) A('student', new THREE.TorusGeometry(0.127, 0.011, 8, 32).rotateX(Math.PI / 2), WHITE, [0, y, 0], null, a);
    A('student', new THREE.TorusGeometry(0.093, 0.016, 8, 32).rotateX(Math.PI / 2), WHITE, [0, -0.29, 0], null, el);
    A('suit', new THREE.TorusGeometry(0.094, 0.02, 8, 32).rotateX(Math.PI / 2), WHITE, [0, -0.3, 0], null, el);
  }
  // 西格奶：胸肌、腹肌、斜方肌、三角肌、大臂
  const SY = '#F1C21E', SC = '#EFD7A0';
  const sigY = M(SY, 0.5), sigC = M(SC, 0.55);
  for (const s of [-1, 1]) {
    A('sigma', new THREE.SphereGeometry(1, 24, 16), sigC, [s * 0.2, 1.27, surf(s * 0.2, 1.27) - 0.075], [0.25, 0.16, 0.11], bgAt(1.27)).rotation.z = -s * 0.15;
    A('sigma', new THREE.SphereGeometry(1, 24, 16), sigY, [s * 0.22, 1.5, -0.06 + lean(1.5)], [0.23, 0.13, 0.2], bgAt(1.5)).rotation.z = s * 0.62;
    for (const y of [0.8, 0.94, 1.08]) A('sigma', new THREE.SphereGeometry(1, 16, 12), sigC, [s * 0.1, y, surf(s * 0.1, y) - 0.032], [0.092, 0.064, 0.055], y > 1.05 ? bgAt(1.08) : null);
  }
  for (const a of arms) {
    A('sigma', new THREE.SphereGeometry(0.19, 20, 14), sigY, [0, -0.02, 0], null, a);
    A('sigma', new THREE.SphereGeometry(1, 20, 14), sigY, [0, -0.19, 0.045], [0.16, 0.18, 0.16], a);
    A('sigma', new THREE.SphereGeometry(1, 18, 12), sigY, [0, -0.11, 0], [0.13, 0.16, 0.13], a.userData.el);
  }
  // 奶骑士：钢铁盔甲、肩甲、护颈、皮带、红披风、生气的眉毛
  const STEEL = new THREE.MeshPhysicalMaterial({ color: '#7E8691', metalness: 0.75, roughness: 0.32, clearcoat: 0.4 });
  const STEELD = new THREE.MeshPhysicalMaterial({ color: '#4E545D', metalness: 0.7, roughness: 0.38 });
  const LEATHER = M('#5B3A1E', 0.7), CAPE = new THREE.MeshPhysicalMaterial({ color: '#8E1B18', roughness: 0.7, sheen: 0.6, sheenColor: new THREE.Color('#FF8A80'), side: THREE.DoubleSide });
  A('knight', new THREE.TubeGeometry(ring(1.49, 0.01), 64, 0.05, 10, true), STEEL, null, null, bgAt(1.49));
  A('knight', new THREE.TubeGeometry(ring(0.7, 0.012), 64, 0.035, 8, true), LEATHER, null, null);
  A('knight', new THREE.SphereGeometry(0.045, 14, 10), new THREE.MeshPhysicalMaterial({ color: '#D9B44A', metalness: 0.9, roughness: 0.3 }), [0, 0.7, surf(0, 0.7) + 0.04], [1.3, 1, 0.6]);
  for (const a of arms) {
    const s = Math.sign(a.position.x);
    A('knight', new THREE.SphereGeometry(0.21, 24, 12, 0, TAU, 0, 1.75), STEEL, [0, 0.03, 0], [1.15, 0.95, 1.1], a).rotation.z = s * 0.15;
    A('knight', new THREE.TorusGeometry(0.2, 0.02, 8, 32).rotateX(Math.PI / 2), STEELD, [0, -0.06, 0], [1.1, 1, 1.05], a);
    A('knight', new THREE.TorusGeometry(0.105, 0.022, 8, 28).rotateX(Math.PI / 2), STEELD, [0, -0.2, 0], null, a.userData.el);
  }
  const cape = new THREE.CylinderGeometry(0.44, 0.74, 1.0, 28, 4, true, Math.PI * 0.62, Math.PI * 0.76); cape.translate(0, -0.5, 0);
  A('knight', cape, CAPE, [0, 1.47, lean(1.47) - 0.02], [1, 1, 0.98], bgAt(1.47));
  for (const s of [-1, 1]) {   // 皱着的眉毛
    const b = A('knight', new THREE.CapsuleGeometry(0.02, 0.11, 4, 8).rotateZ(Math.PI / 2), M('#3A2A12', 0.6), [s * 0.15, 1.93, surf(s * 0.15, 1.93) + 0.02], null, headG);
    b.rotation.set(0, s * 0.5, -s * 0.42); b.userData.ay = 1.93;
  }
  // 大学牲奶：酒红色连帽卫衣、帽兜、抽绳、胸前字、棒球帽、黑书包
  const MAROON = M('#7A1F2B', 0.8), MAROON2 = M('#631722', 0.8), BLACK = M('#202226', 0.55);
  A('college', new THREE.SphereGeometry(1, 28, 16), MAROON, [0, 1.47, lean(1.47) - 0.27], [0.36, 0.19, 0.2], bgAt(1.47));
  A('college', new THREE.TubeGeometry(ring(1.465, 0.01), 64, 0.035, 8, true), MAROON2, null, null, bgAt(1.465));
  for (const s of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([front(s * 0.07, 1.45, 0.03), front(s * 0.075, 1.36, 0.016), front(s * 0.08, 1.27, 0.012)]);
    A('college', new THREE.TubeGeometry(c, 10, 0.011, 6), M('#F4F4F4', 0.5), null, null, bgAt(1.36));
    A('college', new THREE.SphereGeometry(0.018, 8, 6), M('#F4F4F4', 0.5), [s * 0.08, 1.265, surf(s * 0.08, 1.265) + 0.012], null, bgAt(1.36));
  }
  const tR = radiusAt(prof, 1.19) + 0.012, txt = textTexture('奶大学', { w: 512, h: 160, color: '#FFFFFF', font: `900 132px ${FONT}`, y: 0.55 });
  const tg = new THREE.CylinderGeometry(tR, tR, 0.17, 24, 1, true, -0.52, 1.04); tg.scale(1, 1, zs(1.19));
  A('college', tg, new THREE.MeshStandardMaterial({ map: txt, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), [0, 1.19, lean(1.19)], null, bgAt(1.19));
  const capY = 1.86, capZ = lean(capY);
  const capDome = A('college', new THREE.SphereGeometry(0.245, 28, 12, 0, TAU, 0, Math.PI / 2), MAROON, [0, capY, capZ], [1, 0.82, zs(capY) * 0.98], headG); capDome.userData.ay = capY;
  const brim = A('college', new THREE.SphereGeometry(1, 24, 8), MAROON2, [0, capY + 0.01, capZ + 0.25], [0.19, 0.022, 0.16], headG); brim.rotation.x = 0.12; brim.userData.ay = capY;
  A('college', new THREE.SphereGeometry(0.03, 10, 8), MAROON2, [0, capY + 0.2, capZ], null, headG).userData.ay = capY;
  A('college', new THREE.BoxGeometry(0.5, 0.56, 0.22), BLACK, [0, 1.05, -0.66], null).geometry = new THREE.BoxGeometry(0.5, 0.56, 0.22);
  for (const s of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([new V3(s * 0.18, 1.3, -0.56), new V3(s * 0.3, 1.42, -0.15), new V3(s * 0.31, 1.3, surf(s * 0.31, 1.3) + 0.02), new V3(s * 0.3, 1.05, surf(s * 0.3, 1.05) + 0.02)]);
    A('college', new THREE.TubeGeometry(c, 20, 0.025, 6), BLACK, null, null);
  }
  // 奶神：背后一对白色天使翅膀、头顶金色光环
  const FEATHER = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color('#FFF3C4'), emissive: '#FFF1C0', emissiveIntensity: 0.22 });
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.14, 1.38, -0.5); w.scale.setScalar(1.7); bgAt(1.36).add(w);
    const parts = [];
    parts.push(add(new THREE.SphereGeometry(1, 20, 12), FEATHER, [s * 0.28, 0.2, 0], [0.32, 0.09, 0.06], w));
    parts[0].rotation.z = s * 0.55;
    for (let i = 0; i < 6; i++) {
      const L = 0.62 - i * 0.07, a = 0.75 - i * 0.26, dx = Math.cos(a) * L * 0.5, dy = Math.sin(a) * L * 0.5;
      const f = add(new THREE.SphereGeometry(1, 20, 10), FEATHER, [s * (0.06 + dx), 0.06 + dy, -0.02 - i * 0.01], [L * 0.5, 0.07, 0.025], w);
      f.rotation.z = s * a; parts.push(f);
    }
    w.visible = false; acc.god.push(w); wings.push(w);
  }
  const HALO = new THREE.MeshBasicMaterial({ color: '#FFE27A', toneMapped: false });
  const halo = A('god', new THREE.TorusGeometry(0.2, 0.026, 12, 48).rotateX(Math.PI / 2 - 0.25), HALO, [0, 2.24, lean(2.0) + 0.02], null, headG); halo.userData.y0 = 2.24; halo.castShadow = false;
  // 西格奶：更大的斜方肌（脖子到肩膀的“金字塔”）、更鼓的胸肌和腹肌
  for (const s of [-1, 1]) {
    A('sigma', new THREE.SphereGeometry(1, 24, 16), sigY, [s * 0.27, 1.5, -0.08 + lean(1.5)], [0.3, 0.2, 0.24], bgAt(1.5)).rotation.z = s * 0.5;
    A('sigma', new THREE.SphereGeometry(1, 24, 16), sigC, [s * 0.21, 1.25, surf(s * 0.21, 1.25) - 0.07], [0.27, 0.18, 0.12], bgAt(1.25)).rotation.z = -s * 0.12;
  }
  // 西格奶：一字嘴（拉长的脸上）
  const sigMouth = add(new THREE.CapsuleGeometry(0.011, 0.11, 4, 8).rotateZ(Math.PI / 2), M('#6A4A10', 0.5), [0, 1.38 + (1.716 - 1.38) * 1.4, surf(0, 1.716) + 0.006], null, headG); sigMouth.visible = false;
  // 悲伤奶：往下撇的嘴
  const mouthSad = add(new THREE.TorusGeometry(0.06, 0.01, 6, 18, Math.PI * 0.62), mats.line, [0, 1.676, surf(0, 1.69) - 0.004], null, headG);
  mouthSad.rotation.set(-0.25, 0, Math.PI * 0.19); mouthSad.visible = false; mouthSad.userData.ay = 1.69;
  // 西格奶半眯着的眼皮
  for (const eg of eyes) {
    const lid = new THREE.SphereGeometry(EYR * 1.08, 28, 12, 0, TAU, 0, 1.62).rotateX(0.32);
    A('sigma', lid, sigY, null, null, eg);
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
  const sgeo = new THREE.ExtrudeGeometry(st, { depth: 0.035, bevelEnabled: false });
  const smat = std('#FFE14D', 0.3, { emissive: '#FFB000', emissiveIntensity: 0.5 });
  for (let i = 0; i < 3; i++) stars.add(new THREE.Mesh(sgeo, smat));
  const back = new THREE.Group(); back.position.set(0, 1.25, -0.56); back.scale.setScalar(1 / FROG_S); body.add(back);
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); root.add(head);
  root.traverse((o) => { if (o.isMesh && o !== bubble) o.castShadow = true; });
  for (const g of eyeSets) g.userData.ay = 1.83;
  for (const g of eyesClosed) g.userData.ay = 1.86;
  mouthClosed.userData.ay = 1.715; mo.userData.ay = 1.725; blush.userData.ay = 1.7;
  const sigma = buildSigma(); sigma.root.visible = false; lift.add(sigma.root);
  const baseCol = torso.geometry.attributes.color.array.slice(), patchW = torso.geometry.userData.w;
  return { root, lift, sg, pivot, body, arms, legs, eyes, eyeSets, eyesClosed, mouthClosed, mouthOpen: mo, blush, bubble, stars, back, head, mats, torso, restP, restN, headG, bendA: 0,
    bendGroups, acc, baseCol, patchW, skin: 'default', sigma: false, sigMouth, mouthSad, sig: sigma, wings, halo };
}

// 上半身后仰：以胸口为轴，把身体上半部分（连同头、眼睛、嘴、肩膀）往后弯
const BC = { y: 1.2, z: 0.02 }, bw = (y) => smooth(1.05, 1.55, y);
function bendFrog(F, ang) {
  if (Math.abs(ang - F.bendA) < 1e-4) return;
  F.bendA = ang;
  const g = F.torso.geometry, pos = g.attributes.position.array, nor = g.attributes.normal.array, P = F.restP, N = F.restN;
  for (let i = 0; i < P.length; i += 3) {
    const y = P[i + 1], a = ang * bw(y);
    pos[i] = P[i]; nor[i] = N[i];
    if (a === 0) { pos[i + 1] = y; pos[i + 2] = P[i + 2]; nor[i + 1] = N[i + 1]; nor[i + 2] = N[i + 2]; continue; }
    const c = Math.cos(a), sn = Math.sin(a), dy = y - BC.y, dz = P[i + 2] - BC.z;
    pos[i + 1] = BC.y + dy * c - dz * sn; pos[i + 2] = BC.z + dy * sn + dz * c;
    nor[i + 1] = N[i + 1] * c - N[i + 2] * sn; nor[i + 2] = N[i + 1] * sn + N[i + 2] * c;
  }
  g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  const c = Math.cos(ang), sn = Math.sin(ang);
  F.headG.rotation.x = ang;
  F.headG.position.set(0, BC.y - (BC.y * c - BC.z * sn), BC.z - (BC.y * sn + BC.z * c));
  for (const a of F.arms) {
    const r = a.userData.rest, aa = ang * bw(r.y), cc = Math.cos(aa), ss = Math.sin(aa), dy = r.y - BC.y, dz = r.z - BC.z;
    a.position.set(r.x, BC.y + dy * cc - dz * ss, BC.z + dy * ss + dz * cc);
  }
  for (const b of F.bendGroups) {
    const aa = ang * bw(b.y), cc = Math.cos(aa), ss = Math.sin(aa);
    b.g.rotation.x = aa; b.g.position.set(0, BC.y - (BC.y * cc - BC.z * ss), BC.z - (BC.y * ss + BC.z * cc));
  }
}

/* ---------- 皮肤：学生装、西服；以及喝了增强药水后的西格奶形态 ---------- */
export const SKINS = {
  default: { name: '原味奶蛙', desc: '光溜溜的，最原始的样子。' },
  student: { name: '学生装', desc: '蓝白校服配红领巾，上学别迟到。' },
  suit: { name: '西服', desc: '笔挺的西装加红领带，奶国精英。' },
  knight: { name: '奶骑士', desc: '一身钢铁盔甲加红披风，眉头紧锁，谁也别想拦路。' },
  college: { name: '大学牲奶', desc: '酒红色连帽卫衣、棒球帽、黑书包，早八赶课全靠跑。' },
  god: { name: '奶神', desc: '集齐十二生肖才能请出的最稀有皮肤：天使翅膀、金色光环，浑身发光。' },
};
const _c = new THREE.Color(), _y = new THREE.Color(), _cr = new THREE.Color();
const hex = (h) => new THREE.Color(h);
const SK = {
  student: { blue: hex('#2E5DB5'), white: hex('#F3F5F8'), zip: hex('#7C869A') },
  suit: { jacket: hex('#2C3140'), lapel: hex('#3B4257'), shirt: hex('#F7F7F2'), tie: hex('#C81E35'), knot: hex('#A3162A'), pants: hex('#22262F'), seam: hex('#1C1F27') },
  sigma: { y: hex('#F1C21E'), c: hex('#EFD7A0'), line: hex('#D2AE5E') },
  knight: { steel: hex('#6D747E'), seam: hex('#3F444B'), chest: hex('#8A919B'), mail: hex('#3A3E45') },
  college: { m: hex('#7A1F2B'), pocket: hex('#651924'), rib: hex('#5E1520') },
};
function torsoColor(skin, sigma, x, y, z, nz, w, base, out) {
  if (sigma) {
    const pec = (1 - smooth(0.38, 0.5, Math.abs(x))) * smooth(1.08, 1.16, y) * (1 - smooth(1.4, 1.46, y)) * smooth(0.15, 0.45, nz);
    out.copy(SK.sigma.y).lerp(SK.sigma.c, Math.max(w, pec));
    return;
  }
  const yN = 1.47 - 0.04 * nz;
  if (skin === 'default' || skin === 'god' || y > yN) { out.copy(base); return; }
  if (skin === 'student') {
    const S = SK.student;
    if (y < 0.8 || y > 1.33) out.copy(S.blue); else out.copy(S.white);
    if (nz > 0.5 && Math.abs(x) < 0.016 && y > 0.66) out.copy(S.zip);
  } else if (skin === 'knight') {
    const S = SK.knight;
    if (y < 0.66) { out.copy(S.mail); return; }
    out.copy(nz > 0.45 && Math.abs(x) < 0.34 && y > 0.95 ? S.chest : S.steel);
    const f = ((y - 0.62) / 0.13) % 1;
    if (y < 0.98 && f < 0.14) out.copy(S.seam);
    if (nz > 0.5 && Math.abs(x) < 0.012 && y > 0.98) out.copy(S.seam);
  } else if (skin === 'college') {
    const S = SK.college;
    out.copy(y < 0.7 ? S.rib : S.m);
    if (nz > 0.4 && Math.abs(x) < 0.3 - (y - 0.76) * 0.3 && y > 0.76 && y < 1.0) out.copy(S.pocket);
  } else if (skin === 'suit') {
    const S = SK.suit, vH = (y - 1.0) * 0.55 + 0.012;
    if (y < 0.64) { out.copy(S.pants); return; }
    out.copy(S.jacket);
    if (nz > 0.3 && y > 1.0) {
      const ax = Math.abs(x);
      if (ax < vH) {
        out.copy(S.shirt);
        if (ax < 0.03 + (1.45 - y) * 0.03) out.copy(y > 1.38 ? S.knot : S.tie);
      } else if (ax < vH + 0.06) out.copy(S.lapel);
      if (x > 0.24 && x < 0.34 && y > 1.19 && y < 1.19 + (x - 0.24) * 0.8) out.copy(S.shirt);
    } else if (nz > 0.5 && Math.abs(x) < 0.01) out.copy(S.seam);
  }
}
const LIMB = {
  default: { arm: '#EFCF56', leg: '#EFCF56' },
  student: { arm: '#2E5DB5', leg: '#2E5DB5' },
  suit: { arm: '#2C3140', leg: '#22262F' },
  knight: { arm: '#5E656F', leg: '#3A3E45' },
  college: { arm: '#7A1F2B', leg: '#EFCF56' },
  god: { arm: '#EFCF56', leg: '#EFCF56' },
};
export function setFrogSkin(F, skin, sigma) {
  if (!SKINS[skin]) skin = 'default';
  F.skin = skin; F.sigma = !!sigma;
  const g = F.torso.geometry, col = g.attributes.color, B = F.baseCol, W = F.patchW;
  if (!F.restP0) { F.restP0 = F.restP.slice(); F.restN0 = F.restN.slice(); F.headKids = F.headG.children.map((c) => ({ c, y: c.position.y })); }
  // 西格奶的脸是长长的：把脖子以上拉长 1.4 倍，五官跟着往上挪
  const P = F.restP0, N = F.restN0, st = 1;
  F.sg.visible = !sigma; F.sig.root.visible = !!sigma;
  for (let i = 0; i < P.length; i += 3) { const y = P[i + 1]; F.restP[i] = P[i]; F.restP[i + 1] = y > 1.38 ? 1.38 + (y - 1.38) * st : y; F.restP[i + 2] = P[i + 2]; }
  g.attributes.position.array.set(F.restP);
  F.restN.set(N); g.attributes.normal.array.set(N);
  g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; F.bendA = 999;
  for (const h of F.headKids) h.c.position.y = h.y + (sigma && h.c.userData.ay ? (h.c.userData.ay - 1.38) * (st - 1) : 0);
  for (let i = 0, v = 0; i < P.length; i += 3, v++) {
    _y.setRGB(B[i], B[i + 1], B[i + 2]);
    torsoColor(skin, false, P[i], P[i + 1], P[i + 2], N[i + 2], W[v], _y, _c);
    col.setXYZ(v, _c.r, _c.g, _c.b);
  }
  col.needsUpdate = true;
  const L = LIMB[skin];
  F.mats.armU.color.set(L.arm); F.mats.armL.color.set(L.arm);
  F.mats.legU.color.set(L.leg); F.mats.legL.color.set(L.leg);
  F.mats.y.color.set('#EFCF56');
  for (const k of Object.keys(F.acc)) for (const m of F.acc[k]) m.visible = k === skin;
}
// 头部坐标系里的点 → 身体坐标（随后仰一起转）
function headPt(F, p, k = 1) {
  const a = F.bendA * k, c = Math.cos(a), sn = Math.sin(a), dy = p[1] - BC.y, dz = p[2] - BC.z;
  return [p[0], BC.y + dy * c - dz * sn, BC.z + dy * sn + dz * c];
}
const easeIO = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

// o: { mode:'run'|'idle'|'stand'|'laugh', ph, air, slide(0..1), land(0..1), rocket, lean, t, blink, laughK, squash, flip(0..1|null), landPose(0..1) }
export function poseFrog(F, o) {
  if (F.sigma) { poseSigma(F.sig, o); return; }
  const { pivot, body, arms, legs } = F;
  bendFrog(F, 0);
  pivot.rotation.set(0, 0, 0); pivot.position.y = 1.0; body.position.y = -1.0; body.scale.set(1, 1, 1);
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, a = arms[i], l = legs[i];
    a.userData.el.rotation.set(0, 0, 0); a.userData.hd.rotation.set(0, 0, 0);
    aim(a, a.userData.el, [s * 0.62, 1.02, 0.06], [s * 0.7, 0.68, 0.16]);
    l.rotation.set(0, 0, s * 0.06); l.userData.kn.rotation.set(0, 0, 0); l.userData.ft.rotation.set(0, s * 0.3, 0);
  }
  let laugh = false, sad = false;
  const t = o.t || 0;
  if (o.mode === 'run') {
    const ph = o.ph || 0;
    if (o.ride > 0.5 && !o.rocket) {   // 骑在巨型奶蛋上：两腿夹住蛋、双手扶着蛋顶
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        legs[i].rotation.set(-0.75, 0, s * 0.85); legs[i].userData.kn.rotation.x = 1.35; legs[i].userData.ft.rotation.set(-0.4, s * 0.3, 0);
        aim(arms[i], arms[i].userData.el, [s * 0.52, 0.86, 0.42], [s * 0.3, 0.46, 0.66]);
      }
      pivot.rotation.x = 0.12; body.position.y = -1.0;
    } else if (o.rocket) {
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        legs[i].rotation.x = 0.35 + Math.sin(ph + i) * 0.12; legs[i].userData.kn.rotation.x = 0.6;
        aim(arms[i], arms[i].userData.el, [s * 0.8, 1.32, 0.05], [s * 1.12, 1.36, 0.12]);
      }
      pivot.rotation.x = 0.3;
    } else if (o.air) {
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        legs[i].rotation.x = i ? -0.5 : -1.0; legs[i].userData.kn.rotation.x = 1.3;
        aim(arms[i], arms[i].userData.el, [s * 0.6, 1.68, 0.12], [s * 0.72, 2.02, 0.2]);
      }
    } else {
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1, p = ph + (i ? Math.PI : 0), sw = Math.sin(p);
        legs[i].rotation.x = sw * 0.8;
        legs[i].userData.kn.rotation.x = Math.max(0, Math.sin(p + 1.3)) * 1.25;
        legs[i].userData.ft.rotation.x = -legs[i].rotation.x * 0.5;
        aim(arms[i], arms[i].userData.el, [s * 0.62, 1.06, -sw * 0.32], [s * 0.6, 0.86, -sw * 0.32 + 0.3]);
      }
      body.position.y = -1.0 + Math.abs(Math.cos(ph)) * 0.07;
      pivot.rotation.x = 0.16;
    }
    const sl = o.slide || 0;
    if (sl > 0.01) {
      pivot.rotation.x = lerp(pivot.rotation.x, 1.42, sl); body.position.y -= 0.42 * sl;
      if (sl > 0.5) for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; aim(arms[i], arms[i].userData.el, [s * 0.5, 1.72, 0.15], [s * 0.42, 2.08, 0.25]); }
      for (let i = 0; i < 2; i++) { legs[i].rotation.x = lerp(legs[i].rotation.x, 0.35, sl); legs[i].userData.kn.rotation.x = lerp(legs[i].userData.kn.rotation.x, 0.4, sl); }
      body.scale.z = 1 - 0.1 * sl;
    }
    if (o.roll != null) {
      // 前滚翻：抱成一团，贴着地面往前滚一整圈
      const p = o.roll, tuck = Math.sin(Math.min(1, p * 1.15) * Math.PI * 0.5 + 0.0) * (p < 0.88 ? 1 : 1 - (p - 0.88) / 0.12);
      pivot.position.y = lerp(0.62, 0.66, tuck); body.position.y = -0.98;
      pivot.rotation.x = 1.42 + (TAU - 1.42) * easeIO(p);   // 从趴着的姿势接着往前滚，滚完正好站直
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        legs[i].rotation.x = lerp(-0.4, -1.6, tuck); legs[i].userData.kn.rotation.x = lerp(0.5, 2.2, tuck);
        aim(arms[i], arms[i].userData.el, [s * 0.58, 1.02, 0.42], [s * 0.3, 0.72, 0.58]);
      }
      body.scale.set(1, 1 - 0.1 * tuck, 1);
    } else if (o.flip != null) {
      // 空翻：抱膝团身，绕身体中心向后翻一整圈
      const p = o.flip, tuck = Math.sin(Math.min(1, p * 1.1) * Math.PI);
      pivot.rotation.x = -TAU * easeIO(p);
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        legs[i].rotation.x = lerp(-0.4, -1.55, tuck); legs[i].userData.kn.rotation.x = lerp(0.4, 2.1, tuck);
        if (tuck > 0.35) aim(arms[i], arms[i].userData.el, [s * 0.58, 1.02, 0.42], [s * 0.3, 0.72, 0.58]);
        else aim(arms[i], arms[i].userData.el, [s * 0.62, 1.7, 0.1], [s * 0.74, 2.05, 0.18]);
      }
      body.scale.set(1, 1 - 0.07 * tuck, 1);
    } else if (o.landPose > 0) {
      // 帅气落地：先微蹲，双臂 V 字举起
      const lp = o.landPose, crouch = smooth(0.55, 1.0, lp);
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        aim(arms[i], arms[i].userData.el, [s * 0.74, 1.62, 0.08], [s * 1.02, 1.98, 0.14]);
        legs[i].rotation.x = lerp(legs[i].rotation.x, -0.45, crouch); legs[i].userData.kn.rotation.x = lerp(legs[i].userData.kn.rotation.x, 0.9, crouch);
        legs[i].rotation.z = s * (0.06 + 0.12 * crouch);
      }
      body.position.y -= 0.16 * crouch; pivot.rotation.x = lerp(pivot.rotation.x, -0.08, smooth(0, 0.6, lp));
    }
    if (o.land > 0) { const k = o.land; body.scale.set(1 + 0.12 * k, 1 - 0.14 * k, 1 + 0.12 * k); }
    pivot.rotation.z = o.lean || 0;
    if (o.squash) body.scale.set(1.25, 0.7, 1.25);
  } else if (o.mode === 'sad') {
    // 悲伤奶：驼着背、低着头、两只手软软地垂着
    sad = true;
    const sw = Math.sin(t * 1.4);
    bendFrog(F, 0.55 + sw * 0.03);
    pivot.rotation.x = 0.16; pivot.rotation.z = sw * 0.025;
    body.position.y = -1.05;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      aim(arms[i], arms[i].userData.el, [s * 0.56, 0.98, 0.34], [s * 0.46, 0.55, 0.48 + sw * 0.02 * s]);
      arms[i].userData.hd.rotation.set(0.2, 0, 0);
      legs[i].rotation.z = s * 0.05;
    }
  } else if (o.mode === 'idle' || o.mode === 'stand') {
    const b = Math.sin(t * 3);
    body.position.y = -1.0 + Math.abs(b) * 0.04; body.scale.set(1 + 0.012 * b, 1 - 0.018 * b, 1);
    if (F.skin === 'god') {   // 奶神：双手合十
      for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; aim(arms[i], arms[i].userData.el, [s * 0.42, 1.05, 0.38], [s * 0.0, 1.24, 0.72]); arms[i].userData.hd.rotation.set(0, s * 0.6, 0); }
    } else if (o.mode === 'idle') {
      aim(arms[1], arms[1].userData.el, [0.74, 1.6, 0.12], [0.78 + Math.sin(t * 9) * 0.12, 1.98, 0.16]);
      aim(arms[0], arms[0].userData.el, [-0.6, 1.08, 0.3], [-0.3, 0.98, 0.64]);
    }
    for (let i = 0; i < 2; i++) legs[i].rotation.z = (i ? 1 : -1) * 0.1;
  } else {
    // 被抓住：捧腹大笑——双手捂着肚子，先弯腰笑到发抖，再一点点后仰，循环往复（参考视频）
    laugh = true;
    const k = o.laughK == null ? 1 : o.laughK;
    const CYC = 3.2, c = (t % CYC) / CYC;
    const lean = c < 0.82 ? lerp(0.62, -0.5, easeIO(c / 0.82)) : lerp(-0.5, 0.62, easeIO((c - 0.82) / 0.18));   // 正 = 弯腰，负 = 后仰
    const shake = Math.sin(t * 22) * k, hop = Math.abs(Math.sin(t * 11)) * k;
    bendFrog(F, lean * 0.95 + shake * 0.03);
    const crouch = 0.12 + 0.1 * Math.max(0, lean);
    pivot.position.y = 0.58 - crouch * 0.5; pivot.rotation.x = lean * 0.22; pivot.rotation.z = Math.sin(t * 13) * 0.03 * k;
    body.position.y = -0.58 + hop * 0.045;
    body.scale.set(1 + shake * 0.02, 1 - shake * 0.022, 1 + shake * 0.025);
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, wob = Math.sin(t * 22 + i) * 0.015 * k;
      aim(arms[i], arms[i].userData.el, headPt(F, [s * 0.66, 0.98 + wob, 0.36], 0.5), headPt(F, [s * 0.15, 0.76 + 0.08 * Math.max(0, -lean) + wob, 0.7 - 0.3 * Math.max(0, -lean)], 0.35));
      arms[i].userData.hd.rotation.set(-0.3, s * 0.9, s * 0.4);
      legs[i].rotation.z = s * 0.2;
      legs[i].rotation.x = -pivot.rotation.x - crouch * 1.4; legs[i].userData.kn.rotation.x = crouch * 2.6;
      legs[i].userData.ft.rotation.x = crouch * 1.2;
    }
    F.mouthOpen.scale.y = o.open != null ? 0.62 + 0.55 * o.open : 0.85 + 0.2 * Math.abs(Math.sin(t * 15));
  }
  F.mouthOpen.visible = laugh; F.mouthClosed.visible = !laugh && !sad && !F.sigma; F.blush.visible = false;
  F.mouthSad.visible = sad && !F.sigma;
  if (F.skin === 'god') {
    const fl = o.mode === 'run' ? 0.35 + Math.sin(t * 9) * 0.3 : 0.45 + Math.sin(t * 2.5) * 0.12;
    F.wings.forEach((w, i) => { const s = i ? 1 : -1; w.rotation.set(0.15, s * fl, s * 0.1); });
    F.halo.rotation.y = t * 1.2; F.halo.position.y = F.halo.userData.y0 + Math.sin(t * 2.4) * 0.02;
  } F.sigMouth.visible = F.sigma && !laugh;
  for (let i = 0; i < 2; i++) { F.eyeSets[i].visible = !laugh; F.eyesClosed[i].visible = laugh; F.eyes[i].scale.y = o.blink ? 0.12 : sad ? 0.6 : 1; }
}


/* ======================= 西格奶（变身后的独立模型） =======================
   参考设定图：约 2.1 米高的健美身材——小小的蛙头长在粗脖子和巨大的斜方肌上，
   嘴部像鸭嘴一样往前伸；倒三角上身，宽肩、巨大三角肌和二头肌；
   胸肌到肚脐是奶白色，8 块腹肌；腰细；大腿粗壮、小腿鼓；
   手是岩灰色的拳头（竖大拇指），脚是黄色的大蛙蹼脚。 */
export function buildSigma() {
  const Y = '#F5D23B', CR = '#F7E7C6', HAND = '#6B6658', EYE = '#3E6B3A';
  const sk = { roughness: 0.55, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#FFF6C8') };
  const mats = {
    y: new THREE.MeshPhysicalMaterial(Object.assign({ color: Y }, sk)),
    skin: new THREE.MeshPhysicalMaterial(Object.assign({ vertexColors: true }, sk)),
    cr: new THREE.MeshPhysicalMaterial(Object.assign({ color: CR }, sk, { roughness: 0.6 })),
    abs: new THREE.MeshPhysicalMaterial(Object.assign({ color: '#F1DDB0' }, sk, { roughness: 0.6 })),
    hand: std(HAND, 0.85), eye: std('#F1F3E4', 0.12), iris: std(EYE, 0.25), pupil: std('#070707', 0.08),
    line: std('#5A3A0E', 0.6), mouth: std('#3A0C0F', 0.85), tongue: std('#E8798A', 0.5), teeth: std('#FFFFFF', 0.3),
  };
  const root = new THREE.Group(), pivot = new THREE.Group(), body = new THREE.Group();
  root.add(pivot); pivot.add(body); pivot.position.y = 0.95; body.position.y = -0.95;
  const add = makeAdder(body);
  const E = (par, mat, p, r, rot) => { const m = add(new THREE.SphereGeometry(1, 30, 20), mat, p, r, par); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); return m; };

  // 躯干：倒三角，前后扁；胸口到肚脐是奶白色
  const prof = profile([[0, 0.86], [0.24, 0.88], [0.27, 0.98], [0.27, 1.1], [0.3, 1.22], [0.38, 1.36], [0.45, 1.5], [0.46, 1.6], [0.4, 1.68], [0.25, 1.75], [0, 1.77]], 70);
  const zs = (y) => lerp(0.68, 0.62, smooth(1.2, 1.6, y)), lean = () => 0;
  add(shapedLathe(prof, 64, { base: Y, patch: CR, cy: 1.26, rx: 0.33, ry: 0.36, edge: 0.82, bulge: 0.02, zs, lean }), mats.skin);
  const surf = makeSurf(prof, zs, lean);
  // 胸肌、8 块腹肌（奶白色）
  for (const s of [-1, 1]) {
    E(body, mats.cr, [s * 0.125, 1.5, surf(s * 0.125, 1.5) - 0.045], [0.2, 0.12, 0.07], [0.08, 0, -s * 0.06]);
    for (let k = 0; k < 4; k++) { const y = 1.0 + k * 0.095, x = s * 0.07; E(body, mats.abs, [x, y, surf(x, y) - 0.012], [0.064, 0.044, 0.042]); }
  }
  // 背阔肌、斜方肌（从头一直斜到肩膀）、粗脖子
  for (const s of [-1, 1]) {
    E(body, mats.y, [s * 0.27, 1.38, -0.05], [0.17, 0.27, 0.15], [0, 0, s * 0.2]);
    E(body, mats.y, [s * 0.2, 1.74, -0.03], [0.26, 0.16, 0.18], [0, 0, s * 0.5]);
  }
  E(body, mats.y, [0, 1.8, -0.01], [0.17, 0.18, 0.16]);
  // 骨盆、屁股
  E(body, mats.y, [0, 0.93, 0], [0.29, 0.15, 0.2]);
  for (const s of [-1, 1]) E(body, mats.y, [s * 0.12, 0.9, -0.1], [0.14, 0.15, 0.13]);

  // 头：蛙头，嘴像鸭嘴往前伸，眼睛在头顶两侧，粗眉骨
  const head = new THREE.Group(); head.position.set(0, 1.86, 0.02); body.add(head);
  E(head, mats.y, [0, 0.17, -0.02], [0.16, 0.22, 0.165]);
  E(head, mats.y, [0, 0.02, 0.1], [0.155, 0.11, 0.18], [0.12, 0, 0]);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.03, 0.0); head.add(jaw);
  E(jaw, mats.y, [0, -0.04, 0.11], [0.135, 0.07, 0.15], [0.2, 0, 0]);
  const mouthLine = add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(-0.135, 0.0, 0.17), new V3(-0.07, -0.025, 0.25), new V3(0, -0.035, 0.278), new V3(0.07, -0.025, 0.25), new V3(0.135, 0.0, 0.17)]), 24, 0.008, 6), mats.line, null, null, head);
  const mOpen = new THREE.Group(); mOpen.position.set(0, -0.03, 0.2); head.add(mOpen); mOpen.visible = false;
  E(mOpen, mats.mouth, [0, 0, 0], [0.1, 0.055, 0.06]);
  E(mOpen, mats.tongue, [0, -0.03, 0.02], [0.07, 0.025, 0.045]);
  E(mOpen, mats.teeth, [0, 0.045, 0.015], [0.085, 0.012, 0.035]);
  const eyes = [];
  for (const s of [-1, 1]) {
    E(head, mats.y, [s * 0.1, 0.27, 0.07], [0.075, 0.035, 0.07], [0.3, 0, -s * 0.25]);   // 眉骨
    const eg = new THREE.Group(); eg.position.set(s * 0.12, 0.215, 0.095);
    eg.quaternion.setFromUnitVectors(Z, new V3(s * 0.6, 0.05, 1).normalize()); head.add(eg);
    add(new THREE.SphereGeometry(0.054, 22, 16), mats.eye, [0, 0, 0], null, eg);
    add(capGeo(0.0545, 0.85), mats.iris, null, null, eg);
    add(capGeo(0.055, 0.5), mats.pupil, null, null, eg);
    add(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), [-0.014, 0.018, 0.052], null, eg).castShadow = false;
    const lid = add(new THREE.SphereGeometry(0.059, 22, 10, 0, TAU, 0, 1.55), mats.y, null, null, eg); lid.rotation.x = 0.25; lid.userData.base = 0.25;
    eg.userData.lid = lid; eyes.push(eg);
  }

  // 手臂：巨大的三角肌、二头肌、前臂，岩灰色拳头
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.5, 1.6, -0.01); body.add(sh);
    E(sh, mats.y, [s * 0.03, 0.0, 0], [0.17, 0.16, 0.17]);
    add(seg(0.13, 0.11, 0.42), mats.y, null, null, sh);
    E(sh, mats.y, [0, -0.2, 0.055], [0.125, 0.16, 0.115]);
    E(sh, mats.y, [0, -0.2, -0.05], [0.11, 0.15, 0.1]);
    const el = new THREE.Group(); el.position.set(0, -0.42, 0); sh.add(el);
    E(el, mats.y, [0, 0, 0], [0.105, 0.105, 0.105]);
    E(el, mats.y, [0, -0.13, 0.01], [0.11, 0.17, 0.1]);
    add(seg(0.1, 0.075, 0.34), mats.y, null, null, el);
    const hd = new THREE.Group(); hd.position.set(0, -0.38, 0); el.add(hd);
    E(hd, mats.hand, [0, -0.02, 0], [0.085, 0.095, 0.08]);
    for (let k = 0; k < 4; k++) add(new THREE.CapsuleGeometry(0.026, 0.05, 4, 8).rotateZ(Math.PI / 2), mats.hand, [0, -0.04 - (k - 1.5) * 0.034, 0.07], [1, 1, 1], hd);
    const thumbUp = add(new THREE.CapsuleGeometry(0.03, 0.09, 4, 10), mats.hand, [-s * 0.02, -0.14, 0.02], null, hd);
    const thumbIn = add(new THREE.CapsuleGeometry(0.026, 0.05, 4, 8), mats.hand, [-s * 0.07, -0.01, 0.05], null, hd); thumbIn.rotation.z = -s * 0.8;
    sh.userData = { el, hd, thumbUp, thumbIn, s };
    arms.push(sh);
  }
  // 腿：粗大腿、鼓起的小腿、黄色大蛙蹼脚
  const legs = [];
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.19, 0.9, 0); body.add(hp);
    E(hp, mats.y, [s * 0.02, -0.18, 0.02], [0.185, 0.27, 0.19]);
    E(hp, mats.y, [s * 0.06, -0.24, 0.07], [0.12, 0.2, 0.12]);
    const kn = new THREE.Group(); kn.position.set(0, -0.44, 0); hp.add(kn);
    E(kn, mats.y, [0, 0, 0.02], [0.11, 0.1, 0.11]);
    E(kn, mats.y, [0, -0.13, -0.05], [0.12, 0.17, 0.12]);
    add(seg(0.1, 0.07, 0.38), mats.y, null, null, kn);
    const ft = new THREE.Group(); ft.position.set(0, -0.4, 0.0); kn.add(ft);
    E(ft, mats.y, [0, -0.02, 0.07], [0.14, 0.055, 0.17]);
    for (const [dx, a] of [[-0.08, -0.32], [0, 0], [0.08, 0.32]]) {
      const t = add(new THREE.CapsuleGeometry(0.048, 0.1, 4, 10).rotateX(Math.PI / 2), mats.y, [dx + Math.sin(a) * 0.08, -0.04, 0.22], [1, 0.7, 1], ft); t.rotation.y = a;
      E(ft, mats.y, [dx + Math.sin(a) * 0.14, -0.045, 0.29], [0.058, 0.035, 0.055]);
    }
    hp.userData = { kn, ft };
    legs.push(hp);
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, pivot, body, head, jaw, eyes, arms, legs, mouthOpen: mOpen, mouthLine, mats };
}
// o 同 poseFrog
export function poseSigma(S, o) {
  const { pivot, body, arms, legs, head } = S, t = o.t || 0;
  pivot.rotation.set(0, 0, 0); pivot.position.y = 0.95; body.position.y = -0.95; body.scale.set(1, 1, 1);
  head.rotation.set(0, 0, 0); S.jaw.rotation.x = 0;
  let laugh = false;
  const fist = (i, up) => { arms[i].userData.thumbUp.visible = up; arms[i].userData.thumbIn.visible = !up; arms[i].userData.hd.rotation.set(0, 0, 0); };
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    aim(arms[i], arms[i].userData.el, [s * 0.68, 1.2, 0.02], [s * 0.72, 0.85, 0.1]); fist(i, false);
    legs[i].rotation.set(0, 0, s * 0.08); legs[i].userData.kn.rotation.set(0, 0, 0); legs[i].userData.ft.rotation.set(0, s * 0.2, 0);
  }
  const thumbsUp = (i) => {   // 设定图里的招牌动作：小臂竖起、竖大拇指
    const s = i ? 1 : -1;
    aim(arms[i], arms[i].userData.el, [s * 0.74, 1.3, 0.22], [s * 0.66, 1.68, 0.36]); fist(i, true);
  };
  const handOnHip = (i) => { const s = i ? 1 : -1; aim(arms[i], arms[i].userData.el, [s * 0.78, 1.25, -0.08], [s * 0.36, 1.05, 0.02]); fist(i, false); };
  if (o.mode === 'run') {
    const ph = o.ph || 0;
    if (o.air) {
      for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; legs[i].rotation.x = i ? -0.4 : -0.9; legs[i].userData.kn.rotation.x = 1.1; aim(arms[i], arms[i].userData.el, [s * 0.75, 1.75, 0.1], [s * 0.8, 2.15, 0.15]); }
    } else {
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1, p = ph + (i ? Math.PI : 0), sw = Math.sin(p);
        legs[i].rotation.x = sw * 0.7; legs[i].userData.kn.rotation.x = Math.max(0, Math.sin(p + 1.3)) * 1.2; legs[i].userData.ft.rotation.x = -legs[i].rotation.x * 0.5;
        aim(arms[i], arms[i].userData.el, [s * 0.7, 1.28, -sw * 0.3], [s * 0.66, 1.2, -sw * 0.3 + 0.32]);
      }
      body.position.y = -0.95 + Math.abs(Math.cos(ph)) * 0.06; pivot.rotation.x = 0.12;
    }
    const sl = o.slide || 0;
    if (sl > 0.01) {
      pivot.rotation.x = lerp(pivot.rotation.x, 1.35, sl); body.position.y -= 0.45 * sl;
      for (let i = 0; i < 2; i++) { legs[i].rotation.x = lerp(legs[i].rotation.x, 0.3, sl); legs[i].userData.kn.rotation.x = lerp(legs[i].userData.kn.rotation.x, 0.3, sl); }
    }
    if (o.flip != null) {
      const p = o.flip, tuck = Math.sin(Math.min(1, p * 1.1) * Math.PI);
      pivot.rotation.x = -TAU * easeIO(p);
      for (let i = 0; i < 2; i++) { legs[i].rotation.x = lerp(-0.3, -1.4, tuck); legs[i].userData.kn.rotation.x = lerp(0.3, 1.9, tuck); }
    } else if (o.landPose > 0) { thumbsUp(1); handOnHip(0); }
    if (o.spin) { thumbsUp(1); handOnHip(0); for (let i = 0; i < 2; i++) { legs[i].rotation.x = -0.5; legs[i].userData.kn.rotation.x = 0.9; } }
    if (o.land > 0) { const k = o.land; body.scale.set(1 + 0.08 * k, 1 - 0.1 * k, 1 + 0.08 * k); }
    pivot.rotation.z = o.lean || 0;
  } else if (o.mode === 'laugh') {
    // 抓住肥嘟嘟：叉腰仰头大笑，一只手竖大拇指
    laugh = true;
    const k = o.laughK == null ? 1 : o.laughK, op = o.open == null ? 0.7 : o.open;
    pivot.rotation.x = -0.12 - 0.06 * k; pivot.rotation.z = Math.sin(t * 28) * 0.025 * k;
    body.position.y = -0.95 + Math.abs(Math.sin(t * 10)) * 0.04 * k;
    head.rotation.x = -0.4 - 0.2 * op * k; S.jaw.rotation.x = 0.15 + 0.4 * op;
    handOnHip(0); thumbsUp(1);
    for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; legs[i].rotation.z = s * 0.2; legs[i].userData.ft.rotation.y = s * 0.4; }
  } else {
    // 站姿：设定图正面那样，左手叉腰、右手竖大拇指，两腿分开
    const b = Math.sin(t * 2.5);
    body.position.y = -0.95 + b * 0.01;
    handOnHip(0); thumbsUp(1);
    for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; legs[i].rotation.z = s * 0.2; legs[i].userData.ft.rotation.y = s * 0.4; }
  }
  S.mouthOpen.visible = laugh; S.mouthLine.visible = !laugh;
  for (const eg of S.eyes) { eg.scale.y = o.blink ? 0.15 : 1; eg.userData.lid.rotation.x = laugh ? 0.9 : eg.userData.lid.userData.base; }
}

/* ======================= 肥嘟嘟 ======================= */
export const FEI_S = 0.8;
export function buildFei() {
  const Y = '#FFD11A', PALE = '#FFEC9C';
  const clay = { roughness: 0.86, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color('#FFE985') };
  const mats = {
    skin: new THREE.MeshPhysicalMaterial(Object.assign({ vertexColors: true }, clay)),
    y: new THREE.MeshPhysicalMaterial(Object.assign({ color: Y }, clay)),
    nose: std('#6E2410', 0.55), eye: std('#FFFFFF', 0.25), pupil: std('#120A05', 0.1),
    inner: new THREE.MeshPhysicalMaterial(Object.assign({ color: '#F6BF10' }, clay)),
  };
  const root = new THREE.Group(), sg = new THREE.Group(), pivot = new THREE.Group(), body = new THREE.Group();
  root.add(sg); sg.scale.setScalar(FEI_S); sg.add(pivot); pivot.add(body);
  pivot.position.y = 0.8; body.position.y = -0.8;
  const add = makeAdder(body);
  const prof = profile([[0, 0.26], [0.4, 0.28], [0.6, 0.42], [0.67, 0.62], [0.64, 0.84], [0.55, 1.02], [0.43, 1.16], [0.31, 1.27], [0, 1.33]], 80);
  const zs = () => 0.93, lean = (y) => 0.06 * smooth(0.9, 1.3, y);
  add(shapedLathe(prof, 56, { base: Y, patch: PALE, cy: 0.74, rx: 0.46, ry: 0.43, bulge: 0.05, zs, lean }), mats.skin);
  const legs = [];
  for (const s of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(s * 0.36, 0.44, -0.02); body.add(lg);
    add(new THREE.SphereGeometry(0.31, 24, 18), mats.y, [s * 0.05, 0, -0.03], [1, 1, 1.12], lg);
    add(new THREE.SphereGeometry(1, 26, 18), mats.y, [-s * 0.03, -0.3, 0.2], [0.2, 0.15, 0.34], lg);
    add(new THREE.SphereGeometry(1, 22, 16), mats.y, [-s * 0.035, -0.31, 0.46], [0.19, 0.13, 0.16], lg);
    legs.push(lg);
  }
  // 大脑袋 + 往前伸的口鼻 + 大红棕鼻子
  const head = new THREE.Group(); head.position.set(0, 1.47, 0.12); body.add(head);
  add(new THREE.SphereGeometry(0.47, 40, 28), mats.y, [0, 0, 0], [1, 0.92, 0.95], head);
  add(new THREE.SphereGeometry(1, 34, 22), mats.y, [0, -0.15, 0.3], [0.29, 0.25, 0.4], head);
  add(new THREE.SphereGeometry(1, 30, 20), mats.y, [0, -0.13, 0.52], [0.21, 0.19, 0.2], head);
  add(new THREE.SphereGeometry(1, 30, 20), mats.nose, [0, -0.1, 0.69], [0.18, 0.135, 0.13], head);
  const eyes = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.135, 0.19, 0.355);
    eg.quaternion.setFromUnitVectors(Z, new V3(s * 0.3, 0.25, 1).normalize()); head.add(eg);
    add(new THREE.SphereGeometry(0.062, 20, 14), mats.eye, [0, 0, 0], null, eg);
    add(capGeo(0.0626, 0.6), mats.pupil, null, null, eg);
    eyes.push(eg);
  }
  // 吐舌头（被抓后的得意表情）
  const tongue = new THREE.Group(); tongue.position.set(0, -0.33, 0.5); head.add(tongue); tongue.visible = false;
  add(new THREE.SphereGeometry(1, 20, 12), std('#3A1010', 0.8), [0, 0.02, -0.02], [0.1, 0.045, 0.07], tongue);
  const tg = add(new THREE.SphereGeometry(1, 24, 14), std('#F2738C', 0.45), [0, -0.05, 0.1], [0.075, 0.025, 0.15], tongue);
  tg.rotation.x = 0.7;
  const ears = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * 0.22, 0.3, -0.1); eg.rotation.set(-0.08, 0, -s * 0.5); head.add(eg);
    add(new THREE.SphereGeometry(1, 28, 20), mats.y, [0, 0.26, 0], [0.17, 0.29, 0.12], eg);
    add(new THREE.SphereGeometry(1, 20, 14), mats.inner, [0, 0.25, 0.075], [0.08, 0.17, 0.04], eg);
    eg.userData.rz = -s * 0.5;
    ears.push(eg);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.42, 1.03, 0.3); body.add(sh);
    add(new THREE.CapsuleGeometry(0.105, 0.18, 8, 14), mats.y, [0, -0.14, 0], null, sh);
    add(new THREE.SphereGeometry(0.115, 18, 14), mats.y, [0, -0.31, 0.01], null, sh);
    arms.push(sh);
  }
  const tail = new THREE.Group(); tail.position.set(0.08, 0.45, -0.5); body.add(tail);
  const tc = new THREE.CatmullRomCurve3([new V3(0, 0.05, 0.1), new V3(0.08, -0.12, -0.25), new V3(0.25, -0.3, -0.5), new V3(0.45, -0.25, -0.68), new V3(0.58, -0.08, -0.74)]);
  add(taperTube(tc, 0.22, 0.09, 44, 18), mats.y, null, null, tail);
  // 被西格奶抓住后头晕眼花的小星星
  const stars = new THREE.Group(); stars.position.set(0, 0.62, 0); head.add(stars); stars.visible = false;
  const st = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? 0.05 : 0.12; if (i) st.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else st.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const sgeo = new THREE.ExtrudeGeometry(st, { depth: 0.04, bevelEnabled: false }), smat = std('#FFE14D', 0.3, { emissive: '#FFB000', emissiveIntensity: 0.5 });
  for (let i = 0; i < 3; i++) stars.add(new THREE.Mesh(sgeo, smat));
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, pivot, body, head, eyes, ears, arms, legs, tail, mats, tongue, stars };
}
// o: { mode:'idle'|'stand'|'chase'|'grab'|'pounce', ph, t, blink }
export function poseFei(E, o) {
  const t = o.t || 0;
  E.pivot.rotation.set(0, 0, 0); E.body.position.y = -0.8; E.head.rotation.set(0, 0, 0); E.tail.rotation.set(0, 0, 0); E.tongue.visible = false; E.stars.visible = false;
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    aim(E.arms[i], null, [s * 0.36, 0.78, 0.66]);
    E.legs[i].rotation.set(0, 0, 0);
    E.ears[i].rotation.set(-0.08, 0, E.ears[i].userData.rz);
  }
  if (o.mode === 'chase' || o.mode === 'pounce') {
    const ph = o.ph || 0, up = Math.abs(Math.sin(ph));
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      E.legs[i].rotation.x = -0.45 * up;
      aim(E.arms[i], null, [s * 0.5, 1.15 + Math.sin(ph * 2 + i) * 0.1, 0.9]);
      E.ears[i].rotation.x = -0.1 - 0.35 * Math.cos(ph);
    }
    E.pivot.rotation.x = 0.15; E.tail.rotation.y = Math.sin(ph) * 0.3;
  } else if (o.mode === 'idle') {
    E.head.rotation.z = Math.sin(t * 1.3) * 0.08; E.tail.rotation.y = Math.sin(t * 2) * 0.2;
    for (let i = 0; i < 2; i++) E.ears[i].rotation.x = -0.08 + Math.sin(t * 2.5 + i) * 0.06;
  } else if (o.mode === 'dizzy') {
    // 被抓住：一屁股坐在地上，晕乎乎地吐舌头，头上转星星
    E.body.position.y = -0.8 - 0.2; E.pivot.rotation.x = -0.15;
    E.head.rotation.z = Math.sin(t * 3.2) * 0.2; E.head.rotation.x = 0.12;
    E.tongue.visible = true; E.tongue.rotation.z = Math.sin(t * 5) * 0.3;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      E.legs[i].rotation.x = -1.25; E.legs[i].rotation.z = s * 0.25;
      aim(E.arms[i], null, [s * 0.75, 0.55, 0.35]);
      E.ears[i].rotation.x = 0.5;
    }
    E.stars.visible = true;
    E.stars.children.forEach((sm, i) => { const a = t * 5 + (i * TAU) / 3; sm.position.set(Math.cos(a) * 0.38, Math.sin(t * 8 + i) * 0.05, Math.sin(a) * 0.38); sm.rotation.y = t * 4; });
  } else if (o.mode === 'grab') {
    E.head.rotation.z = Math.sin(t * 2.5) * 0.06; E.head.rotation.y = -0.2;
    E.tongue.visible = true; E.tongue.rotation.z = Math.sin(t * 9) * 0.35; E.tongue.rotation.x = 0.1 + Math.sin(t * 5) * 0.12;
    aim(E.arms[0], null, [-0.4, 1.12, 1.1]);
    aim(E.arms[1], null, [0.5, 0.8 + Math.sin(t * 4) * 0.05, 0.65]);
  }
  for (const eg of E.eyes) eg.scale.y = o.mode === 'dizzy' ? 0.2 : o.blink ? 0.12 : 1;
}

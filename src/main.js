import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as MD from './models.js';
import * as CH from './chars.js';
import * as ST from './statues.js';
import { LAUGH_MP3 } from './laughData.js';
import { EGG_MP3 } from './sfxData.js';
import { Sfx } from './audio.js';
import { TAU, rand, clamp, lerp, damp, pick, shuffle, wpick, store, isTouch, $, vib } from './util.js';

/* ================= 参数 ================= */
const FONT = MD.FONT;
const LW = 1.5;                 // 车道宽
const ROAD_W = 7.9;             // 五条道的路面宽
const ROOF = 2.1;               // 牛奶车车顶高度（可以站上去）
const RAMP_L = MD.RAMP_L, CART = MD.CART_L, CART_STEP = 5.3;
const VIEW = 105, BEHIND = 14;  // 前方生成距离 / 身后回收距离
const GRAV = 26, JUMP_V = 9.2, SUPER_V = 15.2, SLIDE_T = 0.66, CHASE_T = 6, FLY_Y = 5.2;
const H_STAND = 1.3, H_SLIDE = 0.8, HW = 0.34;
const speedAt = (d) => 12 + 20 * (1 - Math.exp(-d / 2600)); // 越跑越快：12 → 32
const DIM = {
  cheese: { w: 1.25, d: 0.9, y0: 0, y1: 0.62 },
  wheel: { w: 0.85, d: 0.5, y0: 0, y1: 0.96 },
  bar: { w: 1.5, d: 0.2, y0: 1.06, y1: 2.7 },
  truck: { w: 1.3, d: CART, y0: 0, y1: ROOF },
  ramp: { w: 1.3, d: RAMP_L, y0: 0, y1: ROOF },
};
Object.assign(DIM, ST.STATUE_DIM);   // 雕像障碍：奶猫(跳)、奶狗(滑)、奶马/卷毛奶(躲)
const PU = {
  magnet: { name: '吸奶石', desc: '自动吸走附近的奶蛋', base: 8, step: 2 },
  shoes: { name: '跳蛋', desc: '骑上巨型奶蛋，点一下就弹得超高；撞到障碍会炸掉替你挡一下', base: 9, step: 2 },
  double: { name: '双倍奶蛋', desc: '每个奶蛋都算两个', base: 9, step: 2 },
  shield: { name: '奶泡护罩', desc: '挡住一次碰撞，肥嘟嘟不会出现', base: 15, step: 4 },
  rocket: { name: '奶瓶火箭', desc: '飞上天空，收一大串奶蛋', base: 4.5, step: 0.8 },
};
const PU_KEYS = Object.keys(PU);
const UP_COST = [60, 150, 320, 650, 1200];
const LANES = [-2, -1, 0, 1, 2];       // 五条道
const LMIN = -2, LMAX = 2;

/* ================= 存档 ================= */
const save = Object.assign({ wallet: 0, gold: 0, skin: 'default', tut: false, tutRamp: false, tutFlip: false, tutDog: false }, store.get('naiwa3d', {}));
save.skins = Object.assign({ default: true }, save.skins || {});
save.tickets = save.tickets || 0;
save.pity = save.pity || 0;
save.potHeat = save.potHeat || 0;
save.st = Object.assign({ runs: 0, dist: 0, eggs: 0, flips: 0, slides: 0, pu: 0, rockets: 0, boom: 0, caught: 0, sad: 0, wins: 0, draws: 0, lucky: 0, revives: 0, clean: 0, maxGold: 0 }, save.st || {});   // 成就用的累计数据
save.ach = save.ach || {};   // 成就：1 = 已达成未领取，2 = 已领取   // 药水关卡“热度”：连续抓到肥嘟嘟会越来越贵
const potCost = () => Math.min(POT_MAX, POT_BASE + POT_STEP * save.potHeat);   // 距上次出传说已经抽了几次   // 抽奖机抽到的药水关卡门票
const POT_BASE = 6, POT_STEP = 3, POT_MAX = 18, EXCHANGE = 250;   // 药水关卡：基础 6 奶金，每抓到一次肥嘟嘟涨 3，失败一次降 3                 // 药水关卡门票（奶金）；多少奶蛋换 1 个奶金
const SKIN_COST = { student: 12, suit: 25, college: 20, knight: 30 };          // 皮肤价格（奶金）
const WIN_GOLD = 20, WIN_EGGS = 300;                  // 抓住肥嘟嘟的奖励
save.lv = Object.assign({ magnet: 0, shoes: 0, double: 0, shield: 0, rocket: 0 }, save.lv || {});
save.best = Object.assign({ eggs: 0, dist: 0 }, save.best || {});
save.dex = Object.assign({ dog: 0, cat: 0, horse: 0, curly: 0, sigma: 0, rat: 0, ox: 0, tiger: 0, rabbit: 0, dragon: 0, snake: 0, goat: 0, monkey: 0, rooster: 0, pig: 0 }, save.dex || {});   // 图鉴：每种雕像捡到几次
const persist = () => store.set('naiwa3d', save);
const puDur = (k) => PU[k].base + PU[k].step * save.lv[k];

/* ================= 渲染器与场景 ================= */
const glc = $('#gl'), fxc = $('#fx'), fx = fxc.getContext('2d');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  $('#loading').innerHTML = '<div class="panel">这个浏览器打不开 3D 画面（WebGL）。<br>请换用最新版 Chrome / Safari 打开。</div>';
  throw e;
}
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 520);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.42;
scene.fog = new THREE.Fog('#FFF0D0', 48, 140);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

// 天空：渐变 + 太阳光晕
const sky = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 16), new THREE.ShaderMaterial({
  uniforms: {
    top: { value: new THREE.Color('#5AB4FF') }, mid: { value: new THREE.Color('#BCE5FF') }, hor: { value: new THREE.Color('#FFF0D0') },
    sunDir: { value: new THREE.Vector3(-0.42, 0.3, -0.86).normalize() },
  },
  vertexShader: `varying vec3 vDir;
void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix*viewMatrix*wp; gl_Position.z = gl_Position.w*0.9999; }`,
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 c = mix(hor, mid, smoothstep(-0.02, 0.16, h));
  c = mix(c, top, smoothstep(0.16, 0.75, h));
  float s = max(dot(d, sunDir), 0.0);
  c += vec3(1.0,0.93,0.7)*(pow(s,900.0)*2.0 + pow(s,16.0)*0.35);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  side: THREE.BackSide, depthWrite: false, fog: false,
}));
sky.renderOrder = -10;
scene.add(sky);

const hemi = new THREE.HemisphereLight('#D6EEFF', '#BFDF92', 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#FFEFD2', 2.3);
sun.position.set(-4, 12, 8); sun.target.position.set(0, 0, -4);
scene.add(sun, sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 12, bottom: -10, near: 1, far: 40 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;

/* ================= 资源 ================= */
const G = {}, MAT = {}, TEX = {};
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
function buildAssets() {
  G.egg = MD.eggGeometry(); MAT.egg = MD.vcMat(0.42, 0, { emissive: '#3A2A08', emissiveIntensity: 0.35 });
  G.cheese = MD.cheeseGeometry(); G.wheel = MD.wheelGeometry(); MAT.cheese = MD.vcMat(0.5);
  G.gate = MD.gateGeometry(); MAT.gate = MD.vcMat(0.42);
  G.truckF = MD.truckGeometry(true); G.truckB = MD.truckGeometry(false);
  G.truckRF = MD.truckGeometry(true, true); G.truckRB = MD.truckGeometry(false, true); MAT.truck = MD.vcMat(0.3, 0.05);   // 带坡道的奶车用绿色条纹
  G.ramp = MD.rampGeometry(ROOF); MAT.ramp = MD.vcMat(0.6);
  G.lolli = MD.lolliGeometry(); G.tree = MD.treeGeometry(); G.bottle = MD.bottleGeometry(); G.mush = MD.mushGeometry(); G.bush = MD.bushGeometry();
  MAT.deco = MD.vcMat(0.5);
  TEX.nai = MD.textTexture('奶', { color: '#FFFFFF' });
  TEX.sign = MD.textTexture('奶国', { w: 512, h: 220, color: '#8A4B12', font: `900 150px ${FONT}` });
  TEX.glow = MD.glowTexture('255,236,150');
  TEX.blue = MD.glowTexture('170,225,255');
  TEX.pot = MD.glowTexture('255,140,40');
  MAT.naiText = new THREE.MeshStandardMaterial({ map: TEX.nai, transparent: true, roughness: 0.4 });
  MAT.signText = new THREE.MeshStandardMaterial({ map: TEX.sign, transparent: true, roughness: 0.6 });
  MAT.glow = new THREE.SpriteMaterial({ map: TEX.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  MAT.potGlow = new THREE.SpriteMaterial({ map: TEX.pot, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  MAT.blueGlow = new THREE.SpriteMaterial({ map: TEX.blue, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 });
  MAT.bubble = new THREE.MeshPhysicalMaterial({ color: '#E8F6FF', transparent: true, opacity: 0.22, roughness: 0.03, clearcoat: 1, depthWrite: false, envMapIntensity: 2.2 });
  G.bubble = new THREE.SphereGeometry(1, 28, 20);
}

/* ================= 地面、道路、远景 ================= */
const STRIP = 200; // 循环滚动的地面段长度
let grass, road, curbs, hedges;
function buildWorld() {
  const grassTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#9EDB7A'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#8FD06C'; g.fillRect(0, h / 2, w, h / 2);
    for (let i = 0; i < 90; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(60,140,50,0.18)' : 'rgba(255,255,255,0.12)'; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3); }
  }, [36, 700 / 8]);
  grass = new THREE.Mesh(new THREE.PlaneGeometry(600, 700).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  grass.receiveShadow = true; grass.position.y = -0.02; scene.add(grass);
  const roadTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#FFE3AC'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(200,140,70,0.08)' : 'rgba(255,255,255,0.18)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = 'rgba(205,150,80,0.16)'; for (let y = 0; y < h; y += 128) g.fillRect(0, y, w, 3);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let k = 1; k < LANES.length; k++) { const x = ((LMIN - 0.5 + k) * LW + ROAD_W / 2) / ROAD_W * w; g.fillRect(x - 4, 36, 8, 190); g.fillRect(x - 4, 292, 8, 190); }
    g.fillStyle = '#E8B36A'; g.fillRect(0, 0, 12, h); g.fillRect(w - 12, 0, 12, h);
  }, [1, 700 / 6]);
  road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 700).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.82 }));
  road.receiveShadow = true; road.position.y = 0.004; scene.add(road);
  // 糖果条纹路沿
  const cp = [];
  for (let z = 40; z > -STRIP; z -= 1.2) for (const s of [-1, 1]) cp.push(MD.P(new THREE.BoxGeometry(0.26, 0.16, 1.2), (Math.round(z / 1.2) & 1) ? '#FF7FA0' : '#FFFFFF', { p: [s * (ROAD_W / 2 + 0.13), 0.08, z] }));
  curbs = new THREE.Mesh(MD.merge(cp), MD.vcMat(0.45)); curbs.receiveShadow = true; scene.add(curbs);
  // 矮树篱
  const hp = [];
  for (let z = 40; z > -STRIP; z -= 2.4) for (const s of [-1, 1]) hp.push(MD.P(new THREE.IcosahedronGeometry(1, 2), '#5DB345', { p: [s * (ROAD_W / 2 + 0.7), 0.2, z], s: [0.32, 0.36, 1.25] }));
  hedges = new THREE.Mesh(MD.merge(hp), MD.vcMat(0.8)); hedges.receiveShadow = true; scene.add(hedges);
  // 远景：奶国城堡、山丘、云
  const far = new THREE.Group(); scene.add(far);
  const castle = new THREE.Mesh(MD.castleGeometry(), MD.vcMat(0.6, 0, { fog: false }));
  castle.position.set(-6, -2, -320); castle.scale.setScalar(2.1); far.add(castle);
  const hillMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, fog: false });
  for (const [x, z, sx, sy, c] of [[-150, -300, 90, 22, '#CDEBB4'], [140, -310, 100, 26, '#C6E8AA'], [-40, -290, 70, 12, '#D7F0C0'], [60, -285, 80, 15, '#D2EEBA'], [0, -330, 120, 18, '#DDF2C8']]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 16), hillMat(c)); h.position.set(x, -sy * 0.35, z); h.scale.set(sx, sy, 30); far.add(h);
  }
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 1, emissive: '#FFFFFF', emissiveIntensity: 0.35, fog: false });
  const cg = MD.cloudGeometry();
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Mesh(cg, cloudMat);
    c.position.set(rand(-160, 160), rand(30, 55), rand(-200, -300)); c.scale.setScalar(rand(1.6, 2.8)); c.userData.v = rand(0.6, 1.6);
    far.add(c); clouds.push(c);
  }
}
const clouds = [];

/* ================= 角色 ================= */
let frog, fei, frogRocket, frogMagnet, rideEgg, rideK = 0, sigAura, godAura, godRing;
let frogYaw = 0;

/* ================= 图标（用 3D 模型渲染成小图） ================= */
const ICON = {};
function renderIcon(obj, o) {
  const size = 160;
  const sc = new THREE.Scene(); sc.environment = envTex; sc.environmentIntensity = 0.8;
  sc.add(new THREE.HemisphereLight('#ffffff', '#d9c9a0', 1.6));
  const dl = new THREE.DirectionalLight('#ffffff', 2.4); dl.position.set(2, 3, 4); sc.add(dl);
  sc.add(obj);
  const cm = new THREE.PerspectiveCamera(o.fov || 30, 1, 0.05, 50);
  cm.position.set(o.look[0], o.look[1] + (o.y || 0), o.look[2] + o.dist); cm.lookAt(o.look[0], o.look[1], o.look[2]);
  renderer.setPixelRatio(1); renderer.setSize(size, size, false); renderer.setClearColor(0x000000, 0);
  renderer.render(sc, cm);
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(glc, 0, 0, size, size);
  sc.remove(obj);
  return c.toDataURL('image/png');
}
function buildIcons() {
  const egg = new THREE.Mesh(G.egg, MAT.egg); egg.rotation.y = -0.25;
  ICON.egg = renderIcon(egg, { dist: 1.75, look: [0, 0.01, 0] });
  const f = CH.buildFei(); CH.poseFei(f, { mode: 'stand' }); f.root.rotation.y = -0.35;
  ICON.fei = renderIcon(f.root, { dist: 2.9, look: [0.05, 1.5, 0], fov: 30 });
  const cfg = { magnet: [1.6, 0], shoes: [1.6, 0.05], double: [1.6, 0], shield: [1.65, 0], rocket: [1.7, 0] };
  for (const k of PU_KEYS) {
    const m = MD.puModel(k);
    m.rotation.set(0.25, k === 'shoes' ? 0.3 : -0.35, k === 'rocket' ? -0.35 : 0);
    ICON[k] = renderIcon(m, { dist: cfg[k][0], look: [0, cfg[k][1], 0] });
  }
  const gb = MD.goldBar(); gb.rotation.set(0.42, -0.5, 0);
  ICON.gold = renderIcon(gb, { dist: 1.3, look: [0, 0.1, 0] });
  const pm = MD.potionModel(); pm.rotation.set(0.12, -0.3, 0);
  ICON.potion = renderIcon(pm, { dist: 1.75, look: [0, 0.27, 0] });
  for (const k of Object.keys(CH.SKINS)) {
    const f = CH.buildFrog(); CH.setFrogSkin(f, k, false); CH.poseFrog(f, { mode: 'stand', t: 0.3 }); f.root.rotation.y = -0.35;
    ICON['skin_' + k] = renderIcon(f.root, { dist: 3.3, look: [0, 0.68, 0] });
  }
  document.querySelectorAll('img.ic-egg').forEach((im) => (im.src = ICON.egg));
  document.querySelectorAll('img.ic-gold').forEach((im) => (im.src = ICON.gold));
  document.querySelectorAll('img.ic-potion').forEach((im) => (im.src = ICON.potion));
  $('#icFei').src = ICON.fei; $('#icFei2').src = ICON.fei;
}

/* ================= 尺寸与画质 ================= */
let W = 1, H = 1, LAND = false, SAFE_T = 0, quality = 2, layoutDirty = true;
const CAM = { z: 8, y: 4.4, fov: 62, ly: 1.15, lz: -9 };
function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  const pr = quality === 2 ? Math.min(dpr, 2) : quality === 1 ? Math.min(dpr, 1.4) : 1;
  renderer.setPixelRatio(pr);
  renderer.setSize(W, H, false);
  const wantShadow = quality > 0;
  if (renderer.shadowMap.enabled !== wantShadow) {
    renderer.shadowMap.enabled = wantShadow;
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
  }
}
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  LAND = W > H * 1.05;
  document.body.classList.toggle('land', LAND);
  applyQuality();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fxc.width = Math.round(W * dpr); fxc.height = Math.round(H * dpr);
  fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.aspect = W / H;
  CAM.fov = LAND ? 54 : 74;
  const t = Math.tan((CAM.fov * Math.PI) / 360);
  CAM.z = LAND ? 5.4 : clamp(2.3 / (t * (W / H)), 6.4, 7.4);
  CAM.y = LAND ? 3.3 : 1.6 + CAM.z * 0.38;
  CAM.ly = LAND ? 0.7 : 1.15; CAM.lz = LAND ? -7 : -9;
  SAFE_T = $('#probe').offsetHeight || 0;
  layoutDirty = true;
}

/* ================= 游戏状态 ================= */
let state = 'loading', run = null, nowT = 0, stateT = 0, overT = 0, grpId = 0;
const parts = [];

function newRun(play, mode) {
  if (frog && frog.sigma) CH.setFrogSkin(frog, save.skin, false);
  if (run) {
    for (const o of run.obs) freeObs(o);
    for (const d of run.decos) freeDeco(d);
    for (const p of run.pickups) freePick(p);
  }
  run = {
    play, t: 0, dist: 0, speed: 12, eggs: 0, banked: 0, revives: 0, level: 0,
    lane: 0, prevLane: 0, x: 0, py: 0, vy: 0, air: false, slideT: 0, slideAmt: 0, queueSlide: false, jumpBuf: 0, land: 0,
    phase: 0, invuln: 0, hitSlow: 0, stun: 0, hurt: 0, shake: 0, flash: 0, chase: 0, combo: 0, comboT: 0, sweatT: 0,
    pu: { magnet: 0, shoes: 0, double: 0, shield: 0, rocket: 0 },
    chaser: { on: false, x: 0, z: 20, y: 0, phase: 0, leaving: false, side: 1, jy: 0, sx: 0, sz: 0 },
    entered: new Set(), obs: [], eggList: [], decos: [], pickups: [], nextRow: 34, rowIdx: 0, nextDeco: -BEHIND,
    zones: [], nextStatue: 26, nextSigma: 1000, sigmaN: 0, pendingToast: null,
    catchT: 0, pounced: false, tut: play && !save.tut,
    flip: null, flipUsed: false, landPose: 0, flipReward: 0, flipHint: false, flips: 0,
    hits: 0, chaseDur: CHASE_T, figs: [], spin: 0, morphed: false, sad: false,
    mode: mode || 'normal', gold: 0, sig: null, won: false, potT: 0,
  };
  if (run.mode === 'potion') { run.rowIdx = 3; run.tut = false; run.nextRow = 30; }
  setTheme(run.mode);
  spawnDecos();
}
// 药水关卡换一个傍晚的天色
function setTheme(mode) {
  const p = mode === 'potion';
  const u = sky.material.uniforms;
  u.top.value.set(p ? '#7C6CFF' : '#5AB4FF'); u.mid.value.set(p ? '#FFB8D8' : '#BCE5FF'); u.hor.value.set(p ? '#FFE3C2' : '#FFF0D0');
  scene.fog.color.set(p ? '#FFE3C2' : '#FFF0D0');
}

/* ---------- 对象池 ---------- */
const obsPools = {}, decoPools = {}, pickPools = {};
function makeObsMesh(key) {
  let g;
  if (ST.STATUE_DIM[key]) g = ST.obstacleStatue(key);
  else if (key === 'cheese') { g = new THREE.Mesh(G.cheese, MAT.cheese); g.castShadow = g.receiveShadow = true; }
  else if (key === 'wheel') { g = new THREE.Group(); const m = new THREE.Mesh(G.wheel, MAT.cheese); m.castShadow = true; g.add(m); g.userData.spin = m; }
  else if (key === 'bar') {
    g = new THREE.Group(); const m = new THREE.Mesh(G.gate, MAT.gate); m.castShadow = true; g.add(m);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.515), MAT.signText); t.position.set(0, 2.0, 0.052); g.add(t);
  } else if (key === 'ramp') { g = new THREE.Mesh(G.ramp, MAT.ramp); g.castShadow = g.receiveShadow = true; }
  else {
    g = new THREE.Group(); const m = new THREE.Mesh(G[key], MAT.truck); m.castShadow = m.receiveShadow = true; g.add(m);
    if (key === 'truckF' || key === 'truckRF') {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), MAT.naiText); t.position.set(0, 1.07, CART / 2 + 0.036); g.add(t);
      const gl = [];
      for (const s of [-1, 1]) { const sp = new THREE.Sprite(MAT.glow); sp.scale.set(1.3, 1.3, 1); sp.position.set(s * 0.43, 0.62, CART / 2 + 0.2); g.add(sp); gl.push(sp); }
      g.userData.glow = gl;
    }
  }
  scene.add(g);
  return g;
}
function getObsMesh(key) {
  const p = obsPools[key] || (obsPools[key] = []);
  const m = p.pop() || makeObsMesh(key);
  m.visible = true; m.rotation.set(0, 0, 0); m.scale.setScalar(1);
  return m;
}
function freeObs(o) { o.mesh.visible = false; obsPools[o.key].push(o.mesh); }
function getDeco(kind) {
  const p = decoPools[kind] || (decoPools[kind] = []);
  let m = p.pop();
  if (!m) {
    if (kind === 'sigma') m = ST.sigmaStatue();
    else if (kind.startsWith('st_')) m = ST.decoStatue(kind.slice(3));
    else { m = new THREE.Mesh(G[kind], MAT.deco); m.castShadow = kind !== 'bush'; }
    scene.add(m);
  }
  m.visible = true;
  return m;
}
function freeDeco(d) { d.mesh.visible = false; decoPools[d.kind].push(d.mesh); }
let figRingMat = null;
function makePick(type) {
  const g = new THREE.Group();
  if (type === 'gold' || type === 'potion') {
    const m = new THREE.Group(), md = type === 'gold' ? MD.goldBar() : MD.potionModel();
    md.scale.setScalar(type === 'gold' ? 1.35 : 1.5); md.position.y = type === 'gold' ? -0.15 : -0.38; m.add(md); g.add(m); g.userData.model = m;
    const gl = new THREE.Sprite(type === 'gold' ? MAT.glow : MAT.potGlow); gl.scale.set(type === 'gold' ? 1.9 : 2.4, type === 'gold' ? 1.9 : 2.4, 1); gl.position.z = -0.3; g.add(gl);
    scene.add(g);
    return g;
  }
  if (type.startsWith('fig_')) {   // 图鉴小雕像
    const m = new THREE.Group(), f = ST.figurine(type.slice(4)); f.position.y = -0.47; m.add(f); g.add(m); g.userData.model = m;
    figRingMat = figRingMat || new THREE.MeshStandardMaterial({ color: '#FFD45A', emissive: '#FFB300', emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.35 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.022, 8, 48), figRingMat); ring.rotation.x = Math.PI / 2; ring.position.y = -0.36; g.add(ring);
    const gl = new THREE.Sprite(MAT.glow); gl.scale.set(2.3, 2.3, 1); gl.position.set(0, 0.05, -0.35); g.add(gl);
    scene.add(g);
    return g;
  }
  const m = MD.puModel(type); m.scale.setScalar(1.3); g.add(m); g.userData.model = m;
  const b = new THREE.Mesh(G.bubble, MAT.bubble); b.scale.setScalar(0.62); g.add(b);
  const gl = new THREE.Sprite(MAT.glow); gl.scale.set(2.0, 2.0, 1); gl.position.z = -0.25; g.add(gl);
  scene.add(g);
  return g;
}
function getPick(type) { const p = pickPools[type] || (pickPools[type] = []); const g = p.pop() || makePick(type); g.visible = true; return g; }
function freePick(p) { p.mesh.visible = false; pickPools[p.type].push(p.mesh); }

/* ---------- 生成 ---------- */
const SIDE0 = ROAD_W / 2 - 2.45;   // 路变宽后，路边的东西整体往外挪
const DECO = [['lolli', 3, 3.9 + SIDE0], ['tree', 3.2, 4.6 + SIDE0], ['bottle', 2, 3.8 + SIDE0], ['mush', 2, 4.7 + SIDE0], ['bush', 2.4, 3.9 + SIDE0]];
const DECO_ST = ['dog', 'horse', 'cat', 'curly', 'rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'goat', 'monkey', 'rooster', 'pig'];
function spawnDecos() {
  const r = run;
  // 西格奶：每 1000 米一座，竖着大拇指给你点赞
  while (ST.isReady() && r.nextSigma < r.dist + VIEW + 30) {
    const side = r.sigmaN++ % 2 ? -1 : 1, m = getDeco('sigma'), wz = r.nextSigma + 26;  // 到 1000 米时正好在前方
    m.userData.setDist(r.nextSigma); m.rotation.y = -side * 0.42; m.scale.setScalar(1);
    r.decos.push({ kind: 'sigma', mesh: m, wz, x: side * (6.9 + SIDE0) });
    r.zones.push({ side, z0: wz - 4.6, z1: wz + 4.6 });
    r.nextSigma += 1000;
  }
  while (r.nextDeco < r.dist + VIEW) {
    for (const side of [-1, 1]) {
      const wz0 = r.nextDeco + rand(-1, 1);
      if (r.zones.some((z) => z.side === side && wz0 > z.z0 && wz0 < z.z1)) continue;
      const pot = r.mode === 'potion';
      if (ST.isReady() && wz0 > r.nextStatue && Math.random() < (pot ? 0.4 : 0.1)) {   // 路边的角色雕像
        const k = pot && Math.random() < 0.75 ? 'sigma' : pick(DECO_ST), m = getDeco('st_' + k);
        m.rotation.y = -side * rand(0.25, 0.5); m.scale.setScalar(rand(1, 1.12));
        r.decos.push({ kind: 'st_' + k, mesh: m, wz: wz0, x: side * (rand(4.35, 4.95) + SIDE0) });
        r.zones.push({ side, z0: wz0 - 2.7, z1: wz0 + 2.7 });
        r.nextStatue = wz0 + (pot ? rand(7, 16) : rand(16, 38));
        continue;
      }
      if (Math.random() < 0.78) {
        const k = wpick(DECO.map((d) => [d, d[1]]));
        const m = getDeco(k[0]);
        m.rotation.y = k[0] === 'lolli' ? rand(-0.35, 0.35) : rand(0, TAU);
        m.scale.setScalar(rand(0.85, 1.25));
        r.decos.push({ kind: k[0], mesh: m, wz: wz0, x: side * (k[2] + rand(0, 2.8)) });
      }
    }
    r.nextDeco += rand(3, 5);
  }
}
const STATUE_FALLBACK = { cat: 'cheese', dog: 'bar', horse: 'cheese', curly: 'cheese', sigma: 'cheese' };
function addObs(type, lane, wz, ex) {
  if (STATUE_FALLBACK[type] && !ST.isReady()) type = STATUE_FALLBACK[type];   // 图片还没解码好时先用普通障碍
  const d = DIM[type];
  const o = { type, lane, wz, w: d.w, d: d.d, y0: d.y0, y1: d.y1, fx: 0, fy: 0, hit: false, fly: false, falpha: 1, grp: ++grpId, mv: 0, front: true, hint: null, roll: 0 };
  if (ex) Object.assign(o, ex);
  o.key = type === 'truck' ? (o.ramped ? 'truckR' : 'truck') + (o.front ? 'F' : 'B') : type;
  o.mesh = getObsMesh(o.key);
  if (o.mesh.userData.glow) o.mesh.userData.glow.forEach((s) => (s.visible = !!o.mv));
  run.obs.push(o);
  return o;
}
function addEgg(lane, wz, y, base) { run.eggList.push({ lane, wz, y: y == null ? 0.5 : y, base: base == null ? 0 : base, taken: false, ph: Math.random() * TAU, mag: false }); }
function eggLine(L, start, n, step = 1.7, maxEnd = Infinity) { for (let i = 0; i < n; i++) { const wz = start + i * step; if (wz > maxEnd) break; addEgg(L, wz); } }
function eggArc(L, c, v) {
  const T = (2 * JUMP_V) / GRAV, span = v * T, n = 7;
  for (let i = 0; i < n; i++) { const tt = (i / (n - 1)) * T; addEgg(L, c - span / 2 + v * tt, JUMP_V * tt - 0.5 * GRAV * tt * tt + 0.5); }
}
function laneClear(L, a, b) {
  for (const o of run.obs) if (o.lane === L && o.wz < b && o.wz + o.d > a) return false;
  for (const e of run.eggList) if (e.lane === L && !e.taken && e.wz > a && e.wz < b) return false;
  return true;
}
function addTrain(L, R, carts, ex) {
  const g = ++grpId;
  for (let k = 0; k < carts; k++) addObs('truck', L, R + k * CART_STEP, Object.assign({ grp: g, front: k === 0 }, ex || {}));
  return carts * CART_STEP - (CART_STEP - CART);
}
function placeObs(t, L, R) {
  if (t === 'truck') return addTrain(L, R, Math.random() < 0.3 ? 2 : 1);
  addObs(t, L, R);
  return DIM[t].d;
}
const JUMPS = new Set(['cheese', 'cat']), SLIDES = new Set(['bar', 'dog']), BLOCKS = new Set(['truck', 'horse', 'curly', 'sigma']);
const OBS_W = [['cheese', 0.22], ['cat', 0.12], ['bar', 0.18], ['dog', 0.12], ['truck', 0.26], ['horse', 0.05], ['curly', 0.05]];
const OBS_W_POT = [['cheese', 0.14], ['cat', 0.1], ['bar', 0.13], ['dog', 0.1], ['truck', 0.18], ['sigma', 0.3], ['horse', 0.03], ['curly', 0.02]];
const obsType = () => wpick(run.mode === 'potion' ? OBS_W_POT : OBS_W);
const jumpT = () => (Math.random() < 0.35 ? 'cat' : 'cheese');
const slideT = () => (Math.random() < 0.4 ? 'dog' : 'bar');
const lowT = () => (Math.random() < 0.5 ? jumpT() : slideT());
function rowEggs(R, len, types, v, room) {
  const free = LANES.filter((L) => !types[L]);
  const cheese = LANES.filter((L) => JUMPS.has(types[L]));
  const bars = LANES.filter((L) => SLIDES.has(types[L]));
  const q = Math.random();
  if (cheese.length && q < 0.4) eggArc(pick(cheese), R + 0.45, v);
  else if (free.length && q < 0.9) eggLine(pick(free), R - 3, 5 + ((Math.random() * 6) | 0), 1.7, R + len + room - 4);
  else if (bars.length) for (let i = -2; i <= 2; i++) addEgg(pick(bars), R + i * 1.3, 0.35);
}
const pickN = (n) => shuffle(LANES.slice()).slice(0, n);
// 一排里挡死的道太多时，把多出来的换成能跳/能钻的
function keepOpen(types, maxBlocks) {
  let bl = LANES.filter((L) => BLOCKS.has(types[L]));
  while (bl.length > maxBlocks) { types[pick(bl)] = lowT(); bl = LANES.filter((L) => BLOCKS.has(types[L])); }
  return types;
}
function placeRow(R, ls, types, v, room) {
  let len = 0.9;
  for (const L of ls) len = Math.max(len, placeObs(types[L], L, R));
  rowEggs(R, len, types, v, room);
  return len;
}
const PAT = {
  eggs(R) {
    if (Math.random() < 0.5) { eggLine(pick(LANES), R, 11); return 18; }
    let L = pick(LANES);
    for (let i = 0; i < 12; i++) { if (i % 4 === 0 && i) L = clamp(L + pick([-1, 1]), LMIN, LMAX); addEgg(L, R + i * 1.7); }
    return 20;
  },
  single(R, v, dfc, room) {
    const ls = pickN(Math.random() < lerp(0.25, 0.6, dfc) ? 3 : 2), types = {};
    for (const L of ls) types[L] = obsType();
    keepOpen(types, 2);
    return placeRow(R, ls, types, v, room);
  },
  double(R, v, dfc, room) {
    const ls = pickN(Math.random() < lerp(0.2, 0.7, dfc) ? 4 : 3), types = {};
    for (const L of ls) types[L] = obsType();
    keepOpen(types, 3);
    return placeRow(R, ls, types, v, room);
  },
  triple(R, v, dfc, room) {
    const types = {};
    for (const L of LANES) types[L] = obsType();
    keepOpen(types, Math.random() < 0.5 ? 3 : 2);
    return placeRow(R, LANES, types, v, room);
  },
  train(R, v, dfc) {
    const n = 1 + (Math.random() < 0.6 ? 1 : 0) + (dfc > 0.3 && Math.random() < 0.5 ? 1 : 0) + (dfc > 0.6 && Math.random() < 0.3 ? 1 : 0);
    const ls = pickN(n);
    const rampL = n >= 3 || Math.random() < 0.7 ? ls[0] : null;
    let len = 0;
    for (const L of ls) len = Math.max(len, addTrain(L, R, 2 + (Math.random() < 0.5 ? 1 : 0), L === rampL ? { ramped: true } : null));
    if (rampL != null) {
      const rp = addObs('ramp', rampL, R - RAMP_L, { ramped: true });
      const top = run.obs.filter((o) => o.lane === rampL && o.type === 'truck' && o.wz >= R - 0.1);
      if (top.length) rp.grp = top[0].grp;   // 坡道和车厢算同一组：从正面上坡就整组放行，从侧面撞就整组撞飞
      const end = Math.max(...top.map((o) => o.wz + o.d));
      for (let t = R - RAMP_L + 0.8; t < end - 0.6; t += 1.7) {
        const s = t < R ? (ROOF * (t - (R - RAMP_L))) / RAMP_L : ROOF;
        addEgg(rampL, t, s + 0.5, s);
      }
    }
    shuffle(LANES.filter((L) => !ls.includes(L))).forEach((L, i) => {
      if (i === 0) eggLine(L, R, Math.min(8, Math.floor(len / 1.7)));
      else if (dfc > 0.2 && Math.random() < 0.4) addObs(lowT(), L, R + len * rand(0.3, 0.7));
    });
    return len;
  },
  wheels(R, v, dfc) {
    const n = 1 + (dfc > 0.3 && Math.random() < 0.5 ? 1 : 0) + (dfc > 0.6 && Math.random() < 0.4 ? 1 : 0);
    const ls = pickN(n);
    for (const L of ls) {
      const mv = rand(5, 8), sweep = (mv * (R - run.dist)) / (v + mv);
      if (laneClear(L, R - sweep - 2, R + 1)) addObs('wheel', L, R, { mv }); else addObs('cheese', L, R);
    }
    eggLine(pick(LANES.filter((L) => !ls.includes(L))), R - 3, 7);
    return 1;
  },
  oncoming(R, v, dfc) {
    const ls = shuffle(LANES.slice()), k = dfc > 0.5 && Math.random() < 0.5 ? 2 : 1;
    const mv = lerp(5, 10, dfc), sweep = (mv * (R - run.dist)) / (v + mv);
    for (let i = 0; i < k; i++) {
      if (laneClear(ls[i], R - sweep - 2, R + CART)) addObs('truck', ls[i], R, { mv });
      else addTrain(ls[i], R, 1);
    }
    if (Math.random() < 0.7) addObs(lowT(), ls[k], R + 1);
    if (Math.random() < 0.4) addObs(lowT(), ls[k + 1], R + 4);
    eggLine(ls[4], R - 2, 6);
    return CART;
  },
  zigzag(R, v, dfc) {
    const steps = dfc > 0.6 ? 4 : 3, s = Math.max(v * 0.8, 9) + CART;
    let free = pick(LANES);
    for (let k = 0; k < steps; k++) {
      for (const L of LANES) if (L !== free) addTrain(L, R + k * s, 1);
      eggLine(free, R + k * s, 3, 1.7);
      free = pick([free - 1, free + 1].filter((x) => x >= LMIN && x <= LMAX));
    }
    return (steps - 1) * s + CART;
  },
  combo(R, v) {
    const jf = Math.random() < 0.5, sp = Math.max(v * 0.62, 7.5) + (jf ? 0 : 1.5);
    const row = (jump) => Object.fromEntries(LANES.map((L) => [L, jump ? jumpT() : slideT()]));
    const a = row(jf), b = row(!jf);
    for (const L of LANES) { addObs(a[L], L, R); addObs(b[L], L, R + sp); }
    const L = pick(LANES);
    if (jf) eggArc(L, R + 0.5, v); else eggArc(L, R + sp + 0.5, v);
    return sp + 1;
  },
  // 雕像一条街：五条道上都是雕像，至少两条能过
  gallery(R, v, dfc, room) {
    const types = {};
    for (const L of LANES) types[L] = wpick(run.mode === 'potion' ? [['cat', 0.2], ['dog', 0.25], ['sigma', 0.55]] : [['cat', 0.3], ['dog', 0.3], ['horse', 0.2], ['curly', 0.2]]);
    let bl = LANES.filter((L) => BLOCKS.has(types[L]));
    while (bl.length > 3) { types[pick(bl)] = pick(['cat', 'dog']); bl = LANES.filter((L) => BLOCKS.has(types[L])); }
    return placeRow(R, LANES, types, v, room);
  },
};
function spawnPattern(R) {
  const r = run, v = Math.max(r.speed, 12), dfc = clamp(r.dist / 3200, 0, 1), idx = r.rowIdx++;
  const gap = Math.max(v * lerp(1.35, 0.74, dfc) * rand(0.95, 1.25), 10);
  if (idx < 3) { r.nextRow = R + tutorialRow(idx, R, v) + v * 1.5; return; }
  const kind = wpick([
    ['eggs', 0.08],
    ['single', lerp(0.28, 0.05, dfc)],
    ['double', 0.22],
    ['triple', lerp(0.05, 0.16, dfc)],
    ['train', lerp(0.13, 0.2, dfc)],
    ['wheels', r.dist > 150 ? lerp(0.05, 0.1, dfc) : 0],
    ['oncoming', r.dist > 350 ? lerp(0.04, 0.12, dfc) : 0],
    ['zigzag', r.dist > 900 ? lerp(0.02, 0.12, dfc) : 0],
    ['combo', r.dist > 700 ? lerp(0.02, 0.1, dfc) : 0],
    ['gallery', r.dist > 180 ? 0.07 : 0],
  ]);
  const len = PAT[kind](R, v, dfc, gap);
  const at = R + len + gap * 0.5, pot = r.mode === 'potion';
  if (pot && !r.sig && r.pu.rocket <= 0 && r.dist > 260 && (r.potN || 0) < 2 && !r.pickups.some((p) => p.type === 'potion' && !p.taken) && Math.random() < Math.min(0.16, 0.04 + (r.dist - 260) / 6000)) { r.potN = (r.potN || 0) + 1; placeSpecial(at, 'potion'); }
  else if (r.pu.rocket <= 0 && !r.sig && r.dist > 60 && Math.random() < 0.12) placePickup(at);
  else if (r.pu.rocket <= 0 && r.dist > 80 && Math.random() < (pot ? 0.07 : 0.03)) placeSpecial(at, 'gold');
  else if (r.pu.rocket <= 0 && r.dist > 120 && ST.isReady() && Math.random() < 0.035) placeFigurine(at);
  r.nextRow = R + len + gap;
}
function tutorialRow(idx, R, v) {
  let first;
  if (idx === 0) {
    for (const L of LANES) { const o = addObs('cheese', L, R); if (L === 0) first = o; }
    eggArc(0, R + 0.45, v);
    first.hint = isTouch ? '向上滑 · 跳过奶酪！' : '按 ↑ 跳过奶酪！';
  } else if (idx === 1) {
    for (const L of LANES) { const o = addObs('bar', L, R); if (L === 0) first = o; }
    for (let i = -2; i <= 2; i++) addEgg(0, R + i * 1.3, 0.35);
    first.hint = isTouch ? '向下滑 · 从栏杆下钻过！' : '按 ↓ 趴下钻过去！';
  } else {
    first = addObs('truck', 0, R); addObs('truck', 1, R);
    eggLine(-1, R - 2, 7);
    first.hint = isTouch ? '左右滑 · 躲开牛奶车！' : '按 ← → 躲开牛奶车！';
    first.lastTut = true;
  }
  if (!run.tut) first.hint = null;
  return idx === 2 ? CART : 0.9;
}
function placePickup(t) {
  const r = run, L = pick(LANES);
  for (const o of r.obs) if (o.lane === L && o.wz < t + 3 && o.wz + o.d > t - 3) return;
  for (const e of r.eggList) if (e.lane === L && Math.abs(e.wz - t) < 1.6) e.taken = true;
  const type = wpick([['magnet', 0.26], ['shoes', 0.2], ['double', 0.22], ['shield', 0.2], ['rocket', 0.12]]);
  r.pickups.push({ type, lane: L, wz: t, y: 1.0, taken: false, mesh: getPick(type), ph: Math.random() * TAU });
}

/* ---------- 图鉴：路上偶尔出现的小雕像 ---------- */
const DEX = [
  // 奶十二生肖
  { k: 'rat', z: 1, name: '奶鼠', rare: '普通', rc: 'r1', w: 1, desc: '子鼠。一对大圆耳朵，抬手跟你打招呼。' },
  { k: 'ox', z: 1, name: '奶牛', rare: '普通', rc: 'r1', w: 1, desc: '丑牛。头顶两只小弯角，捂着肚子站得稳稳的。' },
  { k: 'tiger', z: 1, name: '奶虎', rare: '稀有', rc: 'r2', w: 0.75, desc: '寅虎。额头一个"王"字，抬腿举手虎虎生威。' },
  { k: 'rabbit', z: 1, name: '奶兔', rare: '普通', rc: 'r1', w: 1, desc: '卯兔。双手抱着长耳朵，害羞地躲起来。' },
  { k: 'dragon', z: 1, name: '奶龙', rare: '传说', rc: 'r4', w: 0.3, desc: '辰龙。头上长角、背上一排小刺，十二生肖里最难遇到。' },
  { k: 'snake', z: 1, name: '奶蛇', rare: '稀有', rc: 'r2', w: 0.75, desc: '巳蛇。盘成一圈，尾巴尖是棕色的。' },
  { k: 'horse', z: 1, name: '奶马', rare: '稀有', rc: 'r2', w: 0.8, desc: '午马。奶国跑得最快的家伙，鬃毛永远在飘。' },
  { k: 'goat', z: 1, name: '奶羊', rare: '普通', rc: 'r1', w: 1, desc: '未羊。懒洋洋地趴着晒太阳。' },
  { k: 'monkey', z: 1, name: '奶猴', rare: '普通', rc: 'r1', w: 1, desc: '申猴。挠着脑袋想事情，长尾巴卷在身后。' },
  { k: 'rooster', z: 1, name: '奶鸡', rare: '稀有', rc: 'r2', w: 0.75, desc: '酉鸡。红红的鸡冠，一大把扇子似的尾巴。' },
  { k: 'dog', z: 1, name: '奶狗', rare: '普通', rc: 'r1', w: 1, desc: '戌狗。笑得合不拢嘴，站在拱门上，趴下就能从它底下钻过去。' },
  { k: 'pig', z: 1, name: '奶猪', rare: '普通', rc: 'r1', w: 1, desc: '亥猪。侧躺着托着腮，一脸享受。' },
  // 其他伙伴
  { k: 'cat', name: '奶猫', rare: '普通', rc: 'r1', w: 1, desc: '软乎乎的一大坨，挡在路上时跳过去就好。' },
  { k: 'curly', name: '卷毛奶', rare: '稀有', rc: 'r3', w: 0.6, desc: '戴着圆眼镜，憋笑憋得腮帮子都鼓起来了。' },
  { k: 'sigma', name: '西格奶', rare: '传说', rc: 'r4', w: 0.22, desc: '每跑 1000 米就为你竖一次大拇指。最难捡到。' },
];
function placeSpecial(t, type) {   // 奶金 / 增强药水
  const r = run, L = pick(LANES);
  for (const o of r.obs) if (o.lane === L && o.wz < t + 3 && o.wz + o.d > t - 3) return;
  for (const e of r.eggList) if (e.lane === L && Math.abs(e.wz - t) < 1.6) e.taken = true;
  r.pickups.push({ type, lane: L, wz: t, y: type === 'gold' ? 0.75 : 0.9, taken: false, mesh: getPick(type), ph: Math.random() * TAU, sway: true });
}
function placeFigurine(t) {
  const r = run, L = pick(LANES);
  for (const o of r.obs) if (o.lane === L && o.wz < t + 3 && o.wz + o.d > t - 3) return;
  for (const e of r.eggList) if (e.lane === L && Math.abs(e.wz - t) < 1.6) e.taken = true;
  const kind = wpick(DEX.map((d) => [d.k, d.w * (save.dex[d.k] ? 1 : 1.8)]));
  r.pickups.push({ type: 'fig_' + kind, fig: kind, lane: L, wz: t, y: 0.72, taken: false, mesh: getPick('fig_' + kind), ph: Math.random() * TAU, sway: true });
}
function collectFig(kind) {
  const first = !save.dex[kind];
  save.dex[kind]++; persist();
  run.figs.push(kind);
  Sfx.power(); vib(40);
  const d = DEX.find((x) => x.k === kind);
  $('#gcT').textContent = first ? '新收录！' : '又捡到啦';
  setThumb($('#gcImg'), kind);
  $('#gcName').textContent = d.name + '雕像';
  $('#gcSub').textContent = first ? `已在图鉴中解锁（${dexCount()}/${DEX.length}）` : `图鉴里已有 ${save.dex[kind]} 个`;
  const el = $('#getCard'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  refreshDexN();
}

/* 图鉴缩略图：按实际轮廓裁边、按面积统一大小、脚底对齐 */
const THUMB = {};
function thumbOf(k) {
  if (THUMB[k]) return THUMB[k];
  const W = 240, H = 200;
  THUMB[k] = new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      try {
        const sw = im.naturalWidth, sh = im.naturalHeight, c0 = document.createElement('canvas');
        const sc0 = Math.min(1, 400 / Math.max(sw, sh)); c0.width = Math.round(sw * sc0); c0.height = Math.round(sh * sc0);
        const x0 = c0.getContext('2d'); x0.drawImage(im, 0, 0, c0.width, c0.height);
        const a = x0.getImageData(0, 0, c0.width, c0.height).data;
        let l = 1e9, t = 1e9, r = -1, b = -1, area = 0;
        for (let y = 0; y < c0.height; y++) for (let x = 0; x < c0.width; x++) if (a[(y * c0.width + x) * 4 + 3] > 40) { area++; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
        if (r < 0) return res(ST.IMG[k]);
        const bw = r - l + 1, bh = b - t + 1;
        const fit = Math.min((W * 0.92) / bw, (H * 0.94) / bh), byArea = Math.sqrt((W * H * 0.36) / area);
        const s = Math.min(fit, byArea), dw = bw * s, dh = bh * s;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        c.getContext('2d').drawImage(c0, l, t, bw, bh, (W - dw) / 2, H * 0.97 - dh, dw, dh);
        res(c.toDataURL('image/png'));
      } catch (e) { res(ST.IMG[k]); }
    };
    im.onerror = () => res(ST.IMG[k]);
    im.src = ST.IMG[k];
  });
  return THUMB[k];
}
const setThumb = (img, k) => { img.src = ST.IMG[k]; thumbOf(k).then((u) => { img.src = u; }); };
const dexCount = () => DEX.filter((d) => save.dex[d.k] > 0).length;
function refreshDexN() { const n = $('#dexN'); if (n) n.textContent = `${dexCount()}/${DEX.length}`; }
const zodCount = () => DEX.filter((d) => d.z && save.dex[d.k] > 0).length;
function buildDex() {
  const list = $('#dexList'); list.innerHTML = '';
  const head = (txt) => { const h = document.createElement('div'); h.className = 'dhead'; h.innerHTML = txt; list.appendChild(h); };
  const zc = zodCount();
  head(`奶十二生肖 <b>${zc} / 12</b>${zc >= 12 ? '<span class="tag r4">已集齐！去衣柜兑换奶神</span>' : '<small>集齐可兑换最稀有皮肤「奶神」</small>'}`);
  for (const d of DEX) {
    if (d.k === 'cat') head('奶国伙伴');
    const n = save.dex[d.k], c = document.createElement('div');
    c.className = 'dcard' + (n ? '' : ' lock') + (d.k === 'sigma' ? ' wide' : '');
    c.addEventListener('click', () => toast(n ? `${d.name}：${d.desc}` : '还没收集到哦', 'tip', 2.4));
    c.innerHTML = `<div class="pic"><img alt=""></div><div class="dinfo"><span class="tag ${d.rc}">${d.rare}</span><b>${n ? d.name : '？？？'}</b>` +
      `<small>${n ? d.desc : '还没捡到。跑步时留意路上发光的小雕像。'}</small>${n ? `<span class="cnt">已收集 ×${n}</span>` : ''}</div>`;
    setThumb(c.querySelector('img'), d.k);
    list.appendChild(c);
  }
  $('#dexProg').textContent = `已收集 ${dexCount()} / ${DEX.length}`;
}

/* ---------- 成就 ---------- */
const PU_BIT = { magnet: 1, shoes: 2, double: 4, shield: 8, rocket: 16 };
const bits = (n) => { let c = 0; for (; n; n &= n - 1) c++; return c; };
const liveDist = () => (run && (state === 'play' || state === 'reviving') ? run.dist : 0);
const liveEggs = () => (run && (state === 'play' || state === 'reviving') ? run.eggs : 0);
const ACH = [
  { k: 'run1', g: '奔跑', name: '第一次逃亡', desc: '完成 1 局奔跑', goal: 1, rw: 1, v: () => save.st.runs },
  { k: 'run50', g: '奔跑', name: '老逃犯', desc: '累计完成 50 局', goal: 50, rw: 8, v: () => save.st.runs },
  { k: 'd1000', g: '奔跑', name: '千米奶蛙', desc: '单局跑到 1000 米', goal: 1000, rw: 3, v: () => Math.max(save.best.dist, liveDist()) },
  { k: 'd3000', g: '奔跑', name: '奶国马拉松', desc: '单局跑到 3000 米', goal: 3000, rw: 10, v: () => Math.max(save.best.dist, liveDist()) },
  { k: 'dsum', g: '奔跑', name: '跑断腿', desc: '累计跑 30000 米', goal: 30000, rw: 10, v: () => save.st.dist + Math.max(0, liveDist() - (run ? run.stD || 0 : 0)) },
  { k: 'clean', g: '奔跑', name: '毫发无伤', desc: '一次都没撞，单局跑到 800 米', goal: 800, rw: 6, v: () => Math.max(save.st.clean, run && run.hits === 0 ? liveDist() : 0) },
  { k: 'e300', g: '奶蛋', name: '小有积蓄', desc: '单局收集 300 个奶蛋', goal: 300, rw: 2, v: () => Math.max(save.best.eggs, liveEggs()) },
  { k: 'e1000', g: '奶蛋', name: '一夜暴富', desc: '单局收集 1000 个奶蛋', goal: 1000, rw: 8, v: () => Math.max(save.best.eggs, liveEggs()) },
  { k: 'esum', g: '奶蛋', name: '奶蛋富翁', desc: '累计收集 20000 个奶蛋', goal: 20000, rw: 12, v: () => save.st.eggs + Math.max(0, liveEggs() - (run ? run.stE || 0 : 0)) },
  { k: 'gold100', g: '奶蛋', name: '小金库', desc: '钱包里同时有 100 个奶金', goal: 100, rw: 5, v: () => Math.max(save.st.maxGold, save.gold) },
  { k: 'flip50', g: '身手', name: '空翻小能手', desc: '累计成功空翻 50 次', goal: 50, rw: 3, v: () => save.st.flips + (run && (state === 'play' || state === 'reviving') ? run.flips - (run.stF || 0) : 0) },
  { k: 'flip300', g: '身手', name: '奶国体操队', desc: '累计成功空翻 300 次', goal: 300, rw: 10, v: () => save.st.flips + (run && (state === 'play' || state === 'reviving') ? run.flips - (run.stF || 0) : 0) },
  { k: 'slide200', g: '身手', name: '贴地飞行', desc: '累计趴下 200 次', goal: 200, rw: 3, v: () => save.st.slides },
  { k: 'roll50', g: '身手', name: '滚滚奶蛙', desc: '累计成功前滚翻 50 次', goal: 50, rw: 4, v: () => save.st.rolls || 0 },
  { k: 'pu5', g: '道具', name: '道具达人', desc: '用过全部 5 种道具', goal: 5, rw: 3, v: () => bits(save.st.pu) },
  { k: 'boom10', g: '道具', name: '跳蛋爆破手', desc: '跳蛋炸掉 10 次', goal: 10, rw: 4, v: () => save.st.boom },
  { k: 'rocket20', g: '道具', name: '奶瓶航天员', desc: '坐 20 次奶瓶火箭', goal: 20, rw: 4, v: () => save.st.rockets },
  { k: 'caught20', g: '肥嘟嘟', name: '被捕专业户', desc: '被肥嘟嘟抓住 20 次', goal: 20, rw: 2, v: () => save.st.caught },
  { k: 'sad1', g: '肥嘟嘟', name: '唉……', desc: '被抓时变成悲伤奶', goal: 1, rw: 1, v: () => save.st.sad },
  { k: 'win1', g: '肥嘟嘟', name: '反客为主', desc: '变身西格奶抓住肥嘟嘟', goal: 1, rw: 5, v: () => save.st.wins },
  { k: 'win10', g: '肥嘟嘟', name: '肥嘟嘟克星', desc: '抓住肥嘟嘟 10 次', goal: 10, rw: 15, v: () => save.st.wins },
  { k: 'revive5', g: '肥嘟嘟', name: '花钱消灾', desc: '贿赂肥嘟嘟复活 5 次', goal: 5, rw: 3, v: () => save.st.revives },
  { k: 'dex5', g: '收藏', name: '图鉴入门', desc: '图鉴收集 5 种雕像', goal: 5, rw: 2, v: () => dexCount() },
  { k: 'zod12', g: '收藏', name: '十二生肖', desc: '集齐奶十二生肖', goal: 12, rw: 10, v: () => zodCount() },
  { k: 'dexall', g: '收藏', name: '全图鉴', desc: '图鉴全部收集', goal: () => DEX.length, rw: 20, v: () => dexCount() },
  { k: 'skin3', g: '收藏', name: '衣柜达人', desc: '拥有 3 套皮肤（不算原味）', goal: 3, rw: 5, v: () => Object.keys(save.skins).filter((k) => k !== 'default' && save.skins[k]).length },
  { k: 'god', g: '收藏', name: '奶神降临', desc: '获得最稀有皮肤「奶神」', goal: 1, rw: 20, v: () => (save.skins.god ? 1 : 0) },
  { k: 'draw1', g: '扭蛋', name: '第一颗扭蛋', desc: '在抽奖机抽 1 次', goal: 1, rw: 1, v: () => save.st.draws },
  { k: 'draw100', g: '扭蛋', name: '扭蛋狂人', desc: '累计抽 100 次', goal: 100, rw: 8, v: () => save.st.draws },
  { k: 'lucky', g: '扭蛋', name: '欧皇', desc: '不靠保底抽出传说', goal: 1, rw: 5, v: () => save.st.lucky },
];
const goalOf = (a) => (typeof a.goal === 'function' ? a.goal() : a.goal);
const achQ = []; let achBusy = false;
function checkAch() {
  save.st.maxGold = Math.max(save.st.maxGold, save.gold);
  let any = false;
  for (const a of ACH) if (!save.ach[a.k] && a.v() >= goalOf(a)) { save.ach[a.k] = 1; achQ.push(a); any = true; }
  if (any) { persist(); refreshAchDot(); popAch(); }
}
function popAch() {
  if (achBusy || !achQ.length) return;
  const a = achQ.shift(), el = $('#achPop'); achBusy = true;
  $('#apName').textContent = a.name; $('#apDesc').textContent = a.desc; $('#apRw').textContent = `×${a.rw}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); Sfx.level();
  setTimeout(() => { achBusy = false; popAch(); }, 2700);
}
const achReady = () => ACH.filter((a) => save.ach[a.k] === 1).length;
function refreshAchDot() {
  const n = achReady(), d = $('#achDot'); if (d) { d.textContent = n; d.classList.toggle('hide', !n); }
  const c = $('#achN'); if (c) c.textContent = `${ACH.filter((a) => save.ach[a.k]).length}/${ACH.length}`;
}
function claimAch(list) {
  let g = 0;
  for (const a of list) if (save.ach[a.k] === 1) { save.ach[a.k] = 2; g += a.rw; }
  if (!g) return;
  save.gold += g; persist(); Sfx.gold(); toast(`领取了 ${g} 个奶金！`, 'good', 1.4);
  checkAch(); refreshWallet(); refreshAchDot(); buildAch();
}
function buildAch() {
  const list = $('#achList'); list.innerHTML = '';
  const ord = (a) => (save.ach[a.k] === 1 ? 0 : save.ach[a.k] === 2 ? 2 : 1);
  const items = ACH.map((a, i) => [a, i]).sort((x, y) => ord(x[0]) - ord(y[0]) || x[1] - y[1]);
  for (const [a] of items) {
    const st = save.ach[a.k] || 0, goal = goalOf(a), v = Math.min(goal, Math.floor(a.v())), el = document.createElement('div');
    el.className = 'aitem' + (st === 1 ? ' ready' : st === 2 ? ' done' : '');
    el.innerHTML = `<div class="amedal"><i>★</i></div><div class="ainfo"><div class="atop"><b>${a.name}</b><span class="agrp">${a.g}</span></div><small>${a.desc}</small>` +
      `<div class="abar"><i style="width:${((100 * v) / goal).toFixed(1)}%"></i><span>${v} / ${goal}</span></div></div>` +
      `<button class="abtn">${st === 1 ? '领取' : st === 2 ? '已领取' : ''}<span><img src="${ICON.gold}" alt="">×${a.rw}</span></button>`;
    const b = el.querySelector('.abtn'); b.disabled = st !== 1;
    b.addEventListener('click', () => claimAch([a]));
    list.appendChild(el);
  }
  $('#achProg').textContent = `已完成 ${ACH.filter((a) => save.ach[a.k]).length} / ${ACH.length}`;
  const all = $('#bAchAll'); all.classList.toggle('hide', !achReady()); all.textContent = `一键领取（${achReady()}）`;
}
function openAch() { Sfx.click(); state = 'menu'; checkAch(); buildAch(); refreshWallet(); showScreen('ach'); }
function openDex() { Sfx.click(); state = 'menu'; buildDex(); showScreen('dex'); }

/* ---------- 物理与碰撞 ---------- */
function surfaceAt(x, t, onlyRamped) {
  let h = 0;
  for (const o of run.obs) {
    if (o.hit || (o.type !== 'truck' && o.type !== 'ramp') || (onlyRamped && (!o.ramped || !run.entered.has(o.grp)))) continue;
    if (Math.abs(x - o.lane * LW) > 0.62) continue;
    if (o.type === 'truck') { if (t >= o.wz - 0.2 && t <= o.wz + o.d + 0.2 && ROOF > h) h = ROOF; }
    else if (t >= o.wz && t <= o.wz + o.d) { const s = (ROOF * (t - o.wz)) / o.d; if (s > h) h = s; }
  }
  return h;
}
const ROLL_T = 0.62;
function startRoll() {
  const r = run;
  r.roll = { t: 0, hit: false }; r.slideT = ROLL_T + 0.05; r.queueSlide = false; r.jumpBuf = 0;
  Sfx.flip();
}
function startFlip() {
  const r = run;
  if (!r.air || r.flip || r.flipUsed || r.pu.rocket > 0) return;
  r.flip = { t: 0, dur: 0.58, hit: false };
  r.flipUsed = true; r.queueSlide = false; r.jumpBuf = 0; r.slideT = 0;
  r.vy = Math.max(r.vy, 7.2);           // 往上再带一点，保证翻得完一整圈
  Sfx.flip();
  if (!save.tutFlip) { save.tutFlip = true; persist(); }
}
function doJump() {
  const r = run, big = r.pu.shoes > 0;
  r.air = true; r.vy = big ? SUPER_V : JUMP_V; r.slideT = 0; Sfx.jump(big);
  if (!big && !save.tutFlip && !r.flipHint && r.rowIdx > 3) { r.flipHint = true; toast(isTouch ? '跳起来后点一下屏幕：空翻！' : '跳起来后按空格：空翻！', 'tip', 1.8); }
}
function act(dir) {
  if (state !== 'play') return;
  const r = run;
  if (r.sig && r.sig.turn > 0) return;   // 转身时先别乱动
  if (r.flip && dir !== 'F') return;          // 空翻过程中不能变道、不能趴下
  if (r.roll) return;                         // 前滚翻过程中什么都不能做
  if (dir === 'L') { if (r.lane > LMIN) { r.prevLane = r.lane; r.lane--; Sfx.lane(); } }
  else if (dir === 'R') { if (r.lane < LMAX) { r.prevLane = r.lane; r.lane++; Sfx.lane(); } }
  else if (r.pu.rocket > 0) return;
  else if (dir === 'F') { if (r.pu.shoes > 0) { if (!r.air) doJump(); } else startFlip(); }   // 跳蛋：点一下就弹起来
  else if (dir === 'U') { if (!r.air) doJump(); else r.jumpBuf = 0.18; }
  else if (dir === 'D') {
    if (r.air) { r.vy = Math.min(r.vy, -18); r.queueSlide = true; }
    else if (r.slideT > 0 && r.slideAmt > 0.5 && r.pu.shoes <= 0) startRoll();   // 趴着再按一次下：前滚翻
    else { r.slideT = SLIDE_T; Sfx.slide(); save.st.slides++; }
  }
}
function collide(dz, dt, xPrev) {
  const r = run, h = r.slideT > 0 ? H_SLIDE : H_STAND;
  const x0 = r.x - HW, x1 = r.x + HW, y0 = r.py, y1 = r.py + h;
  for (const o of r.obs) {
    if (o.hit) continue;
    if (o.ramped && r.entered.has(o.grp)) continue;     // 倾斜奶车：从坡道正面上去以后，跳、滑、不动都能直接过
    const sw = dz + (o.mv || 0) * dt;
    const t0 = o.wz - r.dist, t1 = t0 + o.d;
    if (t0 > 0.3 || t1 + sw < -0.3) continue;
    const ox = o.lane * LW, hw = o.w / 2;
    if (o.ramped && Math.abs(r.x - ox) < 0.62 && t0 <= 0.3) {   // 正在这条道上：在坡面上（或高过车顶）就算“从正面上车”
      const hr = o.type === 'ramp' ? ROOF * clamp(-t0 / o.d, 0, 1) : ROOF;
      if (r.py >= hr - (o.type === 'ramp' ? 0.75 : 0.35)) { r.entered.add(o.grp); continue; }
    }
    if (x1 < ox - hw || x0 > ox + hw) continue;
    let oy1 = o.y1;
    if (o.type === 'ramp') { const hr = ROOF * clamp(-t0 / o.d, 0, 1); if (r.py >= hr - 0.75) continue; oy1 = hr; }
    else if (o.type === 'truck' && r.py >= ROOF - 0.35) continue;
    if (y1 < o.y0 || y0 > oy1) continue;
    if (r.sig) { knock(o); Sfx.pop(); r.shake = Math.max(r.shake, 0.14); burstAt(o.lane * LW, 1, -0.5, 10, ['#FFE14D', '#FFB000', '#FFFFFF']); continue; }   // 西格奶：一路撞飞
    if (r.invuln > 0 || r.pu.rocket > 0) { for (const q of r.obs) if (q.grp === o.grp) q.hit = true; continue; }
    const prevX = !(xPrev + HW < ox - hw || xPrev - HW > ox + hw);
    onHit(o, o.ramped ? false : !prevX && t0 + sw <= 0.3);   // 从侧面撞上倾斜奶车：和正面撞车一样，撞飞+肥嘟嘟追上来
    return;
  }
}
function knock(o) {
  const r = run, ox = o.lane * LW;
  const dir = ox > r.x + 0.05 ? 1 : ox < r.x - 0.05 ? -1 : Math.random() < 0.5 ? -1 : 1;
  for (const q of r.obs) if (q.grp === o.grp) {
    Object.assign(q, { hit: true, fly: true, fvx: dir * rand(4, 7), fvy: rand(4, 6), fvz: r.speed * 1.1 + 4, fr: rand(-4, 4), falpha: 1, mv: 0 });
  }
}
function onHit(o, side) {
  const r = run;
  if (r.hitLog) r.hitLog.push(o.type + (side ? ':side' : ''));
  if (r.flip) r.flip.hit = true;
  if (r.roll) r.roll.hit = true;
  r.flipReward = 0; r.landPose = 0;
  if (r.pu.shoes > 0) {   // 跳蛋是“自杀式”的：撞上障碍物就整颗炸掉，替你挡下这一下
    r.pu.shoes = 0; rideK = 0; save.st.boom++; knock(o); r.invuln = 1.2; r.shake = 0.4; r.flash = Math.max(r.flash, 0.35); r.land = 0.14;
    Sfx.hit(); Sfx.pop(); vib([40, 20, 60]);
    burstAt(r.x, r.py + 0.9, 0, 34, ['#F4CF7E', '#FFE36B', '#FFFFFF', '#FFB000']);
    const p = toScreen(r.x, r.py + 1.2, 0);
    for (let i = 0; i < 10; i++) { const a = rand(0, TAU), sp = rand(160, 320); addPart({ type: 'star', x: p[0], y: p[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 520, life: rand(0.6, 0.9), size: rand(7, 11), col: pick(['#FFF6E2', '#F4CF7E']), rot: rand(0, TAU), vr: rand(-10, 10) }); }
    addPart({ type: 'text', txt: '砰！', x: p[0], y: p[1] - 30, vx: 0, vy: -60, g: 0, life: 0.9, size: 44, col: '#FF8A1F' });
    toast('跳蛋炸了！替你挡下一撞', 'warn', 1.5);
    return;
  }
  if (r.pu.shield > 0) {
    r.pu.shield = 0; Sfx.pop(); knock(o); r.invuln = 1.0; r.shake = 0.2;
    burstAt(r.x, r.py + 0.7, 0, 16, ['#BDE6FF', '#FFFFFF', '#7FD0FF']);
    toast('护罩挡住了！', 'good', 1.2);
    return;
  }
  Sfx.hit(); vib(side ? 40 : 90);
  r.hits++;
  r.shake = 0.35; r.stun = 1.1; r.invuln = 1.0; r.hurt = 1; r.combo = 0;
  burstAt(r.x, r.py + 0.8, 0, 12, ['#FFE14D', '#FF8A3D', '#FFFFFF']);
  if (side) { r.lane = r.prevLane; r.hitSlow = 0.6; } else { knock(o); r.hitSlow = 1.2; }
  if (r.chase > 0) caught(); else startChase();
}
function clearAhead(len) {
  const r = run;
  for (const o of r.obs) if (!o.fly && o.wz + o.d > r.dist - 1.5 && o.wz < r.dist + len) { o.hit = true; o.fly = true; o.fvx = 0; o.fvy = -1; o.fvz = 0; o.fr = 0; o.falpha = 0.6; }
}

/* ---------- 道具 ---------- */
function activate(type) {
  const r = run, dur = puDur(type);
  r.pu[type] = dur; save.st.pu |= PU_BIT[type] || 0; if (type === 'rocket') save.st.rockets++;
  if (type !== 'shoes') Sfx.power();
  toast(type === 'shoes' ? '跳蛋！点一下屏幕弹得超高' : PU[type].name + '！', 'good', type === 'shoes' ? 1.8 : 1.3);
  if (type === 'shoes') { Sfx.clip('egg', 1.0); r.flip = null; r.roll = null; burstAt(r.x, r.py + 0.6, 0, 18, ['#F4CF7E', '#FFFFFF', '#FFE36B']); }
  if (type === 'rocket') {
    Sfx.rocket(); r.flip = null; r.roll = null;
    r.slideT = 0; r.air = true;
    let L = r.lane;
    const end = r.dist + r.speed * dur - 6;
    let i = 0;
    for (let t = r.dist + 9; t < end; t += 2.0, i++) {
      if (i % 6 === 5) L = clamp(L + pick([-1, 1]), LMIN, LMAX);
      addEgg(L, t, FLY_Y + 0.6, -1);
    }
  }
}
function endRocket() {
  const r = run;
  r.air = true; r.vy = 0; r.invuln = Math.max(r.invuln, 1.6);
  clearAhead(r.speed * 1.6 + 6);
}

/* ---------- 奶金 ---------- */
function collectGold(n, sp) {
  const r = run;
  r.gold += n; save.gold += n; persist();
  Sfx.gold(); vib(25);
  const p = sp || toScreen(r.x, r.py + 1.5, 0);
  addPart({ type: 'text', txt: `+${n} 奶金`, x: p[0], y: p[1] - 24, vx: 0, vy: -70, g: 0, life: 1.0, size: 24, col: '#FFC21E' });
  sparkle(p[0], p[1], 14, ['#FFE36B', '#FFFFFF', '#FFC21E']);
  const pg = $('#pillGold'); pg.classList.remove('bump'); void pg.offsetWidth; pg.classList.add('bump');
}

/* ---------- 增强药水：变身西格奶，反过来追肥嘟嘟 ---------- */
const SIG_DUR = 16, SPIN_T = 0.95, TURN_T = 2.0;
function startSigma() {
  const r = run;
  if (r.sig) return;
  const c = r.chaser, near = c.on && !c.leaving;
  // 回头：先停下、跳起转身，镜头绕到正面，看见身后的肥嘟嘟吓一跳掉头就跑
  r.sig = { t: 0, dur: SIG_DUR, gap: 12, lane: 0, fx: 0, fy: 0, laneT: 1.8, hop: 0, sweat: 0,
    turn: TURN_T, bz: near ? Math.max(c.z, 3) : 18, bx: near ? c.x : r.x + pick([-1, 1]) * LW, brot: Math.PI, shocked: false, acc: 0 };
  r.chase = 0; c.on = false; c.leaving = false;
  clearAhead(16);
  r.pu.rocket = 0; r.pu.shield = 0; r.pu.shoes = 0; r.invuln = 0; r.stun = 0; r.hurt = 0;
  r.shake = 0.2; r.flip = null; r.roll = null; r.slideT = 0;
  r.spin = SPIN_T; r.morphed = false; r.air = true; r.vy = Math.max(r.vy, 10.5);   // 先跳起来，在空中转一圈，转到一半变身
  Sfx.gulp(); setTimeout(() => Sfx.transform(), 200); Sfx.musicFast(true);
  toast('变身西格奶！反追肥嘟嘟！', 'lvl', 2.2);
  burstAt(r.x, r.py + 1, 0, 26, ['#FFE14D', '#FFB000', '#FFFFFF']);
}
function endSigma(escaped) {
  const r = run;
  r.sig = null; CH.setFrogSkin(frog, save.skin, false);
  if (escaped) { toast('肥嘟嘟溜走了……再找一瓶药水！', 'warn', 1.8); Sfx.deny(); }
  Sfx.musicFast(false); r.invuln = Math.max(r.invuln, 1.2);
}
function updateTurn(dt) {
  const r = run, S = r.sig;
  S.turn -= dt;
  const k = 1 - S.turn / TURN_T;
  if (k < 0.5) { if (S.bz > 11) S.bz = Math.max(11, S.bz - 8 * dt); S.bx = damp(S.bx, r.x + 0.9, 2, dt); }   // 肥嘟嘟还在后面追
  else if (k < 0.7) {   // 看见西格奶，吓一跳
    if (!S.shocked) {
      S.shocked = true; Sfx.siren();
      const p = toScreen(S.bx, 2.6, S.bz);
      addPart({ type: 'text', txt: '！！', x: p[0], y: p[1], vx: 0, vy: -40, g: 0, life: 0.9, size: 40, col: '#FF4D3D' });
    }
    if ((S.sweat -= dt) <= 0) { S.sweat = 0.08; const p = toScreen(S.bx, 1.4, S.bz), sd = Math.random() < 0.5 ? -1 : 1; addPart({ type: 'drop', x: p[0] + sd * 16, y: p[1], vx: sd * rand(40, 90), vy: -rand(70, 130), g: 380, life: 0.5, size: 6, col: '#8FD8FF' }); }
  } else { S.brot = damp(S.brot, 0, 10, dt); S.bz += lerp(3, 16, (k - 0.7) / 0.3) * dt; }   // 掉头逃跑
  if (S.turn <= 0) swapTurn();
}
function swapTurn() {   // 镜头转到正面后，把世界“掉个头”：左右前后互换，前方换成一段新的路
  const r = run, S = r.sig;
  S.turn = 0;
  r.lane = -r.lane; r.prevLane = r.lane; r.x = -r.x;
  S.fx = -S.bx; S.lane = clamp(Math.round(S.fx / LW), LMIN, LMAX); S.gap = Math.max(S.bz, 22); S.fy = 0; S.laneT = 1.2;
  frogYaw = Math.PI; camSnap = true;
  const far = r.dist + 44;
  for (const o of r.obs) if (o.wz < far) { o.wz = -1e5; o.fly = false; }
  for (const p of r.pickups) if (p.wz < far && !p.taken) p.wz = -1e5;
  for (const e of r.eggList) if (e.wz < far) e.taken = true;
  r.nextRow = Math.max(r.nextRow, far);
  r.flash = Math.max(r.flash, 0.55);
  cleanup();
  toast('冲啊！抓住肥嘟嘟！', 'lvl', 1.6);
}
function updateSigma(dt) {
  const r = run, S = r.sig;
  if (S.turn > 0) { updateTurn(dt); return; }
  S.t += dt; S.acc = Math.min(1, S.acc + dt / 1.2);
  S.laneT -= dt; if (S.lock > 0) S.lock -= dt;
  if (S.laneT <= 0 && !(S.lock > 0)) {   // 肥嘟嘟东躲西藏地换道
    S.laneT = rand(0.8, 1.5) * lerp(1, 0.6, clamp(S.t / S.dur, 0, 1));
    S.lane = pick(LANES.filter((L) => Math.abs(L - S.lane) === 1)); S.hop = 0.4; S.lock = 0.5;   // 只能跳到相邻的道，跳完 0.5 秒内不能再换
  }
  S.fx = damp(S.fx, S.lane * LW, 7, dt);
  if (S.hop > 0) S.hop -= dt;
  const same = Math.abs(r.x - S.fx) < 0.85;
  if (S.dcd > 0) S.dcd -= dt;
  if (same && S.gap < 10 && !(S.dcd > 0) && !(S.lock > 0) && Math.random() < dt * 3.0) {   // 被追近了：往远离你的方向闪
    S.lane = pick(LANES.filter((L) => Math.abs(L - S.lane) === 1)); S.hop = 0.4; S.lock = 0.5; S.laneT = rand(0.6, 1.1); S.dcd = 0.8; S.gap += 1.5;
  }
  S.gap = clamp(S.gap + (same ? -4.6 * (0.3 + 0.7 * S.acc) : 2.2) * dt, 0, 34);
  const fz = r.dist + S.gap; let top = 0;   // 肥嘟嘟跳过路上的东西
  for (const o of r.obs) if (!o.hit && Math.abs(o.lane * LW - S.fx) < 0.8 && fz > o.wz - 1.2 && fz < o.wz + o.d + 1.2) top = Math.max(top, o.type === 'ramp' || o.type === 'truck' ? ROOF : o.y1 + 0.15);
  S.fy = damp(S.fy, top, 12, dt);
  if (S.gap < 9 && (S.sweat -= dt) <= 0) { S.sweat = 0.25; const p = toScreen(S.fx, S.fy + 1.3, -S.gap), sd = Math.random() < 0.5 ? -1 : 1; addPart({ type: 'drop', x: p[0] + sd * 14, y: p[1], vx: sd * rand(30, 70), vy: -rand(60, 110), g: 380, life: 0.45, size: 5, col: '#8FD8FF' }); }
  if (Math.random() < dt * 10) { const p = toScreen(r.x + rand(-0.7, 0.7), r.py + rand(0.3, 2.2), rand(-0.3, 0.3)); addPart({ type: 'star', x: p[0], y: p[1], vx: 0, vy: -40, g: 0, life: 0.5, size: rand(3, 6), col: pick(['#FFE36B', '#FFFFFF', '#FFC21E']), rot: 0, vr: 4 }); }
  if (S.gap < 1.4 && same && Math.abs(r.py - S.fy) < 1.8) { catchFei(); return; }
  if (S.t >= S.dur) endSigma(true);
}
function catchFei() {
  const r = run;
  state = 'winning'; stateT = 0; r.won = true;
  Sfx.musicStop(); Sfx.victory(); vib([50, 30, 120]);
  r.flash = 0.6; r.shake = 0.3;
  burstAt(r.sig.fx, r.sig.fy + 0.8, -r.sig.gap, 26, ['#FFE14D', '#FFB000', '#FFFFFF', '#FF8FB1']);
  toast('抓住肥嘟嘟啦！', 'lvl', 1.5);
}
function updateWinning(dt) {
  const r = run, S = r.sig; stateT += dt;
  r.speed *= Math.pow(0.02, dt); r.dist += r.speed * dt;
  r.x = damp(r.x, r.lane * LW, 12, dt);
  if (r.air || r.py > surfaceAt(r.x, r.dist) + 0.01) { r.vy -= GRAV * dt; r.py = Math.max(surfaceAt(r.x, r.dist), r.py + r.vy * dt); if (r.py <= surfaceAt(r.x, r.dist)) { r.air = false; r.vy = 0; } }
  S.gap = damp(S.gap, 0.9, 5, dt); S.fx = damp(S.fx, r.x + 1.1, 5, dt); S.fy = damp(S.fy, r.py, 8, dt);
  for (const k of ['shake', 'flash']) if (r[k] > 0) r[k] -= dt;
  updateFly(dt);
  if (stateT > 1.15) toOver(true);
}

/* ---------- 追击 ---------- */
function startChase() {
  const r = run, c = r.chaser;
  r.chaseDur = CHASE_T + 0.5 * Math.max(0, r.hits - 1);   // 每撞一次，甩掉肥嘟嘟要多跑 0.5 秒
  r.chase = r.chaseDur;
  if (!c.on) { c.on = true; c.side = r.lane >= 1 ? -1 : 1; c.x = r.x + c.side * 1.35; c.z = CAM.z + 3; }
  c.leaving = false;
  toast('肥嘟嘟追来了！', 'warn', 1.8); Sfx.siren(); Sfx.musicFast(true);
}
function endChase() { run.chaser.leaving = true; toast('甩掉肥嘟嘟啦！', 'good', 1.5); Sfx.escape(); Sfx.musicFast(false); }
function caught() {
  const r = run, c = r.chaser;
  save.st.caught++;
  state = 'catching'; stateT = 0; r.catchT = 0; r.pounced = false;
  if (!c.on) { c.on = true; c.x = r.x + 1.1; c.z = CAM.z + 1; }
  c.leaving = false; c.sx = c.x; c.sz = c.z; r.chase = 0;
  for (const k of PU_KEYS) r.pu[k] = 0;
  Sfx.musicStop(); updateHud();
}
function updateChaser(dt) {
  const r = run, c = r.chaser;
  if (!c.on) return;
  c.phase += dt * 8.5;
  if (c.leaving) {
    c.z = damp(c.z, CAM.z + 5, 1.4, dt); c.x = damp(c.x, r.x + c.side * 1.15, 2, dt);
    if (c.z > CAM.z + 2.5) c.on = false;
    return;
  }
  if (r.lane >= 1) c.side = -1; else if (r.lane <= -1) c.side = 1;
  const prog = 1 - r.chase / r.chaseDur;
  c.x = damp(c.x, r.x + c.side * 1.35, 3.2, dt);
  c.z = damp(c.z, 1.15 + 2.6 * prog * prog * prog + Math.sin(r.t * 2.3) * 0.15, 2.4, dt);
}

/* ---------- 每帧更新 ---------- */
function updatePlay(dt) {
  const r = run;
  r.t += dt;
  const target = speedAt(r.dist);
  if (r.hitSlow > 0) r.hitSlow -= dt;
  r.speed = target * (r.hitSlow > 0 ? 1 - 0.4 * clamp(r.hitSlow / 1.2, 0, 1) : 1) * (r.sig ? 1.12 * (r.sig.turn > 0 ? Math.max(0, 1 - (1 - r.sig.turn / TURN_T) * 4) : 0.25 + 0.75 * r.sig.acc) : 1);
  const dz = r.speed * dt;
  r.dist += dz;
  while (r.nextRow < r.dist + VIEW) spawnPattern(r.nextRow);
  spawnDecos();
  // 分段加速提示
  const lv = Math.floor(r.dist / 500);
  if (lv > r.level) {
    r.level = lv; Sfx.level();
    const txt = `加速！第 ${lv + 1} 段`;
    if (lv % 2 === 0) { toast('西格奶为你点赞！', 'lvl', 1.5); r.pendingToast = { t: 1.45, txt }; collectGold(1); } else toast(txt, 'lvl', 1.6);
  }
  if ((r.achT = (r.achT || 0) - dt) <= 0) { r.achT = 0.5; checkAch(); }
  if (r.pendingToast && (r.pendingToast.t -= dt) <= 0) { toast(r.pendingToast.txt, 'lvl', 1.6); r.pendingToast = null; }
  // 横向
  const xPrev = r.x, tx = r.lane * LW;
  r.x = damp(r.x, tx, 16, dt); if (Math.abs(r.x - tx) < 0.003) r.x = tx;
  // 纵向
  const surf = surfaceAt(r.x, r.dist);
  if (r.jumpBuf > 0) r.jumpBuf -= dt;
  if (r.pu.rocket > 0) {
    r.air = true; r.vy = 0; r.py = damp(r.py, FLY_Y, 3.5, dt); r.slideT = 0;
  } else if (r.air) {
    r.vy -= GRAV * dt; r.py += r.vy * dt;
    if (r.vy <= 0 && r.py <= surf) {
      r.py = surf; r.air = false; r.vy = 0; r.land = 0.14; Sfx.land(); dustAt(r.x, surf, 0);
      r.flipUsed = false;
      if (r.flip) {
        const ok = !r.flip.hit && r.flip.t / r.flip.dur > 0.82;
        r.flip = null;
        if (ok) {
          r.landPose = 0.55; r.flipReward = 0.22; r.land = 0;
          Sfx.flipLand();
          const p = toScreen(r.x, surf + 0.9, 0);
          addPart({ type: 'text', txt: '帅气落地！', x: p[0], y: p[1] - 40, vx: 0, vy: -50, g: 0, life: 0.9, size: 26, col: '#FFD84A' });
          sparkle(p[0], p[1], 14, ['#FFFFFF', '#FFE36B', '#9FE0FF']);
        }
      }
      if (r.queueSlide) { r.queueSlide = false; r.slideT = SLIDE_T; Sfx.slide(); }
      else if (r.jumpBuf > 0) { r.jumpBuf = 0; doJump(); }
    }
  } else if (surf > r.py + 0.001) { if (surf - r.py < 0.8) r.py = surf; }
  else if (surf < r.py - 0.06) { r.air = true; r.vy = 0; }
  else r.py = surf;
  // 在倾斜奶车上低于车顶（比如从坡道中间跳起来、侧面换道过来）：把奶蛙托上车顶，不算撞车
  if (r.pu.rocket <= 0) {
    const rs = surfaceAt(r.x, r.dist, true);
    if (rs > r.py + 0.005) {
      const gap = rs - r.py;
      r.py = Math.min(rs, r.py + Math.max(gap * (1 - Math.exp(-26 * dt)), 5 * dt));
      if (r.vy < 0) r.vy = 0;
    }
  }
  if (r.slideT > 0) r.slideT -= dt;
  r.slideAmt = damp(r.slideAmt, r.slideT > 0 ? 1 : 0, 18, dt);
  if (r.flip) r.flip.t += dt;
  if (r.roll) {   // 前滚翻：一直保持趴低的判定，滚完没撞到东西就给奶蛋
    r.roll.t += dt; r.slideT = Math.max(r.slideT, 0.05);
    if (r.roll.t >= ROLL_T) {
      const ok = !r.roll.hit; r.roll = null; r.slideT = 0.12;
      if (ok) {
        r.eggs += 3; r.rolls = (r.rolls || 0) + 1; save.st.rolls = (save.st.rolls || 0) + 1; bumpEggs();
        for (let i = 0; i < 3; i++) setTimeout(() => Sfx.egg(i + 3), i * 70);
        const p = toScreen(r.x, r.py + 1.2, 0);
        addPart({ type: 'text', txt: '前滚翻！+3 奶蛋', x: p[0], y: p[1] - 20, vx: 0, vy: -70, g: 0, life: 0.9, size: 24, col: '#FFB000' });
        sparkle(p[0], p[1], 12);
      }
    }
  }
  if (r.landPose > 0) r.landPose -= dt;
  if (r.flipReward > 0) {
    r.flipReward -= dt;
    if (r.flipReward <= 0) {   // 落地后没撞到东西：奖励 3 个奶蛋
      r.eggs += 3; r.flips++; bumpEggs();
      for (let i = 0; i < 3; i++) setTimeout(() => Sfx.egg(i + 3), i * 70);
      const p = toScreen(r.x, r.py + 1.5, 0);
      addPart({ type: 'text', txt: '+3 奶蛋', x: p[0], y: p[1], vx: 0, vy: -70, g: 0, life: 0.9, size: 24, col: '#FFB000' });
      sparkle(p[0], p[1], 10);
    }
  }
  if (r.land > 0) r.land -= dt;
  r.phase += dt * (7 + r.speed * 0.4);
  for (const k of ['invuln', 'stun', 'shake']) if (r[k] > 0) r[k] -= dt;
  if (r.hurt > 0) r.hurt -= dt * 1.6;
  if (r.flash > 0) r.flash -= dt * 2.5;
  if (r.comboT > 0) { r.comboT -= dt; if (r.comboT <= 0) r.combo = 0; }
  // 道具计时
  for (const k of PU_KEYS) if (r.pu[k] > 0) { r.pu[k] -= dt; if (r.pu[k] <= 0) { r.pu[k] = 0; if (k === 'rocket') endRocket(); } }
  // 障碍
  for (const o of r.obs) {
    if (o.mv && !o.fly) o.wz -= o.mv * dt;
    if (o.type === 'wheel' && !o.fly) o.roll += ((r.speed + o.mv) * dt) / 0.48;
  }
  updateFly(dt);
  collide(dz, dt, xPrev);
  if (state !== 'play') return;
  updateEggs(dt, dz);
  updatePickups(dz);
  for (const o of r.obs) {
    if (o.hint && !o.hintShown && o.wz - r.dist < r.speed * 1.5) {
      o.hintShown = true; toast(o.hint, 'tip', 1.8);
      if (o.lastTut) { save.tut = true; persist(); }
    }
    if (o.type === 'ramp' && !save.tutRamp && o.wz - r.dist < r.speed * 1.6 && o.wz > r.dist) {
      save.tutRamp = true; persist(); toast('顺着坡道跑上车顶！', 'tip', 1.8);
    }
    if (o.type === 'dog' && !save.tutDog && !o.hit && o.lane === r.lane && o.wz - r.dist < r.speed * 1.6 && o.wz > r.dist) {
      save.tutDog = true; persist(); toast(isTouch ? '向下滑 · 从奶狗底下钻过去！' : '按 ↓ 从奶狗底下钻过去！', 'tip', 1.8);
    }
  }
  if (r.chase > 0) {
    r.chase -= dt;
    r.sweatT -= dt; if (r.sweatT <= 0) { r.sweatT = 0.22; sweat(); }
    if (r.chase <= 0) { r.chase = 0; endChase(); }
  }
  updateChaser(dt);
  if (r.sig) updateSigma(dt);
  if (r.grow > 0) r.grow -= dt;
  if (r.spin > 0) {
    r.spin -= dt;
    if (Math.random() < dt * 40) { const p = toScreen(r.x + rand(-0.8, 0.8), r.py + rand(0.2, 2.2), rand(-0.4, 0.4)); addPart({ type: 'star', x: p[0], y: p[1], vx: rand(-60, 60), vy: rand(-90, -20), g: 60, life: 0.6, size: rand(4, 8), col: pick(['#FFE36B', '#FFFFFF', '#FFC21E']), rot: 0, vr: 6 }); }
    if (!r.morphed && r.spin < SPIN_T * 0.5) {
      r.morphed = true; r.grow = 0.6; r.flash = 0.75;
      CH.setFrogSkin(frog, save.skin, true);
      burstAt(r.x, r.py + 1, 0, 30, ['#FFE14D', '#FFB000', '#FFFFFF']);
    }
  }
  for (const p of r.pickups) if (p.type === 'potion' && !p.taken && !p.hinted && p.wz - r.dist < r.speed * 1.7) { p.hinted = true; toast('前面有增强药水！快去捡！', 'tip', 1.6); }
  cleanup();
}
function updateFly(dt) {
  for (const o of run.obs) if (o.fly) {
    o.wz += o.fvz * dt; o.fx += o.fvx * dt; o.fy += o.fvy * dt; o.fvy -= 20 * dt; o.falpha -= dt * 1.3;
  }
}
function updateEggs(dt, dz) {
  const r = run, h = r.slideT > 0 ? H_SLIDE : H_STAND, mag = r.pu.magnet > 0;
  for (const e of r.eggList) {
    if (e.taken) continue;
    if (e.mag) {
      const tx = r.x, ty = r.py + 0.65, dx = tx - e.mx, dy = ty - e.my, dzz = -e.mz;
      const d = Math.hypot(dx, dy, dzz);
      e.sp += 70 * dt;
      const st = e.sp * dt;
      if (d <= st + 0.35) { take(e); continue; }
      e.mx += (dx / d) * st; e.my += (dy / d) * st; e.mz += (dzz / d) * st;
      continue;
    }
    const t = e.wz - r.dist;
    if (mag && t < 17 && t > -0.6 && Math.abs(e.lane * LW - r.x) < 3.3 && Math.abs(e.y - r.py) < 4.2) {
      e.mag = true; e.mx = e.lane * LW; e.my = e.y; e.mz = -t; e.sp = r.speed * 0.5; continue;
    }
    if (t > 0.5 || t + dz < -0.5) continue;
    if (Math.abs(e.lane * LW - r.x) > 0.72) continue;
    if (e.y < r.py - 0.3 || e.y > r.py + h + 0.3) continue;
    take(e);
  }
}
const _wp = new THREE.Vector3();
function take(e) {
  const r = run;
  e.taken = true;
  const n = r.pu.double > 0 ? 2 : 1;
  r.eggs += n; r.combo++; r.comboT = 0.6;
  Sfx.egg(r.combo);
  const x = e.mag ? e.mx : e.lane * LW, y = e.mag ? e.my : e.y, z = e.mag ? e.mz : Math.max(-(e.wz - r.dist), -0.2);
  const p = toScreen(x, y, z);
  sparkle(p[0], p[1], n > 1 ? 10 : 7);
  if (n > 1) addPart({ type: 'text', txt: '+2', x: p[0], y: p[1] - 10, vx: 0, vy: -90, g: 0, life: 0.6, size: 22, col: '#FFB000' });
  bumpEggs();
}
function updatePickups(dz) {
  const r = run, h = r.slideT > 0 ? H_SLIDE : H_STAND;
  for (const p of r.pickups) {
    if (p.taken) continue;
    const t = p.wz - r.dist;
    if (t > 0.6 || t + dz < -0.6) continue;
    if (Math.abs(p.lane * LW - r.x) > 0.85) continue;
    if (p.y < r.py - 0.5 || p.y > r.py + h + 0.5) continue;
    p.taken = true; p.mesh.visible = false;
    const s = toScreen(p.lane * LW, p.y, 0);
    sparkle(s[0], s[1], p.sway ? 26 : 16, ['#FFFFFF', '#FFE36B', '#9FE0FF']);
    if (p.fig) collectFig(p.fig);
    else if (p.type === 'gold') collectGold(1, s);
    else if (p.type === 'potion') startSigma();
    else activate(p.type);
  }
}
function cleanup() {
  const r = run, lim = BEHIND;
  for (let i = r.obs.length - 1; i >= 0; i--) {
    const o = r.obs[i];
    if (r.dist - o.wz - o.d > lim || (o.fly && o.falpha <= 0)) { freeObs(o); r.obs.splice(i, 1); }
  }
  for (let i = r.decos.length - 1; i >= 0; i--) { const d = r.decos[i]; if (r.dist - d.wz > lim + (d.kind === 'sigma' ? 10 : 0)) { freeDeco(d); r.decos.splice(i, 1); } }
  if (r.zones.length > 12) r.zones = r.zones.filter((z) => z.z1 > r.dist - lim);
  for (let i = r.pickups.length - 1; i >= 0; i--) { const p = r.pickups[i]; if (p.taken || r.dist - p.wz > lim) { if (!p.taken) freePick(p); else pickPools[p.type].push(p.mesh); r.pickups.splice(i, 1); } }
  if (r.eggList.length > 40) r.eggList = r.eggList.filter((e) => !e.taken && (e.mag || r.dist - e.wz < 3));
}
function updateCatch(dt) {
  const r = run; r.catchT += dt; stateT += dt;
  r.speed *= Math.pow(0.03, dt); r.dist += r.speed * dt;
  r.x = damp(r.x, r.lane * LW, 12, dt);
  if (r.air || r.py > surfaceAt(r.x, r.dist) + 0.01) { r.vy -= GRAV * dt; r.py = Math.max(surfaceAt(r.x, r.dist), r.py + r.vy * dt); }
  r.slideT = 0; r.slideAmt = damp(r.slideAmt, 0, 12, dt);
  for (const k of ['shake', 'stun', 'flash']) if (r[k] > 0) r[k] -= dt * (k === 'flash' ? 1.8 : 1);
  if (r.hurt > 0) r.hurt -= dt * 1.6;
  const c = r.chaser, k = clamp(r.catchT / 0.5, 0, 1), e = k * k * (3 - 2 * k);
  c.x = lerp(c.sx, r.x, e); c.z = lerp(c.sz, 0.55, e); c.jy = Math.sin(k * Math.PI) * 1.6 + r.py * e; c.phase += dt * 6;
  if (k >= 1 && !r.pounced) {
    r.pounced = true; r.flash = 0.75; r.shake = 0.35; Sfx.pounce(); vib([60, 40, 120]);
    burstAt(r.x, r.py + 0.6, 0, 16, ['#FFE14D', '#FF8A3D', '#FFFFFF']);
  }
  updateFly(dt);
  if (r.catchT > 1.25) toOver();
}
function updateRevive(dt) {
  stateT += dt;
  const r = run;
  for (const k of ['shake', 'flash']) if (r[k] > 0) r[k] -= dt;
  updateChaser(dt); updateFly(dt);
  if (stateT > 1.0) { state = 'play'; toast('冲呀！', 'good', 1); Sfx.musicStart(); }
}

/* ================= 渲染同步 ================= */
const _o = new THREE.Object3D();
const EGG_MAX = 300;
let eggIM, shIM;
function buildEggInstances() {
  eggIM = new THREE.InstancedMesh(G.egg, MAT.egg, EGG_MAX); eggIM.frustumCulled = false; eggIM.castShadow = true; eggIM.count = 0; scene.add(eggIM);
  shIM = new THREE.InstancedMesh(new THREE.CircleGeometry(0.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4A3A18', transparent: true, opacity: 0.2, depthWrite: false }), EGG_MAX);
  shIM.frustumCulled = false; shIM.count = 0; scene.add(shIM);
}
function syncEggs() {
  let n = 0, ns = 0;
  const put = (x, y, z, ry, s, base) => {
    _o.position.set(x, y, z); _o.rotation.set(0, ry, 0); _o.scale.setScalar(s); _o.updateMatrix();
    eggIM.setMatrixAt(n++, _o.matrix);
    if (base >= 0) { _o.position.set(x, base + 0.012, z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(s); _o.updateMatrix(); shIM.setMatrixAt(ns++, _o.matrix); }
  };
  if (state === 'menu' || state === 'shop' || state === 'loading') {
    const spots = [[-0.82, 0.25, 0.25], [-1.2, -0.25, 0.6], [-0.95, 0.75, 1.15], [2.15, 0.1, 0.4]];
    spots.forEach(([x, z, ph], i) => {
      const hop = Math.max(0, Math.sin(nowT * 4.2 + ph * 6));
      put(x, 0.31 + hop * 0.32, z, Math.sin(nowT * 1.5 + i) * 0.5 + (x > 0 ? -0.5 : 0.4), 1, 0);
    });
  } else if (run) {
    const r = run;
    for (const e of r.eggList) {
      if (e.taken || n >= EGG_MAX) continue;
      if (e.mag) { put(e.mx, e.my, e.mz, nowT * 8, 0.9, -1); continue; }
      const z = r.dist - e.wz;
      if (z < -VIEW || z > 2) continue;
      put(e.lane * LW, e.y + Math.sin(nowT * 4 + e.ph) * 0.08, z, Math.sin(nowT * 2.4 + e.ph) * 0.75, 1, e.base);
    }
  }
  eggIM.count = n; shIM.count = ns;
  eggIM.instanceMatrix.needsUpdate = true; shIM.instanceMatrix.needsUpdate = true;
}
function syncWorld(dt) {
  const r = run, d = r.dist;
  grass.position.z = -310 + (d % 8);
  road.position.z = -310 + (d % 6);
  curbs.position.z = d % 2.4;
  hedges.position.z = d % 2.4;
  for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 200) c.position.x = -200; }
  for (const o of r.obs) {
    const m = o.mesh;
    let y = o.fy + (o.type === 'wheel' ? 0.48 : 0);
    m.position.set(o.lane * LW + o.fx, y, d - o.wz - o.d / 2);
    if (o.type === 'wheel') m.userData.spin.rotation.x = o.roll;
    if (o.fly) { m.rotation.z += o.fr * dt; m.rotation.x += o.fr * 0.5 * dt; m.scale.setScalar(Math.max(0.01, o.falpha)); }
    if (o.mv && m.userData.glow) { const f = 1.2 + Math.sin(nowT * 18) * 0.12; m.userData.glow.forEach((s) => s.scale.set(f, f, 1)); }
  }
  for (const dc of r.decos) dc.mesh.position.set(dc.x, 0, d - dc.wz);
  for (const p of r.pickups) {
    if (p.taken) continue;
    p.mesh.position.set(p.lane * LW, p.y + Math.sin(nowT * 3 + p.ph) * 0.12, d - p.wz);
    p.mesh.userData.model.rotation.y = p.sway ? Math.sin(nowT * 2.2 + p.ph) * 0.55 : nowT * 2.2 + p.ph;
    const fl = p.mesh.userData.model.getObjectByName('flame'); if (fl) fl.scale.y = 0.8 + Math.random() * 0.4;
  }
  syncEggs();
}
let laughDur = 3.4, laughLv = 0;
function poseFrog(dt) {
  const F = frog, r = run, t = nowT;
  laughLv = damp(laughLv, state === 'over' ? Sfx.laughLevel() : 0, 22, dt);
  const mode = state === 'over' ? (r.sad ? 'sad' : 'laugh') : state === 'menu' || state === 'shop' || state === 'loading' ? 'idle' : 'run';
  let yawT = mode === 'run' ? Math.PI : mode === 'laugh' ? 0.72 : mode === 'sad' ? 0.3 : 0;
  if (state === 'play' && r.chase > 0 && r.pu.rocket <= 0) { const g = (t * 0.8) % 1.6; if (g < 0.4) yawT = Math.PI - 0.95 * Math.sin((g / 0.4) * Math.PI); }
  if (r && r.sig && r.sig.turn > 0 && mode === 'run') yawT = 0;   // 回头面对肥嘟嘟
  frogYaw = damp(frogYaw, yawT, mode === 'run' ? 12 : 8, dt);
  F.root.rotation.y = frogYaw;
  if (r && r.spin > 0 && mode === 'run') { const k = 1 - r.spin / SPIN_T; F.root.rotation.y += TAU * (1 - Math.pow(1 - k, 2.2)); }   // 变身：空中水平转一圈
  F.root.position.set(mode === 'idle' ? 0 : r.x, mode === 'idle' ? 0 : r.py, 0);
  CH.poseFrog(F, {
    mode, t, ph: r ? r.phase : 0,
    air: !!(r && r.air), rocket: !!(r && r.pu.rocket > 0), slide: r ? r.slideAmt : 0,
    land: r && r.land > 0 ? r.land / 0.14 : 0,
    lean: r ? clamp((r.lane * LW - r.x) * 0.22, -0.3, 0.3) * (frogYaw > 1.5 ? 1 : -1) : 0,
    squash: state === 'catching' && r.pounced,
    flip: r && r.flip && mode === 'run' ? clamp(r.flip.t / r.flip.dur, 0, 1) : null,
    roll: r && r.roll && mode === 'run' ? clamp(r.roll.t / ROLL_T, 0, 1) : null,
    landPose: r && mode === 'run' && r.landPose > 0 ? r.landPose / 0.55 : 0,
    spin: !!(r && r.spin > 0 && mode === 'run'),
    ride: rideK,
    blink: mode === 'idle' && t % 3.4 < 0.12,
    laughK: mode === 'laugh' ? (overT < laughDur + 0.3 ? 0.35 + 0.65 * laughLv : 0.4) : 1,
    open: mode === 'laugh' && Sfx.ready ? (overT < laughDur + 0.3 ? laughLv : 0.35 + 0.1 * Math.sin(t * 3)) : undefined,
  });
  // 道具外观
  const pu = r && mode === 'run' ? r.pu : null;
  F.bubble.visible = !!(pu && pu.shield > 0);
  if (F.bubble.visible) { F.bubble.scale.setScalar(1 + Math.sin(t * 6) * 0.03); F.bubble.material.opacity = pu.shield < 2 && Math.floor(t * 8) % 2 ? 0.08 : 0.24; }
  frogRocket.visible = !!(pu && pu.rocket > 0);
  if (frogRocket.visible) { const fl = frogRocket.getObjectByName('flame'); fl.scale.set(1.3, 1.6 + Math.random() * 0.8, 1.3); }
  frogMagnet.visible = !!(pu && pu.magnet > 0);
  if (frogMagnet.visible) { frogMagnet.rotation.y = t * 4; frogMagnet.position.y = Math.sin(t * 5) * 0.06; }
  // 跳蛋：骑在一个巨型奶蛋上，蛋一路弹跳
  rideK = damp(rideK, pu && pu.shoes > 0 && !F.sigma ? 1 : 0, 10, dt);
  rideEgg.visible = rideK > 0.02;
  if (rideEgg.visible) {
    const sl = r.slideAmt || 0, onG = !r.air, bob = onG ? Math.abs(Math.sin(r.phase * 0.5)) : 0.6;
    const land = r.land > 0 ? r.land / 0.14 : 0, sq = (onG ? (1 - bob) * 0.1 : -0.06) + land * 0.22 + sl * 0.4;
    const lift = (1.05 - 0.5 * sl - 0.25 * land + (onG ? bob * 0.22 : 0)) * rideK;
    F.root.position.y += lift;
    rideEgg.position.set(0, -lift + (0.8 * (1 - sq)) * rideK, 0);
    const k = 2.6 * rideK; rideEgg.scale.set(k * (1 + sq * 0.6), k * (1 - sq), k * (1 + sq * 0.6));
    rideEgg.rotation.set(onG ? Math.sin(r.phase * 0.5) * 0.06 : -0.15, 0, 0);
  }
  F.mats.foot.color.set('#6C604E');
  F.stars.visible = !!(r && r.stun > 0 && mode === 'run' && !(state === 'catching' && r.pounced));
  if (F.stars.visible) F.stars.children.forEach((s, i) => { const a = t * 6 + (i * TAU) / 3; s.position.set(Math.cos(a) * 0.35, Math.sin(t * 9 + i) * 0.05, Math.sin(a) * 0.35); s.rotation.y = t * 5; });
  // 无敌闪烁
  F.root.visible = !(r && r.invuln > 0 && state === 'play' && mode === 'run' && Math.floor(r.invuln * 12) % 2 === 0);
  // 奶神：身后金色辉光、脚下金色光圈、不停往上冒的金色星光
  const god = F.skin === 'god' && !F.sigma && F.root.visible;
  godAura.visible = god; godRing.visible = god;
  if (god) {
    const k = 2.7 + Math.sin(t * 3) * 0.25, P = F.root.position;
    godAura.scale.set(k * 1.05, k * 1.25, 1); godAura.position.set(P.x, P.y + 0.95, P.z - 0.9); godAura.material.opacity = 0.65;
    godRing.position.set(P.x, (mode === 'run' ? surfaceAt(P.x, run ? run.dist : 0) : P.y) + 0.03, P.z); godRing.rotation.y = t * 1.5; godRing.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
    if (Math.random() < dt * 9) { const p = toScreen(P.x + rand(-0.6, 0.6), P.y + rand(0.1, 1.6), P.z + rand(-0.3, 0.3)); addPart({ type: 'star', x: p[0], y: p[1], vx: rand(-15, 15), vy: -rand(40, 90), g: 0, life: rand(0.6, 1.1), size: rand(3, 6), col: pick(['#FFE36B', '#FFFFFF', '#FFC21E']), rot: 0, vr: 3 }); }
  }
  // 喝药水变身：先一下子长大，再带着金光
  const gk = r && r.grow > 0 ? 1 - r.grow / 0.6 : 1;
  F.root.scale.setScalar(gk < 1 ? 0.77 + 0.23 * gk + Math.sin(gk * 20) * 0.04 * (1 - gk) : 1);
  const spinning = r && r.spin > 0 && state === 'play';
  sigAura.visible = (!!F.sigma || spinning) && state !== 'menu';
  if (sigAura.visible && spinning) { const k = 2.2 + 3.5 * Math.sin((1 - r.spin / SPIN_T) * Math.PI); sigAura.scale.set(k, k * 1.2, 1); sigAura.position.set(F.root.position.x, F.root.position.y + 0.9, F.root.position.z + 0.3); sigAura.material.opacity = 0.95; }
  else if (sigAura.visible) { const k = 2.5 + Math.sin(t * 7) * 0.18; sigAura.scale.set(k * 1.1, k * 1.25, 1); sigAura.position.set(F.root.position.x, F.root.position.y + 1.1, F.root.position.z - 1.4); sigAura.material.opacity = state === 'over' ? 0.2 : 0.28; }
}
function poseFei(dt) {
  const E = fei, r = run, t = nowT;
  let vis = false, mode = 'idle', ph = 0;
  if (state === 'menu' || state === 'shop' || state === 'loading') {
    vis = true;
    E.root.position.set(1.32, Math.abs(Math.sin(t * 2.2)) * 0.06, -0.6); E.root.rotation.y = -0.38;
  } else if (state === 'over') {
    vis = true; mode = r.won ? 'dizzy' : 'grab';
    E.root.position.set(r.x + (r.won ? 1.25 : 0.88), r.py, r.won ? -0.55 : -0.72); E.root.rotation.y = r.won ? -0.6 : -0.35;
  } else if (r && r.sig && (state === 'play' || state === 'winning' || state === 'paused')) {
    vis = true; const S = r.sig;
    if (S.turn > 0) {
      const k = 1 - S.turn / TURN_T;
      mode = k < 0.5 || k >= 0.7 ? 'chase' : 'idle'; ph = nowT * 9;
      const hop = mode === 'chase' ? Math.abs(Math.sin(nowT * 9)) * 0.3 : Math.max(0, Math.sin(((k - 0.5) / 0.2) * Math.PI)) * 0.8;
      E.root.position.set(S.bx, hop, S.bz); E.root.rotation.y = S.brot + (mode === 'idle' ? Math.sin(nowT * 30) * 0.12 : 0);
    } else if (state === 'winning') { mode = stateT > 0.25 ? 'dizzy' : 'chase'; E.root.position.set(S.fx, S.fy, -S.gap); E.root.rotation.y = Math.PI * 0.75; }
    else {
      mode = 'chase'; ph = nowT * 9;
      const hop = Math.abs(Math.sin(nowT * 9)) * 0.3 + (S.hop > 0 ? Math.sin((S.hop / 0.4) * Math.PI) * 0.7 : 0);
      E.root.position.set(S.fx, S.fy + hop, -S.gap); E.root.rotation.y = Math.PI + (S.gap < 7 ? Math.sin(nowT * 7) * 0.6 : 0);
    }
  } else if (r && r.chaser.on) {
    vis = true; mode = 'chase';
    const c = r.chaser; ph = c.phase;
    const hop = state === 'catching' ? c.jy : Math.abs(Math.sin(c.phase)) * 0.35;
    E.root.position.set(c.x, hop, c.z); E.root.rotation.y = Math.PI;
  }
  if (vis) CH.poseFei(E, { mode, t, ph, blink: mode !== 'chase' && t % 3.9 < 0.12 });
  E.root.visible = vis;
}
const _cv = new THREE.Vector3();
const camCur = { pos: new THREE.Vector3(0, 5, 9), look: new THREE.Vector3(0, 1, -10), ox: 0, oy: 0, fov: 60 };
const camTgt = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ox: 0, oy: 0, fov: 60 };
let camSnap = true, regions = null;
function computeRegions() {
  regions = {};
  const m = $('#menu'), mt = $('#menu .mtop'), mb = $('#menu .mbottom');
  if (m.classList.contains('on') && mt.offsetHeight) {
    regions.menu = LAND ? { x0: 0, x1: Math.min(mt.offsetLeft, mb.offsetLeft), y0: SAFE_T + 10, y1: H - 10 }
      : { x0: 0, x1: W, y0: mt.offsetTop + mt.offsetHeight + 4, y1: mb.offsetTop - 4 };
  }
  let s = $('#shop'), sp = $('#shop .panel');
  for (const id of ['dex', 'ward', 'gacha', 'ach']) if (!(s.classList.contains('on') && sp.offsetHeight)) { s = $('#' + id); sp = $('#' + id + ' .panel'); }
  if (s.classList.contains('on') && sp.offsetHeight) regions.menu = regions.menu || (LAND ? { x0: 0, x1: sp.offsetLeft, y0: 10, y1: H - 10 } : { x0: 0, x1: W, y0: SAFE_T + 10, y1: sp.offsetTop });
  const o = $('#over'), op = $('#over .panel');
  if (o.classList.contains('on') && op.offsetHeight) {
    regions.over = LAND ? { x0: 0, x1: op.offsetLeft - 10, y0: SAFE_T + 14, y1: H - 12 } : { x0: 0, x1: W, y0: SAFE_T + 60, y1: op.offsetTop - 8 };
  }
  layoutDirty = false;
}
function frameShot(c, sw, sh, R, elev = 0.16) {
  const fov = LAND ? 38 : 42, t = Math.tan((fov * Math.PI) / 360);
  const rw = Math.max(80, R.x1 - R.x0), rh = Math.max(80, R.y1 - R.y0);
  const d = Math.max((sh * H) / (1.5 * rh * t), (sw * H) / (1.8 * rw * t), 2.4);
  camTgt.pos.set(c[0], c[1] + d * elev, c[2] + d);
  camTgt.look.set(c[0], c[1], c[2]);
  camTgt.ox = W / 2 - (R.x0 + R.x1) / 2; camTgt.oy = H / 2 - (R.y0 + R.y1) / 2; camTgt.fov = fov;
}
function updateCamera(dt) {
  if (layoutDirty || !regions) computeRegions();
  const r = run;
  if ((state === 'menu' || state === 'shop' || state === 'loading') && regions.menu) frameShot([0.42, 0.95, 0], 3.3, 2.2, regions.menu);
  else if (state === 'over' && regions.over) { if (r.won) frameShot([r.x + 0.5, r.py + 1.15, -0.3], 3.3, 2.6, regions.over, 0.07); else frameShot([r.x + 0.42, r.py + 0.95, -0.3], 2.6, 2.2, regions.over, 0.07); }
  else {
    const lift = clamp(r.py, 0, FLY_Y + 0.5) * 0.8, cx = r.x * 0.72;
    camTgt.pos.set(cx, CAM.y + lift, CAM.z); camTgt.look.set(cx * 0.82, CAM.ly + lift * 0.9, CAM.lz);
    camTgt.ox = 0; camTgt.oy = 0;
    camTgt.fov = CAM.fov + clamp((r.speed - 12) * 0.3, 0, 6) + (r.pu.rocket > 0 ? 5 : 0);
    if (r.sig && r.sig.turn > 0 && state === 'play') {   // 回头：镜头绕着奶蛙转半圈
      const k = clamp((1 - r.sig.turn / TURN_T - 0.12) / 0.8, 0, 1), th = Math.PI * k * k * (3 - 2 * k), cs = Math.cos(th), sn = Math.sin(th);
      for (const v of [camTgt.pos, camTgt.look]) { const x = v.x - r.x, z = v.z; v.x = r.x + x * cs + z * sn; v.z = -x * sn + z * cs; }
      camCur.pos.copy(camTgt.pos); camCur.look.copy(camTgt.look);
    }
  }
  if (camSnap) {
    camCur.pos.copy(camTgt.pos); camCur.look.copy(camTgt.look); camCur.ox = camTgt.ox; camCur.oy = camTgt.oy; camCur.fov = camTgt.fov; camSnap = false;
  } else {
    const play = state === 'play' || state === 'paused';
    const kx = play ? 8 : 4, ky = play ? 5 : 4;
    camCur.pos.x = damp(camCur.pos.x, camTgt.pos.x, kx, dt); camCur.pos.y = damp(camCur.pos.y, camTgt.pos.y, ky, dt); camCur.pos.z = damp(camCur.pos.z, camTgt.pos.z, ky, dt);
    camCur.look.x = damp(camCur.look.x, camTgt.look.x, kx, dt); camCur.look.y = damp(camCur.look.y, camTgt.look.y, ky, dt); camCur.look.z = damp(camCur.look.z, camTgt.look.z, ky, dt);
    camCur.ox = damp(camCur.ox, camTgt.ox, 4, dt); camCur.oy = damp(camCur.oy, camTgt.oy, 4, dt); camCur.fov = damp(camCur.fov, camTgt.fov, 4, dt);
  }
  camera.position.copy(camCur.pos);
  if (r && r.shake > 0) { camera.position.x += rand(-1, 1) * r.shake * 0.45; camera.position.y += rand(-1, 1) * r.shake * 0.35; }
  camera.lookAt(camCur.look);
  camera.fov = camCur.fov;
  if (Math.abs(camCur.ox) > 0.5 || Math.abs(camCur.oy) > 0.5) camera.setViewOffset(W, H, camCur.ox, camCur.oy, W, H);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
}

/* ================= 2D 特效层 ================= */
const _sv = new THREE.Vector3();
function toScreen(x, y, z) { _sv.set(x, y, z).project(camera); return [((_sv.x + 1) / 2) * W, ((1 - _sv.y) / 2) * H, _sv.z]; }
function addPart(p) { p.max = p.life; parts.push(p); }
function sparkle(x, y, n, cols) {
  cols = cols || ['#FFE36B', '#FFFFFF', '#FFC23D'];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rand(-0.2, 0.2), sp = rand(90, 200); addPart({ type: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 220, life: rand(0.35, 0.6), size: rand(4, 7), col: pick(cols), rot: rand(0, TAU), vr: rand(-8, 8) }); }
}
function burstAt(x, y, z, n, cols) { const p = toScreen(x, y, z); for (let i = 0; i < n; i++) { const a = rand(0, TAU), sp = rand(140, 300); addPart({ type: 'star', x: p[0], y: p[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 300, life: rand(0.4, 0.75), size: rand(6, 11), col: pick(cols), rot: rand(0, TAU), vr: rand(-10, 10) }); } }
function dustAt(x, y, z) { const p = toScreen(x, y, z); for (let i = 0; i < 7; i++) addPart({ type: 'dot', x: p[0] + rand(-24, 24), y: p[1] - rand(0, 6), vx: rand(-70, 70), vy: rand(-55, -15), g: 40, life: rand(0.3, 0.5), size: rand(5, 10), col: 'rgba(255,248,225,0.9)' }); }
function sweat() { const r = run, p = toScreen(r.x, r.py + (r.slideT > 0 ? 0.6 : 1.3), 0), s = Math.random() < 0.5 ? -1 : 1; addPart({ type: 'drop', x: p[0] + s * 26, y: p[1], vx: s * rand(40, 90), vy: -rand(80, 140), g: 420, life: 0.5, size: 6, col: '#8FD8FF' }); }
function star2d(x, y, r, col, rot) { fx.beginPath(); for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5 - Math.PI / 2, q = i % 2 ? r * 0.45 : r; fx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } fx.closePath(); fx.fillStyle = col; fx.fill(); }
function updParts(dt) { for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; if (p.vr) p.rot += p.vr * dt; } for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1); }
let hahaT = 0;
function spawnHaha(dt) {
  hahaT -= dt;
  if (hahaT > 0) return;
  if (run.sad) {   // 悲伤奶：飘出"唉……"，掉眼泪
    hahaT = 1.1;
    (frog.sigma ? frog.sig.head : frog.headG).getWorldPosition(_wp);
    const p = toScreen(_wp.x, _wp.y + 1.25, _wp.z), q = toScreen(_wp.x, _wp.y + 1.0, _wp.z + 0.2);
    addPart({ type: 'text', txt: '唉……', x: p[0] - 30, y: p[1] - 20, vx: -12, vy: -26, g: 0, life: 1.8, size: 24, col: '#7FB8FF' });
    for (const s of [-1, 1]) addPart({ type: 'drop', x: q[0] + s * 16, y: q[1], vx: s * 10, vy: 30, g: 300, life: 0.7, size: 6, col: '#8FD8FF' });
    return;
  }
  hahaT = overT < laughDur ? (laughLv > 0.25 || !Sfx.ready ? 0.13 : 0.3) : 0.5;
  (frog.sigma ? frog.sig.mouthOpen : frog.mouthOpen).getWorldPosition(_wp);
  const mp = toScreen(_wp.x, _wp.y, _wp.z + 0.05);
  const sF = Math.abs(toScreen(_wp.x, _wp.y + 1, _wp.z)[1] - mp[1]);
  const sd = Math.random() < 0.72 ? -1 : 1;
  addPart({ type: 'ha', x: mp[0] + sd * rand(0.15, 0.3) * sF, y: mp[1] - 0.15 * sF, vx: sd * rand(0.35, 1.0) * sF, vy: -rand(0.8, 1.25) * sF, g: 0.45 * sF, life: 1.3, size: rand(0.14, 0.24) * sF, col: pick(['#FF6B3D', '#FF9F1C', '#E8452C', '#FF7EB3']), rot: rand(-0.5, 0.5), vr: 0 });
}
function drawFx() {
  fx.clearRect(0, 0, W, H);
  const r = run;
  // 速度线
  if (r && state === 'play' && (r.speed > 19 || r.pu.rocket > 0)) {
    const k = r.pu.rocket > 0 ? 1 : clamp((r.speed - 19) / 10, 0, 0.8);
    const cx = W / 2, cy = H * 0.42, M = Math.max(W, H);
    fx.strokeStyle = `rgba(255,255,255,${0.32 * k})`; fx.lineWidth = 2;
    fx.beginPath();
    for (let i = 0; i < 16; i++) { const a = rand(0, TAU), r0 = M * rand(0.42, 0.55), r1 = r0 + M * rand(0.08, 0.22); fx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); fx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
    fx.stroke();
  }
  // 反追时：肥嘟嘟头上一个跳动的红箭头，告诉玩家它在哪条道
  if (r && r.sig && !r.sig.turn && state === 'play') {
    const S = r.sig, p = toScreen(S.fx, S.fy + 1.9, -S.gap), b = Math.abs(Math.sin(nowT * 6)) * 8, sz = clamp(260 / (S.gap + 6), 9, 22);
    if (p[2] < 1) {
      fx.save(); fx.translate(p[0], p[1] - b);
      fx.beginPath(); fx.moveTo(-sz, -sz * 1.3); fx.lineTo(sz, -sz * 1.3); fx.lineTo(0, 0); fx.closePath();
      fx.fillStyle = '#FF4D3D'; fx.fill(); fx.lineWidth = 3; fx.strokeStyle = '#fff'; fx.stroke();
      fx.font = `900 ${Math.round(sz * 0.95)}px ${FONT}`; fx.textAlign = 'center'; fx.textBaseline = 'bottom'; fx.lineJoin = 'round';
      fx.lineWidth = sz * 0.3; fx.strokeStyle = '#fff'; fx.strokeText('肥嘟嘟', 0, -sz * 1.45); fx.fillStyle = '#E8452C'; fx.fillText('肥嘟嘟', 0, -sz * 1.45);
      fx.restore();
    }
  }
  // 大笑："哈" 字从嘴里冒出来，肥嘟嘟说话
  if (state === 'over') {
    (frog.sigma ? frog.sig.mouthOpen : frog.mouthOpen).getWorldPosition(_wp);
    const mp = toScreen(_wp.x, _wp.y, _wp.z + 0.05);
    const sF = Math.abs(toScreen(_wp.x, _wp.y + 1, _wp.z)[1] - mp[1]);
    fei.head.getWorldPosition(_wp);
    const hp = toScreen(_wp.x, _wp.y + 0.55, _wp.z);
    bubble(r.won ? '饶了我吧～' : '抓到你啦！', hp[0] + 0.35 * sF, hp[1] - 0.25 * sF, clamp(0.12 * sF, 14, 26), hp[0] + 0.05 * sF, hp[1] + 0.02 * sF);
  }
  for (const p of parts) {
    const a = clamp(p.life / p.max, 0, 1);
    fx.globalAlpha = p.type === 'ha' ? Math.min(1, a * 1.6) : a;
    if (p.type === 'star') star2d(p.x, p.y, p.size, p.col, p.rot);
    else if (p.type === 'drop') { const s = p.size; fx.beginPath(); fx.moveTo(p.x, p.y - s * 1.7); fx.quadraticCurveTo(p.x + s, p.y, p.x, p.y + s); fx.quadraticCurveTo(p.x - s, p.y, p.x, p.y - s * 1.7); fx.fillStyle = p.col; fx.fill(); }
    else if (p.type === 'text' || p.type === 'ha') {
      const pop = Math.min(1, (p.max - p.life) * 8);
      fx.save(); fx.translate(p.x, p.y); fx.rotate(p.rot || 0); fx.scale(pop, pop);
      fx.font = `900 ${p.size}px ${FONT}`; fx.textAlign = 'center'; fx.textBaseline = 'middle'; fx.lineJoin = 'round';
      fx.lineWidth = p.size * 0.18; fx.strokeStyle = p.type === 'ha' ? '#FFFFFF' : '#6B3E12'; fx.strokeText(p.type === 'ha' ? '哈' : p.txt, 0, 0);
      fx.fillStyle = p.col; fx.fillText(p.type === 'ha' ? '哈' : p.txt, 0, 0); fx.restore();
    } else { const s = p.size * (1.5 - a * 0.5); fx.beginPath(); fx.arc(p.x, p.y, s, 0, TAU); fx.fillStyle = p.col; fx.fill(); }
  }
  fx.globalAlpha = 1;
  if (r && r.hurt > 0 && (state === 'play' || state === 'catching')) {
    const g = fx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(255,60,60,0)'); g.addColorStop(1, `rgba(255,60,60,${0.4 * clamp(r.hurt, 0, 1)})`);
    fx.fillStyle = g; fx.fillRect(0, 0, W, H);
  }
  if (r && r.flash > 0) { fx.fillStyle = `rgba(255,255,255,${clamp(r.flash, 0, 1)})`; fx.fillRect(0, 0, W, H); }
}
function bubble(txt, x, y, size, tipX, tipY) {
  fx.font = `900 ${size}px ${FONT}`;
  const w = fx.measureText(txt).width + size * 1.3, h = size * 1.8;
  x = clamp(x, w / 2 + 6, W - w / 2 - 6); y = Math.max(y, SAFE_T + h / 2 + 60);
  fx.lineJoin = 'round';
  const rr = h * 0.45;
  fx.beginPath(); fx.moveTo(x - w / 2 + rr, y - h / 2); fx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, rr); fx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, rr); fx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, rr); fx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, rr); fx.closePath();
  fx.fillStyle = '#fff'; fx.fill(); fx.strokeStyle = '#6B3E12'; fx.lineWidth = Math.max(2, size * 0.13); fx.stroke();
  const bx = clamp(tipX, x - w / 2 + h * 0.5, x + w / 2 - h * 0.5);
  fx.beginPath(); fx.moveTo(bx - size * 0.35, y + h / 2 - 2); fx.lineTo(tipX, Math.max(tipY, y + h / 2 + size * 0.5)); fx.lineTo(bx + size * 0.35, y + h / 2 - 2); fx.closePath(); fx.fillStyle = '#fff'; fx.fill();
  fx.beginPath(); fx.moveTo(bx - size * 0.35, y + h / 2); fx.lineTo(tipX, Math.max(tipY, y + h / 2 + size * 0.5)); fx.lineTo(bx + size * 0.35, y + h / 2); fx.stroke();
  fx.fillStyle = '#E8452C'; fx.textAlign = 'center'; fx.textBaseline = 'middle'; fx.fillText(txt, x, y + size * 0.04);
}

/* ================= 界面 ================= */
const hud = $('#hud'), chaseEl = $('#chase'), elE = $('#hEggs'), elD = $('#hDist'), pillE = $('#pillEggs'), x2El = $('#hX2');
const chipEls = {};
function buildChips() {
  const box = $('#chips');
  for (const k of PU_KEYS) {
    const d = document.createElement('div'); d.className = 'chip hide';
    d.innerHTML = `<img src="${ICON[k]}" alt=""><b></b>`;
    box.appendChild(d); chipEls[k] = d;
  }
}
let hudE = -1, hudD = -1, hudG = -1;
function updateHud() {
  const r = run;
  if (r.eggs !== hudE) { hudE = r.eggs; elE.textContent = r.eggs; }
  const d = Math.floor(r.dist); if (d !== hudD) { hudD = d; elD.textContent = d; }
  if (r.chase > 0 && state === 'play') chaseEl.classList.remove('hide');
  else chaseEl.classList.add('hide');
  if (r.gold !== hudG) { hudG = r.gold; $('#hGold').textContent = r.gold; }
  const rc = $('#rchase');
  if (r.sig && !r.sig.turn && state === 'play') { rc.classList.remove('hide'); $('#rcGap').textContent = Math.max(1, Math.ceil(r.sig.gap)); $('#rcFill').style.transform = `scaleX(${clamp(1 - r.sig.t / r.sig.dur, 0, 1).toFixed(3)})`; }
  else rc.classList.add('hide');
  x2El.classList.toggle('hide', !(r.pu.double > 0 && state === 'play'));
  for (const k of PU_KEYS) {
    const on = r.pu[k] > 0 && state === 'play';
    const el = chipEls[k];
    el.classList.toggle('hide', !on);
    if (on) { el.style.setProperty('--p', clamp(r.pu[k] / puDur(k), 0, 1).toFixed(3)); el.lastChild.textContent = Math.ceil(r.pu[k]); el.classList.toggle('low', r.pu[k] < 2); }
  }
}
function bumpEggs() { pillE.classList.remove('bump'); void pillE.offsetWidth; pillE.classList.add('bump'); }
const toastEl = $('#toast');
function toast(txt, kind, dur) { toastEl.textContent = txt; toastEl.className = ''; void toastEl.offsetWidth; toastEl.style.setProperty('--dur', (dur || 1.6) + 's'); toastEl.className = 'show ' + (kind || ''); }
function showScreen(id) { for (const s of ['loading', 'menu', 'shop', 'pause', 'over', 'laughScr', 'dex', 'ward', 'gacha', 'ach']) $('#' + s).classList.toggle('on', s === id); layoutDirty = true; }
function setHud(on) { hud.classList.toggle('hide', !on); }
function refreshWallet() {
  for (const el of document.querySelectorAll('.wallet-n')) el.textContent = save.wallet;
  for (const el of document.querySelectorAll('.gold-n')) el.textContent = save.gold;
  $('#bPotion').classList.toggle('poor', save.gold < potCost() && !save.tickets);
  $('#potCostBox').innerHTML = save.tickets ? `门票×${save.tickets}` : `<img class="ic-gold" src="${ICON.gold || ''}" alt=""><span id="potCost">${potCost()}</span>`;
  const dc = $('#bDraw'); if (dc) dc.classList.toggle('poor', save.wallet < GACHA_COST);
  const dt10 = $('#bDraw10'); if (dt10) dt10.classList.toggle('poor', save.wallet < GACHA_COST * 9);
}
function refreshBest() { $('#mBest').textContent = save.best.eggs || save.best.dist ? `最佳纪录：奶蛋 ${save.best.eggs} 个 · ${save.best.dist} 米` : '第一次来奶国？冲鸭！'; }
const fmt = (v) => (Math.round(v * 10) / 10).toString();
function buildShop() {
  const list = $('#shopList'); list.innerHTML = '';
  const ex = document.createElement('div'); ex.className = 'item';
  ex.innerHTML = `<img src="${ICON.gold}" alt=""><div class="info"><b>兑换奶金</b><small>${EXCHANGE} 个奶蛋换 1 个奶金。奶金用来复活、买衣服、进药水关卡。</small></div>`;
  const eb = document.createElement('button'); eb.className = 'buy';
  eb.innerHTML = `兑换<span><img class="ic-egg" src="${ICON.egg}" alt="">${EXCHANGE}</span>`;
  if (save.wallet < EXCHANGE) eb.classList.add('poor');
  eb.addEventListener('click', () => {
    Sfx.init();
    if (save.wallet < EXCHANGE) { Sfx.deny(); eb.classList.remove('shake'); void eb.offsetWidth; eb.classList.add('shake'); return; }
    save.wallet -= EXCHANGE; save.gold += 1; persist(); Sfx.gold(); refreshWallet(); buildShop();
  });
  ex.appendChild(eb); list.appendChild(ex);
  for (const k of PU_KEYS) {
    const lv = save.lv[k], cost = lv < 5 ? UP_COST[lv] : null;
    const it = document.createElement('div'); it.className = 'item';
    const dur = k === 'shield' ? `最长 ${fmt(puDur(k))} 秒` : `持续 ${fmt(puDur(k))} 秒`;
    const next = cost != null ? ` → ${fmt(puDur(k) + PU[k].step)}` : '';
    it.innerHTML = `<img src="${ICON[k]}" alt=""><div class="info"><b>${PU[k].name}</b><small>${PU[k].desc}</small><small class="dur">${dur}${next}</small><div class="pips">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>`;
    const b = document.createElement('button'); b.className = 'buy';
    if (cost == null) { b.textContent = '已满级'; b.disabled = true; }
    else {
      b.innerHTML = `升级<span><img class="ic-egg" src="${ICON.egg}" alt="">${cost}</span>`;
      if (save.wallet < cost) b.classList.add('poor');
      b.addEventListener('click', () => {
        Sfx.init();
        if (save.wallet < cost) { Sfx.deny(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        save.wallet -= cost; save.lv[k]++; persist(); Sfx.buy(); refreshWallet(); buildShop();
      });
    }
    it.appendChild(b); list.appendChild(it);
  }
}
const reviveCost = () => Math.pow(2, run.revives);   // 1、2、4、8……个奶金
function refreshRevive() {
  const b = $('#bRevive'), c = reviveCost();
  $('#rvCost').textContent = c;
  b.classList.toggle('poor', save.gold < c);
  $('#rvNote').textContent = save.gold < c ? `奶金不够（还差 ${c - save.gold} 个）` : `钱包里有 ${save.gold} 个奶金`;
}

function startGame(mode) {
  Sfx.init(); Sfx.click(); Sfx.stopLaugh();
  newRun(true, mode === 'potion' ? 'potion' : 'normal');
  state = 'play'; stateT = 0; hudE = -1; hudD = -1; hudG = -1; parts.length = 0;
  showScreen(null); setHud(true); updateHud();
  toastEl.className = '';
  Sfx.musicFast(false); Sfx.musicStart();
  if (run.mode === 'potion') toast('药水关卡：找到药水，变身西格奶！', 'tip', 2.2);
}
function refreshRetry() {   // 药水关卡的“再来一关”：有门票就自动用门票
  const b = $('#bRetry'); if (!run) return;
  b.innerHTML = run.mode !== 'potion' ? '再跑一次'
    : save.tickets > 0 ? `再来一关 <span class="tix"><img src="${ICON.potion}" alt="">门票 −1</span>`
    : `再来一关 <img class="ic-gold" src="${ICON.gold}" alt="" style="width:26px;height:22px;object-fit:contain;margin:-4px 0">${potCost()}`;
}
function startPotion() {
  Sfx.init();
  if (save.tickets > 0) { save.tickets--; persist(); refreshWallet(); startGame('potion'); return; }   // 有门票先用门票
  if (save.gold < potCost()) {
    Sfx.deny(); toast(`奶金不够，进药水关卡要 ${potCost()} 个（也可以去抽奖机抽门票）`, 'warn', 2);
    for (const b of [$('#bPotion'), $('#bRetry')]) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
    return;
  }
  save.gold -= potCost(); persist(); refreshWallet();
  startGame('potion');
}
function pause() { if (state !== 'play') return; state = 'paused'; showScreen('pause'); Sfx.musicStop(); }
function resume() { if (state !== 'paused') return; state = 'play'; showScreen(null); Sfx.init(); Sfx.musicStart(); }
function goHome() {
  Sfx.stopLaugh();
  state = 'menu'; newRun(false); setHud(false); toastEl.className = ''; parts.length = 0;
  showScreen('menu'); refreshBest(); refreshWallet(); refreshAchDot(); Sfx.musicStop(); camSnap = false;
}
function openWard() { Sfx.click(); state = 'menu'; buildWard(); refreshWallet(); showScreen('ward'); }
function buildWard(sel) {
  sel = sel || save.skin;
  const list = $('#wardList'); list.innerHTML = '';
  for (const k of Object.keys(CH.SKINS)) {
    const S = CH.SKINS[k], owned = !!save.skins[k], on = save.skin === k, cost = SKIN_COST[k] || 0;
    const it = document.createElement('div'); it.className = 'item' + (sel === k ? ' sel' : '');
    it.innerHTML = `<img class="skin" src="${ICON['skin_' + k]}" alt=""><div class="info"><b>${S.name}</b><small>${S.desc}</small>${owned ? '' : '<small class="dur">点一下先试穿看看</small>'}</div>`;
    const b = document.createElement('button'); b.className = 'buy';
    if (on) { b.textContent = '穿着中'; b.disabled = true; }
    else if (owned) b.textContent = '穿上';
    else if (k === 'god') { const zc = zodCount(); b.innerHTML = zc >= 12 ? '兑换<span>集齐生肖</span>' : `生肖<span>${zc}/12</span>`; if (zc < 12) b.classList.add('poor'); }
    else { b.innerHTML = `购买<span><img class="ic-gold" src="${ICON.gold}" alt="">${cost}</span>`; if (save.gold < cost) b.classList.add('poor'); }
    it.addEventListener('click', (e) => { if (e.target.closest('button')) return; Sfx.click(); CH.setFrogSkin(frog, k, false); buildWard(k); });
    b.addEventListener('click', () => {
      Sfx.init();
      if (!owned && k === 'god') {
        if (zodCount() < 12) { Sfx.deny(); toast(`集齐十二生肖才能兑换奶神（${zodCount()}/12）`, 'warn', 1.8); CH.setFrogSkin(frog, k, false); buildWard(k); return; }
        save.skins.god = true; Sfx.victory(); toast('奶神降临！', 'lvl', 1.8); setTimeout(checkAch, 1500);
      } else if (!owned) {
        if (save.gold < cost) { Sfx.deny(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); CH.setFrogSkin(frog, k, false); buildWard(k); return; }
        save.gold -= cost; save.skins[k] = true; Sfx.buy(); setTimeout(checkAch, 300);
      } else Sfx.click();
      save.skin = k; persist(); CH.setFrogSkin(frog, k, false); refreshWallet(); buildWard(k);
    });
    it.appendChild(b); list.appendChild(it);
  }
}
/* ---------- 抽奖机：抽药水关卡门票、图鉴雕像 ---------- */
const GACHA_COST = 120;
const GACHA = [['ticket', 5], ['gold', 10], ['eggs', 25]].concat(DEX.map((d) => [d.k, d.w * 4.2]));   // 雕像合计约 60%
let gBusy = false;
function buildGachaPool() {
  const tot = GACHA.reduce((a, g) => a + g[1], 0), pct = (w) => { const v = (100 * w) / tot; return (v >= 1 ? v.toFixed(0) : v.toFixed(1)) + '%'; };
  const wOf = (k) => GACHA.find((g) => g[0] === k)[1];
  const rows = [
    [`<img src="${ICON.potion}" alt="">`, '药水关卡门票', '免费进一次药水关卡（不花奶金）', pct(wOf('ticket'))],
    [`<img src="${ICON.gold}" alt="">`, '奶金 ×1', '复活、买衣服、进药水关卡都用它', pct(wOf('gold'))],
    [`<img src="${ICON.egg}" alt="">`, '奶蛋 ×50', '安慰奖，退回一部分奶蛋', pct(wOf('eggs'))],
  ];
  const tiers = [['r1', '普通'], ['r2', '稀有'], ['r4', '传说']];
  let st = '';
  for (const [rc, nm] of tiers) {
    const ds = DEX.filter((d) => d.rare === nm); if (!ds.length) continue;
    const each = ds.map((d) => `${d.name}<i>${pct(wOf(d.k))}</i>`).join('');
    st += `<div class="gtier"><span class="tag ${rc}">${nm}</span><div class="gnames">${each}</div></div>`;
  }
  const stTot = pct(DEX.reduce((a, d) => a + wOf(d.k), 0));
  $('#gPool').innerHTML =
    `<div class="gph">每次花 <b>${GACHA_COST}</b> 个奶蛋，随机抽出 1 样；十连 <b>${GACHA_COST * 9}</b>（九折）</div>` +
    rows.map((r) => `<div class="grow">${r[0]}<div><b>${r[1]}</b><small>${r[2]}</small></div><em>${r[3]}</em></div>`).join('') +
    `<div class="grow"><img src="${ST.IMG.dragon}" alt=""><div><b>图鉴雕像</b><small>抽到后收进图鉴，重复的也会计数</small></div><em>${stTot}</em></div>` +
    `<details class="gdet"><summary>查看每个雕像的概率</summary>${st}</details>` + `<div class="gtip">集齐 <b>奶十二生肖</b>，可以去衣柜兑换最稀有皮肤 <b>「奶神」</b>（现在 ${zodCount()}/12）</div>`;
}

function openGacha() { Sfx.click(); state = 'menu'; gBusy = false; $('#gPrize').classList.remove('on'); $('#gMulti').classList.remove('on'); refreshPity(); $('#gMachine').className = 'machine'; buildGachaPool(); refreshWallet(); showScreen('gacha'); }
const TEN = 10, TEN_COST = GACHA_COST * 9, PITY = 100;   // 十连 9 折；每 100 抽必出传说
const isLegend = (k) => { const d = DEX.find((x) => x.k === k); return !!d && d.rare === '传说'; };
function rollOne() {
  save.pity = (save.pity || 0) + 1; save.st.draws++;
  let k, pity = false;
  if (save.pity >= PITY) {   // 保底：优先给图鉴里还没有的传说，其次给任何还没有的雕像
    pity = true;
    const leg = DEX.filter((d) => d.rare === '传说'), miss = leg.filter((d) => !save.dex[d.k]);
    const anyMiss = DEX.filter((d) => !save.dex[d.k]).sort((a, b) => a.w - b.w);
    k = miss.length ? pick(miss).k : anyMiss.length ? anyMiss[0].k : pick(leg).k;
  } else {
    k = wpick(GACHA);
    if (isLegend(k)) {   // 抽中传说时，优先给图鉴里还没有的那个
      const miss = DEX.filter((d) => d.rare === '传说' && !save.dex[d.k]);
      if (miss.length && save.dex[k]) k = pick(miss).k;
    }
  }
  if (isLegend(k)) { save.pity = 0; if (!pity) save.st.lucky++; }
  const dx = DEX.find((d) => d.k === k), o = { k, dx, pity, title: '抽到啦！', img: '', name: '', sub: '', isNew: false };
  if (k === 'ticket') { save.tickets++; o.img = ICON.potion; o.name = '药水关卡门票'; o.sub = `免费进一次药水关卡（现有 ${save.tickets} 张）`; }
  else if (k === 'gold') { save.gold += 1; o.img = ICON.gold; o.name = '奶金 ×1'; o.sub = `钱包里有 ${save.gold} 个奶金`; }
  else if (k === 'eggs') { save.wallet += 50; o.img = ICON.egg; o.name = '奶蛋 ×50'; o.sub = '退你一点奶蛋，再接再厉！'; o.egg = 50; }
  else {
    o.isNew = !save.dex[k]; save.dex[k]++; o.img = ST.IMG[k]; o.name = dx.name + '雕像';
    o.title = pity ? '保底传说！' : o.isNew ? '新收录！' : '又抽到啦';
    o.sub = o.isNew ? `【${dx.rare}】已在图鉴中解锁（${dexCount()}/${DEX.length}）` : `【${dx.rare}】图鉴里已有 ${save.dex[k]} 个`;
  }
  return o;
}
function pityLeft() { return PITY - (save.pity || 0); }
function refreshPity() { const e = $('#gPity'); if (e) e.innerHTML = `保底：再抽 <b>${pityLeft()}</b> 次必出<span class="tag r4">传说</span>；出传说时优先给图鉴里没有的`; }
function drawGacha(n) {
  Sfx.init();
  n = n === TEN ? TEN : 1;
  if (gBusy) return;
  const cost = n === TEN ? TEN_COST : GACHA_COST, b = $(n === TEN ? '#bDraw10' : '#bDraw');
  if (save.wallet < cost) { Sfx.deny(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); toast(`奶蛋不够，${n === TEN ? '十连' : '抽一次'}要 ${cost} 个`, 'warn', 1.6); return; }
  gBusy = true; save.wallet -= cost;
  const res = []; for (let i = 0; i < n; i++) res.push(rollOne());
  persist();
  const eggBack = res.reduce((a, o) => a + (o.egg || 0), 0);
  for (const el of document.querySelectorAll('#gacha .wallet-n')) el.textContent = save.wallet - eggBack;
  const m = $('#gMachine'), pz = $('#gPrize'), gm = $('#gMulti');
  pz.classList.remove('on'); gm.classList.remove('on'); m.className = 'machine spin';
  const spinT = n === TEN ? 1500 : 1100;
  for (let i = 0; i < (n === TEN ? 9 : 6); i++) setTimeout(() => Sfx.lane(), i * 160);
  setTimeout(() => { m.className = 'machine drop'; Sfx.pop(); }, spinT);
  setTimeout(() => {
    m.className = 'machine'; refreshWallet(); refreshDexN(); buildGachaPool(); refreshPity(); checkAch();
    const best = res.some((o) => isLegend(o.k));
    if (n === 1) {
      const o = res[0];
      $('#gpT').textContent = o.title; if (o.dx) setThumb($('#gpImg'), o.k); else $('#gpImg').src = o.img; $('#gpName').textContent = o.name; $('#gpSub').textContent = o.sub;
      pz.classList.toggle('legend', isLegend(o.k)); pz.classList.add('on');
    } else {
      const g = $('#gmGrid'); g.innerHTML = '';
      res.forEach((o, i) => {
        const c = document.createElement('div');
        c.className = 'gmc ' + (o.dx ? o.dx.rc : 'item') + (isLegend(o.k) ? ' legend' : '');
        c.style.animationDelay = `${i * 0.07}s`;
        c.innerHTML = `<img alt="">${o.isNew ? '<i class="new">NEW</i>' : ''}${o.pity ? '<i class="pity">保底</i>' : ''}<b>${o.dx ? o.dx.name : { ticket: '药水门票', gold: '奶金×1', eggs: '奶蛋×50' }[o.k]}</b>`;
        const im = c.querySelector('img'); if (o.dx) setThumb(im, o.k); else im.src = o.img;
        g.appendChild(c);
      });
      const nNew = res.filter((o) => o.isNew).length;
      $('#gmSum').textContent = `新收录 ${nNew} 个` + (best ? ' · 出传说啦！' : '');
      gm.classList.add('on');
    }
    if (best || res.some((o) => o.k === 'ticket')) Sfx.victory(); else Sfx.power();
    gBusy = false;
  }, spinT + 700);
}
function openShop() { Sfx.click(); state = 'shop'; buildShop(); refreshWallet(); showScreen('shop'); }
function toOver(win) {
  const r = run;
  state = 'over'; overT = 0; hahaT = 0.3; parts.length = 0;
  if (frog.sigma) { CH.setFrogSkin(frog, save.skin, false); r.flash = Math.max(r.flash, 0.7); }   // 结算时变回原来的样子再大笑
  if (win) { r.eggs += WIN_EGGS; r.gold += WIN_GOLD; save.gold += WIN_GOLD; }
  if (r.mode === 'potion' && !r.heatDone) { r.heatDone = true; save.potHeat = win ? Math.min(save.potHeat + 1, (POT_MAX - POT_BASE) / POT_STEP) : Math.max(0, save.potHeat - 1); }
  save.wallet += r.eggs - r.banked; r.banked = r.eggs;
  const d = Math.floor(r.dist), e = r.eggs;
  const isNew = e > save.best.eggs || d > save.best.dist;
  save.best = { eggs: Math.max(save.best.eggs, e), dist: Math.max(save.best.dist, d) };
  persist();
  // 把挡在镜头前的东西清掉
  for (const o of r.obs) { const z = r.dist - o.wz - o.d; if (z > -9 && !o.fly) o.mesh.visible = false; }
  for (const p of r.pickups) if (r.dist - p.wz > -9) p.mesh.visible = false;
  for (const e2 of r.eggList) if (r.dist - e2.wz > -9) e2.taken = true;
  r.chaser.on = false;
  r.py = 0; r.vy = 0; r.air = false; r.slideT = 0; r.slideAmt = 0;
  $('#oEggs').textContent = e; $('#oDist').textContent = d; $('#oGold').textContent = r.gold;
  const ot = $('#oTitle'); ot.textContent = win ? '抓住肥嘟嘟啦！' : '被肥嘟嘟逮捕啦！';
  if (!win) setTimeout(() => { if (state === 'over' && run === r && r.sad) ot.textContent = '被逮捕了……好伤心'; }, 0); ot.className = 'ptitle ' + (win ? 'gold' : 'red');
  const rw = $('#oReward'); rw.classList.toggle('hide', !win);
  if (win) rw.innerHTML = `抓捕奖励：<img src="${ICON.gold}" alt="">×${WIN_GOLD}　<img src="${ICON.egg}" alt="">×${WIN_EGGS}`;
  if (r.mode === 'potion') setTimeout(() => { if (state === 'over' && run === r) toast(win ? `肥嘟嘟变警惕了！下次药水关卡涨到 ${potCost()} 奶金` : `药水关卡降到 ${potCost()} 奶金`, win ? 'warn' : 'tip', 2.4); }, 900);
  $('#bRevive').classList.toggle('hide', !!win); $('#rvNote').classList.toggle('hide', !!win);
  refreshRetry();
  $('#oBest').innerHTML = (isNew ? '<span class="newrec">新纪录！</span>' : '') + `最佳：奶蛋 ${save.best.eggs} 个 · ${save.best.dist} 米`;
  refreshRevive(); refreshWallet();
  setHud(false); toastEl.className = '';
  showScreen('over');
  const ov = $('#over'); ov.classList.add('lock'); setTimeout(() => ov.classList.remove('lock'), 900);
  r.sad = !win && Math.random() < 0.3;   // 三成概率：不是大笑，而是变成悲伤奶
  if (r.sad) { Sfx.sad(); laughDur = 2.6; save.st.sad++; } else laughDur = Sfx.laugh() || 3.4;
  if (!r.stRun) { r.stRun = true; save.st.runs++; }   // 复活后再结算只记增量
  save.st.dist += d - (r.stD || 0); save.st.eggs += e - (r.stE || 0); save.st.flips += r.flips - (r.stF || 0); r.stD = d; r.stE = e; r.stF = r.flips;
  if (win) save.st.wins++;
  if (r.hits === 0) save.st.clean = Math.max(save.st.clean, d);
  persist(); setTimeout(checkAch, 1200);
  if (laughDur > 9) laughDur = 9;
}
function revive() {
  const r = run, cost = reviveCost();
  Sfx.init();
  if (r.won) return;
  if (save.gold < cost) { Sfx.deny(); const b = $('#bRevive'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
  save.gold -= cost; save.st.revives++; persist(); r.revives++; Sfx.stopLaugh();
  for (const o of r.obs) o.mesh.visible = true;
  clearAhead(r.speed * 2 + 14);
  r.invuln = 2.8; r.stun = 0; r.hurt = 0; r.chase = 0; r.hitSlow = 1.2; r.air = r.py > surfaceAt(r.x, r.dist) + 0.05;
  const c = r.chaser; c.on = true; c.leaving = true; c.x = r.x + 1.1; c.z = 1.2; c.side = 1;
  state = 'reviving'; stateT = 0; parts.length = 0;
  showScreen(null); setHud(true); updateHud();
  Sfx.power(); toast('贿赂成功！继续跑！', 'good', 1.4); Sfx.musicFast(false);
}

/* ================= 自定义笑声 ================= */
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      try {
        const rq = indexedDB.open('naiwa', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
        rq.onsuccess = () => { this.db = rq.result; res(this.db); };
        rq.onerror = () => rej(rq.error);
      } catch (e) { rej(e); }
    });
  },
  async op(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('kv', mode), st = tx.objectStore('kv'), rq = fn(st); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); },
  get(k) { return this.op('readonly', (st) => st.get(k)); },
  set(k, v) { return this.op('readwrite', (st) => st.put(v, k)); },
  del(k) { return this.op('readwrite', (st) => st.delete(k)); },
};
function loadSavedLaugh() {
  IDB.get('laugh').then((v) => {
    if (!v || !v.pcm) return;
    const i16 = new Int16Array(v.pcm), f = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32767;
    Sfx.setCustom(f, v.rate, v.name); refreshLaughUI();
  }).catch(() => { /* 浏览器不让存，就用默认笑声 */ });
}
const LE = { buf: null, name: '', peaks: null };
const fmtS = (v) => v.toFixed(1) + ' 秒';
function refreshLaughUI() {
  $('#lCur').textContent = Sfx.hasCustom ? `现在用的是：${Sfx.customName}（${fmtS(Sfx.customDur)}）` : '现在用的是：默认大笑';
  $('#bLaugh').textContent = Sfx.hasCustom ? '笑声：自定义 ✓' : '换被抓时的笑声';
}
function drawWave() {
  const cv = $('#lWave'), w = cv.clientWidth || 300, h = cv.clientHeight || 70, dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  if (!LE.buf) return;
  const d = LE.buf.duration, st = +$('#lStart').value, ln = +$('#lLen').value;
  const x0 = (st / d) * w, x1 = (Math.min(d, st + ln) / d) * w;
  g.fillStyle = 'rgba(255,184,67,0.35)'; g.fillRect(x0, 0, x1 - x0, h);
  const pk = LE.peaks, n = pk.length;
  for (let i = 0; i < n; i++) { const x = (i / n) * w, a = pk[i] * (h * 0.46); const inSel = x >= x0 && x <= x1; g.fillStyle = inSel ? '#E8702A' : '#C9B48A'; g.fillRect(x, h / 2 - a, Math.max(1, w / n - 0.5), a * 2 + 1); }
}
function syncLaughSliders() {
  const d = LE.buf.duration, st = $('#lStart'), ln = $('#lLen');
  if (+st.value > d - 0.3) st.value = Math.max(0, d - 0.3);
  ln.max = Math.max(0.3, Math.min(10, d - +st.value)).toFixed(2);
  if (+ln.value > +ln.max) ln.value = ln.max;
  $('#lStartV').textContent = fmtS(+st.value); $('#lLenV').textContent = fmtS(+ln.value);
  drawWave();
}
async function onLaughFile(file) {
  const note = $('#lNote');
  if (!file) return;
  note.textContent = '正在读取……';
  try {
    const ab = await file.arrayBuffer();
    const buf = await Sfx.decode(ab);
    LE.buf = buf; LE.name = file.name.replace(/\.[^.]+$/, '').slice(0, 20) || '自定义笑声';
    const ch = buf.getChannelData(0), N = 220, step = Math.max(1, Math.floor(ch.length / N));
    LE.peaks = new Float32Array(N); let mx = 1e-6;
    for (let i = 0; i < N; i++) { let m = 0; for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 4) m = Math.max(m, Math.abs(ch[j])); LE.peaks[i] = m; mx = Math.max(mx, m); }
    for (let i = 0; i < N; i++) LE.peaks[i] /= mx;
    // 自动跳过开头的静音
    let s0 = 0; const thr = mx * 0.12;
    for (let j = 0; j < ch.length; j += 64) if (Math.abs(ch[j]) > thr) { s0 = Math.max(0, j / buf.sampleRate - 0.05); break; }
    const st = $('#lStart'), ln = $('#lLen');
    st.max = Math.max(0, buf.duration - 0.3).toFixed(2); st.value = s0.toFixed(2);
    ln.max = Math.min(10, buf.duration - s0).toFixed(2); ln.value = Math.min(6, buf.duration - s0).toFixed(2);
    $('#lEdit').classList.remove('hide');
    syncLaughSliders();
    note.textContent = `读到了 ${fmtS(buf.duration)} 的声音。拖动滑块选出大笑那一段（最长 10 秒），点“试听”确认。`;
  } catch (e) {
    note.textContent = '这个文件读不出声音，换个 mp3 / m4a / wav / mp4 试试。';
  }
}
function saveLaughClip() {
  if (!LE.buf) return;
  const b = LE.buf, rate = b.sampleRate, st = +$('#lStart').value, ln = +$('#lLen').value;
  const a = Math.floor(st * rate), n = Math.min(b.length - a, Math.floor(ln * rate));
  const mono = new Float32Array(n);
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[a + i] / b.numberOfChannels; }
  const fade = Math.min(n >> 2, Math.floor(rate * 0.04));
  for (let i = 0; i < fade; i++) { mono[i] *= i / fade; mono[n - 1 - i] *= i / fade; }
  Sfx.stopPreview(); Sfx.setCustom(mono, rate, LE.name);
  const i16 = new Int16Array(n); for (let i = 0; i < n; i++) i16[i] = Math.max(-1, Math.min(1, mono[i])) * 32767;
  IDB.set('laugh', { name: LE.name, rate, pcm: i16.buffer })
    .then(() => { $('#lNote').textContent = '保存好了！下次被肥嘟嘟抓住就是这个笑声。'; })
    .catch(() => { $('#lNote').textContent = '这次可以用，但浏览器不让保存，下次打开要重新选。'; });
  Sfx.buy(); refreshLaughUI();
}
function openLaugh() { Sfx.init(); Sfx.click(); state = 'menu'; refreshLaughUI(); showScreen('laughScr'); if (LE.buf) setTimeout(drawWave, 30); }
$('#bLaugh').addEventListener('click', openLaugh);
$('#lFile').addEventListener('change', (e) => onLaughFile(e.target.files && e.target.files[0]));
$('#lStart').addEventListener('input', syncLaughSliders);
$('#lLen').addEventListener('input', syncLaughSliders);
$('#lPlay').addEventListener('click', () => { if (LE.buf) Sfx.preview(LE.buf, +$('#lStart').value, +$('#lLen').value); });
$('#lSave').addEventListener('click', saveLaughClip);
$('#lTest').addEventListener('click', () => { Sfx.init(); Sfx.stopPreview(); Sfx.laugh(); });
$('#lReset').addEventListener('click', () => {
  Sfx.stopPreview(); Sfx.stopLaugh(); Sfx.setCustom(null); IDB.del('laugh').catch(() => {}); refreshLaughUI();
  $('#lNote').textContent = '已经换回默认的大笑。';
});
$('#lBack').addEventListener('click', () => { Sfx.stopPreview(); Sfx.stopLaugh(); Sfx.click(); showScreen('menu'); });

/* ================= 输入 ================= */
const game = $('#game');
let tp = null;
game.addEventListener('pointerdown', (e) => {
  Sfx.init();
  if (e.target.closest && e.target.closest('button,input,label')) return;
  tp = { x: e.clientX, y: e.clientY, id: e.pointerId, done: false, t: performance.now() };
});
game.addEventListener('pointermove', (e) => {
  if (!tp || tp.done || e.pointerId !== tp.id) return;
  const dx = e.clientX - tp.x, dy = e.clientY - tp.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
  tp.done = true;
  if (Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'L' : 'R'); else act(dy < 0 ? 'U' : 'D');
});
const endP = (e) => { if (tp && e.pointerId === tp.id) tp = null; };
game.addEventListener('pointerup', (e) => {
  // 轻点（没有滑动）= 空翻，只在空中有效
  if (tp && e.pointerId === tp.id && !tp.done && performance.now() - tp.t < 350 && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) < 16) act('F');
  endP(e);
});
game.addEventListener('pointercancel', endP);
// 手机上禁止整页被拖动，但列表、面板这些本身能滚动的地方要放行
function scrollableUp(el) {
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.matches && el.matches('input,textarea')) return true;
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return true;
  }
  return false;
}
document.addEventListener('touchmove', (e) => { if (!scrollableUp(e.target)) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
  Sfx.init();
  if (state === 'menu' && !$('#menu').classList.contains('on')) { if (k === 'Escape' && $('#dex').classList.contains('on')) $('#bDexBack').click(); if (k === 'Escape' && $('#ward').classList.contains('on')) $('#bWardBack').click(); if (k === 'Escape' && $('#gacha').classList.contains('on')) $('#bGachaBack').click(); if (k === 'Escape' && $('#ach').classList.contains('on')) $('#bAchBack').click(); return; }
  if (state === 'menu' && (k === 'Enter' || k === ' ')) { startGame(); return; }
  if (state === 'over' && (k === 'Enter' || k === ' ') && overT > 0.9) { if (run && run.mode === 'potion') startPotion(); else startGame(); return; }
  if (k === 'p' || k === 'P' || k === 'Escape') { if (state === 'play') pause(); else if (state === 'paused') resume(); return; }
  if (state === 'paused' && (k === 'Enter' || k === ' ')) { resume(); return; }
  if (e.repeat) return;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') act('L');
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') act('R');
  else if (k === ' ') act(run && run.air ? 'F' : 'U');
  else if (k === 'ArrowUp' || k === 'w' || k === 'W') act('U');
  else if (k === 'ArrowDown' || k === 's' || k === 'S') act('D');
});
$('#bStart').addEventListener('click', () => startGame());
$('#bPotion').addEventListener('click', startPotion);
$('#bWard').addEventListener('click', openWard);
$('#bGacha').addEventListener('click', openGacha);
$('#bDraw').addEventListener('click', () => drawGacha(1));
$('#bDraw10').addEventListener('click', () => drawGacha(TEN));
$('#gMulti').addEventListener('click', () => $('#gMulti').classList.remove('on'));
$('#gPrize').addEventListener('click', () => $('#gPrize').classList.remove('on'));
$('#bGachaBack').addEventListener('click', () => { Sfx.click(); state = 'menu'; showScreen('menu'); refreshDexN(); });
$('#bWardBack').addEventListener('click', () => { Sfx.click(); CH.setFrogSkin(frog, save.skin, false); state = 'menu'; showScreen('menu'); });
$('#bShop').addEventListener('click', openShop);
$('#bDex').addEventListener('click', openDex);
$('#bAch').addEventListener('click', openAch);
$('#bAchBack').addEventListener('click', () => { Sfx.click(); state = 'menu'; showScreen('menu'); });
$('#bAchAll').addEventListener('click', () => claimAch(ACH));
$('#bDexBack').addEventListener('click', () => { Sfx.click(); state = 'menu'; showScreen('menu'); refreshDexN(); });
$('#bShopBack').addEventListener('click', () => { Sfx.click(); state = 'menu'; showScreen('menu'); refreshWallet(); });
$('#bRetry').addEventListener('click', () => (run && run.mode === 'potion' ? startPotion() : startGame()));
$('#bRevive').addEventListener('click', revive);
$('#bHome').addEventListener('click', () => { Sfx.click(); goHome(); });
$('#bHome2').addEventListener('click', () => { Sfx.click(); goHome(); });
$('#bPause').addEventListener('click', () => { Sfx.click(); pause(); });
$('#bResume').addEventListener('click', () => { Sfx.click(); resume(); });
const ICON_ON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const bMute = $('#bMute');
const refreshMute = () => (bMute.innerHTML = Sfx.muted ? ICON_OFF : ICON_ON);
bMute.addEventListener('click', () => { Sfx.init(); Sfx.setMuted(!Sfx.muted); refreshMute(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (state === 'play') pause(); Sfx.musicStop(); } });
window.addEventListener('blur', () => { if (state === 'play') pause(); });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

/* ================= 主循环 ================= */
let last = performance.now(), perfT = 0, perfN = 0, perfAcc = 0;
function step(dt) {
  nowT += dt;
  if (state === 'play') updatePlay(dt);
  else if (state === 'catching') updateCatch(dt);
  else if (state === 'winning') updateWinning(dt);
  else if (state === 'reviving') updateRevive(dt);
  else if (state === 'over') { overT += dt; if (run.flash > 0) run.flash -= dt * 2.5; }
  else if (state === 'menu' || state === 'shop') { run.flash = 0; run.dist += dt * 1.2; spawnDecos(); cleanup(); }
  if (run && state !== 'paused') { if (state === 'play') updateHud(); }
  updParts(dt);
  syncWorld(dt);
  poseFrog(dt); poseFei(dt);
  updateCamera(dt);
  if (state === 'over') spawnHaha(dt);
}
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0;
  step(dt);
  renderer.render(scene, camera);
  drawFx();
  // 自动降画质：手机跑不动时降低分辨率/关阴影
  if (state === 'play') {
    perfAcc += (now - (frame.prev || now)); perfN++;
    if (perfAcc > 3000) { const fps = (perfN * 1000) / perfAcc; if (fps < 38 && quality > 0) { quality--; applyQuality(); } perfAcc = 0; perfN = 0; }
  }
  frame.prev = now;
  requestAnimationFrame(frame);
}

/* ================= 启动 ================= */
function boot() {
  ST.loadStatueImages();
  buildAssets();
  buildWorld();
  frog = CH.buildFrog(); scene.add(frog.root); CH.setFrogSkin(frog, save.skin, false);
  sigAura = new THREE.Sprite(MAT.potGlow); sigAura.visible = false; scene.add(sigAura);
  godAura = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); godAura.visible = false; scene.add(godAura);
  godRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#FFD84A', toneMapped: false, transparent: true, opacity: 0.85 }));
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 8, 48).rotateX(Math.PI / 2), godRing.material); godRing.add(inner);
  godRing.visible = false; scene.add(godRing);
  frogRocket = MD.puModel('rocket'); frogRocket.scale.setScalar(1.7); frogRocket.rotation.x = 0.15; frogRocket.visible = false; frog.back.add(frogRocket);
  rideEgg = new THREE.Mesh(G.egg, MAT.egg); rideEgg.castShadow = true; rideEgg.visible = false; frog.root.add(rideEgg);
  frogMagnet = MD.puModel('magnet'); frogMagnet.scale.setScalar(0.9); frogMagnet.visible = false; frog.head.add(frogMagnet);
  fei = CH.buildFei(); scene.add(fei.root);
  buildEggInstances();
  W = window.innerWidth; H = window.innerHeight;
  buildIcons();
  buildChips();
  if (!isTouch) { $('#howSub').textContent = '键盘：方向键 / WASD 移动，空格在空中是空翻，趴着再按 ↓ 前滚翻'; $('#kFlip').textContent = '空格'; }
  else $('#howSub').textContent = '跳起来后轻点屏幕空翻，趴着再下滑一次前滚翻';
  try { const bin = atob(LAUGH_MP3), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); Sfx.setBuiltin(u8.buffer); } catch (e) { /* 用合成笑声 */ }
  try { const bin = atob(EGG_MP3), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); Sfx.setClip('egg', u8.buffer); } catch (e) { /* 没有音效也能玩 */ }
  refreshMute(); refreshBest(); refreshWallet(); refreshLaughUI(); loadSavedLaugh(); refreshDexN(); refreshAchDot(); setTimeout(checkAch, 1500);
  resize();
  newRun(false);
  state = 'menu'; showScreen('menu');
  camSnap = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(() => setTimeout(boot, 30));
function botThink() {
  const r = run; if (state !== 'play') return;
  const v = r.speed, near = (o) => { const z = o.wz - r.dist; return z > -0.3 && z < v * 0.42 && !o.hit; };
  const busy = (L) => r.obs.some((o) => o.lane === L && !o.hit && ((o.type === 'truck' && r.py < ROOF - 0.3) || o.type === 'horse' || o.type === 'curly') && o.wz - r.dist < v * 0.9 && o.wz + o.d - r.dist > -0.6);
  for (const o of r.obs.filter((q) => q.lane === r.lane && near(q))) {
    if ((o.type === 'cheese' || o.type === 'wheel' || o.type === 'cat') && !r.air) { act('U'); return; }
    if ((o.type === 'bar' || o.type === 'dog') && r.slideT <= 0.05) { act('D'); return; }
  }
  if (busy(r.lane) && !r.obs.some((o) => o.type === 'ramp' && o.lane === r.lane && o.wz - r.dist < v * 0.9 && o.wz + o.d > r.dist)) {
    const opts = [r.lane - 1, r.lane + 1].filter((L) => L >= LMIN && L <= LMAX && !busy(L));
    if (opts.length) act(opts[0] < r.lane ? 'L' : 'R');
  }
}
if (location.hash.indexOf('dev') >= 0) window.__naiwa = {
  get run() { return run; }, get state() { return state; }, get laughLv() { return Sfx.laughLevel(); }, get laughDur() { return laughDur; }, act, startGame, revive, save, goHome,
  activate: (k) => activate(k), flip: () => act('F'),
  setQuality(q) { quality = q; applyQuality(); },
  force(kind, needRamp) {
    const r = run, R = r.dist + 26;
    for (const o of r.obs) if (o.wz > r.dist + 5) { o.hit = true; o.mesh.visible = false; }
    r.eggList = r.eggList.filter((e) => e.wz < r.dist + 5);
    let n0 = r.obs.length; PAT[kind](R, r.speed, clamp(r.dist / 3200, 0, 1), 20);
    for (let i = 0; i < 20 && needRamp && !r.obs.slice(n0).some((o) => o.type === 'ramp'); i++) { for (const o of r.obs.slice(n0)) { o.hit = true; o.mesh.visible = false; } n0 = r.obs.length; PAT[kind](R, r.speed, 0.5, 20); }
    r.nextRow = R + 40;
    const ramp = r.obs.slice(n0).find((o) => o.type === 'ramp');
    if (ramp) { r.lane = ramp.lane; r.x = ramp.lane * LW; }
    return r.obs.slice(n0).map((o) => o.type + ':' + o.lane).join(',');
  },
  place(list) { const r = run; for (const [t, L, dz] of list) addObs(t, L, r.dist + dz); r.nextRow = Math.max(r.nextRow, r.dist + 70); },
  clear() { const r = run; for (const o of r.obs) { o.hit = true; o.mesh.visible = false; } r.eggList = []; r.nextRow = r.dist + 70; },
  setDist(d) { const r = run; r.dist = d; r.nextDeco = d - BEHIND; r.nextRow = d + 60; r.level = Math.floor(d / 500); for (const o of r.obs) { o.hit = true; o.mesh.visible = false; } r.eggList = []; },
  get toast() { return $('#toast').textContent; },
  fig(kind, dz) { const r = run, L = r.lane; r.pickups.push({ type: 'fig_' + kind, fig: kind, lane: L, wz: r.dist + dz, y: 0.72, taken: false, mesh: getPick('fig_' + kind), ph: 0 }); },
  get dex() { return save.dex; }, openAch, checkAch, get frogSigma() { return !!frog.sigma; }, openDex, startPotion, startSigma, collectGold, openWard, openGacha, drawGacha, setSkin: (k, sg) => CH.setFrogSkin(frog, k, sg),
  stats() { const c = {}; for (const o of run.obs) c[o.type] = (c[o.type] || 0) + 1; for (const d of run.decos) c['deco:' + d.kind] = (c['deco:' + d.kind] || 0) + 1; return c; },
  sim(sec, bot) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (bot && i % 3 === 0) botThink(); step(1 / 60); } return state; },
};

import * as THREE from 'three';
import './style.css';

/* =====================================================================
   Riverkeeper
   Steer a cleanup boat, scoop trash, keep the river healthy so the
   animals stay.
   ===================================================================== */

/* ---------- constants ---------- */
const RIVER_W = 26;
const RIVER_L = 90; // playable length
const VIS_L = 240; // visual length (extends past the play area)
const HALF_W = RIVER_W / 2;
const HALF_L = RIVER_L / 2;
const FLOW = 2.4; // current speed (units/sec), flows toward +Z
const MAX_SPEED = 9;
const START_HEALTH = 35;
const TAU = Math.PI * 2;

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

const SKY_CLEAN = new THREE.Color(0x9fd8f5);
const SKY_DIRTY = new THREE.Color(0xb7ab84);
const WATER_CLEAN = new THREE.Color(0x24a8ec);
const WATER_DIRTY = new THREE.Color(0x6b5a35);

const M = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, flatShading: true, ...extra });

/* ---------- renderer / scene / camera ---------- */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = SKY_DIRTY.clone();
scene.fog = new THREE.Fog(SKY_DIRTY.clone(), 45, 130);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
camera.position.set(0, 20, 40);
const camLook = { x: 0, y: 0, z: 10 };

const hemi = new THREE.HemisphereLight(0xffffff, 0x6b8f55, 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 2.4);
sun.position.set(25, 40, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
scene.add(sun);
scene.add(sun.target);

/* ---------- world: water, bed, banks, trees ---------- */
const waterGeo = new THREE.PlaneGeometry(RIVER_W + 2, VIS_L, 14, 88);
waterGeo.rotateX(-Math.PI / 2);
const waterBase = waterGeo.attributes.position.array.slice();
const waterMat = new THREE.MeshStandardMaterial({
  color: WATER_DIRTY.clone(),
  transparent: true,
  opacity: 0.92,
  roughness: 0.2,
  metalness: 0.05,
  flatShading: true,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.receiveShadow = true;
water.renderOrder = 0;
scene.add(water);

const bed = new THREE.Mesh(
  new THREE.PlaneGeometry(RIVER_W + 2, VIS_L).rotateX(-Math.PI / 2),
  M(0xc9b27a, { flatShading: false }),
);
bed.position.y = -1.1;
scene.add(bed);

const grassMat = M(0x5fa34a);
for (const side of [-1, 1]) {
  const bank = new THREE.Mesh(new THREE.BoxGeometry(80, 2.6, VIS_L), grassMat);
  bank.position.set(side * (HALF_W + 40), -0.9, 0);
  bank.receiveShadow = true;
  scene.add(bank);
}

const leafMats = [M(0x2f7d3b), M(0x3a8f45), M(0x4a9e4c)];
function buildTrees() {
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.5, 6);
  const leafGeo = new THREE.ConeGeometry(1.5, 3.2, 7);
  const trunkMat = M(0x7a5230);
  for (let i = 0; i < 80; i++) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.75;
    const l1 = new THREE.Mesh(leafGeo, leafMats[i % 3]);
    l1.position.y = 2.6;
    const l2 = new THREE.Mesh(leafGeo, leafMats[i % 3]);
    l2.position.y = 3.9;
    l2.scale.setScalar(0.7);
    trunk.castShadow = l1.castShadow = l2.castShadow = true;
    g.add(trunk, l1, l2);
    const side = Math.random() < 0.5 ? -1 : 1;
    g.position.set(side * rand(HALF_W + 2, HALF_W + 32), 0.4, rand(-VIS_L / 2, VIS_L / 2));
    g.scale.setScalar(rand(0.7, 1.5));
    scene.add(g);
  }
}
buildTrees();

/* ---------- boats (what you can buy) + saved progress ---------- */
const BOATS = [
  { id: 'dilaw', name: 'Dilaw na Bangka', desc: 'Your trusty starter boat. Does the job.', price: 0, speed: 1.0, reach: 1.0, front: 2.1, netR: 1.05 },
  { id: 'papel', name: 'Bangkang Papel', desc: 'Folded paper, light on the water. Quick to turn.', price: 25, speed: 1.12, reach: 1.0, front: 2.0, netR: 0.95 },
  { id: 'kayak', name: 'Kayak', desc: 'Slim and fast, but the net is small.', price: 60, speed: 1.3, reach: 0.85, front: 2.7, netR: 0.8 },
  { id: 'balsa', name: 'Balsang Kawayan', desc: 'A bamboo raft with a huge net. Slow and steady.', price: 110, speed: 0.85, reach: 1.4, front: 2.0, netR: 1.5 },
  { id: 'katig', name: 'Bangkang may Katig', desc: 'Outrigger with a red sail. Fast and a wide net.', price: 200, speed: 1.2, reach: 1.3, front: 3.0, netR: 1.35 },
];
const boatById = (id) => BOATS.find((b) => b.id === id) || BOATS[0];

const MISSION_POOL = [
  { type: 'scoop', label: 'Scoop trash', text: (n) => 'Scoop ' + n + ' pieces of trash', targets: [12, 20, 35], rewards: [10, 18, 32] },
  { type: 'streak', label: 'Streak', text: (n) => 'Reach a streak of ' + n, targets: [4, 6, 8], rewards: [12, 20, 30] },
  { type: 'animals', label: 'Animals back', text: (n) => 'Have ' + n + ' animals in the river at once', targets: [4, 6, 8], rewards: [15, 25, 40] },
  { type: 'health', label: 'River health', text: (n) => 'Raise river health to ' + n + '%', targets: [55, 75, 95], rewards: [15, 25, 40] },
  { type: 'earn', label: 'Earn coins', text: (n) => 'Earn ' + n + ' coins from scooping', targets: [25, 50, 90], rewards: [10, 18, 30] },
];
const poolOf = (type) => MISSION_POOL.find((p) => p.type === type);
const validMission = (m) =>
  m && poolOf(m.type) && Number.isFinite(m.target) && Number.isFinite(m.reward) && Number.isFinite(m.progress);

const SAVE_KEY = 'riverkeeper-save-v1';
const save = {
  coins: 0,
  owned: ['dilaw'],
  boat: 'dilaw',
  up: { net: 0, engine: 0, streak: 0 },
  missions: [],
  missionsDone: 0,
  muted: false,
  season: 0,
};
try {
  const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (d && typeof d === 'object') {
    if (Number.isFinite(d.coins)) save.coins = Math.max(0, Math.floor(d.coins));
    if (Array.isArray(d.owned)) {
      save.owned = ['dilaw', ...d.owned.filter((id) => id !== 'dilaw' && BOATS.some((b) => b.id === id))];
    }
    if (save.owned.includes(d.boat)) save.boat = d.boat;
    if (d.up && typeof d.up === 'object') {
      for (const k of ['net', 'engine', 'streak']) {
        if (Number.isFinite(d.up[k])) save.up[k] = clamp(Math.floor(d.up[k]), 0, 5);
      }
    }
    if (Array.isArray(d.missions)) save.missions = d.missions.filter(validMission).slice(0, 3);
    if (Number.isFinite(d.missionsDone)) save.missionsDone = Math.max(0, Math.floor(d.missionsDone));
    save.muted = !!d.muted;
    if (Number.isFinite(d.season)) save.season = clamp(Math.floor(d.season), 0, 3);
  }
} catch (e) {
  /* storage can be unavailable; the game still works without saving */
}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {
    /* ignore */
  }
}

const effSpeed = () => curBoat.speed * (1 + 0.06 * save.up.engine);
const effReach = () => curBoat.reach * (1 + 0.08 * save.up.net);
const comboWindow = () => 2 + 0.4 * save.up.streak;

const boat = new THREE.Group();
const boatInner = new THREE.Group();
boat.add(boatInner);
let boatParts = [];
let curBoat = BOATS[0];

function netParts(r, z) {
  const frame = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 18, Math.PI), M(0xdddddd));
  frame.rotation.x = -Math.PI / 2;
  frame.position.set(0, 0.2, z);
  const net = new THREE.Mesh(
    new THREE.CircleGeometry(r, 18, 0, Math.PI),
    new THREE.MeshBasicMaterial({
      color: 0x7bf0a8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  net.rotation.x = -Math.PI / 2;
  net.position.set(0, 0.16, z);
  net.renderOrder = 2;
  return [frame, net];
}

function boxMesh(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color));
  m.position.set(x, y, z);
  return m;
}

function buildBoatParts(def, netLvl = save.up.net) {
  const parts = [];
  const netZ = -(def.front - 0.4);

  if (def.id === 'dilaw') {
    parts.push(
      boxMesh(1.9, 0.55, 3.4, 0xffc233, 0, 0.1, 0),
      boxMesh(1.96, 0.12, 3.46, 0x1c7f4d, 0, 0.3, 0),
      boxMesh(1.0, 0.7, 1.0, 0xffffff, 0, 0.75, 0.6),
      boxMesh(1.25, 0.1, 1.25, 0x2aa05a, 0, 1.15, 0.6),
    );
  } else if (def.id === 'papel') {
    parts.push(
      boxMesh(1.7, 0.4, 3.2, 0xf6f1e4, 0, 0.1, 0),
      boxMesh(1.76, 0.07, 3.26, 0x6a8fc4, 0, 0.26, 0),
      boxMesh(1.76, 0.07, 3.26, 0x6a8fc4, 0, 0.02, 0),
    );
    const sail = new THREE.Mesh(new THREE.ConeGeometry(1, 1.5, 4), M(0xffffff));
    sail.position.set(0, 1.05, 0.1);
    sail.scale.set(0.07, 1, 1.5);
    parts.push(sail);
  } else if (def.id === 'kayak') {
    const red = M(0xe2563b);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.32, 3.2), red);
    hull.position.y = 0.08;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.475, 1.0, 8), red);
    bow.rotation.x = -Math.PI / 2;
    bow.scale.set(1, 1, 0.35);
    bow.position.set(0, 0.08, -2.1);
    const stern = new THREE.Mesh(new THREE.ConeGeometry(0.475, 1.0, 8), red);
    stern.rotation.x = Math.PI / 2;
    stern.scale.set(1, 1, 0.35);
    stern.position.set(0, 0.08, 2.1);
    const body = boxMesh(0.34, 0.42, 0.26, 0x2b7bb9, 0, 0.5, 0.2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M(0xd9a273));
    head.position.set(0, 0.88, 0.2);
    const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), M(0x6b4a2b));
    paddle.rotation.z = Math.PI / 2 - 0.25;
    paddle.position.set(0, 0.55, 0.05);
    parts.push(hull, bow, stern, body, head, paddle);
  } else if (def.id === 'balsa') {
    const logGeo = new THREE.CylinderGeometry(0.17, 0.17, 3.2, 7);
    for (let k = 0; k < 7; k++) {
      const log = new THREE.Mesh(logGeo, M(k % 2 ? 0xc9b04f : 0xb59a3d));
      log.rotation.x = Math.PI / 2;
      log.position.set(-0.9 + k * 0.3, 0.06, 0);
      parts.push(log);
    }
    parts.push(boxMesh(2.2, 0.08, 0.14, 0x6b4a2b, 0, 0.26, -0.9), boxMesh(2.2, 0.08, 0.14, 0x6b4a2b, 0, 0.26, 0.9));
    for (const [px, pz] of [[-0.55, 0.3], [0.55, 0.3], [-0.55, 1.1], [0.55, 1.1]]) {
      parts.push(boxMesh(0.07, 0.9, 0.07, 0x6b4a2b, px, 0.72, pz));
    }
    const thatch = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 4), M(0xa07a3a));
    thatch.rotation.y = Math.PI / 4;
    thatch.position.set(0, 1.45, 0.7);
    parts.push(thatch);
  } else if (def.id === 'katig') {
    const blue = M(0x2a79b8);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 3.6), blue);
    hull.position.y = 0.1;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), blue);
    bow.rotation.x = -Math.PI / 2;
    bow.scale.set(1, 1, 0.5);
    bow.position.set(0, 0.1, -2.25);
    const stern = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), blue);
    stern.rotation.x = Math.PI / 2;
    stern.scale.set(1, 1, 0.5);
    stern.position.set(0, 0.1, 2.25);
    parts.push(hull, bow, stern);
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.7, 5);
    for (const pz of [-0.9, 0.9]) {
      const pole = new THREE.Mesh(poleGeo, M(0x6b4a2b));
      pole.rotation.z = Math.PI / 2;
      pole.position.set(0, 0.42, pz);
      parts.push(pole);
    }
    const floatGeo = new THREE.CylinderGeometry(0.17, 0.17, 3.0, 7);
    for (const fx of [-1.8, 1.8]) {
      const f = new THREE.Mesh(floatGeo, M(0xf2c14e));
      f.rotation.x = Math.PI / 2;
      f.position.set(fx, 0.12, 0);
      parts.push(f);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.8, 5), M(0x6b4a2b));
    mast.position.set(0, 1.6, -0.2);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(1, 2.3, 3), M(0xd9534f));
    sail.position.set(0, 1.75, -0.2);
    sail.scale.set(0.05, 1, 1.15);
    parts.push(mast, sail);
  }

  const nets = netParts(def.netR, netZ);
  for (const n of nets) n.scale.setScalar(1 + 0.08 * netLvl); // net upgrade is visible
  parts.push(...nets);
  for (const p of parts) p.castShadow = true;
  return parts;
}

function setBoat(id) {
  const def = boatById(id);
  for (const m of boatParts) boatInner.remove(m);
  boatParts = buildBoatParts(def);
  for (const m of boatParts) boatInner.add(m);
  curBoat = def;
}
setBoat(save.boat);

boat.position.set(0, 0.08, 24);
scene.add(boat);

/* ---------- trash templates ---------- */
const trashTemplates = [];
{
  // bottle
  let g = new THREE.Group();
  let m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.55, 8),
    M(0x7fd6ee, { transparent: true, opacity: 0.85 }),
  );
  m.rotation.z = Math.PI / 2;
  m.renderOrder = 1;
  let cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 8), M(0x2b57c9));
  cap.rotation.z = Math.PI / 2;
  cap.position.x = 0.34;
  g.add(m, cap);
  trashTemplates.push(g);

  // can
  g = new THREE.Group();
  m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10), M(0xcfd4d8));
  m.rotation.z = 0.5;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.14, 10), M(0xd93a3a));
  band.rotation.z = 0.5;
  g.add(m, band);
  trashTemplates.push(g);

  // plastic bag
  g = new THREE.Group();
  m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), M(0xf2f2f2));
  m.scale.set(1.1, 0.5, 1.3);
  g.add(m);
  trashTemplates.push(g);

  // dark bag
  g = new THREE.Group();
  m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), M(0x2b2f3a));
  m.scale.set(1.0, 0.55, 1.2);
  g.add(m);
  trashTemplates.push(g);

  // cardboard crate
  g = new THREE.Group();
  m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.55), M(0xc08a4a));
  g.add(m);
  trashTemplates.push(g);

  // old tire
  g = new THREE.Group();
  m = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.15, 8, 14), M(0x1d1d22));
  m.rotation.x = Math.PI / 2;
  g.add(m);
  trashTemplates.push(g);
}

/* ---------- animal templates ---------- */
function buildDuck() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), M(0xfff4d6));
  body.scale.set(0.9, 0.7, 1.25);
  body.position.y = 0.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M(0x2f8f4e));
  head.position.set(0, 0.55, -0.5);
  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.22), M(0xff9d1c));
  beak.position.set(0, 0.5, -0.74);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4), M(0xfff4d6));
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.3, 0.6);
  const eyeMat = M(0x111111);
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
  e1.position.set(0.1, 0.6, -0.62);
  const e2 = e1.clone();
  e2.position.x = -0.1;
  g.add(body, head, beak, tail, e1, e2);
  return g;
}

function buildFish() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M(0xff8a2b));
  body.scale.set(0.55, 0.7, 1.5);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), M(0xff6a1a));
  tail.rotation.x = -Math.PI / 2;
  tail.scale.x = 0.25;
  tail.position.z = 0.62;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), M(0xff6a1a));
  fin.scale.x = 0.25;
  fin.position.y = 0.28;
  const eyeMat = M(0x111111);
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
  e1.position.set(0.1, 0.08, -0.38);
  const e2 = e1.clone();
  e2.position.x = -0.1;
  g.add(body, tail, fin, e1, e2);
  return g;
}

function buildTurtle() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 8, 0, TAU, 0, Math.PI / 2),
    M(0x4f8a3c),
  );
  shell.scale.set(1, 0.6, 1.25);
  const skin = M(0x9cc25a);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), skin);
  head.position.set(0, 0.1, -0.78);
  g.add(shell, head);
  for (const [x, z] of [
    [0.5, -0.4],
    [-0.5, -0.4],
    [0.5, 0.45],
    [-0.5, 0.45],
  ]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), skin);
    f.scale.set(1.1, 0.4, 1.4);
    f.position.set(x, 0.02, z);
    g.add(f);
  }
  return g;
}

const ANIMAL_TYPES = [
  { name: 'duck', emoji: '🦆', build: buildDuck, speed: 1.4, y: 0.02 },
  { name: 'fish', emoji: '🐟', build: buildFish, speed: 2.4, y: -0.45 },
  { name: 'turtle', emoji: '🐢', build: buildTurtle, speed: 1.0, y: 0.0 },
];
const animalTemplates = {};
for (const type of ANIMAL_TYPES) animalTemplates[type.name] = type.build();

/* ---------- game state ---------- */
let state = 'menu'; // 'menu' | 'playing' | 'over'
let t = 0;
let gameTime = 0;
let health = START_HEALTH;
let displayHealth = START_HEALTH;
let collected = 0;
let combo = 0;
let comboTimer = 0;
let spawnTimer = 1;
let syncTimer = 0;
let toastCooldown = 0;
let animalSerial = 0;
let boatYaw = 0;
let wakeTimer = 0;
let viewMode = 'wide'; // 'wide' | 'boat' | 'wildlife'
let focus = null; // animal the wildlife camera follows
let focusTimer = 0;
let muted = false;
let reachedClean = false;
let reachedSilent = false;
const vel = { x: 0, z: 0 };

const trash = [];
const animals = [];
const ripples = [];

/* ---------- sound: everything is synthesised, no audio files ---------- */
let AC = null;
let busMaster = null;
let busSfx = null;
let busMusic = null;
let noiseBuf = null;
let echoIn = null;
let musicTimer = 0;
let nextChordT = 0;
let nextNoteT = 0;
let chordIdx = 0;

const MODES = {
  // river is healthy: major pentatonic over C. river is sick: minor over A.
  bright: { root: 261.63, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]] },
  dark: { root: 220, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] },
};
const semi = (root, n) => root * Math.pow(2, n / 12);

function mkGain(v, to) {
  const g = AC.createGain();
  g.gain.value = v;
  if (to) g.connect(to);
  return g;
}

function initAudio() {
  if (AC) {
    if (AC.state === 'suspended') AC.resume();
    return;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  try {
    AC = new Ctor();
    busMaster = mkGain(muted ? 0 : 0.9, AC.destination);
    busSfx = mkGain(0.8, busMaster);
    busMusic = mkGain(0.3, busMaster);
    const busAmb = mkGain(0.55, busMaster);

    // brown-ish noise, looped, is the base of the water and every splash
    const len = Math.max(1, Math.floor(AC.sampleRate * 2));
    noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }

    // river: slow swell of low noise + a quiet high babble
    const layer = (type, freq, vol, lfoHz, lfoDepth) => {
      const src = AC.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = AC.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = mkGain(vol, busAmb);
      const lfo = AC.createOscillator();
      lfo.frequency.value = lfoHz;
      const depth = mkGain(lfoDepth, g.gain);
      lfo.connect(depth);
      src.connect(f);
      f.connect(g);
      src.start();
      lfo.start();
    };
    layer('lowpass', 700, 0.35, 0.11, 0.12);
    layer('bandpass', 1900, 0.05, 0.31, 0.03);

    // a soft echo that the music notes send into
    echoIn = mkGain(0.45, busMusic);
    const delay = AC.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = mkGain(0.38, delay);
    delay.connect(fb);
    echoIn.connect(delay);
    delay.connect(busMusic);

    nextChordT = AC.currentTime + 0.2;
    nextNoteT = AC.currentTime + 0.9;
    musicTimer = setInterval(musicTick, 300);
    if (musicTimer && musicTimer.unref) musicTimer.unref();
    if (document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (!AC) return;
        if (document.hidden) AC.suspend();
        else AC.resume();
      });
    }
  } catch (e) {
    AC = null; // audio is optional
  }
}

function padNote(f, t, dur) {
  for (const detune of [-4, 4]) {
    const o = AC.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.detune.value = detune;
    const g = mkGain(0.0001, busMusic);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 1.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

function pluck(f, t, dur) {
  const o = AC.createOscillator();
  o.type = 'triangle';
  o.frequency.value = f;
  const g = mkGain(0.0001, busMusic);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.11, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(echoIn);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function musicTick() {
  if (!AC || muted || AC.state !== 'running') return;
  const now = AC.currentTime;
  if (nextChordT < now - 1) nextChordT = now;
  if (nextNoteT < now - 1) nextNoteT = now;
  const mode = health < 35 ? MODES.dark : MODES.bright;

  while (nextChordT < now + 1.2) {
    const chord = mode.chords[chordIdx++ % mode.chords.length];
    for (const n of chord) padNote(semi(mode.root, n - 12), nextChordT, 6.4);
    nextChordT += 6;
  }
  while (nextNoteT < now + 1.0) {
    if (Math.random() < 0.75) {
      const n = mode.scale[Math.floor(Math.random() * mode.scale.length)] + (Math.random() < 0.7 ? 12 : 24);
      pluck(semi(mode.root, n), nextNoteT, 1.6);
    }
    nextNoteT += pick([0.9, 1.35, 1.8, 0.9]);
  }
}

function tone(t, f0, f1, dur, vol, type = 'sine') {
  const o = AC.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = mkGain(0.0001, busSfx);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function splash(t, dur, freq, vol) {
  const src = AC.createBufferSource();
  src.buffer = noiseBuf;
  const f = AC.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
  f.Q.value = 0.9;
  const g = mkGain(0.0001, busSfx);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

const SFX = {
  scoop(combo) {
    const t = AC.currentTime;
    splash(t, 0.22, 1400, 0.9);
    const up = Math.min(combo || 1, 10) * 45;
    tone(t + 0.05, 740 + up, 1100 + up, 0.12, 0.09, 'triangle'); // coin tick, higher on a streak
  },
  escape() {
    const t = AC.currentTime;
    tone(t, 170, 70, 0.3, 0.16, 'sawtooth');
    splash(t, 0.3, 500, 0.5);
  },
  animal() {
    const t = AC.currentTime;
    tone(t, 660, 660, 0.18, 0.08);
    tone(t + 0.1, 880, 880, 0.28, 0.08);
  },
  click() {
    tone(AC.currentTime, 520, 640, 0.07, 0.07, 'triangle');
  },
  buy() {
    const t = AC.currentTime;
    [784, 988, 1319].forEach((f, i) => tone(t + i * 0.08, f, f, 0.2, 0.09, 'triangle'));
  },
  mission() {
    const t = AC.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, f, f, 0.32, 0.1, 'triangle'));
  },
  bark() {
    const t = AC.currentTime;
    tone(t, 420, 220, 0.1, 0.09, 'sawtooth');
    tone(t + 0.17, 400, 210, 0.1, 0.09, 'sawtooth');
  },
  moo() {
    const t = AC.currentTime;
    tone(t, 150, 105, 0.9, 0.13, 'triangle');
  },
  bleat() {
    const t = AC.currentTime;
    tone(t, 520, 400, 0.35, 0.06, 'sawtooth');
    tone(t + 0.3, 480, 340, 0.3, 0.06, 'sawtooth');
  },
  cluck() {
    const t = AC.currentTime;
    tone(t, 760, 520, 0.06, 0.05, 'square');
    tone(t + 0.1, 700, 500, 0.06, 0.05, 'square');
  },
  plop() {
    const t = AC.currentTime;
    tone(t, 320, 110, 0.14, 0.12);
    splash(t, 0.18, 700, 0.35);
  },
};
function sfx(name, arg) {
  if (!AC || muted || AC.state !== 'running') return;
  try {
    SFX[name](arg);
  } catch (e) {
    /* never let a sound break the game */
  }
}
// kept for simple one-off blips
function beep(freq, dur = 0.12, type = 'sine', vol = 0.07) {
  if (!AC || muted || AC.state !== 'running') return;
  try {
    tone(AC.currentTime, freq, freq, dur, vol, type);
  } catch (e) {
    /* ignore */
  }
}

/* ---------- UI helpers ---------- */
const hudEls = {
  hud: $('hud'),
  bottom: $('bottom'),
  pct: $('pct'),
  mood: $('mood'),
  flavor: $('flavor'),
  pips: $('pips').querySelectorAll('svg'),
  barWater: $('bar-water'),
  barWildlife: $('bar-wildlife'),
  barTrash: $('bar-trash'),
  barStreak: $('bar-streak'),
  streakLabel: $('streak-label'),
  pillTrash: $('coin-line'),
  coins: $('coins'),
  mcLabel: $('mc-label'),
  mcProg: $('mc-prog'),
  mcBar: $('mc-bar'),
  menuCoins: $('menu-coins'),
  caption: $('caption-text'),
  sound: $('sound'),
  overlay: $('overlay'),
  play: $('play'),
};
const viewButtons = document.querySelectorAll('#views button');

// what the river looks and feels like at each health level
const TIERS = [
  { min: 0, mood: 'Silent. Nothing swims here.', flavor: 'The water has gone the colour of tea.' },
  { min: 10, mood: 'Barely breathing.', flavor: 'A lone bottle bobs where the fish used to turn.' },
  { min: 25, mood: 'Murky, but not lost.', flavor: 'Someone has started to care.' },
  { min: 45, mood: 'Getting clearer.', flavor: 'You can almost see the riverbed.' },
  { min: 65, mood: 'Alive again.', flavor: 'Ducks are back at the bend.' },
  { min: 85, mood: 'Running clear.', flavor: 'Fish flash silver in the shallows.' },
];
const IDLE_LINES = [
  'The current carries everything downstream.',
  'Scoop it before it reaches the sea.',
  'Every bottle you lift is one fewer in the sea.',
  'The ducks keep an eye on you from the reeds.',
];
const VIEW_HINTS = {
  wide: 'The whole river, from above.',
  boat: 'Low behind the boat. Watch for bottles.',
  wildlife: 'Following whoever lives nearby.',
};

const hudCache = {};
function setText(key, el, v) {
  if (hudCache[key] !== v) {
    hudCache[key] = v;
    el.textContent = v;
  }
}
function setWidth(key, el, pct) {
  const v = pct.toFixed(0) + '%';
  if (hudCache[key] !== v) {
    hudCache[key] = v;
    el.style.width = v;
  }
}

// the caption bar shows the latest event, then drifts back to idle lines
let captionHold = 0;
let idleTimer = 0;
let idleIndex = 0;
function toast(msg) {
  hudEls.caption.textContent = msg;
  captionHold = 4.5;
  idleTimer = 0;
}
function updateCaption(dt) {
  if (state !== 'playing') return;
  captionHold -= dt;
  if (captionHold > 0) return;
  idleTimer -= dt;
  if (idleTimer <= 0) {
    hudEls.caption.textContent = IDLE_LINES[idleIndex++ % IDLE_LINES.length];
    idleTimer = 8;
  }
}

function updateHud() {
  setText('pct', hudEls.pct, String(Math.round(health)));

  let tier = TIERS[0];
  for (const tr of TIERS) if (health >= tr.min) tier = tr;
  setText('mood', hudEls.mood, tier.mood);
  setText('flavor', hudEls.flavor, tier.flavor);

  const lit = Math.round(displayHealth / 10);
  for (let i = 0; i < 10; i++) {
    const on = i < lit;
    if (hudCache['pip' + i] !== on) {
      hudCache['pip' + i] = on;
      hudEls.pips[i].classList.toggle('on', on);
    }
  }

  const present = animals.filter((a) => !a.leaving).length;
  setWidth('bw', hudEls.barWater, displayHealth);
  setWidth('bl', hudEls.barWildlife, clamp(present / 12, 0, 1) * 100);
  setWidth('bt', hudEls.barTrash, clamp(trash.length / 30, 0, 1) * 100);
  setWidth('bs', hudEls.barStreak, comboTimer > 0 ? clamp(comboTimer / comboWindow(), 0, 1) * 100 : 0);
  setText('streak', hudEls.streakLabel, combo > 1 && comboTimer > 0 ? 'Streak ×' + combo : 'Streak');
  setText('coins', hudEls.coins, String(save.coins));
  setText('menucoins', hudEls.menuCoins, String(save.coins));

  const cm = save.missions.find((m) => !m.done);
  if (cm) {
    setText('mcl', hudEls.mcLabel, poolOf(cm.type).label);
    setText('mcp', hudEls.mcProg, Math.min(cm.progress, cm.target) + '/' + cm.target);
    setWidth('mcb', hudEls.mcBar, clamp(cm.progress / cm.target, 0, 1) * 100);
  } else {
    setText('mcl', hudEls.mcLabel, 'All done!');
    setText('mcp', hudEls.mcProg, '');
    setWidth('mcb', hudEls.mcBar, 100);
  }
}

/* ---------- ripples ---------- */
const ringGeo = new THREE.RingGeometry(0.35, 0.5, 28).rotateX(-Math.PI / 2);
function addRipple(x, z, size = 1, color = 0xffffff) {
  if (ripples.length > 40) return;
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const m = new THREE.Mesh(ringGeo, mat);
  m.position.set(x, 0.14, z);
  m.scale.setScalar(size * 0.6);
  m.renderOrder = 2;
  scene.add(m);
  ripples.push({ m, age: 0, life: 0.9, size });
}

function updateRipples(dt) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.age += dt;
    const k = r.age / r.life;
    if (k >= 1) {
      scene.remove(r.m);
      r.m.material.dispose();
      ripples.splice(i, 1);
      continue;
    }
    r.m.scale.setScalar(r.size * (0.6 + k * 2.2));
    r.m.material.opacity = 0.7 * (1 - k);
  }
}

/* ---------- trash ---------- */
let trashSerial = 0;
function spawnTrash(z, x, forcedType, forcedId) {
  const type =
    Number.isInteger(forcedType) && forcedType >= 0 && forcedType < trashTemplates.length
      ? forcedType
      : Math.floor(Math.random() * trashTemplates.length);
  const mesh = trashTemplates[type].clone();
  mesh.scale.setScalar(1.35);
  mesh.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const item = {
    mesh,
    type,
    id: forcedId !== undefined ? forcedId : ++trashSerial,
    phase: rand(0, TAU),
    spin: rand(-0.8, 0.8),
    x: x === undefined ? rand(-HALF_W + 2, HALF_W - 2) : x,
    z,
  };
  item.tx = item.x;
  item.tz = z;
  mesh.position.set(item.x, 0.12, z);
  mesh.rotation.y = rand(0, TAU);
  scene.add(mesh);
  trash.push(item);
  return item;
}

// what the player who scooped gets: coins, streak, missions, sound
function scoopReward(it) {
  collected++;
  combo = comboTimer > 0 ? combo + 1 : 1;
  comboTimer = comboWindow();
  const gain = Math.round((combo >= 3 ? 2 : 1) * season().m.coin); // a streak pays double
  save.coins += gain;
  missionEvent('scoop', 1);
  missionEvent('streak', combo);
  missionEvent('earn', gain);
  persist();
  addRipple(it.x, it.z, 1.8, 0x9ff0ff);
  sfx('scoop', combo);
  if (combo >= 4 && combo % 4 === 0) sayLine('praise');
  hudEls.pillTrash.classList.remove('pop');
  void hudEls.pillTrash.offsetWidth;
  hudEls.pillTrash.classList.add('pop');
}

function collectTrash(i) {
  const it = trash[i];
  scene.remove(it.mesh);
  trash.splice(i, 1);
  health = Math.min(100, health + 2.2);
  scoopReward(it);
}

// host only: a friend's boat scooped it, tell them so they get the coins
function collectRemote(i, pid) {
  const it = trash[i];
  scene.remove(it.mesh);
  trash.splice(i, 1);
  health = Math.min(100, health + 2.2);
  addRipple(it.x, it.z, 1.8, 0x9ff0ff);
  const conn = NET.conns.get(pid);
  try {
    if (conn) conn.send({ t: 'got', id: it.id });
  } catch (e) {
    /* friend dropped */
  }
}

function trashEscaped(i) {
  const it = trash[i];
  scene.remove(it.mesh);
  trash.splice(i, 1);
  health = Math.max(0, health - 3.5);
  addRipple(it.x, it.z, 2, 0xff6a5a);
  sfx('escape');
  if (toastCooldown <= 0) {
    toast('⚠️ Trash floated out to sea!');
    toastCooldown = 2.5;
    if (Math.random() < 0.6) sayLine('escape');
  }
}

// every boat that can scoop: yours and, for the host, the friends' boats
function trashCollectors() {
  const list = [{ pid: 0, x: boat.position.x, z: boat.position.z, front: curBoat.front, yaw: boatYaw, reach: effReach() }];
  for (const r of remotes.values()) list.push({ pid: r.pid, x: r.x, z: r.z, front: r.front, yaw: r.yaw, reach: r.reach });
  return list.map((c) => ({
    pid: c.pid,
    x: c.x,
    z: c.z,
    px: c.x - Math.sin(c.yaw) * c.front,
    pz: c.z - Math.cos(c.yaw) * c.front,
    r2: c.reach * c.reach,
  }));
}

function updateTrash(dt, active) {
  const authority = NET.role !== 'client'; // in a room, the host owns the trash
  if (active && authority) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTrash(-HALF_L + 1);
      spawnTimer = Math.max(1.1, 2.2 - gameTime * 0.006) / season().m.trash;
    }
  }
  const cols = active && authority ? trashCollectors() : [];
  for (let i = trash.length - 1; i >= 0; i--) {
    const it = trash[i];
    if (!authority) {
      // friend's game: glide toward where the host says each piece is
      const k = Math.min(1, 12 * dt);
      it.x += (it.tx - it.x) * k;
      it.z += (it.tz - it.z) * k;
    } else if (active) {
      it.z += FLOW * season().m.flow * dt;
      it.x = clamp(it.x + Math.sin(t * 0.7 + it.phase) * 0.4 * dt, -HALF_W + 1, HALF_W - 1);
      let taken = false;
      for (const c of cols) {
        const dx = it.x - c.px;
        const dz = it.z - c.pz;
        const bx = it.x - c.x;
        const bz = it.z - c.z;
        if (dx * dx + dz * dz < 2.4 * c.r2 || bx * bx + bz * bz < 2.2) {
          if (c.pid === 0) collectTrash(i);
          else collectRemote(i, c.pid);
          taken = true;
          break;
        }
      }
      if (taken) continue;
      if (it.z > HALF_L - 0.5) {
        trashEscaped(i);
        continue;
      }
    }
    it.mesh.position.set(it.x, 0.12 + Math.sin(t * 2 + it.phase) * 0.05, it.z);
    it.mesh.rotation.y += it.spin * dt;
    it.mesh.rotation.z = Math.sin(t * 1.5 + it.phase) * 0.12;
  }
}

/* ---------- animals ---------- */
function pickTarget(a) {
  a.tx = rand(-HALF_W + 2, HALF_W - 2);
  a.tz = clamp(a.z + rand(-18, 18), -HALF_L + 3, HALF_L - 3);
  a.retarget = rand(4, 9);
}

function addAnimal(instant = false) {
  const type = ANIMAL_TYPES[animalSerial++ % ANIMAL_TYPES.length];
  const mesh = animalTemplates[type.name].clone();
  mesh.rotation.order = 'YXZ';
  mesh.traverse((o) => {
    if (o.isMesh) o.castShadow = type.name !== 'fish';
  });
  const a = {
    type,
    mesh,
    x: rand(-HALF_W + 3, HALF_W - 3),
    z: rand(-HALF_L + 8, HALF_L - 8),
    yaw: rand(0, TAU),
    tx: 0,
    tz: 0,
    retarget: 0,
    phase: rand(0, TAU),
    scale: instant ? 1 : 0,
    leaving: false,
    jumpT: -1,
    jumpCool: rand(2, 6),
    flee: 0,
  };
  pickTarget(a);
  mesh.position.set(a.x, type.y, a.z);
  mesh.scale.setScalar(Math.max(0.001, a.scale));
  scene.add(mesh);
  animals.push(a);
  if (!instant) {
    addRipple(a.x, a.z, 2.2);
    toast(`${type.emoji} A ${type.name} swam back to the river!`);
    sfx('animal');
    if (Math.random() < 0.7) sayCustom('May bumalik na ' + ANIMAL_TAGALOG[type.name] + '!');
  }
}

function syncAnimals(dt) {
  syncTimer -= dt;
  if (syncTimer > 0) return;
  const present = animals.filter((a) => !a.leaving);
  const hb = health + season().m.animals;
  const arrive = Math.floor(hb / 9);
  const stay = Math.floor((hb + 5) / 9);
  if (present.length < arrive) {
    addAnimal(false);
    syncTimer = 1.2;
  } else if (present.length > stay) {
    const a = present[present.length - 1];
    a.leaving = true;
    syncTimer = 1.2;
    toast(`😢 A ${a.type.name} left the dirty river...`);
  }
}

function updateAnimals(dt, active) {
  for (let i = animals.length - 1; i >= 0; i--) {
    const a = animals[i];

    if (a.leaving) {
      a.scale -= dt * 1.2;
      if (a.scale <= 0) {
        scene.remove(a.mesh);
        animals.splice(i, 1);
        continue;
      }
    } else if (a.scale < 1) {
      a.scale = Math.min(1, a.scale + dt * 1.2);
    }

    if (active) {
      // flee from the boat
      const bx = a.x - boat.position.x;
      const bz = a.z - boat.position.z;
      const bd = Math.hypot(bx, bz);
      if (bd < 3.2 && bd > 0.01 && a.flee <= 0 && !a.leaving) {
        a.flee = 1.4;
        a.tx = clamp(a.x + (bx / bd) * 10, -HALF_W + 2, HALF_W - 2);
        a.tz = clamp(a.z + (bz / bd) * 10, -HALF_L + 3, HALF_L - 3);
        a.retarget = 3;
      }
      a.flee -= dt;

      // wander
      a.retarget -= dt;
      const dx = a.tx - a.x;
      const dz = a.tz - a.z;
      if (a.retarget <= 0 || dx * dx + dz * dz < 2) pickTarget(a);
      const want = Math.atan2(-(a.tx - a.x), -(a.tz - a.z));
      a.yaw += clamp(angDiff(a.yaw, want), -2.2 * dt, 2.2 * dt);
      const sp = a.type.speed * (a.flee > 0 ? 1.8 : 1);
      a.x = clamp(a.x - Math.sin(a.yaw) * sp * dt, -HALF_W + 1.5, HALF_W - 1.5);
      a.z = clamp(a.z - Math.cos(a.yaw) * sp * dt, -HALF_L + 2, HALF_L - 2);
    }

    let y = a.type.y + Math.sin(t * 2 + a.phase) * (a.type.name === 'fish' ? 0.03 : 0.04);
    let pitch = 0;

    if (a.type.name === 'fish') {
      a.jumpCool -= dt;
      if (a.jumpT < 0 && a.jumpCool <= 0 && active && !a.leaving && a.scale >= 1) {
        a.jumpT = 0;
        a.jumpCool = rand(4, 9);
        addRipple(a.x, a.z, 1.2);
      }
      if (a.jumpT >= 0) {
        a.jumpT += dt / 0.9;
        if (a.jumpT >= 1) {
          a.jumpT = -1;
          addRipple(a.x, a.z, 1.4);
        } else {
          y = a.type.y + Math.sin(a.jumpT * Math.PI) * 1.5;
          pitch = (0.5 - a.jumpT) * 1.6;
        }
      }
    }

    y -= (1 - a.scale) * 0.4;
    a.mesh.position.set(a.x, y, a.z);
    a.mesh.rotation.y = a.yaw;
    a.mesh.rotation.x = pitch;
    a.mesh.rotation.z = Math.sin(t * 2 + a.phase) * 0.05;
    a.mesh.scale.setScalar(Math.max(0.001, a.scale * 1.25));
  }
}

/* ---------- people on the banks: fishermen and walkers who talk in Tagalog ---------- */
const BANK_Y = 0.4;
const SKIN = [0xf1c9a0, 0xd9a273, 0xb97f56, 0x8d5a3b];
const SHIRTS = [0xd9534f, 0x2b7bb9, 0xf0b429, 0x3a9d6e, 0xf4f1e8, 0x8e5bb5];
const PANTS = [0x2f3a4a, 0x4a3b2a, 0x55606e];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const bodyGeo = boxGeo(0.42, 0.56, 0.26);
const legGeo = boxGeo(0.15, 0.7, 0.17);
const armGeo = boxGeo(0.12, 0.5, 0.12);
const headGeo = new THREE.SphereGeometry(0.17, 10, 8);
const salakotGeo = new THREE.ConeGeometry(0.38, 0.22, 14);
const capGeo = new THREE.SphereGeometry(0.185, 8, 6, 0, TAU, 0, Math.PI / 2);
const rodGeo = new THREE.CylinderGeometry(0.018, 0.04, 2.6, 5);
const lineGeo = new THREE.CylinderGeometry(0.007, 0.007, 1, 3);
const bobberGeo = new THREE.SphereGeometry(0.09, 8, 6);
const bucketGeo = new THREE.CylinderGeometry(0.17, 0.13, 0.28, 8);
const rodMat = M(0x6b4a2b);
const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
const bobberMat = M(0xe0443c);
const bucketMat = M(0x3b79b8);
const salakotMat = M(0xd8b45a);
const capMat = M(0x2d3640);

function buildPerson(kind) {
  const g = new THREE.Group();
  const skin = M(pick(SKIN));
  const shirt = M(pick(SHIRTS));
  const pants = M(pick(PANTS));

  const body = new THREE.Mesh(bodyGeo, shirt);
  body.position.y = 0.98;
  const head = new THREE.Mesh(headGeo, skin);
  head.position.y = 1.44;

  // fishermen always wear a salakot (the traditional wide hat); walkers wear one or a cap
  const wearsSalakot = kind === 'fisher' || Math.random() < 0.4;
  const hat = new THREE.Mesh(wearsSalakot ? salakotGeo : capGeo, wearsSalakot ? salakotMat : capMat);
  hat.position.set(0, wearsSalakot ? 1.64 : 1.5, 0);

  const mkLimb = (geo, mat, x, y, drop) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -drop;
    pivot.add(m);
    return pivot;
  };
  const legL = mkLimb(legGeo, pants, -0.1, 0.7, 0.35);
  const legR = mkLimb(legGeo, pants, 0.1, 0.7, 0.35);
  const armL = mkLimb(armGeo, shirt, -0.27, 1.22, 0.22);
  const armR = mkLimb(armGeo, shirt, 0.27, 1.22, 0.22);

  g.add(body, head, hat, legL, legR, armL, armR);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  g.scale.setScalar(1.25);
  return { g, legL, legR, armL, armR };
}

function buildFisher(side, z) {
  const p = buildPerson('fisher');
  const g = p.g;
  g.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2; // face the water
  p.armL.rotation.x = 1.15;
  p.armR.rotation.x = 1.15;

  // rod, tilted out over the river (local forward is -z)
  const rod = new THREE.Group();
  rod.position.set(0, 0.95, -0.3);
  const rodMesh = new THREE.Mesh(rodGeo, rodMat);
  rodMesh.position.y = 1.3;
  rod.add(rodMesh);
  rod.rotation.x = -1.1;
  g.add(rod);

  // line + bobber hang straight down from the rod tip to the water
  const tipY = 0.95 + 2.6 * Math.cos(1.1);
  const tipZ = -0.3 - 2.6 * Math.sin(1.1);
  const waterY = -BANK_Y;
  const lineLen = tipY - waterY;
  const line = new THREE.Mesh(lineGeo, lineMat);
  line.scale.y = lineLen;
  line.position.set(0, (tipY + waterY) / 2, tipZ);
  const bobber = new THREE.Mesh(bobberGeo, bobberMat);
  bobber.position.set(0, waterY + 0.06, tipZ);
  g.add(line, bobber);

  const bucket = new THREE.Mesh(bucketGeo, bucketMat);
  bucket.position.set(0.7, 0.14, 0.2);
  bucket.castShadow = true;
  g.add(bucket);

  const x = side * (HALF_W + 0.9);
  g.position.set(x, BANK_Y, z);
  scene.add(g);
  const fwd = { x: -Math.sin(g.rotation.y), z: -Math.cos(g.rotation.y) };
  return {
    kind: 'fisher',
    mesh: g,
    x,
    z,
    rod,
    bobber,
    bobberBase: waterY + 0.06,
    bobX: x + fwd.x * -tipZ,
    bobZ: z + fwd.z * -tipZ,
    biteT: 0,
    biteIn: rand(6, 14),
    phase: rand(0, TAU),
  };
}

function buildWalker(side, z, dir) {
  const p = buildPerson('walker');
  const x = side * (HALF_W + 2.6);
  p.g.position.set(x, BANK_Y, z);
  scene.add(p.g);
  return {
    kind: 'walker',
    mesh: p.g,
    legL: p.legL,
    legR: p.legR,
    armL: p.armL,
    armR: p.armR,
    x,
    z,
    dir,
    speed: rand(0.9, 1.5),
    phase: rand(0, TAU),
  };
}

const humans = [
  buildFisher(-1, -30),
  buildFisher(1, -10),
  buildFisher(-1, 12),
  buildFisher(1, 30),
  buildWalker(-1, -36, 1),
  buildWalker(1, 2, -1),
  buildWalker(-1, 26, -1),
  buildWalker(1, 40, 1),
];

/* what the people say, by how healthy the river is */
const LINES = {
  dirty: [
    'Ang dumi na ng ilog...',
    'Walang isda, puro basura!',
    'Sino ba ang nagtapon nito?',
    'Ang baho na dito, grabe.',
    'Dati ang linaw ng tubig dito.',
  ],
  mid: [
    'Gumaganda na ang ilog!',
    'Salamat sa paglilinis, kapitan!',
    'Unti-unti nang luminaw ang tubig.',
    'May mga isda na ulit!',
    'Huwag tayong magtapon sa ilog, ha?',
  ],
  clean: [
    'Ang linis na ng ilog!',
    'Maraming salamat, Riverkeeper!',
    'Balik na ang mga pato!',
    'Ang sarap tumambay dito.',
    'Ang daming isda ngayon!',
  ],
  banter: ['Miss ko na sya.', 'Sana all may baby!'],
  season: [],
  praise: ['Galing mo, kapitan!', 'Ang bilis mo!', 'Sige lang, kaya mo yan!', 'Ayos! Isa pa!'],
  escape: ['Naku, nakawala ang basura!', 'Habulin mo, kapitan!', 'Huwag hayaang umabot sa dagat!'],
  bite: ['May kagat na!', 'Humihila na!'],
  catchBad: ['Plastik na naman ang nahuli ko!', 'Lata lang pala!'],
  catchGood: ['Huli! Ang laki!', 'Ayos, may ulam na tayo!'],
};
const ANIMAL_TAGALOG = { duck: 'pato', fish: 'isda', turtle: 'pagong' };

/* speech bubbles: three DOM elements pinned above the speakers' heads */
const bubbles = [0, 1, 2].map((i) => ({ el: $('sp' + i), who: null, t: 0 }));
const tmpV = new THREE.Vector3();

function headScreen(h) {
  tmpV.set(h.x, BANK_Y + (h.hy || 2.7), h.z).project(camera);
  const x = (tmpV.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
  const ok = tmpV.z < 1 && x > 20 && x < window.innerWidth - 20 && y > 90 && y < window.innerHeight - 140;
  return { x, y, z: tmpV.z, ok };
}

function sayAs(h, text, secs = 3.6) {
  let slot = bubbles.find((b) => b.who === h) || bubbles.find((b) => !b.who);
  if (!slot) slot = bubbles.reduce((a, b) => (b.t < a.t ? b : a));
  slot.who = h;
  slot.t = secs;
  slot.el.textContent = text;
  slot.el.classList.add('show');
}

function sayLine(kind, fromFisher = false) {
  if (state !== 'playing' || uiOpen()) return;
  const pool = humans.filter((h) => (!fromFisher || h.kind === 'fisher') && headScreen(h).ok);
  if (!pool.length) return;
  sayAs(pick(pool), pick(kind === 'season' ? season().lines : LINES[kind]));
}
function sayCustom(text) {
  if (state !== 'playing' || uiOpen()) return;
  const pool = humans.filter((h) => headScreen(h).ok);
  if (pool.length) sayAs(pick(pool), text);
}

function healthTier() {
  return health < 30 ? 'dirty' : health < 70 ? 'mid' : 'clean';
}

let chatTimer = 7;

function updateHumans(dt, active) {
  for (const h of humans) {
    h.phase += dt * (h.kind === 'walker' ? h.speed * 5 : 1.4);

    if (h.kind === 'walker') {
      if (active) h.z += h.dir * h.speed * dt;
      if (h.z > HALF_L + 8) h.dir = -1;
      if (h.z < -HALF_L - 8) h.dir = 1;
      const swing = Math.sin(h.phase) * 0.6;
      h.legL.rotation.x = swing;
      h.legR.rotation.x = -swing;
      h.armL.rotation.x = -swing * 0.7;
      h.armR.rotation.x = swing * 0.7;
      h.mesh.rotation.y = h.dir > 0 ? Math.PI : 0;
      h.mesh.position.set(h.x, BANK_Y + Math.abs(Math.sin(h.phase)) * 0.04, h.z);
    } else {
      // fisherman: idle sway, a bite now and then
      h.mesh.position.y = BANK_Y + Math.sin(h.phase) * 0.012;
      h.rod.rotation.x = -1.1 + Math.sin(h.phase * 0.7) * 0.015;
      h.bobber.position.y = h.bobberBase + Math.sin(h.phase * 2) * 0.02;
      if (active) h.biteIn -= dt;
      if (h.biteIn <= 0 && h.biteT <= 0) {
        h.biteT = 1.6;
        h.biteIn = rand(12, 24);
        addRipple(h.bobX, h.bobZ, 1.1);
        if (headScreen(h).ok) {
          sayAs(h, pick(LINES.bite), 2);
          sfx('plop');
        }
      }
      if (h.biteT > 0) {
        h.biteT -= dt;
        h.rod.rotation.x = -1.1 + Math.sin(h.biteT * 22) * 0.1 * Math.min(1, h.biteT);
        h.bobber.position.y = h.bobberBase - 0.12 * Math.min(1, h.biteT);
        if (h.biteT <= 0) {
          addRipple(h.bobX, h.bobZ, 1.4);
          if (headScreen(h).ok) sayAs(h, pick(health < 30 ? LINES.catchBad : LINES.catchGood), 3);
        }
      }
    }
  }

  if (active) {
    chatTimer -= dt;
    if (chatTimer <= 0) {
      chatTimer = rand(7, 12);
      const r = Math.random();
      sayLine(r < 0.22 ? 'season' : r < 0.42 ? 'banter' : healthTier());
    }
  }
}

function updateBubbles(dt) {
  for (const b of bubbles) {
    if (!b.who) continue;
    b.t -= dt;
    const sp = headScreen(b.who);
    if (b.t <= 0 || state !== 'playing' || uiOpen()) {
      b.who = null;
      b.el.classList.remove('show');
      continue;
    }
    const x = clamp(sp.x, 90, window.innerWidth - 90);
    const y = clamp(sp.y, 100, window.innerHeight - 150);
    b.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
    b.el.classList.toggle('show', sp.x > -40 && sp.x < window.innerWidth + 40 && sp.z < 1);
  }
}

/* ---------- land animals on the banks ---------- */
// a leg or head that swings from a pivot at (x, y, z); the box hangs below the pivot
function limb(w, h, d, color, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color));
  m.position.y = -h / 2;
  m.castShadow = true;
  pivot.add(m);
  return pivot;
}
function blob(geo, color, x, y, z) {
  const m = new THREE.Mesh(geo, M(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function buildCarabao() {
  const g = new THREE.Group();
  const hide = 0x4a4a52;
  const legs = [
    limb(0.2, 0.6, 0.2, hide, -0.3, 0.6, -0.55),
    limb(0.2, 0.6, 0.2, hide, 0.3, 0.6, -0.55),
    limb(0.2, 0.6, 0.2, hide, -0.3, 0.6, 0.55),
    limb(0.2, 0.6, 0.2, hide, 0.3, 0.6, 0.55),
  ];
  const head = new THREE.Group();
  head.position.set(0, 1.2, -0.95);
  head.add(blob(new THREE.BoxGeometry(0.45, 0.45, 0.65), 0x3b3b42, 0, 0, -0.28));
  for (const sx of [-1, 1]) {
    const horn = blob(new THREE.CylinderGeometry(0.045, 0.06, 0.7, 6), 0xe8e0cc, sx * 0.4, 0.22, -0.12);
    horn.rotation.z = sx * 1.15;
    head.add(horn);
  }
  const tail = blob(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), hide, 0, 1.0, 0.95);
  tail.rotation.x = 0.4;
  g.add(blob(new THREE.BoxGeometry(1.0, 0.8, 1.7), hide, 0, 1.0, 0), head, tail, ...legs);
  return { g, legs, head, grazeX: -0.75 };
}

function buildGoat() {
  const g = new THREE.Group();
  const fur = 0xf1ead8;
  const legs = [
    limb(0.1, 0.55, 0.1, 0xd8cdb4, -0.14, 0.55, -0.3),
    limb(0.1, 0.55, 0.1, 0xd8cdb4, 0.14, 0.55, -0.3),
    limb(0.1, 0.55, 0.1, 0xd8cdb4, -0.14, 0.55, 0.3),
    limb(0.1, 0.55, 0.1, 0xd8cdb4, 0.14, 0.55, 0.3),
  ];
  const head = new THREE.Group();
  head.position.set(0, 0.98, -0.45);
  head.add(blob(new THREE.BoxGeometry(0.24, 0.28, 0.34), fur, 0, 0.02, -0.12));
  for (const sx of [-1, 1]) {
    const horn = blob(new THREE.ConeGeometry(0.04, 0.22, 5), 0x8a7a5a, sx * 0.08, 0.22, -0.02);
    horn.rotation.x = -0.4;
    head.add(horn);
  }
  head.add(blob(new THREE.ConeGeometry(0.04, 0.14, 5), 0xd8cdb4, 0, -0.17, -0.24));
  const tail = blob(new THREE.ConeGeometry(0.06, 0.18, 5), fur, 0, 0.95, 0.46);
  g.add(blob(new THREE.BoxGeometry(0.45, 0.4, 0.85), fur, 0, 0.78, 0), head, tail, ...legs);
  return { g, legs, head, grazeX: -0.8 };
}

function buildChicken() {
  const g = new THREE.Group();
  const legs = [
    limb(0.04, 0.25, 0.04, 0xe8b13a, -0.08, 0.25, 0),
    limb(0.04, 0.25, 0.04, 0xe8b13a, 0.08, 0.25, 0),
  ];
  const body = blob(new THREE.SphereGeometry(0.22, 8, 6), 0xb5532a, 0, 0.42, 0);
  body.scale.set(1, 0.85, 1.25);
  const head = new THREE.Group();
  head.position.set(0, 0.62, -0.2);
  head.add(
    blob(new THREE.SphereGeometry(0.1, 8, 6), 0xc2602f, 0, 0.04, 0),
    blob(new THREE.BoxGeometry(0.03, 0.08, 0.1), 0xd9342b, 0, 0.16, 0),
  );
  const beak = blob(new THREE.ConeGeometry(0.03, 0.08, 4), 0xf0a02a, 0, 0.02, -0.12);
  beak.rotation.x = -Math.PI / 2;
  head.add(beak);
  const tail = blob(new THREE.ConeGeometry(0.1, 0.3, 4), 0x6b3a22, 0, 0.55, 0.27);
  tail.rotation.x = 0.5;
  g.add(body, head, tail, ...legs);
  return { g, legs, head, grazeX: -0.9 };
}

function buildDog() {
  const g = new THREE.Group();
  const fur = 0xa0703a;
  const legs = [
    limb(0.1, 0.35, 0.1, 0x8a5d2e, -0.12, 0.38, -0.28),
    limb(0.1, 0.35, 0.1, 0x8a5d2e, 0.12, 0.38, -0.28),
    limb(0.1, 0.35, 0.1, 0x8a5d2e, -0.12, 0.38, 0.28),
    limb(0.1, 0.35, 0.1, 0x8a5d2e, 0.12, 0.38, 0.28),
  ];
  const head = new THREE.Group();
  head.position.set(0, 0.68, -0.42);
  head.add(
    blob(new THREE.BoxGeometry(0.26, 0.24, 0.3), fur, 0, 0, -0.1),
    blob(new THREE.BoxGeometry(0.14, 0.1, 0.16), 0x3a2a1c, 0, -0.04, -0.28),
    blob(new THREE.BoxGeometry(0.06, 0.14, 0.1), 0x5a3a1c, -0.12, 0.14, -0.04),
    blob(new THREE.BoxGeometry(0.06, 0.14, 0.1), 0x5a3a1c, 0.12, 0.14, -0.04),
  );
  const tail = blob(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 5), fur, 0, 0.74, 0.46);
  tail.rotation.x = 0.8;
  g.add(blob(new THREE.BoxGeometry(0.34, 0.32, 0.75), fur, 0, 0.55, 0), head, tail, ...legs);
  return { g, legs, head, grazeX: -0.6 };
}

const LAND_TYPES = {
  carabao: { en: 'carabao', tl: 'kalabaw', speed: 0.5, hy: 2.4, build: buildCarabao, say: ['Mooo...', 'Mmmooo!'], sfx: 'moo' },
  goat: { en: 'goat', tl: 'kambing', speed: 0.9, hy: 1.7, build: buildGoat, say: ['Meee!', 'Mehehe!'], sfx: 'bleat' },
  chicken: { en: 'chicken', tl: 'manok', speed: 0.8, hy: 1.1, build: buildChicken, say: ['Tok tok tok!', 'Tak-tak-tak!'], sfx: 'cluck' },
  dog: { en: 'dog', tl: 'aso', speed: 1.5, hy: 1.7, build: buildDog, say: ['Aw! Aw!', 'Aw aw aw!'], sfx: 'bark' },
};

// the cleaner the river, the more animals come back to the banks
const LAND_PLAN = [
  { type: 'carabao', minHealth: 0, base: 1.15 },
  { type: 'chicken', minHealth: 0, base: 0.9 },
  { type: 'goat', minHealth: 25, base: 1.0 },
  { type: 'chicken', minHealth: 40, base: 0.9 },
  { type: 'dog', minHealth: 55, base: 1.0 },
  { type: 'carabao', minHealth: 75, base: 0.85, baby: true },
];

const landAnimals = LAND_PLAN.map((p, i) => {
  const def = LAND_TYPES[p.type];
  const model = def.build();
  model.g.scale.setScalar(0.001);
  scene.add(model.g);
  const side = i % 2 ? 1 : -1;
  const la = {
    def,
    ...model,
    base: p.base,
    minHealth: p.minHealth,
    baby: !!p.baby,
    side,
    x: side * rand(HALF_W + 1.8, HALF_W + 4.4),
    z: rand(-HALF_L, HALF_L),
    yaw: rand(0, TAU),
    tx: 0,
    tz: 0,
    state: 'idle',
    idleT: rand(0.5, 4),
    moveT: 0,
    phase: rand(0, TAU),
    talkT: rand(8, 20),
    scale: 0,
    present: false,
    leaving: false,
    hy: def.hy,
  };
  la.g.visible = false;
  return la;
});

function pickLandTarget(la) {
  la.tx = la.side * rand(HALF_W + 1.8, HALF_W + 4.4);
  la.tz = clamp(la.z + rand(-12, 12), -HALF_L - 2, HALF_L + 6);
  la.moveT = rand(5, 10);
}

function syncLand(dt, instant) {
  for (const la of landAnimals) {
    const want = health + season().m.animals >= la.minHealth - (la.present ? 6 : 0);
    if (want && !la.present && !instant && la.minHealth > 0) {
      toast(la.baby ? 'A baby carabao was born on the riverbank!' : 'A ' + la.def.en + ' wandered back to the riverbank!');
      sfx('animal');
      sayCustom(la.baby ? 'Sana all may baby!' : 'May bumalik na ' + la.def.tl + '!');
    }
    la.present = want;
    la.leaving = !want;
    const target = want ? 1 : 0;
    la.scale = instant ? target : clamp(la.scale + Math.sign(target - la.scale) * dt * 1.5, 0, 1);
  }
}

function updateLand(dt, active) {
  syncLand(dt, false);
  for (const la of landAnimals) {
    if (la.scale <= 0.01) {
      la.g.visible = false;
      continue;
    }
    la.g.visible = true;

    let walking = false;
    if (active) {
      if (la.state === 'idle') {
        la.idleT -= dt;
        if (la.idleT <= 0) {
          la.state = 'walk';
          pickLandTarget(la);
        }
      } else {
        la.moveT -= dt;
        const dx = la.tx - la.x;
        const dz = la.tz - la.z;
        if (dx * dx + dz * dz < 0.6 || la.moveT <= 0) {
          la.state = 'idle';
          la.idleT = rand(2.5, 6);
        } else {
          walking = true;
          const want = Math.atan2(-dx, -dz);
          la.yaw += clamp(angDiff(la.yaw, want), -2 * dt, 2 * dt);
          la.x -= Math.sin(la.yaw) * la.def.speed * dt;
          la.z -= Math.cos(la.yaw) * la.def.speed * dt;
        }
      }

      la.talkT -= dt;
      if (la.talkT <= 0) {
        la.talkT = rand(14, 26);
        if (headScreen(la).ok) {
          sayAs(la, pick(la.def.say), 2.2);
          sfx(la.def.sfx);
        }
      }
    }

    la.phase += dt * (walking ? la.def.speed * 7 : 2);
    const swing = walking ? Math.sin(la.phase) * 0.55 : 0;
    la.legs.forEach((leg, k) => {
      leg.rotation.x = k === 0 || k === 3 ? swing : -swing;
    });
    // resting animals graze, chickens peck
    if (!walking) {
      const peck = la.def.sfx === 'cluck' ? Math.max(0, Math.sin(la.phase * 2.5)) : 1;
      la.head.rotation.x = la.grazeX * peck;
    } else {
      la.head.rotation.x = Math.sin(la.phase * 0.5) * 0.05;
    }

    la.g.position.set(la.x, BANK_Y + (walking ? Math.abs(Math.sin(la.phase)) * 0.04 : 0), la.z);
    la.g.rotation.y = la.yaw;
    la.g.scale.setScalar(la.base * la.scale);
  }
}

/* ---------- four seasons ---------- */
const SEASON_LEN = 80; // seconds of play per season
const SEASONS = [
  {
    id: 'spring', name: 'Spring', tl: 'Tagsibol', dot: '#f2a7c3',
    sky: 0xcfe9f7, grass: 0x6fbf5a, leaves: [0x62b84e, 0x78c85a, 0x8fd46a], water: 0x3fb6e8, sun: 0xfff0e0, sunI: 2.4, hemiAdd: 0.1,
    p: { color: 0xffc4dc, size: 0.36, count: 120, fall: 0.9, drift: 1.4 },
    m: { animals: 5, trash: 1, coin: 1, flow: 1, speed: 1 },
    note: 'Animals return more easily.',
    lines: ['Ang bango ng mga bulaklak!', 'Namumulaklak na ang mga halaman!', 'Ang ganda ng simoy ng hangin.'],
  },
  {
    id: 'summer', name: 'Summer', tl: 'Tag-init', dot: '#f2c14e',
    sky: 0x8fd2ff, grass: 0x62a83e, leaves: [0x2f7d3b, 0x3a8f45, 0x4a9e4c], water: 0x1fa3f0, sun: 0xfff4c0, sunI: 3.0, hemiAdd: 0.2,
    p: { color: 0xfff1a8, size: 0.22, count: 70, fall: 0.12, drift: 2.0 },
    m: { animals: 0, trash: 1.25, coin: 1.5, flow: 1, speed: 1 },
    note: 'More trash, but richer coins.',
    lines: ['Ang init! Maligo tayo mamaya.', 'Tag-init na naman!', 'Ang daming namamasyal ngayon.'],
  },
  {
    id: 'autumn', name: 'Autumn', tl: 'Taglagas', dot: '#d9792b',
    sky: 0xeccf9a, grass: 0xb89a45, leaves: [0xd9792b, 0xc2452d, 0xe8b53a], water: 0x6a8d9a, sun: 0xffc890, sunI: 2.0, hemiAdd: -0.1,
    p: { color: 0xd9792b, size: 0.44, count: 150, fall: 1.4, drift: 2.2 },
    m: { animals: 0, trash: 1, coin: 1, flow: 1.3, speed: 1 },
    note: 'The current runs faster.',
    lines: ['Nalalaglag na ang mga dahon.', 'Mahangin ngayon, ano?', 'Ang bilis ng agos ngayon!'],
  },
  {
    id: 'winter', name: 'Winter', tl: 'Taglamig', dot: '#9ec9e6',
    sky: 0xe3ecf2, grass: 0xeef3f6, leaves: [0xcfe0d6, 0xdbe8df, 0xe6f0ea], water: 0x7fbfdc, sun: 0xdfeaff, sunI: 1.5, hemiAdd: -0.15,
    p: { color: 0xffffff, size: 0.3, count: 260, fall: 1.6, drift: 0.8 },
    m: { animals: -5, trash: 0.8, coin: 1, flow: 1, speed: 0.88 },
    note: 'Cold water: slower boat, less trash.',
    lines: ['Brrr, ang lamig!', 'Magsuot ka ng jacket, kapitan!', 'Ang puti ng paligid!'],
  },
];
for (const se of SEASONS) {
  se.c = {
    sky: new THREE.Color(se.sky),
    grass: new THREE.Color(se.grass),
    leaves: se.leaves.map((x) => new THREE.Color(x)),
    water: new THREE.Color(se.water),
    sun: new THREE.Color(se.sun),
  };
}
let seasonIdx = save.season;
let seasonT = SEASON_LEN;
const season = () => SEASONS[seasonIdx];
// the colours on screen glide toward the season's colours
const seasonCols = {
  sky: season().c.sky.clone(),
  grass: season().c.grass.clone(),
  leaves: season().c.leaves.map((x) => x.clone()),
  water: season().c.water.clone(),
};

// falling petals, pollen, leaves or snow
const P_N = 260;
const pPos = new Float32Array(P_N * 3);
for (let i = 0; i < P_N; i++) {
  pPos[i * 3] = rand(-32, 32);
  pPos[i * 3 + 1] = rand(0, 22);
  pPos[i * 3 + 2] = rand(-30, 22);
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0.9, depthWrite: false });
try {
  if (document.createElement) {
    const cv = document.createElement('canvas');
    cv.width = 32;
    cv.height = 32;
    const g2 = cv.getContext('2d');
    const gr = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = gr;
    g2.fillRect(0, 0, 32, 32);
    pMat.map = new THREE.CanvasTexture(cv); // soft round flakes instead of squares
    pMat.needsUpdate = true;
  }
} catch (e) {
  /* squares are fine */
}
const particles = new THREE.Points(pGeo, pMat);
particles.frustumCulled = false;
scene.add(particles);

const seasonEls = { name: $('season-name'), dot: $('season-dot'), pill: $('season-pill') };

function applySeasonLook() {
  const se = season();
  pMat.color.set(se.p.color);
  pMat.size = se.p.size;
  pGeo.setDrawRange(0, se.p.count);
  seasonEls.name.textContent = se.name;
  seasonEls.dot.style.background = se.dot;
}

function setSeason(idx, announce, manual) {
  seasonIdx = idx;
  seasonT = SEASON_LEN;
  if (!isClient()) {
    save.season = idx;
    persist();
  }
  applySeasonLook();
  const se = season();
  if (announce && state === 'playing') {
    toast(se.tl + ' (' + se.name + ') begins. ' + se.note);
    sfx(manual ? 'click' : 'animal');
    if (!manual) sayLine('season');
  }
}

function nextSeason(manual) {
  if (isClient()) {
    if (manual) toast('Only the host can change the season.');
    return;
  }
  setSeason((seasonIdx + 1) % SEASONS.length, true, manual);
}

function updateSeason(dt) {
  if (isClient()) return;
  seasonT -= dt;
  if (seasonT <= 0) nextSeason(false);
}

function updateParticles(dt) {
  const se = season();
  const cx = camLook.x;
  const cz = camLook.z;
  for (let i = 0; i < se.p.count; i++) {
    const j = i * 3;
    pPos[j + 1] -= se.p.fall * (0.7 + (i % 5) * 0.15) * dt;
    pPos[j] += Math.sin(t * 0.8 + i) * se.p.drift * dt;
    pPos[j + 2] += Math.cos(t * 0.6 + i * 1.7) * se.p.drift * 0.4 * dt;
    if (pPos[j + 1] < 0.1 || Math.abs(pPos[j] - cx) > 36 || Math.abs(pPos[j + 2] - cz) > 40) {
      pPos[j] = cx + rand(-32, 32);
      pPos[j + 1] = se.p.fall < 0.3 ? rand(0.5, 6) : rand(14, 24);
      pPos[j + 2] = cz + rand(-32, 22);
    }
  }
  pGeo.attributes.position.needsUpdate = true;
}

function updateSeasonLook(dt) {
  const se = season();
  const k = 1 - Math.exp(-1.2 * dt);
  seasonCols.sky.lerp(se.c.sky, k);
  seasonCols.grass.lerp(se.c.grass, k);
  seasonCols.water.lerp(se.c.water, k);
  grassMat.color.copy(seasonCols.grass);
  for (let i = 0; i < 3; i++) {
    seasonCols.leaves[i].lerp(se.c.leaves[i], k);
    leafMats[i].color.copy(seasonCols.leaves[i]);
  }
  sun.color.lerp(se.c.sun, k);
  sun.intensity += (se.sunI - sun.intensity) * k;
}

seasonEls.pill.addEventListener('click', () => nextSeason(true));
applySeasonLook();

/* ---------- input ---------- */
const keys = new Set();
const pointer = { down: false, ndc: new THREE.Vector2() };
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function setPointer(e) {
  pointer.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
}

canvas.addEventListener('pointerdown', (e) => {
  pointer.down = true;
  setPointer(e);
  if (canvas.setPointerCapture) {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (pointer.down) setPointer(e);
});
for (const name of ['pointerup', 'pointercancel', 'pointerleave']) {
  canvas.addEventListener(name, () => {
    pointer.down = false;
  });
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'Escape') {
    closeShop();
    closeMissions();
    closeMulti();
  }
  if ((e.code === 'Enter' || e.code === 'Space') && state !== 'playing' && !uiOpen()) startGame();
  if (state === 'playing') {
    if (e.code === 'Digit1') setView('wide');
    if (e.code === 'Digit2') setView('boat');
    if (e.code === 'Digit3') setView('wildlife');
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  keys.clear();
  pointer.down = false;
});

function readInput() {
  let x = 0;
  let z = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  if (x || z) {
    const l = Math.hypot(x, z);
    return { x: x / l, z: z / l };
  }
  if (pointer.down) {
    raycaster.setFromCamera(pointer.ndc, camera);
    if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
      const dx = hitPoint.x - boat.position.x;
      const dz = hitPoint.z - boat.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.8) {
        const s = Math.min(1, d / 4);
        return { x: (dx / d) * s, z: (dz / d) * s };
      }
    }
  }
  return { x: 0, z: 0 };
}

/* ---------- boat ---------- */
function updateBoat(dt) {
  const input = readInput();
  const k = 1 - Math.exp(-4 * dt);
  const top = MAX_SPEED * effSpeed() * season().m.speed;
  vel.x += (input.x * top - vel.x) * k;
  vel.z += (input.z * top - vel.z) * k;
  boat.position.x = clamp(boat.position.x + vel.x * dt, -HALF_W + 1.4, HALF_W - 1.4);
  boat.position.z = clamp(boat.position.z + vel.z * dt, -HALF_L + 2, HALF_L - 2);

  const speed = Math.hypot(vel.x, vel.z);
  if (speed > 0.8) {
    const want = Math.atan2(-vel.x, -vel.z);
    boatYaw += angDiff(boatYaw, want) * Math.min(1, 8 * dt);
  }
  boat.rotation.y = boatYaw;

  wakeTimer -= dt;
  if (speed > 2 && wakeTimer <= 0) {
    addRipple(
      boat.position.x + Math.sin(boatYaw) * 1.7,
      boat.position.z + Math.cos(boatYaw) * 1.7,
      0.8,
    );
    wakeTimer = 0.18;
  }
}

/* ---------- environment / water / camera ---------- */
function animateWater(time) {
  const pos = waterGeo.attributes.position;
  const arr = pos.array;
  for (let i = 0; i < pos.count; i++) {
    const x = waterBase[i * 3];
    const z = waterBase[i * 3 + 2];
    arr[i * 3 + 1] = Math.sin(x * 0.6 + time * 1.3) * 0.05 + Math.sin(z * 0.4 - time * FLOW * 0.9) * 0.05;
  }
  pos.needsUpdate = true;
}

function updateEnvironment(dt) {
  displayHealth += (health - displayHealth) * Math.min(1, 3 * dt);
  const k = clamp(displayHealth / 100, 0, 1);
  waterMat.color.copy(WATER_DIRTY).lerp(WATER_CLEAN, k);
  waterMat.color.lerp(seasonCols.water, 0.3);
  waterMat.opacity = 0.93 - 0.22 * k;
  scene.background.copy(SKY_DIRTY).lerp(SKY_CLEAN, k);
  scene.background.lerp(seasonCols.sky, 0.45);
  scene.fog.color.copy(scene.background);
  updateSeasonLook(dt);
  hemi.intensity = 1.0 + 0.5 * k + season().hemiAdd;
}

function pickFocus() {
  let best = null;
  let bestD = Infinity;
  for (const a of animals.concat(landAnimals)) {
    if (a.leaving || a.scale < 0.8) continue;
    const d = Math.hypot(a.x - boat.position.x, a.z - boat.position.z);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  focus = best;
  focusTimer = 4;
}

// returns [camX, camY, camZ, lookX, lookY, lookZ] for the current view
function viewTarget(dt) {
  const aspect = window.innerWidth / window.innerHeight;
  const bp = boat.position;

  if (shopOpen) return [bp.x + 4.4, 3.6, bp.z + 6.4, bp.x, -2.6, bp.z];
  if (state !== 'playing') {
    const zoom = clamp(0.85 / aspect, 1, 2.0);
    const a = t * 0.12;
    return [Math.sin(a) * 26 * zoom, 13 * zoom, 8 + Math.cos(a) * 26 * zoom, 0, 0, 8];
  }
  if (viewMode === 'boat') {
    const z = clamp(0.8 / aspect, 1, 1.5);
    return [bp.x * 0.85, 7 * z, bp.z + 10 * z, bp.x * 0.85, 0.4, bp.z - 5];
  }
  if (viewMode === 'wildlife') {
    focusTimer -= dt;
    if (!focus || focus.leaving || !(animals.includes(focus) || landAnimals.includes(focus)) || focusTimer <= 0) pickFocus();
    if (focus) {
      const z = clamp(0.85 / aspect, 1, 1.6);
      return [focus.x + 4 * z, 4.5 * z, focus.z + 8 * z, focus.x, 0.3, focus.z - 1];
    }
  }
  const zoom = clamp(0.85 / aspect, 1, 2.0);
  const wz = zoom * 1.2; // pulled back so both banks and their animals show
  return [bp.x * 0.7, 17 * wz, bp.z + 13 * wz, bp.x * 0.7, 0, bp.z - 3];
}

function updateCamera(dt) {
  const v = viewTarget(dt);
  const k = 1 - Math.exp(-4 * dt);
  camera.position.x += (v[0] - camera.position.x) * k;
  camera.position.y += (v[1] - camera.position.y) * k;
  camera.position.z += (v[2] - camera.position.z) * k;
  camLook.x += (v[3] - camLook.x) * k;
  camLook.y += (v[4] - camLook.y) * k;
  camLook.z += (v[5] - camLook.z) * k;
  camera.lookAt(camLook.x, camLook.y, camLook.z);

  const bp = boat.position;
  sun.position.set(bp.x + 25, 40, bp.z + 15);
  sun.target.position.set(bp.x, 0, bp.z);
}

function setView(mode) {
  if (viewMode === mode) return;
  viewMode = mode;
  focus = null;
  focusTimer = 0;
  for (const b of viewButtons) {
    const on = b.dataset.view === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  if (state === 'playing') toast(VIEW_HINTS[mode]);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ---------- game flow ---------- */
function clearWorld() {
  for (const it of trash) scene.remove(it.mesh);
  trash.length = 0;
  for (const a of animals) scene.remove(a.mesh);
  animals.length = 0;
  for (const r of ripples) {
    scene.remove(r.m);
    r.m.material.dispose();
  }
  ripples.length = 0;
}

function resetGame() {
  clearWorld();
  health = START_HEALTH;
  displayHealth = START_HEALTH;
  collected = 0;
  combo = 0;
  comboTimer = 0;
  gameTime = 0;
  spawnTimer = 1;
  syncTimer = 0;
  toastCooldown = 0;
  animalSerial = 0;
  focus = null;
  focusTimer = 0;
  reachedClean = false;
  reachedSilent = false;
  captionHold = 0;
  idleTimer = 0;
  chatTimer = 6;
  seasonT = SEASON_LEN;
  syncLand(0, true);
  for (const b of bubbles) {
    b.who = null;
    b.el.classList.remove('show');
  }
  boatYaw = 0;
  vel.x = 0;
  vel.z = 0;
  boat.position.set(0, 0.08, 24);
  boat.rotation.y = 0;
  if (NET.role !== 'client') for (let i = 0; i < 12; i++) spawnTrash(rand(-HALF_L + 3, HALF_L - 14));
  const initial = Math.floor(health / 9);
  for (let i = 0; i < initial; i++) addAnimal(true);
}

const playUi = [hudEls.hud, hudEls.bottom];

function startGame() {
  if (state === 'playing') return;
  resetGame();
  state = 'playing';
  hudEls.overlay.classList.add('hidden');
  for (const el of playUi) el.classList.remove('hidden');
  toast('Scoop the trash before it reaches the sea.');
  sfx('click');
}

for (const b of viewButtons) b.addEventListener('click', () => setView(b.dataset.view));

function setMuted(v) {
  muted = v;
  save.muted = v;
  persist();
  hudEls.sound.classList.toggle('off', v);
  hudEls.sound.setAttribute('aria-pressed', String(v));
  if (!v) initAudio();
  if (busMaster) busMaster.gain.setTargetAtTime(v ? 0 : 0.9, AC.currentTime, 0.08);
  if (!v) sfx('click');
}
hudEls.sound.addEventListener('click', () => setMuted(!muted));
// browsers only allow sound after a tap or key press
for (const ev of ['pointerdown', 'click', 'touchend', 'keydown']) window.addEventListener(ev, initAudio);
if (save.muted) {
  muted = true;
  hudEls.sound.classList.add('off');
  hudEls.sound.setAttribute('aria-pressed', 'true');
}

/* ---------- missions ---------- */
let missionsOpen = false;
let multiOpen = false;
const uiOpen = () => shopOpen || missionsOpen || multiOpen;
const missEls = { root: $('missions'), list: $('mis-list'), coins: $('mis-coins'), close: $('mis-close') };

function newMission() {
  const used = save.missions.map((m) => m.type);
  const free = MISSION_POOL.filter((p) => !used.includes(p.type));
  const p = pick(free.length ? free : MISSION_POOL);
  const maxTier = Math.min(2, 1 + Math.floor(save.missionsDone / 3)); // gets harder as you finish more
  const tier = Math.floor(Math.random() * (maxTier + 1));
  return { type: p.type, target: p.targets[tier], reward: p.rewards[tier], progress: 0, done: false, t: 0 };
}
while (save.missions.length < 3) save.missions.push(newMission());

function missionEvent(type, value) {
  for (const m of save.missions) {
    if (m.done || m.type !== type) continue;
    if (type === 'scoop' || type === 'earn') m.progress += value;
    else m.progress = Math.max(m.progress, value);
    if (m.progress >= m.target) completeMission(m);
  }
}

function completeMission(m) {
  m.progress = m.target;
  m.done = true;
  m.t = 4; // stays visible as "Done" for a moment, then a new mission replaces it
  save.coins += m.reward;
  save.missionsDone++;
  persist();
  toast('Mission done: ' + poolOf(m.type).text(m.target) + '. +' + m.reward + ' coins');
  sfx('mission');
  if (missionsOpen) renderMissions();
}

let missionTick = 0;
function updateMissions(dt) {
  missionTick -= dt;
  if (missionTick <= 0) {
    missionTick = 0.5;
    missionEvent('animals', animals.filter((a) => !a.leaving).length);
    missionEvent('health', Math.round(health));
  }
  for (let i = 0; i < save.missions.length; i++) {
    const m = save.missions[i];
    if (!m.done) continue;
    m.t -= dt;
    if (m.t <= 0) {
      save.missions.splice(i, 1);
      save.missions.splice(i, 0, newMission());
      persist();
    }
  }
}

function renderMissions() {
  missEls.coins.textContent = String(save.coins);
  missEls.list.innerHTML = save.missions
    .map((m) => {
      const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
      return (
        '<div class="mis-row' + (m.done ? ' done' : '') + '"><span class="mis-title">' + poolOf(m.type).text(m.target) +
        '</span><span class="mis-reward">' + (m.done ? 'Done' : '<i class="coin"></i>+' + m.reward) +
        '</span><span class="track mis-bar"><i style="width:' + pct + '%"></i></span></div>'
      );
    })
    .join('');
}

function openMissions() {
  if (missionsOpen) return;
  if (shopOpen) closeShop();
  if (multiOpen) closeMulti();
  missionsOpen = true;
  renderMissions();
  missEls.root.classList.remove('hidden');
  hudEls.overlay.classList.add('hidden');
  hudEls.hud.classList.add('hidden');
  hudEls.bottom.classList.add('hidden');
  sfx('click');
}

function closeMissions() {
  if (!missionsOpen) return;
  missionsOpen = false;
  missEls.root.classList.add('hidden');
  if (state === 'playing') {
    hudEls.hud.classList.remove('hidden');
    hudEls.bottom.classList.remove('hidden');
  } else {
    hudEls.overlay.classList.remove('hidden');
  }
}

missEls.close.addEventListener('click', closeMissions);
$('mission-chip').addEventListener('click', openMissions);
$('menu-missions').addEventListener('click', openMissions);

/* ---------- boat shop ---------- */
let shopOpen = false;
let previewId = save.boat;
const shopEls = {
  root: $('shop'),
  list: $('boat-list'),
  name: $('bi-name'),
  desc: $('bi-desc'),
  speed: $('bi-speed'),
  net: $('bi-net'),
  buy: $('buy'),
  coins: $('shop-coins'),
  close: $('shop-close'),
};

const BOAT_ICON = {
  dilaw:
    '<svg class="bicon" viewBox="0 0 80 44"><path d="M8 26h64l-8 12H16z" fill="#ffc233"/><rect x="30" y="14" width="20" height="12" fill="#fff"/><path d="M27 14h26" stroke="#2aa05a" stroke-width="4"/><path d="M0 41q10-6 20 0t20 0t20 0t20 0" stroke="#5fa8d3"/></svg>',
  papel:
    '<svg class="bicon" viewBox="0 0 80 44"><path d="M8 28h64l-9 10H17z" fill="#f6f1e4"/><path d="M40 5l15 23H25z" fill="#fff"/><path d="M40 5v23"/><path d="M0 41q10-6 20 0t20 0t20 0t20 0" stroke="#5fa8d3"/></svg>',
  kayak:
    '<svg class="bicon" viewBox="0 0 80 44"><path d="M4 30q36-14 72 0q-36 10-72 0z" fill="#e2563b"/><rect x="35" y="22" width="10" height="7" fill="#2b7bb9"/><circle cx="40" cy="17" r="5" fill="#f1c9a0"/><path d="M20 11l40 24"/><path d="M0 41q10-6 20 0t20 0t20 0t20 0" stroke="#5fa8d3"/></svg>',
  balsa:
    '<svg class="bicon" viewBox="0 0 80 44"><rect x="8" y="24" width="64" height="5" fill="#c9b04f"/><rect x="8" y="29" width="64" height="5" fill="#b59a3d"/><rect x="8" y="34" width="64" height="5" fill="#c9b04f"/><path d="M28 24V12M52 24V12"/><path d="M22 12l26-8 10 8z" fill="#a07a3a"/></svg>',
  katig:
    '<svg class="bicon" viewBox="0 0 80 44"><path d="M14 30q26-8 52 0l-6 7H20z" fill="#2a79b8"/><path d="M42 3l17 25H42z" fill="#d9534f"/><path d="M42 3v29"/><path d="M6 33h68"/><rect x="3" y="37" width="24" height="5" rx="2.5" fill="#f2c14e"/><rect x="53" y="37" width="24" height="5" rx="2.5" fill="#f2c14e"/></svg>',
};

function renderShop() {
  shopEls.list.innerHTML = BOATS.map((b) => {
    const owned = save.owned.includes(b.id);
    const tag = save.boat === b.id ? 'In use' : owned ? 'Owned' : '<i class="coin"></i>' + b.price;
    const sel = previewId === b.id;
    return (
      '<button type="button" class="boat-card' + (sel ? ' sel' : '') + '" data-boat="' + b.id +
      '" role="option" aria-selected="' + sel + '">' + BOAT_ICON[b.id] +
      '<span class="bn">' + b.name + '</span><span class="bt' + (owned ? ' own' : '') + '">' + tag + '</span></button>'
    );
  }).join('');

  const b = boatById(previewId);
  const owned = save.owned.includes(b.id);
  shopEls.name.textContent = b.name;
  shopEls.desc.textContent = b.desc;
  shopEls.speed.style.width = Math.round((b.speed / 1.4) * 100) + '%';
  shopEls.net.style.width = Math.round((b.reach / 1.5) * 100) + '%';
  shopEls.coins.textContent = String(save.coins);

  let label;
  let disabled = false;
  if (save.boat === b.id) {
    label = 'In use';
    disabled = true;
  } else if (owned) {
    label = 'Use this boat';
  } else if (save.coins >= b.price) {
    label = 'Buy for ' + b.price + ' coins';
  } else {
    label = 'Need ' + (b.price - save.coins) + ' more coins';
    disabled = true;
  }
  shopEls.buy.textContent = label;
  shopEls.buy.disabled = disabled;
}

function openShop() {
  if (shopOpen) return;
  shopOpen = true;
  if (missionsOpen) closeMissions();
  if (multiOpen) closeMulti();
  previewId = save.boat;
  setTab('boats');
  shopEls.root.classList.remove('hidden');
  hudEls.overlay.classList.add('hidden');
  hudEls.hud.classList.add('hidden');
  hudEls.bottom.classList.add('hidden');
  for (const b of bubbles) {
    b.who = null;
    b.el.classList.remove('show');
  }
}

function closeShop() {
  if (!shopOpen) return;
  shopOpen = false;
  setBoat(save.boat);
  boat.rotation.y = boatYaw;
  shopEls.root.classList.add('hidden');
  if (state === 'playing') {
    hudEls.hud.classList.remove('hidden');
    hudEls.bottom.classList.remove('hidden');
  } else {
    hudEls.overlay.classList.remove('hidden');
  }
}

shopEls.list.addEventListener('click', (e) => {
  const card = e.target && e.target.closest ? e.target.closest('[data-boat]') : null;
  if (!card) return;
  previewId = card.dataset.boat;
  setBoat(previewId); // the boat out on the river changes so you can see it
  renderShop();
  sfx('click');
});

shopEls.buy.addEventListener('click', () => {
  const b = boatById(previewId);
  if (!save.owned.includes(b.id)) {
    if (save.coins < b.price) return;
    save.coins -= b.price;
    save.owned.push(b.id);
    sfx('buy');
  }
  save.boat = b.id;
  persist();
  renderShop();
});

const UPS = [
  { id: 'net', name: 'Net size', desc: '+8% net reach per level' },
  { id: 'engine', name: 'Engine', desc: '+6% boat speed per level' },
  { id: 'streak', name: 'Streak timer', desc: '+0.4 s to keep a streak going' },
];
const UP_COST = [20, 40, 70, 110, 160];
const tabButtons = document.querySelectorAll('#shop-tabs button');
const tabEls = { boats: $('tab-boats'), up: $('tab-up'), list: $('up-list'), tabs: $('shop-tabs') };
let shopTab = 'boats';

function renderUpgrades() {
  shopEls.coins.textContent = String(save.coins);
  tabEls.list.innerHTML = UPS.map((u) => {
    const lvl = save.up[u.id];
    const cost = UP_COST[lvl];
    const pips = [0, 1, 2, 3, 4].map((i) => '<span class="lv' + (i < lvl ? ' on' : '') + '"></span>').join('');
    const btn =
      lvl >= 5
        ? '<button type="button" class="up-buy" disabled>Max</button>'
        : '<button type="button" class="up-buy" data-up="' + u.id + '"' + (save.coins < cost ? ' disabled' : '') +
          '><i class="coin"></i>' + cost + '</button>';
    return (
      '<div class="up-row"><div class="up-main"><b>' + u.name + '</b><span>' + u.desc +
      '</span><span class="lvs">' + pips + '</span></div>' + btn + '</div>'
    );
  }).join('');
}

function setTab(tab) {
  shopTab = tab;
  tabEls.boats.hidden = tab !== 'boats';
  tabEls.up.hidden = tab !== 'up';
  for (const b of tabButtons) {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  setBoat(tab === 'boats' ? previewId : save.boat);
  if (tab === 'up') renderUpgrades();
  else renderShop();
}

tabEls.tabs.addEventListener('click', (e) => {
  const btn = e.target && e.target.closest ? e.target.closest('button') : null;
  if (btn && btn.dataset.tab && btn.dataset.tab !== shopTab) {
    sfx('click');
    setTab(btn.dataset.tab);
  }
});

tabEls.list.addEventListener('click', (e) => {
  const btn = e.target && e.target.closest ? e.target.closest('[data-up]') : null;
  if (!btn) return;
  const id = btn.dataset.up;
  const lvl = save.up[id];
  if (lvl === undefined || lvl >= 5 || save.coins < UP_COST[lvl]) return;
  save.coins -= UP_COST[lvl];
  save.up[id] = lvl + 1;
  persist();
  sfx('buy');
  setBoat(save.boat); // the bigger net shows up on the boat
  renderUpgrades();
});

shopEls.close.addEventListener('click', closeShop);
$('shop-btn').addEventListener('click', openShop);
$('menu-shop').addEventListener('click', openShop);

hudEls.play.addEventListener('click', startGame);

/* ---------- multiplayer: co-op over peer-to-peer (WebRTC through PeerJS) ---------- */
// The host runs the river (trash, health, seasons). Friends steer their own boat and see the
// host's river. Everyone keeps their own coins, boat, upgrades and missions.
const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const UNAVAILABLE = 'Multiplayer is not available in this preview. Deploy the game (zip, then Vercel) and open that link to play together.';
const NET = {
  role: 'solo', // 'solo' | 'host' | 'joining' | 'client'
  peer: null,
  hostConn: null,
  conns: new Map(), // host: pid -> connection
  pid: 0,
  code: '',
  nextPid: 1,
  sendT: 0,
  snapT: 0,
  joinTimer: 0,
  pendingCode: '',
};
const remotes = new Map(); // pid -> a friend's boat
const isClient = () => NET.role === 'client';

const multiEls = {
  root: $('multi'),
  start: $('multi-start'),
  room: $('multi-room'),
  code: $('room-code'),
  players: $('room-players'),
  status: $('multi-status'),
  input: $('multi-code'),
  create: $('multi-create'),
  join: $('multi-join'),
  leave: $('multi-leave'),
  close: $('multi-close'),
};
const roomPill = $('room-pill');
const roomText = $('room-text');
const tagEls = [0, 1, 2].map((i) => $('pt' + i));
const setMultiStatus = (msg) => {
  multiEls.status.textContent = msg || '';
};
const r2d = (n) => Math.round(n * 100) / 100;

async function loadPeer() {
  if (window.__RIVERKEEPER_PEER__) return window.__RIVERKEEPER_PEER__; // test hook
  const mod = await import('peerjs');
  return mod.Peer || mod.default;
}
function openPeer(Peer, id) {
  const opts = window.RIVERKEEPER_ICE ? { config: { iceServers: window.RIVERKEEPER_ICE } } : {};
  return new Promise((resolve, reject) => {
    const p = id ? new Peer(id, opts) : new Peer(opts);
    let settled = false; // later errors belong to the caller, not to this setup step
    const to = setTimeout(() => {
      settled = true;
      try {
        p.destroy();
      } catch (e) {
        /* ignore */
      }
      reject({ type: 'timeout' });
    }, 10000);
    p.on('open', () => {
      settled = true;
      clearTimeout(to);
      resolve(p);
    });
    p.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      try {
        p.destroy();
      } catch (err) {
        /* ignore */
      }
      reject(e || { type: 'error' });
    });
  });
}

/* ----- friends' boats ----- */
function makeRemote(pid) {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  scene.add(group);
  const r = {
    pid, group, inner, parts: [], boatId: null, net: -1,
    x: 0, z: 24, yaw: 0, tx: 0, tz: 24, tyaw: 0, reach: 1, front: 2.1, seen: false,
  };
  remotes.set(pid, r);
  return r;
}

function setRemoteState(pid, x, z, yaw, boatId, netLvl, reach, front) {
  if (![x, z, yaw].every(Number.isFinite)) return;
  const r = remotes.get(pid) || makeRemote(pid);
  r.tx = clamp(x, -HALF_W, HALF_W);
  r.tz = clamp(z, -HALF_L, HALF_L);
  r.tyaw = yaw;
  if (!r.seen) {
    r.x = r.tx;
    r.z = r.tz;
    r.yaw = r.tyaw;
    r.seen = true;
  }
  if (Number.isFinite(reach)) r.reach = clamp(reach, 0.5, 2.5);
  if (Number.isFinite(front)) r.front = clamp(front, 1.5, 3.5);
  const id = BOATS.some((b) => b.id === boatId) ? boatId : 'dilaw';
  const nl = clamp(Math.floor(Number(netLvl)) || 0, 0, 5);
  if (r.boatId !== id || r.net !== nl) {
    for (const m of r.parts) r.inner.remove(m);
    r.parts = buildBoatParts(boatById(id), nl);
    for (const m of r.parts) r.inner.add(m);
    r.boatId = id;
    r.net = nl;
  }
}

function removeRemote(pid) {
  const r = remotes.get(pid);
  if (!r) return;
  scene.remove(r.group);
  remotes.delete(pid);
}
function clearRemotes() {
  for (const pid of [...remotes.keys()]) removeRemote(pid);
}

function updateRemotes(dt) {
  const k = 1 - Math.exp(-10 * dt);
  for (const r of remotes.values()) {
    r.x += (r.tx - r.x) * k;
    r.z += (r.tz - r.z) * k;
    r.yaw += angDiff(r.yaw, r.tyaw) * k;
    r.group.position.set(r.x, 0.08 + Math.sin(t * 2 + r.pid) * 0.03, r.z);
    r.group.rotation.y = r.yaw;
    r.inner.rotation.z = Math.sin(t * 1.6 + r.pid) * 0.03;
  }
}

function updateTags() {
  let n = 0;
  for (const r of remotes.values()) {
    if (n >= tagEls.length) break;
    tmpV.set(r.x, 2.4, r.z).project(camera);
    const x = (tmpV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
    const el = tagEls[n++];
    el.textContent = 'Kapitan ' + (r.pid + 1);
    el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
    const ok = tmpV.z < 1 && x > -40 && x < window.innerWidth + 40 && y > 70 && y < window.innerHeight - 110 && state === 'playing' && !uiOpen();
    el.classList.toggle('show', ok);
  }
  for (; n < tagEls.length; n++) tagEls[n].classList.remove('show');
}

/* ----- room sheet ----- */
function updateRoomUi() {
  const inRoomNow = NET.role === 'host' || NET.role === 'client';
  const count = 1 + remotes.size;
  roomPill.hidden = !inRoomNow;
  roomText.textContent = NET.code + ' · ' + count;
  multiEls.start.hidden = inRoomNow;
  multiEls.room.hidden = !inRoomNow;
  multiEls.code.textContent = NET.code || '----';
  multiEls.players.textContent = count + (count === 1 ? ' player. Waiting for friends...' : ' players in the room');
}

function openMulti() {
  if (multiOpen) return;
  if (shopOpen) closeShop();
  if (missionsOpen) closeMissions();
  multiOpen = true;
  updateRoomUi();
  multiEls.root.classList.remove('hidden');
  hudEls.overlay.classList.add('hidden');
  hudEls.hud.classList.add('hidden');
  hudEls.bottom.classList.add('hidden');
  sfx('click');
}
function closeMulti() {
  if (!multiOpen) return;
  multiOpen = false;
  multiEls.root.classList.add('hidden');
  if (state === 'playing') {
    hudEls.hud.classList.remove('hidden');
    hudEls.bottom.classList.remove('hidden');
  } else {
    hudEls.overlay.classList.remove('hidden');
  }
}

function leaveRoom() {
  clearTimeout(NET.joinTimer);
  try {
    if (NET.peer) NET.peer.destroy();
  } catch (e) {
    /* ignore */
  }
  NET.peer = null;
  NET.hostConn = null;
  NET.conns.clear();
  NET.role = 'solo';
  NET.code = '';
  NET.pid = 0;
  NET.nextPid = 1;
  clearRemotes();
  updateRoomUi();
}

/* ----- host ----- */
function hostAccept(conn) {
  if (NET.conns.size >= MAX_PLAYERS - 1) {
    conn.on('open', () => {
      try {
        conn.send({ t: 'full' });
      } catch (e) {
        /* ignore */
      }
      setTimeout(() => conn.close(), 400);
    });
    return;
  }
  const pid = NET.nextPid++;
  conn.on('open', () => {
    NET.conns.set(pid, conn);
    try {
      conn.send({ t: 'welcome', pid });
    } catch (e) {
      /* ignore */
    }
    toast('Kapitan ' + (pid + 1) + ' joined the room!');
    sfx('animal');
    updateRoomUi();
  });
  conn.on('data', (m) => {
    if (m && m.t === 'pos') setRemoteState(pid, m.x, m.z, m.yaw, m.boat, m.net, m.reach, m.front);
  });
  const drop = () => {
    if (!NET.conns.has(pid) && !remotes.has(pid)) return;
    NET.conns.delete(pid);
    removeRemote(pid);
    toast('Kapitan ' + (pid + 1) + ' left the room.');
    updateRoomUi();
  };
  conn.on('close', drop);
  conn.on('error', drop);
}

function sendSnapshot() {
  const tr = trash.slice(0, 80).map((it) => [it.id, r2d(it.x), r2d(it.z), it.type]);
  const b = [[0, r2d(boat.position.x), r2d(boat.position.z), r2d(boatYaw), curBoat.id, save.up.net]];
  for (const r of remotes.values()) b.push([r.pid, r2d(r.tx), r2d(r.tz), r2d(r.tyaw), r.boatId, r.net]);
  const msg = { t: 'snap', h: Math.round(health * 10) / 10, s: seasonIdx, tr, b };
  for (const c of NET.conns.values()) {
    try {
      c.send(msg);
    } catch (e) {
      /* connection is closing */
    }
  }
}

async function createRoom() {
  if (NET.role !== 'solo') return;
  setMultiStatus('Creating your room...');
  let Peer;
  try {
    Peer = await loadPeer();
  } catch (e) {
    setMultiStatus(UNAVAILABLE);
    return;
  }
  let peer = null;
  let code = '';
  for (let attempt = 0; attempt < 4 && !peer; attempt++) {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    try {
      peer = await openPeer(Peer, 'riverkeeper-' + code);
    } catch (e) {
      if (!e || e.type !== 'unavailable-id') {
        setMultiStatus('Could not reach the matchmaking server. Check your connection and try again.');
        return;
      }
    }
  }
  if (!peer) {
    setMultiStatus('Could not make a room code. Try again.');
    return;
  }
  NET.peer = peer;
  NET.code = code;
  NET.role = 'host';
  NET.nextPid = 1;
  peer.on('connection', hostAccept);
  peer.on('disconnected', () => {
    try {
      peer.reconnect();
    } catch (e) {
      /* ignore */
    }
  });
  peer.on('error', () => toast('Connection hiccup. Friends may need to rejoin.'));
  setMultiStatus('');
  closeMulti();
  if (state !== 'playing') startGame();
  updateRoomUi();
  toast('Room ' + code + ' is open. Share the code!');
}

/* ----- friend ----- */
function syncRemoteTrash(list) {
  const ids = new Set();
  for (const e of list.slice(0, 80)) {
    if (!Array.isArray(e)) continue;
    const [id, x, z, type] = e;
    if (!Number.isFinite(id) || !Number.isFinite(x) || !Number.isFinite(z)) continue;
    ids.add(id);
    const it = trash.find((o) => o.id === id);
    if (it) {
      it.tx = x;
      it.tz = z;
    } else {
      spawnTrash(z, x, type, id);
    }
  }
  for (let i = trash.length - 1; i >= 0; i--) {
    if (!ids.has(trash[i].id)) {
      scene.remove(trash[i].mesh);
      trash.splice(i, 1);
    }
  }
}

function applySnapshot(m) {
  if (Number.isFinite(m.h)) health = clamp(m.h, 0, 100);
  if (Number.isInteger(m.s) && m.s >= 0 && m.s < SEASONS.length && m.s !== seasonIdx) setSeason(m.s, true, false);
  if (Array.isArray(m.tr)) syncRemoteTrash(m.tr);
  if (Array.isArray(m.b)) {
    const seen = new Set();
    for (const e of m.b.slice(0, 6)) {
      if (!Array.isArray(e)) continue;
      const [pid, x, z, yaw, bid, nl] = e;
      if (!Number.isInteger(pid) || pid === NET.pid) continue;
      seen.add(pid);
      setRemoteState(pid, x, z, yaw, bid, nl);
    }
    for (const pid of [...remotes.keys()]) if (!seen.has(pid)) removeRemote(pid);
    updateRoomUi();
  }
}

function clientData(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'welcome' && NET.role === 'joining' && Number.isInteger(m.pid)) {
    clearTimeout(NET.joinTimer);
    NET.role = 'client';
    NET.pid = m.pid;
    NET.code = NET.pendingCode;
    setMultiStatus('');
    closeMulti();
    startGame();
    updateRoomUi();
    toast('Joined room ' + NET.code + '. Help clean the river!');
  } else if (m.t === 'full' && NET.role === 'joining') {
    leaveRoom();
    setMultiStatus('That room is full (4 players).');
  } else if (m.t === 'snap' && NET.role === 'client') {
    applySnapshot(m);
  } else if (m.t === 'got' && NET.role === 'client') {
    const idx = trash.findIndex((o) => o.id === m.id);
    let spot = { x: boat.position.x, z: boat.position.z - 2 };
    if (idx >= 0) {
      spot = trash[idx];
      scene.remove(trash[idx].mesh);
      trash.splice(idx, 1);
    }
    scoopReward(spot);
  }
}

function onHostLeft() {
  leaveRoom();
  toast('The host left. You are playing on your own now.');
}

async function joinRoom() {
  if (NET.role !== 'solo') return;
  const code = String(multiEls.input.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) {
    setMultiStatus('Type the 4-character room code.');
    return;
  }
  setMultiStatus('Connecting...');
  let Peer;
  try {
    Peer = await loadPeer();
  } catch (e) {
    setMultiStatus(UNAVAILABLE);
    return;
  }
  NET.role = 'joining';
  NET.pendingCode = code;
  let peer;
  try {
    peer = await openPeer(Peer, null);
  } catch (e) {
    NET.role = 'solo';
    setMultiStatus('Could not reach the matchmaking server. Check your connection and try again.');
    return;
  }
  NET.peer = peer;
  const fail = (msg) => {
    if (NET.role !== 'joining') return;
    leaveRoom();
    setMultiStatus(msg);
  };
  NET.joinTimer = setTimeout(
    () => fail('Could not connect. Check the code. Phones on the same Wi-Fi connect most reliably.'),
    12000,
  );
  peer.on('error', (e) => fail(e && e.type === 'peer-unavailable' ? 'No room with that code.' : 'Connection problem. Try again.'));
  const conn = peer.connect('riverkeeper-' + code, { reliable: true });
  NET.hostConn = conn;
  conn.on('data', clientData);
  const closed = () => (NET.role === 'client' ? onHostLeft() : fail('The room closed before you joined.'));
  conn.on('close', closed);
  conn.on('error', closed);
}

function netTick(dt) {
  if (NET.role === 'host') {
    NET.snapT -= dt;
    if (NET.snapT <= 0) {
      NET.snapT = 0.1;
      sendSnapshot();
    }
  } else if (NET.role === 'client' && NET.hostConn && NET.hostConn.open) {
    NET.sendT -= dt;
    if (NET.sendT <= 0) {
      NET.sendT = 0.066;
      try {
        NET.hostConn.send({
          t: 'pos',
          x: r2d(boat.position.x),
          z: r2d(boat.position.z),
          yaw: r2d(boatYaw),
          boat: curBoat.id,
          net: save.up.net,
          reach: r2d(effReach()),
          front: curBoat.front,
        });
      } catch (e) {
        /* ignore */
      }
    }
  }
}

multiEls.create.addEventListener('click', createRoom);
multiEls.join.addEventListener('click', joinRoom);
multiEls.leave.addEventListener('click', () => {
  leaveRoom();
  setMultiStatus('You left the room.');
});
multiEls.close.addEventListener('click', closeMulti);
roomPill.addEventListener('click', openMulti);
$('menu-multi').addEventListener('click', openMulti);

/* ---------- main loop ---------- */
resetGame();
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  t += dt;
  toastCooldown -= dt;

  const active = state === 'playing' && !(NET.role === 'solo' && uiOpen());
  if (active) {
    gameTime += dt;
    comboTimer -= dt;
    if (!isClient()) health = Math.max(0, health - trash.length * 0.02 * dt); // pollution drain (the host decides)
    updateBoat(dt);
    syncAnimals(dt);
    updateMissions(dt);
    updateSeason(dt);
  }
  updateTrash(dt, active);
  updateRemotes(dt);
  netTick(dt);
  updateAnimals(dt, active);
  updateHumans(dt, active);
  updateLand(dt, active);
  updateParticles(dt);
  updateRipples(dt);

  boat.position.y = 0.08 + Math.sin(t * 2) * 0.03;
  if (shopOpen) boat.rotation.y = t * 0.7; // turntable while you shop
  boatInner.rotation.z = Math.sin(t * 1.6) * 0.03;
  boatInner.rotation.x = Math.sin(t * 1.3) * 0.02;

  animateWater(t);
  updateEnvironment(dt);
  updateCamera(dt);
  updateHud();
  updateCaption(dt);
  renderer.render(scene, camera);
  updateBubbles(dt);
  updateTags();

  // milestones only: the game never ends, health just rises and falls
  if (active) {
    if (health >= 100 && !reachedClean) {
      reachedClean = true;
      save.coins += 10;
      persist();
      toast('The river runs clear! Bonus +10 coins.');
      sfx('mission');
    } else if (health < 90) {
      reachedClean = false;
    }
    if (health <= 0 && !reachedSilent) {
      reachedSilent = true;
      toast('The river has gone silent. You can still bring it back.');
    } else if (health > 10) {
      reachedSilent = false;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- loading screen: keep it up for a moment, then reveal the menu ---------- */
const loaderEl = $('loader');
const bootStart = performance.now();
const MIN_LOAD_MS = 2200;
const fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 3500))]).then(() => {
  const wait = Math.max(0, MIN_LOAD_MS - (performance.now() - bootStart));
  setTimeout(() => {
    loaderEl.classList.add('done');
    setTimeout(() => loaderEl.classList.add('hidden'), 600);
  }, wait);
});

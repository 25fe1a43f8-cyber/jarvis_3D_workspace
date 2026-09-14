import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

window.__THREE = THREE;

// ============================================
// 🎯 PART NAMES
// ============================================
const PART_NAMES = {
    trunk:  'Object_64',
    hood:   'Object_11',
    doorFL: 'Object_76',
    doorFR: 'Object_96',
    doorRL: 'Object_79',
    doorRR: 'Object_91'
};

// ============================================
// 🗂️ PART CLASSIFICATION
// ============================================
const PART_GROUP_OVERRIDES = {
    'Object_76': 'doors', 'Object_79': 'doors',
    'Object_91': 'doors', 'Object_96': 'doors',
    'Object_11': 'hood',
    'Object_64': 'trunk',
    'Object_142': 'wheels', 'Object_145': 'wheels',
    'Object_147': 'wheels', 'Object_149': 'wheels',
    'Object_151': 'wheels', 'Object_153': 'wheels',
    'Object_156': 'wheels', 'Object_158': 'wheels',
    'Object_160': 'wheels', 'Object_162': 'wheels',
    'Object_164': 'wheels', 'Object_173': 'wheels',
    'Object_29':  'lights', 'Object_32':  'lights',
    'Object_88':  'lights', 'Object_118': 'lights',
    'Object_121': 'lights', 'Object_124': 'lights',
    'Object_176': 'lights',
    'Object_93': 'windows', 'Object_100': 'windows',
    'Object_14':  'engine', 'Object_17':  'engine',
    'Object_20':  'engine', 'Object_67':  'engine',
    'Object_103': 'engine', 'Object_109': 'engine',
    'Object_127': 'engine', 'Object_133': 'engine',
    'Object_136': 'engine', 'Object_139': 'engine',
    'Object_58':  'interior', 'Object_61':  'interior',
    'Object_70':  'interior', 'Object_73':  'interior',
    'Object_98':  'interior', 'Object_106': 'interior',
    'Object_112': 'interior',
    'Object_41': 'body', 'Object_56': 'body',
    'Object_82': 'body', 'Object_85': 'body',
    'Object_170': 'body',
    'Object_26': 'underside', 'Object_167': 'underside',
    'Object_8':   'front_fascia', 'Object_35':  'front_fascia',
    'Object_38':  'front_fascia', 'Object_44':  'front_fascia',
    'Object_130': 'front_fascia',
    'Object_23': 'rear_fascia', 'Object_115': 'rear_fascia',
    'Object_50': 'side_panels', 'Object_53': 'side_panels',
    'Object_47': 'cabin'
};

const LIGHT_HEADLIGHT_NAMES = ['Object_29', 'Object_176'];
const LIGHT_TAILLIGHT_NAMES  = ['Object_88', 'Object_118', 'Object_121', 'Object_124'];
const HEADLIGHT_COLOR     = 0xfff6d5;
const HEADLIGHT_INTENSITY = 3.0;
const TAILLIGHT_COLOR     = 0xff1a1a;
const TAILLIGHT_INTENSITY = 2.5;

const CAMERA_STEP_DURATION = 0.8;
const CAMERA_STEP_FRACTION = 0.15;

const GESTURE_GAIN_TRANSLATE = 3.5;

// ============================================
// SPEECH SYNTHESIS
// ============================================
let speechSynth = null;
if (typeof window !== 'undefined' && window.speechSynthesis) speechSynth = window.speechSynthesis;

function speak(text) {
    if (!speechSynth) return;
    try {
        speechSynth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.15; u.pitch = 1.0; u.volume = 0.9; u.lang = 'en-US';
        u.onstart = () => { document.body.classList.add('voice-speaking'); };
        u.onend = () => { document.body.classList.remove('voice-speaking'); };
        speechSynth.speak(u);
    } catch (e) {}
}

// ============================================
// SCENE
// ============================================
const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
window.__scene = scene;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(5, 3, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
canvasContainer.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
fillLight.position.set(-5, 5, -5);
scene.add(fillLight);
const interiorLight = new THREE.PointLight(0xffffff, 2, 10);
interiorLight.position.set(0, 1, 0);
scene.add(interiorLight);
const bottomLight = new THREE.PointLight(0xffffff, 1.5, 8);
bottomLight.position.set(0, -1.5, 0);
scene.add(bottomLight);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;
orbitControls.autoRotate = true;
orbitControls.autoRotateSpeed = 1.5;
orbitControls.maxPolarAngle = Math.PI - 0.05;
orbitControls.minPolarAngle = 0.05;
orbitControls.minDistance = 0.5;
orbitControls.maxDistance = 500;

// ============================================
// STATE
// ============================================
let carModel = null;
let dragControls = null;
let currentMode = 'orbit';
let yaw = 0, pitch = 0;
let currentSplitDistance = 4.0;
const MIN_SPLIT_DISTANCE = 0.5;
const MAX_SPLIT_DISTANCE = 20.0;

const allPartMeshes = [];
const hingedParts = new Map();
const explodedParts = new Map();
const basePositions = new Map();
const visibilitySnapshot = new Map();

const cameraVelocity = new THREE.Vector3(0, 0, 0);
let cameraVelocityActive = false;
let cameraVelocityTimeout = null;

let blueprintMode = false;
let originalSceneBackground = new THREE.Color(0x111111);

let isolatedPart = null;
let selectedPart = null;

let stackOrder = [];

let walkVelocity = new THREE.Vector3(0, 0, 0);
let walkVelocityActive = false;
let walkVelocityTimeout = null;

let axesHelper = null;
let gridHelper = null;

// 🆕 Leave-modal state flag (more reliable than checking style.display)
window.__leaveModalOpen = false;

window.__orbitModeActive = false;
window.__panModeActive = false;
window.__zoomModeActive = false;
window.__axisModeActive = false;
window.__rotateModeActive = false;
let lastOrbitModeTime = 0;
let lastPanModeTime = 0;
let lastZoomModeTime = 0;
let lastRotateModeTime = 0;
const GESTURE_MODE_TIMEOUT = 1500;

const CAMERA_DISTANCE = 6.0;
let prevCarWorldPos = new THREE.Vector3(0, 0, 0);
let cameraInitialized = false;

const handPointerEl = document.getElementById('hand-pointer');
let handPointerLastSeen = 0;
const HAND_POINTER_TIMEOUT = 2000;

let lastHoverCheckTime = 0;
let lastHoveredEl = null;
const HOVER_CHECK_INTERVAL = 60;

const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isolatedPart) restoreAllVisibility();
});
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && e.shiftKey) {
        if (window.GestureAPI && window.GestureAPI.resetCarPosition) {
            window.GestureAPI.resetCarPosition();
            voiceStatus && (voiceStatus.textContent = '🔄 Car position reset');
        }
    }
});

document.addEventListener('mousemove', (e) => {
    if (currentMode === 'walk' || currentMode === 'drive') {
        yaw -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
    }
});
document.addEventListener('click', () => {
    if (currentMode === 'walk' || currentMode === 'drive') {
        renderer.domElement.requestPointerLock?.();
    }
});

const hudEl = document.getElementById('jarvis-hud');
const hudTreeEl = document.getElementById('hud-tree');
const hudPartCount = document.getElementById('hud-part-count');
const hudSplitDist = document.getElementById('hud-split-dist');
const hudStatus = document.getElementById('hud-status');
const hudSearch = document.getElementById('hud-search-input');
const voiceStatus = document.getElementById('voice-status');
const voiceBtn = document.getElementById('voice-btn');

// ============================================
// LOAD MODEL
// ============================================
const loader = new GLTFLoader();
const progressBar = document.getElementById('progress');
const loaderScreen = document.getElementById('loader');

const MODEL_PATH = './assets/bmw_m4.glb';
console.log(`📂 Attempting to load model from: ${MODEL_PATH}`);

loader.load(
    MODEL_PATH,
    function (gltf) {
        console.log('✅ GLB loaded successfully!');
        carModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(carModel);
        const center = box.getCenter(new THREE.Vector3());
        carModel.position.sub(center);
        carModel.updateMatrixWorld(true);

        carModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                allPartMeshes.push(child);
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                child.userData.__origMaterialProps = mats.map(m => m ? {
                    color: m.color ? m.color.getHex() : undefined,
                    metalness: m.metalness,
                    roughness: m.roughness,
                    emissive: m.emissive ? m.emissive.getHex() : undefined,
                    emissiveIntensity: m.emissiveIntensity,
                    opacity: m.opacity,
                    transparent: m.transparent,
                    wireframe: m.wireframe
                } : null);
            }
        });

        scene.add(carModel);
        allPartMeshes.forEach(m => captureBase(m));

        loaderScreen.classList.add('hidden');
        setupDragControls();

        prevCarWorldPos.set(0, 0, 0);
        cameraInitialized = false;

        console.log(`📦 Loaded ${allPartMeshes.length} mesh parts`);
        setupHingesFromNames();
        buildHudTree();

        setTimeout(() => {
            const hud = document.getElementById('jarvis-hud');
            if (hud) {
                hud.classList.add('open');
                hud.classList.remove('minimized');
            }
        }, 400);
    },
    function (xhr) {
        if (xhr.total > 0) {
            const pct = Math.round((xhr.loaded / xhr.total) * 100);
            progressBar.textContent = pct + '%';
        } else {
            progressBar.textContent = `${(xhr.loaded / 1024).toFixed(0)} KB`;
        }
    },
    function (err) {
        console.error('❌ GLB load error:', err);
        loaderScreen.innerHTML = `
            <div style="text-align:center; padding: 20px;">
                <p style="color:#ff5566; font-family: Orbitron, sans-serif; font-size: 1.2rem; margin-bottom: 10px;">
                    ⚠️ FAILED TO LOAD MODEL
                </p>
                <p style="color: #8ccaff; font-size: 0.9rem; margin-bottom: 5px;">
                    Path: <code style="color:#00f3ff;">${MODEL_PATH}</code>
                </p>
                <p style="color: #ff5566; font-size: 0.85rem; margin-bottom: 15px;">
                    ${err.message || err.type || 'Unknown error'}
                </p>
            </div>
        `;
    }
);

// ============================================
// BASE POSITION
// ============================================
function captureBase(mesh) {
    mesh.userData.__baseLocalPos  = mesh.position.clone();
    mesh.userData.__baseLocalQuat = mesh.quaternion.clone();
    mesh.userData.__baseVisible   = mesh.visible;
    basePositions.set(mesh, {
        position: mesh.userData.__baseLocalPos,
        quaternion: mesh.userData.__baseLocalQuat
    });
}

// ============================================
// DRAG CONTROLS
// ============================================
function setupDragControls() {
    dragControls = new DragControls(allPartMeshes, camera, renderer.domElement);
    let draggedMesh = null;

    dragControls.addEventListener('hoveron', () => {
        if (currentMode === 'orbit') renderer.domElement.style.cursor = 'grab';
    });
    dragControls.addEventListener('hoveroff', () => {
        renderer.domElement.style.cursor = 'default';
    });
    dragControls.addEventListener('dragstart', (event) => {
        orbitControls.enabled = false;
        draggedMesh = event.object;
        selectedPart = event.object;
        if (explodedParts.has(draggedMesh)) explodedParts.delete(draggedMesh);
        if (hingedParts.has(draggedMesh)) {
            const h = hingedParts.get(draggedMesh);
            h.isOpen = false;
            h.currentAngle = 0;
        }
        updateDetailsPanel();
    });
    dragControls.addEventListener('dragend', () => {
        orbitControls.enabled = true;
        if (draggedMesh) {
            if (voiceStatus) voiceStatus.textContent = `📌 ${draggedMesh.name} moved`;
            updateDetailsPanel();
        }
        draggedMesh = null;
    });
}

// ============================================
// HINGES
// ============================================
function setupHingesFromNames() {
    let doors = 0, hood = 0, trunk = 0;
    Object.entries(PART_NAMES).forEach(([slot, partName]) => {
        if (!partName) return;
        const part = allPartMeshes.find(p => p.name === partName);
        if (!part) return;

        const b = new THREE.Box3().setFromObject(part);
        const size = b.getSize(new THREE.Vector3());
        const center = b.getCenter(new THREE.Vector3());

        if (slot.startsWith('door')) {
            const isLeft = slot.includes('L');
            const isFrontDoor = slot.includes('F');
            const hingeZOffset = isFrontDoor ? size.z * 0.5 : -size.z * 0.5;
            const hingeWorld = new THREE.Vector3(center.x, center.y, center.z + hingeZOffset);
            const openAngle = (isLeft ? 1 : -1) * (Math.PI / 2.2);
            createHinge(part, hingeWorld, new THREE.Vector3(0, 1, 0), openAngle, 'door');
            doors++;
        } else if (slot === 'hood') {
            const hingeWorld = new THREE.Vector3(center.x, center.y, center.z - size.z * 0.5);
            createHinge(part, hingeWorld, new THREE.Vector3(1, 0, 0), -Math.PI / 3.2, 'hood');
            hood++;
        } else if (slot === 'trunk') {
            const hingeWorld = new THREE.Vector3(center.x, center.y, center.z + size.z * 0.5);
            createHinge(part, hingeWorld, new THREE.Vector3(1, 0, 0), Math.PI / 3.2, 'trunk');
            trunk++;
        }
    });
    console.log(`🚗 Hinges: Doors=${doors} Hood=${hood} Trunk=${trunk}`);
}

function createHinge(part, hingePointWorld, axisLocal, openAngle, category) {
    const parent = part.parent;
    const hingePointLocal = parent.worldToLocal(hingePointWorld.clone());
    const base = basePositions.get(part) || { position: part.position.clone(), quaternion: part.quaternion.clone() };
    const offsetFromHinge = base.position.clone().sub(hingePointLocal);
    hingedParts.set(part, {
        parent, hingePointLocal, axisLocal, openAngle,
        originalPos: base.position.clone(),
        originalQuat: base.quaternion.clone(),
        offsetFromHinge,
        currentAngle: 0, isOpen: false, category
    });
}

function openHinge(part) {
    const h = hingedParts.get(part);
    if (!h || h.isOpen) return;
    h.isOpen = true;
    if (h.category === 'door' && part.material) {
        const mats = Array.isArray(part.material) ? part.material : [part.material];
        mats.forEach(m => { m.transparent = true; });
    }
    const state = { angle: h.currentAngle, opacity: 1 };
    new TWEEN.Tween(state)
        .to({ angle: h.openAngle, opacity: 0.15 }, 1200)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
            applyHingeTransform(part, h, state.angle);
            h.currentAngle = state.angle;
            if (h.category === 'door' && part.material) {
                const mats = Array.isArray(part.material) ? part.material : [part.material];
                mats.forEach(m => { m.opacity = state.opacity; });
            }
        }).start();
}

function closeHinge(part) {
    const h = hingedParts.get(part);
    if (!h || !h.isOpen) return;
    h.isOpen = false;
    const base = basePositions.get(part) || { position: h.originalPos, quaternion: h.originalQuat };
    new TWEEN.Tween(part.position)
        .to({ x: base.position.x, y: base.position.y, z: base.position.z }, 1000)
        .easing(TWEEN.Easing.Cubic.Out)
        .onComplete(() => {
            part.position.copy(base.position);
            part.quaternion.copy(base.quaternion);
            h.currentAngle = 0;
            part.updateMatrixWorld(true);
        }).start();
    new TWEEN.Tween(part.quaternion)
        .to({ x: base.quaternion.x, y: base.quaternion.y, z: base.quaternion.z, w: base.quaternion.w }, 1000)
        .easing(TWEEN.Easing.Cubic.Out).start();
    if (h.category === 'door' && part.material) {
        const mats = Array.isArray(part.material) ? part.material : [part.material];
        new TWEEN.Tween({ o: mats[0] ? mats[0].opacity : 1 }).to({ o: 1 }, 1000)
            .onUpdate(s => { mats.forEach(m => { m.opacity = s.o; }); }).start();
    }
}

function applyHingeTransform(part, h, angle) {
    const q = new THREE.Quaternion().setFromAxisAngle(h.axisLocal, angle);
    const newOffset = h.offsetFromHinge.clone().applyQuaternion(q);
    part.position.copy(h.hingePointLocal.clone().add(newOffset));
    part.quaternion.copy(h.originalQuat).premultiply(q);
    part.updateMatrixWorld(true);
}

// ============================================
// SPLIT ALL
// ============================================
function applySplitDistance(part, distance, delay = 0) {
    const d = explodedParts.get(part);
    if (!d || d.isBody) return;
    const tw = d.worldPosAtSplit.clone().add(d.direction.clone().multiplyScalar(distance));
    new TWEEN.Tween(part.position).to({ x: tw.x, y: tw.y, z: tw.z }, 800)
        .easing(TWEEN.Easing.Cubic.Out).delay(delay).start();
}

function splitAll() {
    if (!carModel) return;
    if (isolatedPart) { isolatedPart = null; visibilitySnapshot.clear(); }
    allPartMeshes.forEach(m => { m.visible = true; });
    syncHudRowsToVisibility(null);

    allPartMeshes.forEach(m => {
        const base = basePositions.get(m);
        if (base) { m.position.copy(base.position); m.quaternion.copy(base.quaternion); }
    });
    explodedParts.clear();

    const carBox = new THREE.Box3().setFromObject(carModel);
    const carCenter = carBox.getCenter(new THREE.Vector3());
    const carSize = carBox.getSize(new THREE.Vector3());
    const carMax = Math.max(carSize.x, carSize.y, carSize.z);

    const infos = [];
    allPartMeshes.forEach(part => {
        const b = new THREE.Box3().setFromObject(part);
        if (b.isEmpty()) return;
        const s = b.getSize(new THREE.Vector3());
        const v = s.x * s.y * s.z;
        if (v > 0) infos.push({ part, volume: v });
    });
    infos.sort((a, b) => b.volume - a.volume);
    const bodyPart = infos[0].part;
    const splitDist = carMax * 0.35;

    explodedParts.set(bodyPart, {
        originalPos: bodyPart.position.clone(),
        originalQuat: bodyPart.quaternion.clone(),
        direction: new THREE.Vector3(0, 0, 0),
        worldPosAtSplit: new THREE.Vector3(),
        isBody: true
    });

    const others = infos.slice(1);
    const total = others.length;
    others.forEach((item, i) => {
        const part = item.part;
        if (hingedParts.has(part)) {
            const h = hingedParts.get(part);
            if (h && h.isOpen) closeHinge(part);
        }
        const op = part.position.clone(), oq = part.quaternion.clone();
        const wp = new THREE.Vector3(); part.getWorldPosition(wp);
        const ratio = (i + 0.5) / Math.max(total, 1);
        const ga = Math.PI * (3 - Math.sqrt(5));
        const th = ga * i;
        const ph = Math.acos(1 - 2 * ratio);
        const sdir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        const radial = wp.clone().sub(carCenter);
        if (radial.lengthSq() < 0.0001) radial.set(0, 1, 0);
        radial.normalize();
        const dir = sdir.clone().multiplyScalar(0.6).add(radial.clone().multiplyScalar(0.4)).normalize();
        explodedParts.set(part, { originalPos: op, originalQuat: oq, direction: dir, worldPosAtSplit: wp });
        const tw = wp.clone().add(dir.clone().multiplyScalar(splitDist));
        new TWEEN.Tween(part.position).to({ x: tw.x, y: tw.y, z: tw.z }, 1500)
            .easing(TWEEN.Easing.Cubic.Out).delay(i * 10).start();
    });

    if (voiceStatus) voiceStatus.textContent = `💥 Split ${others.length} parts`;
    speak(`Split ${others.length} parts`);
}

// ============================================
// SPLIT GROUP
// ============================================
function splitGroup(groupKey) {
    if (!carModel) return;
    const parts = findPartsByGroup(groupKey);
    if (!parts.length) { voiceStatus.textContent = `⚠️ No ${groupKey} found`; return; }
    if (typeof TWEEN !== 'undefined') TWEEN.removeAll();
    visibilitySnapshot.clear();
    allPartMeshes.forEach(m => {
        visibilitySnapshot.set(m, m.visible);
        m.visible = parts.includes(m);
    });
    isolatedPart = null;

    const badge = document.getElementById('isolation-badge');
    const label = document.getElementById('isolation-label');
    if (badge && label) {
        label.textContent = `SPLIT: ${groupKey.toUpperCase()} (${parts.length})`;
        badge.classList.remove('hidden');
    }

    const carBox = new THREE.Box3().setFromObject(carModel);
    const carSize = carBox.getSize(new THREE.Vector3());
    const carMax = Math.max(carSize.x, carSize.y, carSize.z);

    const groupBox = new THREE.Box3();
    parts.forEach(p => groupBox.expandByObject(p));
    const groupCenter = groupBox.getCenter(new THREE.Vector3());
    const spreadDist = carMax * 0.4;

    parts.forEach(part => {
        const base = basePositions.get(part);
        if (base) { part.position.copy(base.position); part.quaternion.copy(base.quaternion); }
    });
    explodedParts.clear();
    parts.forEach((part, i) => {
        const wp = new THREE.Vector3();
        part.getWorldPosition(wp);
        const ratio = (i + 0.5) / Math.max(parts.length, 1);
        const ga = Math.PI * (3 - Math.sqrt(5));
        const th = ga * i;
        const ph = Math.acos(1 - 2 * ratio);
        const sdir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
        let radial = wp.clone().sub(groupCenter);
        if (radial.lengthSq() < 0.0001) radial.set(0, 1, 0);
        radial.normalize();
        const dir = sdir.clone().multiplyScalar(0.7).add(radial.clone().multiplyScalar(0.3)).normalize();
        explodedParts.set(part, { originalPos: part.position.clone(), originalQuat: part.quaternion.clone(), direction: dir, worldPosAtSplit: wp });
        const tw = wp.clone().add(dir.clone().multiplyScalar(spreadDist));
        new TWEEN.Tween(part.position).to({ x: tw.x, y: tw.y, z: tw.z }, 1200)
            .easing(TWEEN.Easing.Cubic.Out).delay(i * 30).start();
    });

    orbitControls.target.copy(groupCenter);
    const camDist = carMax * 2.5;
    const camDir = new THREE.Vector3().subVectors(camera.position, groupCenter).normalize();
    const newPos = groupCenter.clone().add(camDir.multiplyScalar(camDist));
    new TWEEN.Tween(camera.position).to({ x: newPos.x, y: newPos.y, z: newPos.z }, 900)
        .easing(TWEEN.Easing.Quadratic.InOut).onUpdate(() => camera.lookAt(groupCenter)).start();
    new TWEEN.Tween(orbitControls.target).to({ x: groupCenter.x, y: groupCenter.y, z: groupCenter.z }, 900)
        .easing(TWEEN.Easing.Quadratic.InOut).start();

    if (voiceStatus) voiceStatus.textContent = `💥 Split ${groupKey}`;
    speak(`Splitting ${groupKey}`);
}

// ============================================
// SPLIT PART
// ============================================
function splitPart(mesh) {
    if (!carModel || !mesh) return;
    if (typeof TWEEN !== 'undefined') TWEEN.removeAll();
    const carBox = new THREE.Box3().setFromObject(carModel);
    const carCenter = carBox.getCenter(new THREE.Vector3());
    const carSize = carBox.getSize(new THREE.Vector3());
    const carMax = Math.max(carSize.x, carSize.y, carSize.z);

    allPartMeshes.forEach(m => {
        const base = basePositions.get(m);
        if (base) { m.position.copy(base.position); m.quaternion.copy(base.quaternion); }
    });
    explodedParts.clear();

    const wp = new THREE.Vector3();
    mesh.getWorldPosition(wp);
    const dir = wp.clone().sub(carCenter);
    if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0);
    dir.normalize();

    const flyDist = carMax * 0.5;
    const tw = wp.clone().add(dir.clone().multiplyScalar(flyDist));
    explodedParts.set(mesh, {
        originalPos: mesh.position.clone(),
        originalQuat: mesh.quaternion.clone(),
        direction: dir,
        worldPosAtSplit: wp
    });
    new TWEEN.Tween(mesh.position).to({ x: tw.x, y: tw.y, z: tw.z }, 1200)
        .easing(TWEEN.Easing.Cubic.Out).start();

    const midPoint = carCenter.clone().add(wp).multiplyScalar(0.5);
    orbitControls.target.copy(midPoint);
    const camDist = carMax * 1.8;
    const camDir = new THREE.Vector3().subVectors(camera.position, midPoint).normalize();
    const newPos = midPoint.clone().add(camDir.multiplyScalar(camDist));
    new TWEEN.Tween(camera.position).to({ x: newPos.x, y: newPos.y, z: newPos.z }, 900)
        .easing(TWEEN.Easing.Quadratic.InOut).onUpdate(() => camera.lookAt(midPoint)).start();
    new TWEEN.Tween(orbitControls.target).to({ x: midPoint.x, y: midPoint.y, z: midPoint.z }, 900)
        .easing(TWEEN.Easing.Quadratic.InOut).start();

    if (voiceStatus) voiceStatus.textContent = `💥 Split ${mesh.name}`;
    speak(`Split ${mesh.name}`);
}

function changeSplitDistance(delta) {
    currentSplitDistance = Math.max(MIN_SPLIT_DISTANCE, Math.min(MAX_SPLIT_DISTANCE, currentSplitDistance + delta));
    if (explodedParts.size > 0) {
        let i = 0;
        explodedParts.forEach((d, p) => { if (!d.isBody) { applySplitDistance(p, currentSplitDistance, i * 10); i++; } });
    }
    if (voiceStatus) voiceStatus.textContent = `📏 Distance: ${currentSplitDistance.toFixed(1)}`;
    if (hudSplitDist) hudSplitDist.textContent = currentSplitDistance.toFixed(1);
}
function setSplitDistance(v) {
    currentSplitDistance = Math.max(MIN_SPLIT_DISTANCE, Math.min(MAX_SPLIT_DISTANCE, v));
    if (explodedParts.size > 0) changeSplitDistance(0);
}

// ============================================
// RESET
// ============================================
function unsplitAll() {
    if (typeof TWEEN !== 'undefined') TWEEN.removeAll();
    hingedParts.forEach((h) => { h.isOpen = false; h.currentAngle = 0; });

    let snapped = 0;
    allPartMeshes.forEach(mesh => {
        const base = basePositions.get(mesh);
        if (!base) return;
        const wasOff = mesh.position.distanceToSquared(base.position) > 1e-6 ||
                       Math.abs(mesh.quaternion.dot(base.quaternion)) < 1 - 1e-6;
        if (wasOff) snapped++;
        mesh.position.copy(base.position);
        mesh.quaternion.copy(base.quaternion);
        mesh.scale.set(1, 1, 1);
        mesh.visible = true;
        mesh.userData.__trashed = false;
        mesh.updateMatrixWorld(true);
    });

    explodedParts.clear();
    if (isolatedPart) { isolatedPart = null; visibilitySnapshot.clear(); }
    visibilitySnapshot.forEach((wasVisible, m) => { m.visible = wasVisible; });
    visibilitySnapshot.clear();
    const badge = document.getElementById('isolation-badge');
    if (badge) badge.classList.add('hidden');
    syncHudRowsToVisibility(null);

    allPartMeshes.forEach(m => {
        if (!m.material) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat, idx) => {
            const orig = m.userData.__origMaterialProps?.[idx];
            if (!orig) return;
            if (mat.color && orig.color !== undefined) mat.color.setHex(orig.color);
            if (mat.emissive && orig.emissive !== undefined) mat.emissive.setHex(orig.emissive);
            if (mat.emissiveIntensity !== undefined && orig.emissiveIntensity !== undefined)
                mat.emissiveIntensity = orig.emissiveIntensity;
            if ('metalness' in mat && orig.metalness !== undefined) mat.metalness = orig.metalness;
            if ('roughness' in mat && orig.roughness !== undefined) mat.roughness = orig.roughness;
            if (orig.opacity !== undefined) mat.opacity = orig.opacity;
            if (orig.transparent !== undefined) mat.transparent = orig.transparent;
            if (orig.wireframe !== undefined) mat.wireframe = orig.wireframe;
            mat.needsUpdate = true;
        });
    });

    if (carModel) {
        carModel.position.set(0, 0, 0);
        carModel.rotation.set(0, 0, 0);
    }

    blueprintMode = false;
    scene.background = originalSceneBackground.clone();

    if (carModel) {
        const b = new THREE.Box3().setFromObject(carModel);
        const s = b.getSize(new THREE.Vector3());
        const d = Math.max(s.x, s.y, s.z) * 1.5;
        camera.position.set(d * 0.7, d * 0.5, d * 0.7);
        orbitControls.target.copy(carModel.position);
        camera.lookAt(carModel.position);
    }

    orbitControls.autoRotate = true;
    orbitControls.autoRotateSpeed = 1.5;

    hideHud();
    if (voiceStatus) voiceStatus.textContent = `🔄 Reset — Car restored`;
    speak('Reset complete. Car restored.');
}

// ============================================
// BLUEPRINT MODE
// ============================================
function setBlueprintMode(on) {
    blueprintMode = on;
    if (on) {
        if (!blueprintMode) originalSceneBackground = scene.background.clone();
        scene.background = new THREE.Color(0x020a12);
        allPartMeshes.forEach(mesh => {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach(m => {
                if (!m) return;
                m.wireframe = true;
                if (m.color) m.color.setHex(0x00e5ff);
                if (m.emissive) { m.emissive.setHex(0x00e5ff); m.emissiveIntensity = 0.6; }
                if ('metalness' in m) m.metalness = 0.2;
                if ('roughness' in m) m.roughness = 0.5;
                m.needsUpdate = true;
            });
        });
        voiceStatus.textContent = '🔷 Blueprint ON';
        speak('Blueprint mode on');
    } else {
        scene.background = originalSceneBackground.clone();
        allPartMeshes.forEach(mesh => {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m, idx) => {
                if (!m) return;
                const orig = mesh.userData.__origMaterialProps?.[idx];
                if (orig) {
                    if (m.color && orig.color !== undefined) m.color.setHex(orig.color);
                    if (m.emissive && orig.emissive !== undefined) m.emissive.setHex(orig.emissive);
                    if (m.emissiveIntensity !== undefined && orig.emissiveIntensity !== undefined)
                        m.emissiveIntensity = orig.emissiveIntensity;
                    if ('metalness' in m && orig.metalness !== undefined) m.metalness = orig.metalness;
                    if ('roughness' in m && orig.roughness !== undefined) m.roughness = orig.roughness;
                    if (orig.opacity !== undefined) m.opacity = orig.opacity;
                    if (orig.transparent !== undefined) m.transparent = orig.transparent;
                    if (orig.wireframe !== undefined) m.wireframe = orig.wireframe;
                } else {
                    m.wireframe = false;
                }
                m.needsUpdate = true;
            });
        });
        voiceStatus.textContent = '🔷 Blueprint OFF';
        speak('Blueprint mode off');
    }
    const btn = document.querySelector('[data-setting="blueprint"]');
    if (btn) btn.classList.toggle('active', on);
}

// ============================================
// 🎯 PANEL MANAGEMENT
// ============================================
const ALL_PANEL_IDS = ['jarvis-hud', 'details-panel', 'design-panel', 'material-panel', 'edit-panel', 'settings-panel'];

window.__autoMinimizeOthers = true;
const PANEL_BASE_Z = 100;
let topPanelZ = PANEL_BASE_Z;

function bringPanelToFront(id) {
    const el = document.getElementById(id);
    if (!el) return;
    topPanelZ++;
    el.style.zIndex = topPanelZ;
}

function resetPanelZIndexes() {
    topPanelZ = PANEL_BASE_Z;
    ALL_PANEL_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.zIndex = PANEL_BASE_Z;
    });
}

function openPanel(id, autoMinimize = window.__autoMinimizeOthers) {
    const el = document.getElementById(id);
    if (!el) return;

    if (autoMinimize) {
        ALL_PANEL_IDS.forEach(otherId => {
            if (otherId !== id) {
                const otherEl = document.getElementById(otherId);
                if (otherEl && otherEl.classList.contains('open') && !otherEl.classList.contains('minimized')) {
                    otherEl.classList.add('minimized');
                }
            }
        });
    }

    el.classList.add('open');
    el.classList.remove('minimized');
    bringPanelToFront(id);
    updateMinBtn(el);
}

function closePanel(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
}

function minimizePanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('minimized');
    updateMinBtn(el);
}

function minimizeAllPanels() {
    ALL_PANEL_IDS.forEach(id => minimizePanel(id));
}

function maximizePanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('minimized');
    bringPanelToFront(id);
    updateMinBtn(el);
}

function updateMinBtn(el) {
    const btn = el.querySelector('.ctl-min');
    if (btn) btn.textContent = el.classList.contains('minimized') ? '+' : '−';
}

function movePanel(id, position) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.position = position;
}

function resetPanelPositions() {
    ALL_PANEL_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        for (let i = 0; i < 6; i++) el.classList.remove('stack-slot-' + i);
    });
    stackOrder = [];
    resetPanelZIndexes();
}

function applyCascadeStack() {
    stackOrder.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (!el) return;
        for (let i = 0; i < 6; i++) el.classList.remove('stack-slot-' + i);
        el.classList.add('stack-slot-' + Math.min(idx, 5));
    });
}

function minimizeOthers(exceptId) {
    ALL_PANEL_IDS.forEach(id => { if (id !== exceptId) minimizePanel(id); });
}

// ============================================
// PANEL SIZE
// ============================================
const PANEL_SIZE_PRESETS = {
    tiny:    { w: 280, h: 400 },
    small:   { w: 380, h: 550 },
    medium:  { w: 460, h: 700 },
    default: { w: 800, h: 850 },
    normal:  { w: 800, h: 850 },
    large:   { w: 800, h: 900 },
    big:     { w: 800, h: 900 },
    huge:    { w: 800, h: 1000 },
    full:    { w: 1080, h: 1080 }
};

const panelSizes = {};

function setPanelSize(id, sizeKey) {
    const el = document.getElementById(id);
    if (!el) return;
    const preset = PANEL_SIZE_PRESETS[sizeKey];
    if (!preset) return;
    el.style.setProperty('width', preset.w + 'px', 'important');
    el.style.setProperty('height', preset.h + 'px', 'important');
    el.style.setProperty('max-height', preset.h + 'px', 'important');
    panelSizes[id] = { w: preset.w, h: preset.h };
}

function setPanelCustomSize(id, w, h) {
    const el = document.getElementById(id);
    if (!el) return;
    w = Math.max(180, Math.min(2000, w));
    h = Math.max(200, Math.min(2000, h));
    el.style.setProperty('width', w + 'px', 'important');
    el.style.setProperty('height', h + 'px', 'important');
    el.style.setProperty('max-height', h + 'px', 'important');
    panelSizes[id] = { w, h };
}

function setPanelWidth(id, w) {
    const el = document.getElementById(id);
    if (!el) return;
    w = Math.max(180, Math.min(2000, w));
    el.style.setProperty('width', w + 'px', 'important');
    panelSizes[id] = { w, h: panelSizes[id]?.h || 850 };
}

function setPanelHeight(id, h) {
    const el = document.getElementById(id);
    if (!el) return;
    h = Math.max(200, Math.min(2000, h));
    el.style.setProperty('height', h + 'px', 'important');
    el.style.setProperty('max-height', h + 'px', 'important');
    panelSizes[id] = { w: panelSizes[id]?.w || 800, h };
}

function resetPanelSize(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.removeProperty('width');
    el.style.removeProperty('height');
    el.style.removeProperty('max-height');
    delete panelSizes[id];
}

function growPanel(id, action) {
    const el = document.getElementById(id);
    if (!el) return;
    let current = panelSizes[id]?.w;
    if (!current) current = parseFloat(window.getComputedStyle(el).width) || 800;
    let newW;
    if (action === 'bigger' || action === 'larger' || action === 'grow') newW = Math.min(1200, current + 100);
    else newW = Math.max(220, current - 100);
    el.style.setProperty('width', newW + 'px', 'important');
    panelSizes[id] = { w: newW, h: panelSizes[id]?.h || 850 };
}

document.querySelectorAll('.ctl-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.close;
        if (id) closePanel(id);
    });
});
document.querySelectorAll('.ctl-min').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.min;
        const el = document.getElementById(id);
        if (!el) return;
        if (el.classList.contains('minimized')) maximizePanel(id);
        else minimizePanel(id);
    });
});

document.querySelectorAll('.hud-panel').forEach(panel => {
    panel.addEventListener('mousedown', () => {
        if (panel.classList.contains('open')) {
            bringPanelToFront(panel.id);
        }
    });
});

function openPartsPanel() {
    openPanel('jarvis-hud', true);
    setPanelCustomSize('jarvis-hud', 600, 1200);
    const tree = document.getElementById('hud-tree');
    if (tree) tree.scrollTop = 0;
    if (voiceStatus) voiceStatus.textContent = "📂 Parts panel opened";
    speak("Opening parts panel");
}

function autoScrollPanel(panelId, direction = 'down') {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const scrollable = panel.querySelector('.panel-body, .inspector-tree');
    if (scrollable) {
        const scrollAmount = direction === 'down' ? 300 : -300;
        scrollable.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        if (voiceStatus) voiceStatus.textContent = `📜 Scrolling ${direction}...`;
    }
}

// ============================================
// PART GROUPS
// ============================================
const PART_GROUPS = {
    doors:        { label: '🚪 Doors' },
    hood:         { label: '🔧 Hood' },
    trunk:        { label: '🧳 Trunk' },
    wheels:       { label: '🛞 Wheels' },
    engine:       { label: '🏎️ Engine' },
    lights:       { label: '💡 Lights' },
    windows:      { label: '🪟 Windows' },
    interior:     { label: '🪑 Interior' },
    body:         { label: '🚗 Body' },
    underside:    { label: '🔻 Underside' },
    front_fascia: { label: '⬆️ Front Fascia' },
    rear_fascia:  { label: '⬇️ Rear Fascia' },
    side_panels:  { label: '🔶 Side Panels' },
    cabin:        { label: '🚪 Cabin Shell' },
    other:        { label: '📦 Other' }
};

const hudOriginalEmissive = new WeakMap();

function classifyPart(mesh) {
    if (PART_GROUP_OVERRIDES[mesh.name]) return PART_GROUP_OVERRIDES[mesh.name];
    return 'other';
}

function findPartByName(query) {
    if (!query) return null;
    const q = query.toLowerCase().trim();
    let found = allPartMeshes.find(m => m.name.toLowerCase() === q);
    if (found) return found;
    found = allPartMeshes.find(m => m.name.toLowerCase().includes(q));
    if (found) return found;
    const numMatch = q.match(/^(\d+)$/);
    if (numMatch) found = allPartMeshes.find(m => m.name.toLowerCase() === `object_${numMatch[1]}`);
    return found || null;
}

function findPartsByGroup(groupKey) {
    return allPartMeshes.filter(m => classifyPart(m) === groupKey);
}

function isolateGroup(groupKey) {
    const parts = findPartsByGroup(groupKey);
    if (!parts.length) { if (voiceStatus) voiceStatus.textContent = `⚠️ No ${groupKey} found`; return 0; }
    visibilitySnapshot.clear();
    allPartMeshes.forEach(m => { visibilitySnapshot.set(m, m.visible); m.visible = parts.includes(m); });
    isolatedPart = null;
    syncHudRowsToVisibility(null);

    const badge = document.getElementById('isolation-badge');
    const label = document.getElementById('isolation-label');
    if (badge && label) { label.textContent = `ISOLATED: ${groupKey.toUpperCase()} (${parts.length})`; badge.classList.remove('hidden'); }

    const box = new THREE.Box3();
    parts.forEach(p => box.expandByObject(p));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.y, size.z) * 2 + 1;
    orbitControls.target.copy(center);
    const dir = new THREE.Vector3().subVectors(camera.position, center).normalize();
    const newPos = center.clone().add(dir.multiplyScalar(d));
    new TWEEN.Tween(camera.position).to({ x: newPos.x, y: newPos.y, z: newPos.z }, 900)
        .easing(TWEEN.Easing.Quadratic.InOut).onUpdate(() => camera.lookAt(center)).start();
    new TWEEN.Tween(orbitControls.target).to({ x: center.x, y: center.y, z: center.z }, 900)
        .easing(TWEEN.Easing.Quadratic.InOut).start();

    speak(`Isolated ${groupKey}, ${parts.length} parts`);
    return parts.length;
}

// ============================================
// LIGHT DETECTION
// ============================================
const lightMeshStates = new WeakMap();
const detectedLights = { head: [], tail: [], initialized: false };

function reportLightCandidates() {
    const head = [], tail = [];
    LIGHT_HEADLIGHT_NAMES.forEach(n => { const m = findPartByName(n); if (m && !head.includes(m)) head.push(m); });
    LIGHT_TAILLIGHT_NAMES.forEach(n => { const m = findPartByName(n); if (m && !tail.includes(m)) tail.push(m); });
    [...head, ...tail].forEach(mesh => {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(m => {
            if (!m || !m.emissive) return;
            if (!lightMeshStates.has(m)) lightMeshStates.set(m, {
                origEmissive: m.emissive.clone(),
                origIntensity: m.emissiveIntensity ?? 1
            });
        });
    });
    detectedLights.head = head;
    detectedLights.tail = tail;
    detectedLights.initialized = true;
    return { headlights: head, taillights: tail };
}
function ensureLightsDetected() {
    if (!detectedLights.initialized) reportLightCandidates();
    return detectedLights;
}

function toggleHeadlights(on) {
    const { head } = ensureLightsDetected();
    if (!head.length) {
        if (voiceStatus) voiceStatus.textContent = '⚠️ No headlights found';
        speak('No headlights found');
        return 0;
    }
    head.forEach(mesh => {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(m => {
            if (!m || !m.emissive) return;
            if (!lightMeshStates.has(m)) lightMeshStates.set(m, {
                origEmissive: m.emissive.clone(),
                origIntensity: m.emissiveIntensity ?? 1
            });
            const state = lightMeshStates.get(m);
            if (on) {
                const origHex = state.origEmissive.getHex();
                if (origHex === 0x000000) m.emissive.setHex(HEADLIGHT_COLOR);
                else m.emissive.copy(state.origEmissive).lerp(new THREE.Color(HEADLIGHT_COLOR), 0.6);
                m.emissiveIntensity = HEADLIGHT_INTENSITY;
            } else {
                m.emissive.copy(state.origEmissive);
                m.emissiveIntensity = state.origIntensity;
            }
            m.needsUpdate = true;
        });
    });
    if (voiceStatus) voiceStatus.textContent = on ? '💡 Headlights ON' : '💡 Headlights OFF';
    return head.length;
}

function toggleTaillights(on) {
    const { tail } = ensureLightsDetected();
    if (!tail.length) {
        if (voiceStatus) voiceStatus.textContent = '⚠️ No taillights found';
        speak('No taillights found');
        return 0;
    }
    tail.forEach(mesh => {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(m => {
            if (!m || !m.emissive) return;
            if (!lightMeshStates.has(m)) lightMeshStates.set(m, {
                origEmissive: m.emissive.clone(),
                origIntensity: m.emissiveIntensity ?? 1
            });
            const state = lightMeshStates.get(m);
            if (on) {
                const origHex = state.origEmissive.getHex();
                if (origHex === 0x000000) m.emissive.setHex(TAILLIGHT_COLOR);
                else m.emissive.copy(state.origEmissive).lerp(new THREE.Color(TAILLIGHT_COLOR), 0.7);
                m.emissiveIntensity = TAILLIGHT_INTENSITY;
            } else {
                m.emissive.copy(state.origEmissive);
                m.emissiveIntensity = state.origIntensity;
            }
            m.needsUpdate = true;
        });
    });
    if (voiceStatus) voiceStatus.textContent = on ? '💡 Taillights ON' : '💡 Taillights OFF';
    return tail.length;
}

function setPartVisible(query, visible) {
    const mesh = findPartByName(query);
    if (!mesh) return null;
    if (isolatedPart) restoreAllVisibility();
    mesh.visible = visible;
    syncHudRowsToVisibility(null);
    return mesh;
}
function togglePart(query) {
    const mesh = findPartByName(query);
    if (!mesh) return null;
    if (isolatedPart) restoreAllVisibility();
    mesh.visible = !mesh.visible;
    syncHudRowsToVisibility(null);
    return mesh;
}

// ============================================
// BUILD HUD TREE
// ============================================
function buildHudTree() {
    if (!hudTreeEl || !allPartMeshes.length) return;
    const grouped = {};
    Object.keys(PART_GROUPS).forEach(k => grouped[k] = []);
    allPartMeshes.forEach(mesh => { grouped[classifyPart(mesh)].push(mesh); });

    hudTreeEl.innerHTML = '';
    let totalShown = 0;

    Object.entries(PART_GROUPS).forEach(([key, meta]) => {
        const parts = grouped[key];
        if (!parts.length) return;
        totalShown += parts.length;

        const group = document.createElement('div');
        group.className = 'hud-group';

        const header = document.createElement('div');
        header.className = 'hud-group-header';
        header.innerHTML = `
            <span class="hud-caret">▼</span>
            <span>${meta.label}</span>
            <span class="hud-group-count">${parts.length}</span>
        `;
        header.addEventListener('click', () => group.classList.toggle('collapsed'));

        const body = document.createElement('div');
        body.className = 'hud-group-body';

        parts.sort((a, b) => a.name.localeCompare(b.name)).forEach(mesh => {
            const row = document.createElement('div');
            row.className = 'hud-part';
            row.dataset.partName = mesh.name;

            const name = document.createElement('span');
            name.className = 'hud-part-name';
            name.textContent = mesh.name;

            const eye = document.createElement('button');
            eye.className = 'hud-eye';
            eye.textContent = mesh.visible ? '👁' : '🚫';
            eye.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isolatedPart) restoreAllVisibility();
                mesh.visible = !mesh.visible;
                eye.textContent = mesh.visible ? '👁' : '🚫';
                row.classList.toggle('hidden-part', !mesh.visible);
            });

            row.appendChild(name);
            row.appendChild(eye);
            row.addEventListener('mouseenter', () => highlightPart(mesh, row));
            row.addEventListener('mouseleave', () => unhighlightPart(mesh, row));
            row.addEventListener('click', () => { selectPart(mesh); focusOnPart(mesh); });
            row.addEventListener('contextmenu', (e) => { e.preventDefault(); focusOnPart(mesh); });

            body.appendChild(row);
        });

        group.appendChild(header);
        group.appendChild(body);
        hudTreeEl.appendChild(group);
    });

    if (hudPartCount) hudPartCount.textContent = totalShown;
}

function highlightPart(mesh, row) {
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(m => {
        if (!hudOriginalEmissive.has(m)) hudOriginalEmissive.set(m, { emissive: m.emissive ? m.emissive.clone() : null, intensity: m.emissiveIntensity ?? 1 });
        if (m.emissive) { m.emissive.setHex(0x00e5ff); m.emissiveIntensity = 1.4; }
    });
    if (row) row.classList.add('highlight-hover');
}
function unhighlightPart(mesh, row) {
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(m => {
        const orig = hudOriginalEmissive.get(m);
        if (orig && m.emissive) { m.emissive.copy(orig.emissive); m.emissiveIntensity = orig.intensity; }
    });
    if (row) row.classList.remove('highlight-hover');
}

function focusOnPart(mesh) {
    if (isolatedPart === mesh) { restoreAllVisibility(); return; }
    isolatePart(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const d = Math.max(size.x, size.y, size.z) * 3 + 1;
    orbitControls.target.copy(center);
    const dir = new THREE.Vector3().subVectors(camera.position, center).normalize();
    const newPos = center.clone().add(dir.multiplyScalar(d));
    new TWEEN.Tween(camera.position).to({ x: newPos.x, y: newPos.y, z: newPos.z }, 900)
        .easing(TWEEN.Easing.Quadratic.InOut).onUpdate(() => camera.lookAt(center)).start();
    new TWEEN.Tween(orbitControls.target).to({ x: center.x, y: center.y, z: center.z }, 900)
        .easing(TWEEN.Easing.Quadratic.InOut).start();
}
function isolatePart(mesh) {
    visibilitySnapshot.clear();
    allPartMeshes.forEach(m => { visibilitySnapshot.set(m, m.visible); m.visible = (m === mesh); });
    isolatedPart = mesh;
    syncHudRowsToVisibility(mesh);
    const badge = document.getElementById('isolation-badge');
    const label = document.getElementById('isolation-label');
    if (badge && label) { label.textContent = `ISOLATED: ${mesh.name}`; badge.classList.remove('hidden'); }
}
function restoreAllVisibility() {
    if (visibilitySnapshot.size === 0) return;
    visibilitySnapshot.forEach((wasVisible, m) => { m.visible = wasVisible; });
    visibilitySnapshot.clear();
    isolatedPart = null;
    syncHudRowsToVisibility(null);
    const badge = document.getElementById('isolation-badge');
    if (badge) badge.classList.add('hidden');
}
function syncHudRowsToVisibility(soloMesh) {
    document.querySelectorAll('.hud-part').forEach(row => {
        const name = row.dataset.partName;
        const mesh = allPartMeshes.find(m => m.name === name);
        if (!mesh) return;
        const eye = row.querySelector('.hud-eye');
        if (eye) eye.textContent = mesh.visible ? '👁' : '🚫';
        row.classList.toggle('hidden-part', !mesh.visible);
        row.classList.toggle('highlight', soloMesh === mesh || selectedPart === mesh);
    });
}

// ============================================
// SELECT + DETAILS
// ============================================
function selectPart(mesh, autoOpen = true) {
    selectedPart = mesh;
    if (autoOpen) {
        resetPanelPositions();
        minimizeOthers('details-panel');
        openPanel('details-panel', false);
        maximizePanel('details-panel');
        stackOrder = ALL_PANEL_IDS.filter(x => x !== 'details-panel');
        applyCascadeStack();
    }
    updateDetailsPanel();
    syncHudRowsToVisibility(null);
    if (mesh) speak(`Selected ${mesh.name}`);
}

function updateDetailsPanel() {
    if (!selectedPart) return;
    const m = selectedPart;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const pos = m.position;
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setText('det-name', m.name);
    setText('det-group', classifyPart(m));
    setText('det-type', m.geometry?.type || 'Mesh');
    setText('det-verts', m.geometry?.attributes?.position?.count || 0);
    setText('det-tris', m.geometry?.index ? Math.floor(m.geometry.index.count / 3) : 0);
    setText('det-sx', size.x.toFixed(2));
    setText('det-sy', size.y.toFixed(2));
    setText('det-sz', size.z.toFixed(2));
    setText('det-px', pos.x.toFixed(2));
    setText('det-py', pos.y.toFixed(2));
    setText('det-pz', pos.z.toFixed(2));

    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const firstMat = mats[0];
    if (firstMat) {
        setText('det-mat-type', firstMat.type || 'Unknown');
        setText('det-mat-color', firstMat.color ? '#' + firstMat.color.getHexString() : '—');
        setText('det-metal', firstMat.metalness !== undefined ? firstMat.metalness.toFixed(2) : '—');
        setText('det-rough', firstMat.roughness !== undefined ? firstMat.roughness.toFixed(2) : '—');
        setText('det-opacity', firstMat.opacity !== undefined ? firstMat.opacity.toFixed(2) : '—');
    }
    setText('det-vis', m.visible ? 'YES' : 'NO');
    setText('det-trashed', m.userData.__trashed ? 'YES' : 'NO');
}
setInterval(updateDetailsPanel, 500);

// ============================================
// DESIGN / MATERIAL / EDIT HANDLERS
// ============================================
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!selectedPart) return;
        const hex = parseInt(btn.dataset.color, 16);
        const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
        mats.forEach(m => { if (m && m.color) { m.color.setHex(hex); m.needsUpdate = true; } });
        updateDetailsPanel();
    });
});
document.getElementById('opacity-slider')?.addEventListener('input', (e) => {
    if (!selectedPart) return;
    const v = parseFloat(e.target.value) / 100;
    const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
    mats.forEach(m => { if (m) { m.transparent = v < 1; m.opacity = v; m.needsUpdate = true; } });
    updateDetailsPanel();
});
document.getElementById('wireframe-toggle')?.addEventListener('click', () => {
    if (!selectedPart) return;
    const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
    mats.forEach(m => { if (m) { m.wireframe = !m.wireframe; m.needsUpdate = true; } });
    updateDetailsPanel();
});
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!btn.dataset.preset || !selectedPart) return;
        applyMaterialPreset(selectedPart, btn.dataset.preset);
        updateDetailsPanel();
    });
});
function applyMaterialPreset(mesh, preset) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m, idx) => {
        if (!m) return;
        switch (preset) {
            case 'metal': if (m.color) m.color.setHex(0xaaaaaa); if ('metalness' in m) m.metalness = 0.9; if ('roughness' in m) m.roughness = 0.3; if (m.emissive) m.emissive.setHex(0x000000); break;
            case 'chrome': if (m.color) m.color.setHex(0xffffff); if ('metalness' in m) m.metalness = 1.0; if ('roughness' in m) m.roughness = 0.05; if (m.emissive) m.emissive.setHex(0x000000); break;
            case 'glass': if (m.color) m.color.setHex(0x88ccff); m.transparent = true; m.opacity = 0.35; if ('metalness' in m) m.metalness = 0.0; if ('roughness' in m) m.roughness = 0.05; break;
            case 'matte': if (m.color) m.color.setHex(0x333333); if ('metalness' in m) m.metalness = 0.0; if ('roughness' in m) m.roughness = 1.0; if (m.emissive) m.emissive.setHex(0x000000); break;
            case 'glow': if (m.emissive) { m.emissive.setHex(0x00e5ff); m.emissiveIntensity = 2.5; } break;
            case 'reset': {
                const orig = mesh.userData.__origMaterialProps?.[idx];
                if (orig) {
                    if (m.color && orig.color !== undefined) m.color.setHex(orig.color);
                    if ('metalness' in m && orig.metalness !== undefined) m.metalness = orig.metalness;
                    if ('roughness' in m && orig.roughness !== undefined) m.roughness = orig.roughness;
                    if (m.emissive && orig.emissive !== undefined) m.emissive.setHex(orig.emissive);
                    if (orig.opacity !== undefined) m.opacity = orig.opacity;
                    if (orig.transparent !== undefined) m.transparent = orig.transparent;
                    if (orig.wireframe !== undefined) m.wireframe = orig.wireframe;
                }
                break;
            }
        }
        m.needsUpdate = true;
    });
}
document.getElementById('metalness-slider')?.addEventListener('input', (e) => {
    if (!selectedPart) return;
    const v = parseFloat(e.target.value) / 100;
    const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
    mats.forEach(m => { if (m && 'metalness' in m) { m.metalness = v; m.needsUpdate = true; } });
    updateDetailsPanel();
});
document.getElementById('roughness-slider')?.addEventListener('input', (e) => {
    if (!selectedPart) return;
    const v = parseFloat(e.target.value) / 100;
    const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
    mats.forEach(m => { if (m && 'roughness' in m) { m.roughness = v; m.needsUpdate = true; } });
    updateDetailsPanel();
});
document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => { if (selectedPart) applyEditAction(btn.dataset.edit); });
});
function applyEditAction(action) {
    const mesh = selectedPart;
    if (!mesh) return;
    const carBox = new THREE.Box3().setFromObject(carModel);
    const carSize = carBox.getSize(new THREE.Vector3());
    const carMax = Math.max(carSize.x, carSize.y, carSize.z);
    const nudge = carMax * 0.05;

    switch (action) {
        case 'rot-x': mesh.rotation.x += Math.PI / 2; break;
        case 'rot-y': mesh.rotation.y += Math.PI / 2; break;
        case 'rot-z': mesh.rotation.z += Math.PI / 2; break;
        case 'scale-up': mesh.scale.multiplyScalar(1.1); break;
        case 'scale-down': mesh.scale.multiplyScalar(0.9); break;
        case 'move-x+': mesh.position.x += nudge; break;
        case 'move-x-': mesh.position.x -= nudge; break;
        case 'move-y+': mesh.position.y += nudge; break;
        case 'move-y-': mesh.position.y -= nudge; break;
        case 'move-z+': mesh.position.z += nudge; break;
        case 'move-z-': mesh.position.z -= nudge; break;
        case 'reset-transform':
            const base = basePositions.get(mesh);
            if (base) { mesh.position.copy(base.position); mesh.quaternion.copy(base.quaternion); mesh.scale.set(1, 1, 1); }
            break;
    }
    mesh.updateMatrixWorld(true);
    updateDetailsPanel();
}

// ============================================
// SETTINGS HANDLERS
// ============================================
document.querySelectorAll('[data-setting]').forEach(btn => {
    btn.addEventListener('click', () => toggleSetting(btn.dataset.setting));
});
function toggleSetting(key) {
    switch (key) {
        case 'autorotate':
            orbitControls.autoRotate = !orbitControls.autoRotate;
            voiceStatus.textContent = `🔄 AutoRotate ${orbitControls.autoRotate ? 'ON' : 'OFF'}`;
            break;
        case 'axes':
            if (axesHelper) { scene.remove(axesHelper); axesHelper = null; voiceStatus.textContent = '📐 Axes OFF'; }
            else { axesHelper = new THREE.AxesHelper(5); scene.add(axesHelper); voiceStatus.textContent = '📐 Axes ON'; }
            break;
        case 'grid':
            if (gridHelper) { scene.remove(gridHelper); gridHelper = null; voiceStatus.textContent = '▦ Grid OFF'; }
            else { gridHelper = new THREE.GridHelper(50, 50, 0x00e5ff, 0x004455); scene.add(gridHelper); voiceStatus.textContent = '▦ Grid ON'; }
            break;
        case 'wireframe-all':
            allPartMeshes.forEach(mesh => {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach(m => { if (m) { m.wireframe = !m.wireframe; m.needsUpdate = true; } });
            });
            break;
        case 'blueprint':
            setBlueprintMode(!blueprintMode);
            break;
        case 'explode-toggle':
            if (explodedParts.size > 0) unsplitAll();
            else splitAll();
            break;
    }
}

// ============================================
// TRASH
// ============================================
const trashBin = document.getElementById('trash-bin');
trashBin?.addEventListener('click', () => { if (selectedPart) trashPart(selectedPart); });
function trashPart(mesh) {
    if (!mesh) return;
    mesh.visible = false;
    mesh.userData.__trashed = true;
    voiceStatus.textContent = `🗑️ Trashed ${mesh.name}`;
    speak(`Trashed ${mesh.name}`);
    if (selectedPart === mesh) selectedPart = null;
    syncHudRowsToVisibility(null);
    updateDetailsPanel();
}
function restoreTrashed() {
    let n = 0;
    allPartMeshes.forEach(m => { if (m.userData.__trashed) { m.userData.__trashed = false; m.visible = true; n++; } });
    syncHudRowsToVisibility(null);
    voiceStatus.textContent = n ? `♻️ Restored ${n} parts` : '⚠️ No trashed parts';
    speak(n ? `Restored ${n} parts` : 'No trashed parts');
}
let draggedMeshGlobal = null;
if (dragControls) {
    dragControls.addEventListener('dragstart', (e) => { draggedMeshGlobal = e.object; });
    dragControls.addEventListener('dragend', () => {
        if (draggedMeshGlobal && trashBin && trashBin.classList.contains('highlight')) trashPart(draggedMeshGlobal);
        if (trashBin) trashBin.classList.remove('highlight');
        draggedMeshGlobal = null;
    });
}
document.addEventListener('pointermove', (e) => {
    if (!draggedMeshGlobal || !trashBin) return;
    const binRect = trashBin.getBoundingClientRect();
    const inBin = e.clientX >= binRect.left && e.clientX <= binRect.right &&
                  e.clientY >= binRect.top && e.clientY <= binRect.bottom;
    trashBin.classList.toggle('highlight', inBin);
});

// ============================================
// HUD SHOW / HIDE
// ============================================
function showHud() {
    if (!hudEl) return;
    if (!hudTreeEl.children.length) buildHudTree();
    hudEl.classList.add('open');
    if (hudStatus) { hudStatus.textContent = 'EXPLODED'; hudStatus.className = 'hud-value warn'; }
    if (hudSplitDist) hudSplitDist.textContent = currentSplitDistance.toFixed(1);
}
function hideHud() {
    if (!hudEl) return;
    hudEl.classList.remove('open');
    if (hudStatus) { hudStatus.textContent = 'READY'; hudStatus.className = 'hud-value ok'; }
}

document.getElementById('hud-btn-unsplit')?.addEventListener('click', () => { unsplitAll(); });
document.getElementById('hud-btn-hideall')?.addEventListener('click', () => {
    isolatedPart = null; visibilitySnapshot.clear();
    allPartMeshes.forEach(m => { m.visible = false; });
    syncHudRowsToVisibility(null);
    const badge = document.getElementById('isolation-badge');
    if (badge) badge.classList.add('hidden');
});
document.getElementById('hud-btn-showall')?.addEventListener('click', () => {
    isolatedPart = null; visibilitySnapshot.clear();
    allPartMeshes.forEach(m => { m.visible = true; });
    syncHudRowsToVisibility(null);
    const badge = document.getElementById('isolation-badge');
    if (badge) badge.classList.add('hidden');
});
document.getElementById('isolation-exit')?.addEventListener('click', restoreAllVisibility);
hudSearch?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.hud-part').forEach(row => {
        const name = (row.dataset.partName || '').toLowerCase();
        row.style.display = !q || name.includes(q) ? '' : 'none';
    });
    document.querySelectorAll('.hud-group').forEach(group => {
        const visible = group.querySelectorAll('.hud-part:not([style*="display: none"])').length;
        group.style.display = visible ? '' : 'none';
    });
});

// ============================================
// CAMERA HELPERS
// ============================================
function flyToPart(position) {
    const b = getBounds();
    const s = b.getSize(new THREE.Vector3());
    const d = Math.max(s.x, s.y, s.z) * 0.9;
    let target;
    if (position === 'front')  target = new THREE.Vector3(0, 0, d * 1.5);
    if (position === 'back')   target = new THREE.Vector3(0, 0, -d * 1.5);
    if (position === 'left')   target = new THREE.Vector3(-d * 1.5, 0, 0);
    if (position === 'right')  target = new THREE.Vector3(d * 1.5, 0, 0);
    if (position === 'top')    target = new THREE.Vector3(0, d * 1.5, 0.01);
    if (position === 'bottom') target = new THREE.Vector3(0, -d * 1.5, 0.01);
    if (position === 'center') target = new THREE.Vector3(d * 0.7, d * 0.5, d * 0.7);
    orbitControls.target.set(0, 0, 0);
    new TWEEN.Tween(camera.position).to({ x: target.x, y: target.y, z: target.z }, 1200)
        .easing(TWEEN.Easing.Quadratic.InOut).onUpdate(() => camera.lookAt(orbitControls.target)).start();
}
function getBounds() {
    const b = new THREE.Box3();
    if (allPartMeshes.length) allPartMeshes.forEach(m => b.expandByObject(m));
    else if (carModel) b.setFromObject(carModel);
    return b;
}
function moveCameraAxis(axis, sign) {
    if (!carModel) return;
    const carBox = new THREE.Box3().setFromObject(carModel);
    const carSize = carBox.getSize(new THREE.Vector3());
    const carMax = Math.max(carSize.x, carSize.y, carSize.z);
    const speed = carMax * CAMERA_STEP_FRACTION;

    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward);
    const camRight = new THREE.Vector3().crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();
    const camUp = new THREE.Vector3(0, 1, 0);

    let dirVec = new THREE.Vector3();
    if (axis === 'x') dirVec.copy(camRight).multiplyScalar(sign);
    if (axis === 'y') dirVec.copy(camUp).multiplyScalar(sign);
    if (axis === 'z') dirVec.copy(camForward).multiplyScalar(sign);

    cameraVelocity.copy(dirVec).multiplyScalar(speed);
    cameraVelocityActive = true;

    if (cameraVelocityTimeout) clearTimeout(cameraVelocityTimeout);
    cameraVelocityTimeout = setTimeout(() => { cameraVelocityActive = false; }, CAMERA_STEP_DURATION * 1000);
}
function stopCameraMovement() {
    cameraVelocity.set(0, 0, 0);
    cameraVelocityActive = false;
    if (cameraVelocityTimeout) clearTimeout(cameraVelocityTimeout);
}
function updateCameraVelocity(delta) {
    if (!cameraVelocityActive) return;
    const step = cameraVelocity.clone().multiplyScalar(delta);
    camera.position.add(step);
    orbitControls.target.add(step);
    camera.lookAt(orbitControls.target);
}
function zoomCamera(f) {
    let target;
    if (isolatedPart) target = new THREE.Box3().setFromObject(isolatedPart).getCenter(new THREE.Vector3());
    else if (selectedPart) target = new THREE.Box3().setFromObject(selectedPart).getCenter(new THREE.Vector3());
    else {
        const visBox = new THREE.Box3();
        let anyVisible = false;
        allPartMeshes.forEach(m => { if (m.visible) { visBox.expandByObject(m); anyVisible = true; } });
        if (anyVisible) target = visBox.getCenter(new THREE.Vector3());
        else if (carModel) target = new THREE.Box3().setFromObject(carModel).getCenter(new THREE.Vector3());
        else target = orbitControls.target.clone();
    }
    orbitControls.target.copy(target);
    const off = new THREE.Vector3().subVectors(camera.position, target);
    const currentLength = off.length();
    let targetLength;
    if (carModel) {
        const carBox = new THREE.Box3().setFromObject(carModel);
        const carSize = carBox.getSize(new THREE.Vector3());
        const carMax = Math.max(carSize.x, carSize.y, carSize.z);
        if (f < 1) targetLength = Math.max(carMax * 0.25, currentLength * 0.6);
        else targetLength = Math.min(carMax * 5.0, currentLength * 1.5);
    } else targetLength = currentLength * f;
    targetLength = Math.max(orbitControls.minDistance, Math.min(orbitControls.maxDistance, targetLength));
    off.setLength(targetLength);
    const np = target.clone().add(off);
    new TWEEN.Tween(camera.position).to({ x: np.x, y: np.y, z: np.z }, 500)
        .easing(TWEEN.Easing.Quadratic.Out).onUpdate(() => camera.lookAt(target)).start();
}
function enterOrbitMode() {
    currentMode = 'orbit';
    orbitControls.enabled = true;
    orbitControls.autoRotate = false;
    const b = getBounds();
    const s = b.getSize(new THREE.Vector3());
    const dist = Math.max(s.x, s.y, s.z) * 1.8;
    const pos = new THREE.Vector3(dist * 0.7, s.y * 0.5, dist * 0.7);
    new TWEEN.Tween(camera.position).to({ x: pos.x, y: pos.y, z: pos.z }, 1200).easing(TWEEN.Easing.Quadratic.InOut).start();
    new TWEEN.Tween(orbitControls.target).to({ x: 0, y: 0, z: 0 }, 1200).easing(TWEEN.Easing.Quadratic.InOut).start();
}
function enterWalkMode() {
    currentMode = 'walk';
    orbitControls.enabled = false;
    const b = getBounds();
    const s = b.getSize(new THREE.Vector3());
    camera.position.set(s.x * 1.2, s.y * 0.4, -s.z * 0.9);
    yaw = -Math.PI / 4; pitch = -0.1;
    renderer.domElement.requestPointerLock?.();
}
function enterDriveView(seat) {
    currentMode = 'drive';
    orbitControls.enabled = false;
    const b = getBounds();
    const cs = b.getSize(new THREE.Vector3());
    const seatX = cs.x * 0.15, seatY = cs.y * 0.15, seatZ = -cs.z * 0.02;
    const seats = {
        driver:    new THREE.Vector3(-seatX, seatY, seatZ),
        passenger: new THREE.Vector3( seatX, seatY, seatZ),
        back:      new THREE.Vector3( 0, seatY, seatZ - cs.z * 0.18)
    };
    const looks = {
        driver:    new THREE.Vector3(-seatX, seatY + 0.05, seatZ + cs.z * 0.8),
        passenger: new THREE.Vector3( seatX, seatY + 0.05, seatZ + cs.z * 0.8),
        back:      new THREE.Vector3( 0, seatY + 0.05, seatZ + cs.z * 0.8)
    };
    const pos = seats[seat], look = looks[seat];
    new TWEEN.Tween(camera.position).to({ x: pos.x, y: pos.y, z: pos.z }, 1500)
        .easing(TWEEN.Easing.Quadratic.InOut).onUpdate(() => camera.lookAt(look))
        .onComplete(() => {
            yaw = Math.atan2(look.x - pos.x, look.z - pos.z);
            pitch = -0.05;
            renderer.domElement.requestPointerLock?.();
        }).start();
}
function enterEngineView() {
    currentMode = 'drive'; orbitControls.enabled = false;
    const b = getBounds(), s = b.getSize(new THREE.Vector3());
    const pos = new THREE.Vector3(0, s.y * 0.4, s.z * 0.7);
    const look = new THREE.Vector3(0, s.y * 0.1, 0);
    new TWEEN.Tween(camera.position).to({ x: pos.x, y: pos.y, z: pos.z }, 1200)
        .easing(TWEEN.Easing.Quadratic.InOut).onUpdate(() => camera.lookAt(look))
        .onComplete(() => { yaw = Math.PI; pitch = -0.4; renderer.domElement.requestPointerLock?.(); }).start();
}
function enterTrunkView() {
    currentMode = 'drive'; orbitControls.enabled = false;
    const b = getBounds(), s = b.getSize(new THREE.Vector3());
    const pos = new THREE.Vector3(0, s.y * 0.4, -s.z * 0.7);
    const look = new THREE.Vector3(0, s.y * 0.1, 0);
    new TWEEN.Tween(camera.position).to({ x: pos.x, y: pos.y, z: pos.z }, 1200)
        .easing(TWEEN.Easing.Quadratic.InOut).onUpdate(() => camera.lookAt(look))
        .onComplete(() => { yaw = 0; pitch = -0.4; renderer.domElement.requestPointerLock?.(); }).start();
}
function updateWalkMode(delta) {
    const speed = 2.5 * delta;
    const forward = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let move = new THREE.Vector3();
    if (keys['w'] || keys['arrowup'])    move.add(forward);
    if (keys['s'] || keys['arrowdown'])  move.sub(forward);
    if (keys['a'] || keys['arrowleft'])  move.sub(right);
    if (keys['d'] || keys['arrowright']) move.add(right);
    if (keys[' '])                       move.y += 1;
    if (keys['shift'])                   move.y -= 1;
    if (move.lengthSq() > 0) { move.normalize().multiplyScalar(speed); camera.position.add(move); }
    camera.lookAt(camera.position.clone().add(forward));
}
function rotateCamera(direction) {
    const off = new THREE.Vector3().subVectors(camera.position, orbitControls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    const step = Math.PI / 6;
    if (direction === 'left')  sph.theta -= step;
    if (direction === 'right') sph.theta += step;
    if (direction === 'up')    sph.phi = Math.max(0.05, sph.phi - step);
    if (direction === 'down')  sph.phi = Math.min(Math.PI - 0.05, sph.phi + step);
    off.setFromSpherical(sph);
    const np = orbitControls.target.clone().add(off);
    new TWEEN.Tween(camera.position).to({ x: np.x, y: np.y, z: np.z }, 600)
        .easing(TWEEN.Easing.Quadratic.Out).onUpdate(() => camera.lookAt(orbitControls.target)).start();
}
function setCameraView(v) {
    const b = getBounds(), s = b.getSize(new THREE.Vector3());
    const d = Math.max(s.x, s.y, s.z) * 1.8;
    let p;
    if (v === 'front') p = new THREE.Vector3(0, s.y * 0.3, d);
    if (v === 'back')  p = new THREE.Vector3(0, s.y * 0.3, -d);
    if (v === 'side')  p = new THREE.Vector3(d, s.y * 0.3, 0);
    if (v === 'top')   p = new THREE.Vector3(0, d * 1.2, 0.01);
    if (v === 'bottom') p = new THREE.Vector3(0, -d * 1.2, 0.01);
    orbitControls.target.set(0, 0, 0);
    new TWEEN.Tween(camera.position).to({ x: p.x, y: p.y, z: p.z }, 900)
        .easing(TWEEN.Easing.Quadratic.Out).onUpdate(() => camera.lookAt(orbitControls.target)).start();
}

// ============================================
// HUMAN-STYLE CAMERA MOVEMENT
// ============================================
function humanMove(direction, duration = 500) {
    const speed = 0.06;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    let move = new THREE.Vector3();
    if (direction === 'forward') move.copy(forward);
    else if (direction === 'back') move.copy(forward).negate();
    else if (direction === 'left') move.copy(right).negate();
    else if (direction === 'right') move.copy(right);
    else if (direction === 'up') move.copy(up);
    else if (direction === 'down') move.copy(up).negate();
    else if (direction === 'strafe left') move.copy(right).negate();
    else if (direction === 'strafe right') move.copy(right);

    if (move.lengthSq() === 0) return;

    walkVelocity.copy(move).multiplyScalar(speed);
    walkVelocityActive = true;
    if (walkVelocityTimeout) clearTimeout(walkVelocityTimeout);
    walkVelocityTimeout = setTimeout(() => { walkVelocityActive = false; }, duration);
}

function updateWalkVelocity(delta) {
    if (!walkVelocityActive) return;
    const step = walkVelocity.clone().multiplyScalar(delta * 60);
    camera.position.add(step);
    orbitControls.target.add(step);
}

// ============================================
// CAMERA SPLIT & RESET
// ============================================
let isSplitScreen = false;

function toggleSplitScreen() {
    isSplitScreen = !isSplitScreen;
    if (isSplitScreen) {
        renderer.setScissorTest(true);
        renderer.setViewport(0, 0, window.innerWidth / 2, window.innerHeight);
        renderer.setScissor(0, 0, window.innerWidth / 2, window.innerHeight);
        camera.aspect = (window.innerWidth / 2) / window.innerHeight;
        camera.updateProjectionMatrix();
        if (voiceStatus) voiceStatus.textContent = "🎥 Camera Split ON";
    } else {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
        renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        if (voiceStatus) voiceStatus.textContent = "🎥 Camera Reset";
    }
    renderer.render(scene, camera);
}

function resetCamera() {
    if (isSplitScreen) toggleSplitScreen();
    const b = getBounds();
    const s = b.getSize(new THREE.Vector3());
    const d = Math.max(s.x, s.y, s.z) * 1.5;
    camera.position.set(d * 0.7, d * 0.5, d * 0.7);
    orbitControls.target.copy(carModel.position);
    camera.lookAt(carModel.position);
    if (voiceStatus) voiceStatus.textContent = "🎥 Camera Reset";
}

// ============================================
// LEAVE MODAL — handlers
// ============================================
function openLeaveModal() {
    const modal = document.getElementById('leave-modal');
    if (!modal) {
        console.warn('leave-modal element not found');
        return;
    }
    modal.style.display = 'flex';
    window.__leaveModalOpen = true;
    if (voiceStatus) voiceStatus.textContent = '❓ Awaiting your choice...';
    speak("Do you want to save, cancel, continue edit, or leave without saving?");
}

function closeLeaveModal() {
    const modal = document.getElementById('leave-modal');
    if (modal) modal.style.display = 'none';
    window.__leaveModalOpen = false;
}

window.saveAndLeave = () => {
    closeLeaveModal();
    if (voiceStatus) voiceStatus.textContent = "💾 Saving...";
    speak("Saving changes. Returning to JARVIS.");
    setTimeout(() => { window.location.href = 'jarvis.html'; }, 1600);
};
window.cancelLeave = () => {
    closeLeaveModal();
    if (voiceStatus) voiceStatus.textContent = "❌ Action Cancelled";
    speak("Cancelled. Staying here.");
};
window.continueEdit = () => {
    closeLeaveModal();
    if (voiceStatus) voiceStatus.textContent = "✏️ Continuing Edit";
    speak("Continuing edit.");
};
window.leaveWithoutSave = () => {
    closeLeaveModal();
    if (voiceStatus) voiceStatus.textContent = "🚪 Leaving without saving...";
    speak("Leaving without saving. Returning to JARVIS.");
    setTimeout(() => { window.location.href = 'jarvis.html'; }, 1600);
};

// ============================================
// VOICE RECOGNITION
// ============================================
let recognition = null;
let isListening = false;
let recognitionRestartTimer = null;
let lastProcessedTranscript = '';
let lastProcessedTime = 0;
let networkErrorCount = 0;

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SR) {
    if (voiceStatus) voiceStatus.textContent = '❌ Use Chrome or Edge';
    if (voiceBtn) voiceBtn.disabled = true;
} else {
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 5;

    recognition.onresult = (event) => {
        let bestFinal = '', bestInterim = '', finalConfidence = 0;
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            let bestAlt = result[0], bestConf = result[0].confidence || 0;
            for (let j = 1; j < result.length; j++) {
                const c = result[j].confidence || 0;
                if (c > bestConf) { bestConf = c; bestAlt = result[j]; }
            }
            const text = (bestAlt.transcript || '').toLowerCase().trim();
            if (!text) continue;
            if (result.isFinal) { bestFinal = text; finalConfidence = bestConf; }
            else { bestInterim = text; }
        }
        if (bestFinal) {
            const now = Date.now();
            if (bestFinal === lastProcessedTranscript && (now - lastProcessedTime) < 1500) return;
            lastProcessedTranscript = bestFinal;
            lastProcessedTime = now;
            networkErrorCount = 0;
            console.log(`🎤 Heard (conf ${finalConfidence.toFixed(2)}):`, bestFinal);
            if (voiceStatus) {
                voiceStatus.textContent = `Heard: "${bestFinal}"`;
                voiceStatus.classList.add('active');
            }
            handleVoiceCommand(bestFinal);
            setTimeout(() => {
                if (voiceStatus && !window.__leaveModalOpen)
                    voiceStatus.textContent = isListening ? '🎤 Listening...' : 'Mic Off';
            }, 2500);
        } else if (bestInterim) {
            if (voiceStatus && !window.__leaveModalOpen) {
                voiceStatus.textContent = `… "${bestInterim}"`;
                voiceStatus.classList.add('active');
            }
        }
    };

    recognition.onerror = (e) => {
        console.warn('🎤 Speech error:', e.error);
        if (e.error === 'not-allowed') {
            if (voiceStatus) voiceStatus.textContent = '❌ Mic denied';
            isListening = false;
            if (voiceBtn) {
                voiceBtn.textContent = "🎤 Start Voice Control";
                voiceBtn.classList.remove('listening');
            }
        } else if (e.error === 'network') {
            networkErrorCount++;
            if (voiceStatus) voiceStatus.textContent = `🌐 Network error (${networkErrorCount})`;
        } else if (e.error === 'no-speech') {
            if (voiceStatus && !window.__leaveModalOpen)
                voiceStatus.textContent = isListening ? '🎤 Listening...' : 'Mic Off';
        } else if (e.error === 'audio-capture') {
            if (voiceStatus) voiceStatus.textContent = '❌ No microphone found';
        }
    };

    recognition.onstart = () => {
        if (voiceStatus && !window.__leaveModalOpen) {
            voiceStatus.textContent = '🎤 Listening...';
            voiceStatus.classList.add('active');
        }
    };

    recognition.onend = () => {
        if (isListening) {
            clearTimeout(recognitionRestartTimer);
            recognitionRestartTimer = setTimeout(() => {
                if (isListening) try { recognition.start(); } catch (e) {}
            }, 150);
        } else {
            if (voiceStatus && !window.__leaveModalOpen) {
                voiceStatus.textContent = 'Mic Off';
                voiceStatus.classList.remove('active');
            }
        }
    };
}

if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
        if (!recognition) return;
        if (isListening) {
            isListening = false;
            clearTimeout(recognitionRestartTimer);
            try { recognition.stop(); } catch (e) {}
            voiceBtn.textContent = "🎤 Start Voice Control";
            voiceBtn.classList.remove('listening');
            if (voiceStatus) {
                voiceStatus.textContent = "Mic Off";
                voiceStatus.classList.remove('active');
            }
            return;
        }
        isListening = true;
        try { recognition.start(); } catch (e) {}
        voiceBtn.textContent = "🔴 Stop Listening";
        voiceBtn.classList.add('listening');
        if (voiceStatus) {
            voiceStatus.textContent = "🎤 Listening...";
            voiceStatus.classList.add('active');
        }
    });
}

// ============================================
// VOICE COMMAND HELPERS
// ============================================
function has(i, ks) { return ks.some(k => i.includes(k)); }

const GROUP_ALIASES = {
    doors:        ['door', 'doors'],
    hood:         ['hood', 'bonnet'],
    trunk:        ['trunk', 'boot'],
    wheels:       ['wheel', 'wheels', 'tire', 'tires', 'rim', 'rims'],
    engine:       ['engine', 'motor'],
    lights:       ['light', 'lights', 'headlight', 'headlights', 'taillight', 'taillights'],
    windows:      ['window', 'windows', 'glass'],
    interior:     ['interior', 'seat', 'seats'],
    body:         ['body', 'frame', 'shell', 'chassis'],
    underside:    ['underside', 'underbody'],
    front_fascia: ['front fascia', 'front bumper', 'nose', 'grille'],
    rear_fascia:  ['rear fascia', 'rear bumper', 'diffuser'],
    side_panels:  ['side panels', 'rockers', 'skirts'],
    cabin:        ['cabin']
};

function openC(cat) {
    let n = 0;
    hingedParts.forEach((d, p) => { if (d.category === cat) { openHinge(p); n++; } });
    if (voiceStatus) voiceStatus.textContent = n ? `✅ Opened ${cat}` : `⚠️ No ${cat}`;
    return n;
}
function closeC(cat) {
    let n = 0;
    hingedParts.forEach((d, p) => { if (d.category === cat) { closeHinge(p); n++; } });
    if (voiceStatus) voiceStatus.textContent = n ? `✅ Closed ${cat}` : `⚠️ No ${cat}`;
    return n;
}

// ============================================
// VOICE COMMAND HANDLER
// ============================================
function handleVoiceCommand(raw) {
    const cmd = raw
        .toLowerCase()
        .replace(/[.,!?;:'"()\[\]{}]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    console.log(`🔍 Voice cmd: "${cmd}"`);

    if (window.VoiceOrb) window.VoiceOrb.setSuccess();

    // ==========================================
    // 🚨 LEAVE MODAL INTERCEPT — HIGHEST PRIORITY
    // ==========================================
    if (window.__leaveModalOpen) {
        console.log('🚨 Modal open, parsing as modal response');

        // SAVE
        if (cmd === 'save' || cmd === 'save it' || cmd === 'save changes' ||
            cmd === 'yes save' || cmd === 'confirm save' || cmd === 'save and leave' ||
            cmd.includes('save')) {
            window.saveAndLeave();
            return;
        }
        // DISCARD / LEAVE WITHOUT SAVING
        if (cmd === 'discard' || cmd === 'leave without saving' || cmd === 'dont save' ||
            cmd === 'do not save' || cmd === 'no save' || cmd === 'without saving' ||
            cmd === 'leave without save' || cmd === 'no dont save' || cmd === 'dont save it' ||
            cmd.includes('discard') || cmd.includes('without saving')) {
            window.leaveWithoutSave();
            return;
        }
        // CONTINUE EDIT
        if (cmd === 'continue' || cmd === 'continue edit' || cmd === 'keep editing' ||
            cmd === 'stay' || cmd === 'edit more' || cmd === 'continue editing' ||
            cmd.includes('continue') || cmd.includes('keep editing')) {
            window.continueEdit();
            return;
        }
        // CANCEL
        if (cmd === 'cancel' || cmd === 'abort' || cmd === 'never mind' ||
            cmd === 'nevermind' || cmd === 'go back' || cmd === 'stop' ||
            cmd.includes('cancel') || cmd.includes('never mind') || cmd.includes('nevermind')) {
            window.cancelLeave();
            return;
        }
        // Unknown — re-prompt
        speak("Please say save, cancel, continue edit, or discard.");
        return;
    }

    // Short/garbage filter
    if (cmd.length < 3) return;
    if (['dj', 'the', 'a', 'uh', 'um', 'hmm', 'the panel', 'the panel with'].includes(cmd)) return;

    function matchPanelName(text) {
        if (text.includes('details') || text.includes('detail')) return 'details-panel';
        if (text.includes('design')) return 'design-panel';
        if (text.includes('material') || text.includes('matrial')) return 'material-panel';
        if (text.includes('edit') || text.includes('credit') || text.includes('edited')) return 'edit-panel';
        if (text.includes('setting')) return 'settings-panel';
        if (text.includes('parts') || text.includes('inspector') || text.includes('part')) return 'jarvis-hud';
        return null;
    }
    function matchPanelOrAll(text) {
        if (text.includes('all')) return 'ALL';
        return matchPanelName(text);
    }

    // ==========================================
    // 🆕 LEAVE COMMAND — opens the modal
    // ==========================================
    if (has(cmd, ['leave', 'exit', 'quit', 'close app', 'goodbye', 'good bye', 'sign off'])) {
        openLeaveModal();
        return;
    }

    // ==========================================
    // 🚗 HINGED PARTS
    // ==========================================
    if (has(cmd, ['open hood', 'open bonnet', 'lift hood', 'lift the hood', 'lift the bonnet',
                  'raise hood', 'raise the hood', 'open the hood', 'lift up hood'])) {
        const n = openC('hood');
        speak(n ? 'Opening hood' : 'Hood not found');
        return;
    }
    if (has(cmd, ['close hood', 'close bonnet', 'lower hood', 'lower the hood', 'shut hood',
                  'close the hood', 'lower the bonnet'])) {
        const n = closeC('hood');
        speak(n ? 'Closing hood' : 'Hood not found');
        return;
    }
    if (has(cmd, ['open trunk', 'open boot', 'lift trunk', 'lift the trunk', 'open the trunk',
                  'raise trunk', 'pop trunk', 'pop the trunk'])) {
        const n = openC('trunk');
        speak(n ? 'Opening trunk' : 'Trunk not found');
        return;
    }
    if (has(cmd, ['close trunk', 'close boot', 'lower trunk', 'shut trunk', 'close the trunk',
                  'lower the boot'])) {
        const n = closeC('trunk');
        speak(n ? 'Closing trunk' : 'Trunk not found');
        return;
    }
    if (has(cmd, ['open door', 'open doors', 'open the doors', 'open the door',
                  'open all doors', 'lift door', 'lift the door'])) {
        const n = openC('door');
        speak(n ? 'Opening doors' : 'Doors not found');
        return;
    }
    if (has(cmd, ['close door', 'close doors', 'close the doors', 'close the door',
                  'close all doors', 'shut door', 'shut the doors'])) {
        const n = closeC('door');
        speak(n ? 'Closing doors' : 'Doors not found');
        return;
    }

    // ==========================================
    // 🔀 SPLIT / UNSPLIT / EXPLODE
    // ==========================================
    if (cmd === 'split' || cmd === 'explode' || cmd === 'disassemble' || cmd === 'take apart' ||
        has(cmd, ['explode on', 'explode everything', 'explode all', 'explode the car',
                  'split car', 'split everything', 'split all', 'split the car', 'split it',
                  'disassemble the car', 'take apart the car', 'break apart', 'break it apart'])) {
        splitAll();
        return;
    }
    if (cmd === 'unsplit' || cmd === 'implode' || cmd === 'reassemble' || cmd === 'assemble' ||
        has(cmd, ['unsplit everything', 'unsplit all', 'unsplit the car', 'unsplit it',
                  'put back together', 'put it back together', 'put the car back',
                  'reassemble the car', 'put car back'])) {
        unsplitAll();
        return;
    }
    if (has(cmd, ['toggle explode', 'explode toggle', 'toggle split'])) {
        if (explodedParts.size > 0) unsplitAll();
        else splitAll();
        return;
    }

    // Split group
    const splitGroupMatch = cmd.match(/(?:split|explode|disassemble)\s+(?:the\s+)?(doors?|wheels?|engine|lights?|windows?|interior|body|hood|trunk|bonnet|boot|underside|fascia|panels?|cabin)/);
    if (splitGroupMatch) {
        const groupWord = splitGroupMatch[1].toLowerCase();
        let gk = groupWord.replace(/s$/, '');
        if (gk === 'door') gk = 'doors';
        else if (gk === 'wheel') gk = 'wheels';
        else if (gk === 'light') gk = 'lights';
        else if (gk === 'window') gk = 'windows';
        else if (gk === 'panel') gk = 'side_panels';
        else if (gk === 'fascia') gk = 'front_fascia';
        else if (gk === 'bonnet') gk = 'hood';
        else if (gk === 'boot') gk = 'trunk';
        splitGroup(gk);
        return;
    }

    // Split object
    const splitObjMatch = cmd.match(/(?:split|explode|disassemble)\s+object\s*_?\s*(\d{1,3})/);
    if (splitObjMatch) {
        const mesh = findPartByName(`Object_${splitObjMatch[1]}`);
        if (mesh) splitPart(mesh);
        else speak(`Object ${splitObjMatch[1]} not found`);
        return;
    }

    // Split distance
    const distMatch = cmd.match(/(?:set\s+|change\s+)?(?:split|explode)\s+distance\s+(?:to\s+)?(\d+(?:\.\d+)?)/);
    if (distMatch) {
        const v = parseFloat(distMatch[1]);
        setSplitDistance(v);
        speak(`Split distance ${v}`);
        return;
    }
    // 🆕 Increase / decrease distance
    if (has(cmd, ['increase distance', 'increase the distance', 'increase split distance',
                  'more distance', 'bigger distance'])) {
        changeSplitDistance(1);
        speak('Increasing distance');
        return;
    }
    if (has(cmd, ['decrease distance', 'decrease the distance', 'decrease split distance',
                  'less distance', 'smaller distance'])) {
        changeSplitDistance(-1);
        speak('Decreasing distance');
        return;
    }

    // ==========================================
    // 🔄 RESET
    // ==========================================
    if (has(cmd, ['reset all', 'reset everything', 'reset the car', 'reset car', 'reset',
                  'bring back the car', 'bring the car back', 'restore the car', 'restore all',
                  'revert', 'undo everything'])) {
        unsplitAll();
        return;
    }

    // ==========================================
    // 🎬 BLUEPRINT ON / OFF (only explicit)
    // ==========================================
    if (has(cmd, ['blueprint on', 'blueprint mode on', 'turn on blueprint', 'enable blueprint',
                  'start blueprint', 'blueprint mode'])) {
        setBlueprintMode(true);
        return;
    }
    if (has(cmd, ['blueprint off', 'blueprint mode off', 'turn off blueprint', 'disable blueprint',
                  'stop blueprint', 'exit blueprint'])) {
        setBlueprintMode(false);
        return;
    }

    // ==========================================
    // ▦ GRID
    // ==========================================
    if (has(cmd, ['grid on', 'show grid', 'enable grid', 'turn on grid'])) {
        if (!gridHelper) {
            gridHelper = new THREE.GridHelper(50, 50, 0x00e5ff, 0x004455);
            scene.add(gridHelper);
        }
        voiceStatus.textContent = '▦ Grid ON';
        speak('Grid on');
        return;
    }
    if (has(cmd, ['grid off', 'hide grid', 'disable grid', 'turn off grid'])) {
        if (gridHelper) { scene.remove(gridHelper); gridHelper = null; }
        voiceStatus.textContent = '▦ Grid OFF';
        speak('Grid off');
        return;
    }

    // ==========================================
    // 📐 AXES
    // ==========================================
    if (has(cmd, ['axes on', 'show axes', 'enable axes', 'turn on axes'])) {
        if (!axesHelper) { axesHelper = new THREE.AxesHelper(5); scene.add(axesHelper); }
        voiceStatus.textContent = '📐 Axes ON';
        speak('Axes on');
        return;
    }
    if (has(cmd, ['axes off', 'hide axes', 'disable axes', 'turn off axes'])) {
        if (axesHelper) { scene.remove(axesHelper); axesHelper = null; }
        voiceStatus.textContent = '📐 Axes OFF';
        speak('Axes off');
        return;
    }

    // ==========================================
    // 💡 LIGHTS
    // ==========================================
    if (has(cmd, ['headlights on', 'headlight on', 'head lights on', 'front lights on'])) {
        toggleHeadlights(true); speak('Headlights on'); return;
    }
    if (has(cmd, ['headlights off', 'headlight off', 'head lights off', 'front lights off'])) {
        toggleHeadlights(false); speak('Headlights off'); return;
    }
    if (has(cmd, ['taillights on', 'taillight on', 'tail lights on', 'backlights on',
                  'back lights on', 'rear lights on'])) {
        toggleTaillights(true); speak('Taillights on'); return;
    }
    if (has(cmd, ['taillights off', 'taillight off', 'tail lights off', 'backlights off',
                  'back lights off', 'rear lights off'])) {
        toggleTaillights(false); speak('Taillights off'); return;
    }
    if (has(cmd, ['all lights on', 'lights on'])) {
        toggleHeadlights(true); toggleTaillights(true); speak('All lights on'); return;
    }
    if (has(cmd, ['all lights off', 'lights off'])) {
        toggleHeadlights(false); toggleTaillights(false); speak('All lights off'); return;
    }

    // ==========================================
    // 🚶 HUMAN-STYLE MOVEMENT
    // ==========================================
    if (/^(?:walk\s+|move\s+|go\s+|step\s+)?forward(?:\s+\d+)?$/.test(cmd) ||
        /^(?:walk\s+|move\s+|go\s+)?ahead$/.test(cmd)) {
        humanMove('forward', 800);
        voiceStatus.textContent = '🚶 Moving forward';
        speak('Moving forward');
        return;
    }
    if (/^(?:walk\s+|move\s+|go\s+|step\s+)?(?:back|backward|backwards|reverse)(?:\s+\d+)?$/.test(cmd)) {
        humanMove('back', 800);
        voiceStatus.textContent = '🚶 Moving back';
        speak('Moving back');
        return;
    }
    if (/^(?:move\s+|walk\s+|go\s+|step\s+|strafe\s+)?left(?:\s+\d+)?$/.test(cmd)) {
        humanMove('left', 800);
        voiceStatus.textContent = '🚶 Moving left';
        speak('Moving left');
        return;
    }
    if (/^(?:move\s+|walk\s+|go\s+|step\s+|strafe\s+)?right(?:\s+\d+)?$/.test(cmd)) {
        humanMove('right', 800);
        voiceStatus.textContent = '🚶 Moving right';
        speak('Moving right');
        return;
    }
    if (/^(?:move\s+|walk\s+|go\s+|step\s+)?up(?:\s+\d+)?$/.test(cmd) ||
        /^(?:fly\s+up|ascend|rise)$/.test(cmd)) {
        humanMove('up', 800);
        voiceStatus.textContent = '🚶 Moving up';
        speak('Moving up');
        return;
    }
    if (/^(?:move\s+|walk\s+|go\s+|step\s+)?down(?:\s+\d+)?$/.test(cmd) ||
        /^(?:fly\s+down|descend|lower)$/.test(cmd)) {
        humanMove('down', 800);
        voiceStatus.textContent = '🚶 Moving down';
        speak('Moving down');
        return;
    }
    if (has(cmd, ['forward left', 'front left'])) {
        humanMove('forward', 800); setTimeout(() => humanMove('left', 800), 10);
        voiceStatus.textContent = '🚶 Forward left'; speak('Moving forward left'); return;
    }
    if (has(cmd, ['forward right', 'front right'])) {
        humanMove('forward', 800); setTimeout(() => humanMove('right', 800), 10);
        voiceStatus.textContent = '🚶 Forward right'; speak('Moving forward right'); return;
    }
    if (has(cmd, ['back left', 'rear left'])) {
        humanMove('back', 800); setTimeout(() => humanMove('left', 800), 10);
        voiceStatus.textContent = '🚶 Back left'; speak('Moving back left'); return;
    }
    if (has(cmd, ['back right', 'rear right'])) {
        humanMove('back', 800); setTimeout(() => humanMove('right', 800), 10);
        voiceStatus.textContent = '🚶 Back right'; speak('Moving back right'); return;
    }

    // ==========================================
    // 🎯 OBJECT NAME
    // ==========================================
    const objMatch = cmd.match(/\bobject\s*_?\s*(\d{1,3})\b/);
    if (objMatch) {
        const mesh = findPartByName(`Object_${objMatch[1]}`);
        if (mesh) {
            selectPart(mesh);
            focusOnPart(mesh);
            voiceStatus.textContent = `🎯 Focused Object_${objMatch[1]}`;
            speak(`Showing object ${objMatch[1]}`);
        } else {
            voiceStatus.textContent = `⚠️ Object_${objMatch[1]} not found`;
            speak(`Object ${objMatch[1]} not found`);
        }
        return;
    }

    // ==========================================
    // 📂 PANELS
    // ==========================================
    if (has(cmd, ['open parts', 'open inspector', 'open parts panel'])) {
        openPartsPanel();
        return;
    }
    if (has(cmd, ['close parts', 'close parts panel', 'close inspector'])) {
        closePanel('jarvis-hud');
        speak("Closing parts panel");
        return;
    }

    if ((cmd.startsWith('open ') || cmd.startsWith('show ')) && cmd.includes('panel')) {
        const panelName = cmd.replace(/^(open|show)\s+/, '').replace(/\s+panel$/, '').trim();
        const targetId = matchPanelOrAll(panelName);
        if (targetId === 'ALL') {
            ALL_PANEL_IDS.forEach(id => { openPanel(id, false); maximizePanel(id); });
            speak('Opening all panels');
            return;
        }
        if (targetId) {
            openPanel(targetId);
            maximizePanel(targetId);
            speak(`Opening ${panelName} panel`);
            return;
        }
    }

    if ((cmd.startsWith('close ') || cmd.startsWith('hide ')) && cmd.includes('panel')) {
        const panelName = cmd.replace(/^(close|hide)\s+/, '').replace(/\s+panel$/, '').trim();
        const targetId = matchPanelOrAll(panelName);
        if (targetId === 'ALL') {
            ALL_PANEL_IDS.forEach(id => closePanel(id));
            speak('Closing all panels');
            return;
        }
        if (targetId) {
            closePanel(targetId);
            speak(`Closing ${panelName} panel`);
            return;
        }
    }

    if (cmd === 'scroll' || cmd.startsWith('scroll ') || cmd === 'scroll down' || cmd === 'scroll up') {
        const direction = cmd.includes('up') ? 'up' : 'down';
        const openPanelEl = document.querySelector('.hud-panel.open:not(.minimized)');
        if (openPanelEl) {
            autoScrollPanel(openPanelEl.id, direction);
            speak(`Scrolling ${direction}`);
        } else speak("No panel is open to scroll");
        return;
    }

    if (has(cmd, ['split camera', 'camera split', 'split view', 'split screen'])) {
        toggleSplitScreen();
        speak("Camera split");
        return;
    }
    if (has(cmd, ['reset camera', 'camera reset', 'normal view'])) {
        resetCamera();
        speak("Camera reset");
        return;
    }

    const maxMatch = cmd.match(/^(?:maximi[sz]e|expand|restore|open up)\s+(.*?)(?:\s+panel)?$/);
    if (maxMatch) {
        const panelName = maxMatch[1].trim();
        const targetId = matchPanelOrAll(panelName);
        if (targetId === 'ALL') {
            ALL_PANEL_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.classList.add('open'); el.classList.remove('minimized'); updateMinBtn(el); }
            });
            speak('Maximizing all panels');
            return;
        }
        if (targetId) {
            openPanel(targetId, false);
            maximizePanel(targetId);
            speak(`Maximizing ${panelName} panel`);
            return;
        }
    }

    const minMatch = cmd.match(/^(?:minimi[sz]e|collapse|shrink)\s+(.*?)(?:\s+panel)?$/);
    if (minMatch) {
        const panelName = minMatch[1].trim();
        const targetId = matchPanelOrAll(panelName);
        if (targetId === 'ALL' || panelName === '' || panelName === 'all panels') {
            minimizeAllPanels();
            speak('Minimizing all panels');
            return;
        }
        if (targetId) {
            minimizePanel(targetId);
            speak(`Minimizing ${panelName} panel`);
            return;
        }
    }

    if (cmd === 'minimize' || cmd === 'minimize all' || cmd === 'minimize everything') {
        minimizeAllPanels();
        speak('Minimizing all panels');
        return;
    }

    // Panel size
    const hasSizeVerb = /(?:make|set|size|resize|change)/.test(cmd);
    const hasPanelWord = cmd.includes('panel');

    if (hasSizeVerb && hasPanelWord) {
        const panelMatch = cmd.match(/(?:make|set|size|resize|change)\s+(?:the\s+)?(.*?)\s+panel\s+(.+)$/);
        if (panelMatch) {
            const panelName = panelMatch[1].trim();
            const spec = panelMatch[2].trim();
            let targetId = matchPanelName(panelName);
            if (!targetId && (panelName.includes('this') || panelName.includes('it') || panelName === '')) {
                const openEl = document.querySelector('.hud-panel.open:not(.minimized)');
                if (openEl) targetId = openEl.id;
            }
            if (targetId || targetId === 'ALL') {
                const ids = targetId === 'ALL' ? ALL_PANEL_IDS : [targetId];
                const directMatch = spec.match(/(\d{3,4})\s*(?:by|x|and|,)\s*(\d{3,4})/);
                if (directMatch) {
                    const w = parseInt(directMatch[1]);
                    const h = parseInt(directMatch[2]);
                    ids.forEach(id => setPanelCustomSize(id, w, h));
                    speak(`Resizing ${panelName} panel to ${w} by ${h}`);
                    return;
                }
                const widthMatch = spec.match(/(?:width|with|wide|wait)\s*(?:to\s+)?(\d{3,4})/);
                if (widthMatch) {
                    const w = parseInt(widthMatch[1]);
                    ids.forEach(id => setPanelWidth(id, w));
                    speak(`Setting ${panelName} panel width to ${w}`);
                    return;
                }
                const heightMatch = spec.match(/(?:height|high|hite)\s*(?:to\s+)?(\d{3,4})/);
                if (heightMatch) {
                    const h = parseInt(heightMatch[1]);
                    ids.forEach(id => setPanelHeight(id, h));
                    speak(`Setting ${panelName} panel height to ${h}`);
                    return;
                }
                const presetMatch = spec.match(/\b(tiny|small|medium|normal|default|large|big|huge|full)\b/);
                if (presetMatch) {
                    const sizeKey = presetMatch[1];
                    ids.forEach(id => setPanelSize(id, sizeKey));
                    speak(`Sizing ${panelName} panel to ${sizeKey}`);
                    return;
                }
            }
        }
    }

    if (cmd.includes('reset') && cmd.includes('panel') && cmd.includes('size')) {
        const panelName = cmd.replace(/reset/, '').replace(/panel/, '').replace(/size/, '').trim();
        const targetId = matchPanelName(panelName);
        if (targetId) {
            resetPanelSize(targetId);
            speak(`Resetting ${panelName} panel size`);
            return;
        }
    }

    if (has(cmd, ['auto minimize off', 'disable auto minimize', 'stop auto minimize'])) {
        window.__autoMinimizeOthers = false;
        voiceStatus.textContent = '📌 Auto-minimize OFF';
        speak('Auto minimize off');
        return;
    }
    if (has(cmd, ['auto minimize on', 'enable auto minimize', 'start auto minimize'])) {
        window.__autoMinimizeOthers = true;
        voiceStatus.textContent = '📌 Auto-minimize ON';
        speak('Auto minimize on');
        return;
    }

    // ==========================================
    // 🎨 DESIGN / MATERIAL
    // ==========================================
    const COLOR_NAMES = {
        white: 0xffffff, black: 0x000000, red: 0xff3b30,
        orange: 0xff9500, yellow: 0xffcc00, green: 0x00ff88,
        cyan: 0x00e5ff, blue: 0x007bff, purple: 0xa020f0,
        pink: 0xff00aa
    };

    const colorMatch = cmd.match(/\b(?:paint|color|colour|make)\s+(?:it\s+|the\s+part\s+)?(white|black|red|orange|yellow|green|cyan|blue|purple|pink)\b/);
    if (colorMatch) {
        if (!selectedPart) { voiceStatus.textContent = '⚠️ No part selected'; speak('Please select a part first'); return; }
        const hex = COLOR_NAMES[colorMatch[1]];
        const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
        mats.forEach(m => { if (m && m.color) { m.color.setHex(hex); m.needsUpdate = true; } });
        voiceStatus.textContent = `🎨 ${colorMatch[1]}`;
        speak(`Painting ${colorMatch[1]}`);
        updateDetailsPanel();
        return;
    }

    const opacityMatch = cmd.match(/\b(?:opacity|alpha)\s+(\d{1,3})\b/);
    if (opacityMatch) {
        if (!selectedPart) { voiceStatus.textContent = '⚠️ No selected part'; speak('Please select a part first'); return; }
        const v = Math.max(0, Math.min(100, parseInt(opacityMatch[1]))) / 100;
        const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
        mats.forEach(m => { if (m) { m.transparent = v < 1; m.opacity = v; m.needsUpdate = true; } });
        const sl = document.getElementById('opacity-slider');
        if (sl) sl.value = Math.round(v * 100);
        voiceStatus.textContent = `🎨 Opacity ${Math.round(v * 100)}%`;
        speak(`Opacity set to ${Math.round(v * 100)} percent`);
        return;
    }

    if (has(cmd, ['wireframe on'])) {
        if (selectedPart) {
            const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
            mats.forEach(m => { if (m) { m.wireframe = true; m.needsUpdate = true; } });
            voiceStatus.textContent = '🎨 Wireframe ON';
            speak('Wireframe on');
        } else speak('Please select a part first');
        return;
    }
    if (has(cmd, ['wireframe off'])) {
        if (selectedPart) {
            const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
            mats.forEach(m => { if (m) { m.wireframe = false; m.needsUpdate = true; } });
            voiceStatus.textContent = '🎨 Wireframe OFF';
            speak('Wireframe off');
        } else speak('Please select a part first');
        return;
    }

    if (has(cmd, ['make it metal', 'metal preset', 'apply metal'])) {
        if (selectedPart) { applyMaterialPreset(selectedPart, 'metal'); updateDetailsPanel(); speak('Applying metal preset'); }
        else speak('Please select a part first');
        return;
    }
    if (has(cmd, ['make it chrome', 'chrome preset', 'apply chrome'])) {
        if (selectedPart) { applyMaterialPreset(selectedPart, 'chrome'); updateDetailsPanel(); speak('Applying chrome preset'); }
        else speak('Please select a part first');
        return;
    }
    if (has(cmd, ['make it glass', 'glass preset', 'apply glass'])) {
        if (selectedPart) { applyMaterialPreset(selectedPart, 'glass'); updateDetailsPanel(); speak('Applying glass preset'); }
        else speak('Please select a part first');
        return;
    }
    if (has(cmd, ['make it matte', 'matte preset', 'apply matte'])) {
        if (selectedPart) { applyMaterialPreset(selectedPart, 'matte'); updateDetailsPanel(); speak('Applying matte preset'); }
        else speak('Please select a part first');
        return;
    }
    if (has(cmd, ['make it glow', 'glow preset', 'apply glow', 'neon'])) {
        if (selectedPart) { applyMaterialPreset(selectedPart, 'glow'); updateDetailsPanel(); speak('Applying glow preset'); }
        else speak('Please select a part first');
        return;
    }
    if (has(cmd, ['reset material', 'reset appearance', 'reset preset'])) {
        if (selectedPart) { applyMaterialPreset(selectedPart, 'reset'); updateDetailsPanel(); speak('Material reset'); }
        else speak('Please select a part first');
        return;
    }

    const metalMatch = cmd.match(/\b(?:metalness|metal)\s+(\d{1,3})\b/);
    if (metalMatch) {
        if (selectedPart) {
            const v = Math.max(0, Math.min(100, parseInt(metalMatch[1]))) / 100;
            const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
            mats.forEach(m => { if (m && 'metalness' in m) { m.metalness = v; m.needsUpdate = true; } });
            const sl = document.getElementById('metalness-slider');
            if (sl) sl.value = Math.round(v * 100);
            voiceStatus.textContent = `🔩 Metalness ${Math.round(v * 100)}%`;
            speak(`Metalness set to ${Math.round(v * 100)} percent`);
        } else speak('Please select a part first');
        return;
    }

    const roughMatch = cmd.match(/\b(?:roughness|rough)\s+(\d{1,3})\b/);
    if (roughMatch) {
        if (selectedPart) {
            const v = Math.max(0, Math.min(100, parseInt(roughMatch[1]))) / 100;
            const mats = Array.isArray(selectedPart.material) ? selectedPart.material : [selectedPart.material];
            mats.forEach(m => { if (m && 'roughness' in m) { m.roughness = v; m.needsUpdate = true; } });
            const sl = document.getElementById('roughness-slider');
            if (sl) sl.value = Math.round(v * 100);
            voiceStatus.textContent = `🔩 Roughness ${Math.round(v * 100)}%`;
            speak(`Roughness set to ${Math.round(v * 100)} percent`);
        } else speak('Please select a part first');
        return;
    }

    // Auto rotate
    if (has(cmd, ['auto rotate on', 'autorotate on', 'start rotating'])) {
        orbitControls.autoRotate = true; orbitControls.autoRotateSpeed = 1.5;
        voiceStatus.textContent = '🔄 AutoRotate ON';
        speak('Auto rotate on');
        return;
    }
    if (has(cmd, ['auto rotate off', 'autorotate off', 'stop rotating'])) {
        orbitControls.autoRotate = false;
        voiceStatus.textContent = '🔄 AutoRotate OFF';
        speak('Auto rotate off');
        return;
    }

    // Numeric selection
    const selectNum = cmd.match(/\b(?:select|choose|pick|target)\s+(?:object|part|mesh|item)?\s*_?\s*(\d{1,3})\b/);
    if (selectNum) {
        const mesh = findPartByName(`Object_${selectNum[1]}`);
        if (mesh) {
            selectPart(mesh);
            voiceStatus.textContent = `🎯 Selected Object_${selectNum[1]}`;
            speak(`Selected object ${selectNum[1]}`);
        } else {
            voiceStatus.textContent = `⚠️ Object_${selectNum[1]} not found`;
            speak(`Object ${selectNum[1]} not found`);
        }
        return;
    }

    // Trash
    if (has(cmd, ['trash it', 'delete it', 'bin it', 'remove it', 'trash selected'])) {
        if (selectedPart) { trashPart(selectedPart); speak('Trashed'); }
        else speak('Please select a part first');
        return;
    }
    if (has(cmd, ['restore trash', 'restore from trash', 'recover parts'])) {
        restoreTrashed();
        speak('Restoring trashed parts');
        return;
    }

    // Fallback panels
    if (/^(?:open|show)\s+all(?:\s+panels)?$/.test(cmd) || cmd === 'open everything') {
        resetPanelPositions();
        ALL_PANEL_IDS.forEach(id => { openPanel(id, false); maximizePanel(id); });
        voiceStatus.textContent = '📂 All panels opened';
        speak('Opening all panels');
        return;
    }
    if (has(cmd, ['close panels', 'close all panels'])) {
        ALL_PANEL_IDS.forEach(id => closePanel(id));
        voiceStatus.textContent = '📁 All panels closed';
        speak('Closing all panels');
        return;
    }

    // Visibility
    if (has(cmd, ['show all', 'show everything', 'unhide all'])) { restoreAllVisibility(); speak('Showing all parts'); return; }
    if (has(cmd, ['hide all', 'hide everything'])) {
        isolatedPart = null; visibilitySnapshot.clear();
        allPartMeshes.forEach(m => { m.visible = false; });
        syncHudRowsToVisibility(null);
        speak('Hiding all parts');
        return;
    }

    // Camera views
    if (has(cmd, ['turn left', 'rotate left'])) { rotateCamera('left'); voiceStatus.textContent = '↩️ Turn left'; speak('Turning left'); return; }
    if (has(cmd, ['turn right', 'rotate right'])) { rotateCamera('right'); voiceStatus.textContent = '↪️ Turn right'; speak('Turning right'); return; }
    if (has(cmd, ['look up', 'rotate up'])) { rotateCamera('up'); voiceStatus.textContent = '⬆️ Up'; speak('Looking up'); return; }
    if (has(cmd, ['look down', 'rotate down'])) { rotateCamera('down'); voiceStatus.textContent = '⬇️ Down'; speak('Looking down'); return; }
    if (has(cmd, ['front view'])) { setCameraView('front'); speak('Front view'); return; }
    if (has(cmd, ['back view', 'rear view'])) { setCameraView('back'); speak('Rear view'); return; }
    if (has(cmd, ['top view'])) { setCameraView('top'); speak('Top view'); return; }
    if (has(cmd, ['side view'])) { setCameraView('side'); speak('Side view'); return; }
    if (has(cmd, ['zoom in', 'closer'])) { zoomCamera(0.4); speak('Zooming in'); return; }
    if (has(cmd, ['zoom out', 'farther'])) { zoomCamera(1.5); speak('Zooming out'); return; }

    // Group isolation
    for (const [gk, aliases] of Object.entries(GROUP_ALIASES)) {
        for (const a of aliases) {
            if (cmd === a || cmd.includes(a)) {
                if (isolateGroup(gk)) {
                    speak(`Isolating ${gk}`);
                    return;
                }
            }
        }
    }

    // Unrecognized
    console.log('❓ Unrecognized voice command:', cmd);
    voiceStatus.textContent = `❓ Unknown: "${cmd}"`;
    if (window.VoiceOrb) window.VoiceOrb.setError();
    speak(`I did not understand ${cmd}`);
}

// ============================================
// GESTURE API
// ============================================
const gestureRaycaster = new THREE.Raycaster();
const gestureNDC = new THREE.Vector2();
let handGrabState = null;
let handUiPinch = false;
let lastHandGesturePoint = { x: .5, y: .5 };

function gestureScreenPoint(nx, ny) {
    return { x: (1 - nx) * window.innerWidth, y: ny * window.innerHeight };
}

function gestureUIAt(nx, ny) {
    const pt = gestureScreenPoint(nx, ny);
    if (!handPointerEl) return null;
    handPointerEl.style.visibility = 'hidden';
    const el = document.elementFromPoint(pt.x, pt.y);
    handPointerEl.style.visibility = '';
    if (!el) return null;
    return el.closest('button,input,select,textarea,.hud-part,.hud-group-header,.ctl-btn,.preset-btn,.color-btn,.hud-action,.panel-control,.panel-header,[class*="panel"]');
}

function gestureRaycast(nx, ny) {
    if (!camera || !carModel) return null;
    gestureNDC.x = (1 - nx) * 2 - 1;
    gestureNDC.y = -(ny * 2 - 1);
    gestureRaycaster.setFromCamera(gestureNDC, camera);
    const visible = allPartMeshes.filter(m => m.visible && !m.userData.__trashed);
    const hits = gestureRaycaster.intersectObjects(visible, false);
    return hits.length ? hits[0] : null;
}

function selectByHandPoint(nx, ny, focus = false) {
    const hit = gestureRaycast(nx, ny);
    if (!hit?.object) return null;
    selectPart(hit.object);
    if (focus) focusOnPart(hit.object);
    if (voiceStatus) voiceStatus.textContent = `🎯 Hand target: ${hit.object.name}`;
    return hit.object;
}

let simMouseDown = false;
let simMouseStartX = 0, simMouseStartY = 0;
let simPanelDrag = null;
let simPanelStartRect = null;
let simPanelStartPointer = null;

function fireMouseEvent(type, x, y, button = 0, buttons = 0) {
    const el = document.elementFromPoint(x, y) || document.body;
    const evt = new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y, button, buttons, which: button + 1
    });
    el.dispatchEvent(evt);
    return el;
}

function beginSimulatedMouse(nx, ny) {
    const p = gestureScreenPoint(nx, ny);
    const x = p.x, y = p.y;
    simMouseStartX = x; simMouseStartY = y;

    if (handPointerEl) handPointerEl.style.visibility = 'hidden';
    const el = document.elementFromPoint(x, y);
    if (handPointerEl) handPointerEl.style.visibility = '';

    const panel = el?.closest('.panel, .jarvis-panel, .panel-container, [class*="panel"]');
    let panelDragTarget = null;
    if (panel) {
        const rect = panel.getBoundingClientRect();
        if (y - rect.top < 60) panelDragTarget = panel;
    }

    if (panelDragTarget) {
        simPanelDrag = panelDragTarget;
        simPanelStartRect = panelDragTarget.getBoundingClientRect();
        simPanelStartPointer = { x, y };
        simMouseDown = true;
        fireMouseEvent('mousedown', x, y, 0, 1);
        return;
    }

    simPanelDrag = null;
    simMouseDown = true;
    fireMouseEvent('mousedown', x, y, 0, 1);
}

function moveSimulatedMouse(nx, ny) {
    if (!simMouseDown) return;
    const p = gestureScreenPoint(nx, ny);
    const x = p.x, y = p.y;

    if (simPanelDrag && simPanelStartRect && simPanelStartPointer) {
        const dx = x - simPanelStartPointer.x;
        const dy = y - simPanelStartPointer.y;
        const newLeft = simPanelStartRect.left + dx;
        const newTop  = simPanelStartRect.top + dy;
        simPanelDrag.style.setProperty('left', newLeft + 'px', 'important');
        simPanelDrag.style.setProperty('top', newTop + 'px', 'important');
        simPanelDrag.style.setProperty('right', 'auto', 'important');
        simPanelDrag.style.setProperty('bottom', 'auto', 'important');
        fireMouseEvent('mousemove', x, y, 0, 1);
        return;
    }
    fireMouseEvent('mousemove', x, y, 0, 1);
}

function endSimulatedMouse(nx, ny) {
    if (!simMouseDown) return;
    const p = gestureScreenPoint(nx, ny);
    const x = p.x, y = p.y;
    fireMouseEvent('mouseup', x, y, 0, 0);

    const moved = Math.hypot(x - simMouseStartX, y - simMouseStartY);
    if (moved < 8 && !simPanelDrag) {
        fireMouseEvent('click', x, y, 0, 0);
        if (handPointerEl) handPointerEl.style.visibility = 'hidden';
        const el = document.elementFromPoint(x, y);
        if (handPointerEl) handPointerEl.style.visibility = '';
        if (el && el !== document.body) { try { el.click(); } catch (e) {} }
    }

    simMouseDown = false;
    simPanelDrag = null;
    simPanelStartRect = null;
    simPanelStartPointer = null;
}

function beginHandGrab(nx, ny) {
    const ui = gestureUIAt(nx, ny);
    if (ui) {
        handUiPinch = true;
        handGrabState = null;
        beginSimulatedMouse(nx, ny);
        return { type: 'ui', element: ui };
    }

    const hit = gestureRaycast(nx, ny);
    if (!hit?.object) {
        handUiPinch = false;
        handGrabState = null;
        beginSimulatedMouse(nx, ny);
        return { type: 'empty' };
    }

    const mesh = hit.object;
    selectPart(mesh, false);
    const planeNormal = new THREE.Vector3();
    camera.getWorldDirection(planeNormal);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, hit.point.clone());

    handGrabState = {
        mesh, plane,
        startPoint: hit.point.clone(),
        startWorld: hit.object.getWorldPosition(new THREE.Vector3()),
        startLocal: hit.object.position.clone()
    };
    handUiPinch = false;
    orbitControls.enabled = false;
    if (voiceStatus) voiceStatus.textContent = `🤏 Grabbing ${mesh.name}`;
    return { type: 'part', mesh };
}

function moveHandGrab(nx, ny) {
    if (simMouseDown) moveSimulatedMouse(nx, ny);
    if (handUiPinch || !handGrabState) return;

    const p = gestureScreenPoint(nx, ny);
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcX = ((p.x - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((p.y - rect.top) / rect.height) * 2 - 1);
    gestureNDC.set(ndcX, ndcY);
    gestureRaycaster.setFromCamera(gestureNDC, camera);
    const hitPoint = new THREE.Vector3();
    if (!gestureRaycaster.ray.intersectPlane(handGrabState.plane, hitPoint)) return;

    const mesh = handGrabState.mesh;
    if (!mesh?.parent) return;
    const local = mesh.parent.worldToLocal(hitPoint.clone());
    mesh.position.copy(local);
    mesh.updateMatrixWorld(true);
    updateDetailsPanel();
}

function endHandGrab() {
    if (handGrabState?.mesh) {
        if (voiceStatus) voiceStatus.textContent = `📌 ${handGrabState.mesh.name} dropped`;
        updateDetailsPanel();
    }
    handGrabState = null;
    handUiPinch = false;
    orbitControls.enabled = true;
    if (simMouseDown) endSimulatedMouse(window.__lastGesturePointer?.x ?? 0.5, window.__lastGesturePointer?.y ?? 0.5);
}

function clickHandTarget(nx, ny) {
    const ui = gestureUIAt(nx, ny);
    if (ui) { try { ui.click(); } catch {} return; }
    selectByHandPoint(nx, ny, false);
}

window.GestureAPI = {
    openPanel, closePanel, minimizePanel, maximizePanel, movePanel,
    minimizeAllPanels,
    bringPanelToFront, resetPanelZIndexes,
    resetPanelSize, setPanelSize, setPanelWidth, setPanelHeight, setPanelCustomSize,
    growPanel,
    humanMove,
    toggleHeadlights, toggleTaillights,
    openLeaveModal, closeLeaveModal,

    togglePanel: (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.classList.contains('open')) closePanel(id);
        else { openPanel(id); maximizePanel(id); }
    },
    toggleAllPanels: () => {
        const anyOpen = ALL_PANEL_IDS.some(id => document.getElementById(id)?.classList.contains('open'));
        if (anyOpen) ALL_PANEL_IDS.forEach(closePanel);
        else ALL_PANEL_IDS.forEach(id => { openPanel(id); maximizePanel(id); });
    },
    nextPanel: () => {
        const order = ALL_PANEL_IDS;
        window.__panelCursor = ((window.__panelCursor ?? 0) + 1) % order.length;
        const id = order[window.__panelCursor];
        resetPanelPositions(); minimizeOthers(id); openPanel(id, false); maximizePanel(id);
        stackOrder = ALL_PANEL_IDS.filter(x => x !== id); applyCascadeStack();
    },
    prevPanel: () => {
        const order = ALL_PANEL_IDS;
        window.__panelCursor = ((window.__panelCursor ?? 0) - 1 + order.length) % order.length;
        const id = order[window.__panelCursor];
        resetPanelPositions(); minimizeOthers(id); openPanel(id, false); maximizePanel(id);
        stackOrder = ALL_PANEL_IDS.filter(x => x !== id); applyCascadeStack();
    },
    movePanelRelative: (id, direction) => {
        const el = document.getElementById(id); if (!el) return;
        const r = el.getBoundingClientRect(), step = 40;
        let x=r.left,y=r.top;
        if(direction==='left')x-=step;if(direction==='right')x+=step;if(direction==='up')y-=step;if(direction==='down')y+=step;
        el.style.setProperty('left',x+'px','important');el.style.setProperty('top',y+'px','important');
        el.style.setProperty('right','auto','important');el.style.setProperty('bottom','auto','important');
    },

    translateCar: (dx = 0, dy = 0, dz = 0) => {
        if (!carModel) return;
        const GAIN = GESTURE_GAIN_TRANSLATE;
        carModel.position.x += dx * GAIN;
        carModel.position.y += dy * GAIN;
        carModel.position.z += dz * GAIN;
        carModel.position.x = Math.max(-25, Math.min(25, carModel.position.x));
        carModel.position.y = Math.max(-8,  Math.min(15, carModel.position.y));
        carModel.position.z = Math.max(-25, Math.min(25, carModel.position.z));
    },
    rotateCar: (yawDelta = 0) => {
        if (carModel) carModel.rotation.y += yawDelta;
    },
    toggleAutoRotate: () => {
        orbitControls.autoRotate = !orbitControls.autoRotate;
        if (voiceStatus) voiceStatus.textContent = `🔄 AutoRotate ${orbitControls.autoRotate ? 'ON' : 'OFF'}`;
        speak(`Auto rotate ${orbitControls.autoRotate ? 'on' : 'off'}`);
    },
    resetCarPosition: () => {
        if (!carModel) return;
        carModel.position.set(0, 0, 0);
        carModel.rotation.set(0, 0, 0);
    },
    setAxisMode: (on) => { window.__axisModeActive = !!on; },
    setRotateMode: (on) => { window.__rotateModeActive = !!on; },

    selectPart, focusOnPart, isolatePart, restoreAllVisibility,
    setPartVisible, togglePart, findPartByName, findPartsByGroup, isolateGroup,
    splitAll, splitGroup, splitPart, unsplitAll, changeSplitDistance, setSplitDistance,
    trashSelectedPart: () => { if(selectedPart) trashPart(selectedPart); },
    restoreTrashed,
    openC, closeC,

    setBlueprintMode, getBlueprintMode:()=>blueprintMode, toggleSetting,
    applyMaterialPreset: (preset)=>{ if(selectedPart) { applyMaterialPreset(selectedPart,preset); updateDetailsPanel(); } },
    setSelectedColor: (hex)=>{
        if(!selectedPart)return;
        const mats=Array.isArray(selectedPart.material)?selectedPart.material:[selectedPart.material];
        mats.forEach(m=>{if(m?.color)m.color.setHex(hex);m.needsUpdate=true;});updateDetailsPanel();
    },
    setSelectedOpacity: (v)=>{
        if(!selectedPart)return;
        v=Math.max(0,Math.min(1,v));const mats=Array.isArray(selectedPart.material)?selectedPart.material:[selectedPart.material];
        mats.forEach(m=>{if(m){m.transparent=v<1;m.opacity=v;m.needsUpdate=true;}});updateDetailsPanel();
    },
    applyEditAction,

    moveCameraAxis, zoomCamera, stopCameraMovement, flyToPart, setCameraView,
    enterOrbitMode, enterWalkMode, enterDriveView, enterEngineView, enterTrunkView, rotateCamera,
    toggleSplitScreen,
    resetCamera,

    speak, getSelectedPart:()=>selectedPart,
    getState:()=>({blueprintMode,isolatedPart:isolatedPart?.name||null,selectedPart:selectedPart?.name||null,currentMode,explodedCount:explodedParts.size,leaveModalOpen:window.__leaveModalOpen}),

    gestureSelectNearestPart:()=>{
        const p=window.__lastGesturePointer;
        if(p) selectByHandPoint(p.x,p.y,false);
    },
    handSelect:(x,y)=>selectByHandPoint(x,y,false),
    handGrabStart:(x,y)=>beginHandGrab(x,y),
    handGrabMove:(x,y)=>moveHandGrab(x,y),
    handGrabEnd:()=>endHandGrab(),
    handClick:(x,y)=>clickHandTarget(x,y),

    twoHandTransform:(delta)=>{
        if(selectedPart){
            const factor=Math.max(.82,Math.min(1.18,1+delta));
            selectedPart.scale.multiplyScalar(factor);selectedPart.updateMatrixWorld(true);updateDetailsPanel();
            if (voiceStatus) voiceStatus.textContent=`🤏🤏 Scale ${selectedPart.name}`;
        } else {
            apiZoomFromGesture(delta*4);
        }
    },
    twoHandRotate:(yawDelta,pitchDelta=0)=>{
        if(selectedPart){selectedPart.rotation.y += yawDelta;selectedPart.rotation.x += pitchDelta;selectedPart.updateMatrixWorld(true);updateDetailsPanel();}
        else window.GestureAPI.setOrbitAngles(yawDelta,pitchDelta);
    },

    setOrbitMode:(on)=>{window.__orbitModeActive=on;if(on)lastOrbitModeTime=performance.now();},
    setPanMode:(on)=>{window.__panModeActive=on;if(on)lastPanModeTime=performance.now();},
    setZoomMode:(on)=>{window.__zoomModeActive=on;if(on)lastZoomModeTime=performance.now();},
    setOrbitAngles:(yawOffset=0,pitchOffset=0)=>{
        const offset=new THREE.Vector3().subVectors(camera.position,orbitControls.target);
        const spherical=new THREE.Spherical().setFromVector3(offset);
        spherical.theta+=yawOffset;spherical.phi=Math.max(.05,Math.min(Math.PI-.05,spherical.phi+pitchOffset));
        offset.setFromSpherical(spherical);camera.position.copy(orbitControls.target).add(offset);camera.lookAt(orbitControls.target);orbitControls.update();lastOrbitModeTime=performance.now();
    },
    translateCamera:(dx=0,dy=0,dz=0)=>{
        const forward=new THREE.Vector3();camera.getWorldDirection(forward);
        const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
        const move=new THREE.Vector3().addScaledVector(right,dx).addScaledVector(new THREE.Vector3(0,1,0),dy).addScaledVector(forward,-dz);
        camera.position.add(move);orbitControls.target.add(move);camera.lookAt(orbitControls.target);orbitControls.update();lastPanModeTime=performance.now();
    },
    rollCamera:(a=0)=>camera.rotateZ(a),
    dollyCamera:(delta=0)=>{
        if(handGrabState)return;
        const off=new THREE.Vector3().subVectors(camera.position,orbitControls.target);const len=Math.max(orbitControls.minDistance,Math.min(orbitControls.maxDistance,off.length()+delta));
        off.setLength(len);camera.position.copy(orbitControls.target).add(off);camera.lookAt(orbitControls.target);orbitControls.update();lastZoomModeTime=performance.now();
    }
};

function apiZoomFromGesture(delta){
    if(handGrabState)return;
    window.GestureAPI.dollyCamera(delta);
}

console.log('🤖 JARVIS gesture API online');

// ============================================
// CROSS-TAB COMMAND HANDLER
// ============================================
function handleGestureCommand(action, args) {
    if (!action) return;
    const api = window.GestureAPI;

    switch (action) {
        case '__orbit': {
            const now = performance.now();
            if (now - lastOrbitModeTime < 25) return;
            lastOrbitModeTime = now;
            window.__orbitModeActive = true;
            api.setOrbitAngles(args[0] || 0, args[1] || 0);
            return;
        }
        case '__translate': {
            const now = performance.now();
            if (now - lastPanModeTime < 25) return;
            lastPanModeTime = now;
            window.__panModeActive = true;
            api.translateCamera(args[0] || 0, args[1] || 0, args[2] || 0);
            return;
        }
        case '__dolly': {
            const now = performance.now();
            if (now - lastZoomModeTime < 25) return;
            lastZoomModeTime = now;
            window.__zoomModeActive = true;
            api.dollyCamera(args[0] || 0);
            return;
        }
        case '__roll': { api.rollCamera(args[0] || 0); return; }
        case '__twoHandTransform': { api.twoHandTransform(args[0] || 0); return; }
        case '__twoHandRotate':    { api.twoHandRotate(args[0] || 0, args[1] || 0); return; }
        case '__axis': {
            const [dx, dy, dz] = args || [0, 0, 0];
            api.translateCar(dx, dy, dz);
            return;
        }
        case 'setAxisMode':       { api.setAxisMode(args ? args[0] : false); return; }
        case 'toggleAutoRotate':  { api.toggleAutoRotate(); return; }
        case 'setRotateMode':     { api.setRotateMode(args ? args[0] : false); return; }
        case 'resetCarPosition':  { api.resetCarPosition(); return; }
        case 'toggleHeadlights':  { api.toggleHeadlights(args && args[0] !== undefined ? !!args[0] : true); return; }
        case 'toggleTaillights':  { api.toggleTaillights(args && args[0] !== undefined ? !!args[0] : true); return; }
        case 'hideAll': {
            isolatedPart = null;
            visibilitySnapshot.clear();
            allPartMeshes.forEach(m => { m.visible = false; });
            syncHudRowsToVisibility(null);
            return;
        }
        case 'togglePanel':       api.togglePanel(args[0]); return;
        case 'toggleAllPanels':   api.toggleAllPanels(); return;
        case 'nextPanel':         api.nextPanel(); return;
        case 'prevPanel':         api.prevPanel(); return;
        case 'movePanelRelative': api.movePanelRelative(args[0], args[1]); return;
        case 'trashSelectedPart': api.trashSelectedPart(); return;
        case 'openLeaveModal':    api.openLeaveModal(); return;
        case 'closeLeaveModal':   api.closeLeaveModal(); return;
    }

    const fn = api[action];
    if (typeof fn === 'function') {
        try { fn.apply(api, args || []); }
        catch (e) { console.warn(`⚠️ Failed to run ${action}:`, e); }
    }
}

try {
    const gestureChannel = new BroadcastChannel('bmw_m4_gestures');
    gestureChannel.onmessage = (event) => {
        const { action, args } = event.data || {};
        handleGestureCommand(action, args);
    };
} catch (e) {}

window.addEventListener('storage', (event) => {
    if (event.key !== '__bmw_m4_gesture_cmd') return;
    if (!event.newValue) return;
    try {
        const { action, args, ts } = JSON.parse(event.newValue);
        if (Date.now() - ts > 2000) return;
        handleGestureCommand(action, args);
    } catch (e) {}
});

// ============================================
// HAND POINTER
// ============================================
function setHandPointerPos(normX, normY, pinching = false) {
    window.__lastGesturePointer = { x: normX, y: normY };
    lastHandGesturePoint = { x: normX, y: normY };
    if (!handPointerEl) return;

    const screenX = (1 - normX) * window.innerWidth;
    const screenY = normY * window.innerHeight;

    handPointerEl.style.transform =
        `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`;

    handPointerEl.classList.remove('hidden');
    handPointerEl.classList.toggle('pinching', pinching);
    handPointerLastSeen = Date.now();
    updateHoveredElement(screenX, screenY);
}

function updateHoveredElement(x, y) {
    if (!handPointerEl) return;
    const now = performance.now();
    if (now - lastHoverCheckTime < HOVER_CHECK_INTERVAL) return;
    lastHoverCheckTime = now;

    handPointerEl.style.visibility = 'hidden';
    const el = document.elementFromPoint(x, y);
    handPointerEl.style.visibility = '';

    if (lastHoveredEl && lastHoveredEl !== el) lastHoveredEl.classList.remove('hand-pointer-hover');
    if (el && el.matches('button, input, .hud-part, .hud-group-header, .ctl-btn, .preset-btn, .color-btn, .hud-action')) {
        el.classList.add('hand-pointer-hover');
        lastHoveredEl = el;
    } else {
        lastHoveredEl = null;
    }
}

function hideHandPointer() {
    if (handPointerEl) handPointerEl.classList.add('hidden');
    if (lastHoveredEl) { lastHoveredEl.classList.remove('hand-pointer-hover'); lastHoveredEl = null; }
}

setInterval(() => {
    if (handPointerLastSeen && Date.now() - handPointerLastSeen > HAND_POINTER_TIMEOUT) hideHandPointer();
}, 500);

try {
    const pointerChannel = new BroadcastChannel('bmw_m4_pointer');
    pointerChannel.onmessage = (event) => {
        const { x, y, pinching, action } = event.data || {};
        if (action === 'hide') { endHandGrab(); hideHandPointer(); return; }
        if (typeof x === 'number' && typeof y === 'number') {
            setHandPointerPos(x, y, !!pinching);
            if (action === 'pinchStart') beginHandGrab(x, y);
            else if (action === 'pinchMove') moveHandGrab(x, y);
            else if (action === 'pinchEnd') endHandGrab();
            else if (action === 'click') clickHandTarget(x, y);
            else if (action === 'select') selectByHandPoint(x, y, false);
        }
    };
} catch (e) {}

window.addEventListener('storage', (event) => {
    if (event.key !== '__bmw_m4_pointer') return;
    if (!event.newValue) return;
    try {
        const { x, y, pinching, action, ts } = JSON.parse(event.newValue);
        if (Date.now() - ts > 1000) return;
        if (action === 'hide') { endHandGrab(); hideHandPointer(); return; }
        if (typeof x === 'number' && typeof y === 'number') {
            setHandPointerPos(x, y, !!pinching);
            if (action === 'pinchStart') beginHandGrab(x, y);
            else if (action === 'pinchMove') moveHandGrab(x, y);
            else if (action === 'pinchEnd') endHandGrab();
            else if (action === 'click') clickHandTarget(x, y);
            else if (action === 'select') selectByHandPoint(x, y, false);
        }
    } catch (e) {}
});

// ============================================
// GESTURE MODE AUTO-DEACTIVATE
// ============================================
window.__checkGestureModes = () => {
    const now = performance.now();
    if (window.__orbitModeActive && now - lastOrbitModeTime > GESTURE_MODE_TIMEOUT) window.__orbitModeActive = false;
    if (window.__panModeActive && now - lastPanModeTime > GESTURE_MODE_TIMEOUT) window.__panModeActive = false;
    if (window.__zoomModeActive && now - lastZoomModeTime > GESTURE_MODE_TIMEOUT) window.__zoomModeActive = false;
};

// ============================================
// DEBUG HELPERS
// ============================================
window.__allParts = () => console.table(allPartMeshes.map(m => ({ name: m.name, group: classifyPart(m) })));
window.__panelStatus = () => {
    const s = ALL_PANEL_IDS.map(id => {
        const el = document.getElementById(id);
        if (!el) return `${id}: MISSING`;
        return `${id}: open=${el.classList.contains('open')}, min=${el.classList.contains('minimized')}, z=${el.style.zIndex || 'auto'}`;
    });
    console.log('📊 PANELS:\n' + s.join('\n'));
};

// ============================================
// CAMERA LOCK
// ============================================
function updateCameraLock() {
    if (!carModel || !cameraInitialized) return;
    const currentCarPos = carModel.position.clone();
    const delta = new THREE.Vector3().subVectors(currentCarPos, prevCarWorldPos);
    if (delta.lengthSq() < 1e-8) return;

    camera.position.add(delta);
    orbitControls.target.add(delta);

    const off = new THREE.Vector3().subVectors(camera.position, currentCarPos);
    const dist = off.length();
    if (dist > CAMERA_DISTANCE * 2.5 || dist < CAMERA_DISTANCE * 0.4) {
        off.setLength(CAMERA_DISTANCE);
        camera.position.copy(currentCarPos).add(off);
        orbitControls.target.copy(currentCarPos);
    }
    prevCarWorldPos.copy(currentCarPos);
}

// ============================================
// ANIMATE LOOP
// ============================================
let lastTime = performance.now();
function animate(time) {
    requestAnimationFrame(animate);
    const delta = (time - lastTime) / 1000;
    lastTime = time;

    if (typeof TWEEN !== 'undefined') TWEEN.update(time);
    if (window.__checkGestureModes) window.__checkGestureModes();

    updateCameraVelocity(delta);
    updateWalkVelocity(delta);

    if (carModel && !cameraInitialized) {
        cameraInitialized = true;
        prevCarWorldPos.copy(carModel.position);
        const b = new THREE.Box3().setFromObject(carModel);
        const s = b.getSize(new THREE.Vector3());
        const d = Math.max(s.x, s.y, s.z) * 1.5;
        camera.position.set(d * 0.7, d * 0.5, d * 0.7);
        orbitControls.target.copy(carModel.position);
        camera.lookAt(carModel.position);
    }

    if (currentMode === 'orbit') {
        updateCameraLock();
        orbitControls.update();
    } else if (currentMode === 'walk') {
        updateWalkMode(delta);
    } else if (currentMode === 'drive') {
        const f = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        camera.lookAt(camera.position.clone().add(f));
    }
    renderer.render(scene, camera);
    renderer.resetState();
}
animate(performance.now());

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
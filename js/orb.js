/* ============================================================
   JARVIS HOLOGRAPHIC ORB — visual only
============================================================ */

const canvas = document.getElementById("orbCanvas");

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 3000);

function fitOrbToScreen() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect > 1.65) camera.position.z = 8.9;
    else if (aspect > 1.35) camera.position.z = 8.5;
    else if (aspect > 1.0) camera.position.z = 8.8;
    else camera.position.z = 9.8;
}
fitOrbToScreen();

const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true,
    powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

let composer = null;
let bloomPass = null;

if (typeof THREE.EffectComposer !== "undefined" &&
    typeof THREE.RenderPass !== "undefined" &&
    typeof THREE.UnrealBloomPass !== "undefined") {
    const renderPass = new THREE.RenderPass(scene, camera);
    bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        2.4, 0.85, 0.02
    );
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
}

const jarvisGroup = new THREE.Group();
scene.add(jarvisGroup);

const ORB_RADIUS = 2.55;
const PARTICLE_COUNT = 8500;
const OUTER_PARTICLES = 2400;
const LATITUDE_LINES = 34;
const LONGITUDE_LINES = 42;

let time = 0;
let speaking = false;
let voiceLevel = 0;
let targetVoiceLevel = 0;

const COLOR_BLUE   = new THREE.Color(0x0066ff);
const COLOR_CYAN   = new THREE.Color(0x00d9ff);
const COLOR_PURPLE = new THREE.Color(0x743cff);
const COLOR_PINK   = new THREE.Color(0xff18d5);
const COLOR_ORANGE = new THREE.Color(0xff572e);

function random(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function colorForHeight(normalized) {
    const color = new THREE.Color();
    if (normalized > 0.55) {
        color.lerpColors(COLOR_BLUE, COLOR_CYAN, (normalized - 0.55) / 0.45);
    } else if (normalized > 0.05) {
        color.lerpColors(COLOR_PURPLE, COLOR_CYAN, (normalized - 0.05) / 0.50);
    } else if (normalized > -0.55) {
        color.lerpColors(COLOR_PINK, COLOR_PURPLE, (normalized + 0.55) / 0.60);
    } else {
        color.lerpColors(COLOR_ORANGE, COLOR_PINK, clamp((normalized + 1) / 0.45, 0, 1));
    }
    return color;
}

function organicRadius(theta, phi, currentTime, speakingAmount) {
    const wave1 = Math.sin(theta * 3.0 + phi * 2.1 + currentTime * 0.65);
    const wave2 = Math.sin(theta * 6.0 - phi * 3.2 - currentTime * 0.45);
    const wave3 = Math.cos(theta * 8.0 + phi * 5.0 + currentTime * 0.32);
    const wave4 = Math.sin(phi * 10.0 - theta * 2.0 + currentTime * 0.8);
    let deformation = wave1 * 0.15 + wave2 * 0.10 + wave3 * 0.065 + wave4 * 0.035;
    deformation += Math.sin(theta * 5 + currentTime * 4) * speakingAmount * 0.16;
    deformation += Math.cos(phi * 7 - currentTime * 3) * speakingAmount * 0.09;
    return ORB_RADIUS * (1 + deformation);
}

const particleMaterial = new THREE.PointsMaterial({
    size: 0.034, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true
});

function createSurfaceParticles() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors    = new Float32Array(PARTICLE_COUNT * 3);
    const seeds     = new Float32Array(PARTICLE_COUNT);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2;
        const radiusXZ = Math.sqrt(1 - y * y);
        const theta = goldenAngle * i;
        const phi = Math.acos(y);
        const radius = organicRadius(theta, phi, 0, 0);

        let x = Math.cos(theta) * radiusXZ * radius;
        let yy = y * radius;
        let z = Math.sin(theta) * radiusXZ * radius;

        const noise = random(-0.045, 0.045);
        x += x * noise; yy += yy * noise; z += z * noise;

        const idx = i * 3;
        positions[idx] = x;
        positions[idx + 1] = yy;
        positions[idx + 2] = z;

        const color = colorForHeight(y);
        const variation = random(0.78, 1.18);
        colors[idx]     = clamp(color.r * variation, 0, 1);
        colors[idx + 1] = clamp(color.g * variation, 0, 1);
        colors[idx + 2] = clamp(color.b * variation, 0, 1);

        seeds[i] = Math.random() * 10000;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("seed",     new THREE.BufferAttribute(seeds, 1));

    const points = new THREE.Points(geometry, particleMaterial);
    jarvisGroup.add(points);
    return points;
}

const surface = createSurfaceParticles();

function createOuterParticles() {
    const positions = new Float32Array(OUTER_PARTICLES * 3);
    const colors    = new Float32Array(OUTER_PARTICLES * 3);

    for (let i = 0; i < OUTER_PARTICLES; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(random(-1, 1));
        const distance = ORB_RADIUS + Math.pow(Math.random(), 2.2) * 1.45;

        const x = Math.sin(phi) * Math.cos(theta) * distance;
        const y = Math.cos(phi) * distance;
        const z = Math.sin(phi) * Math.sin(theta) * distance;

        const idx = i * 3;
        positions[idx] = x; positions[idx + 1] = y; positions[idx + 2] = z;

        const color = colorForHeight(y / distance);
        colors[idx]     = color.r * random(0.45, 1);
        colors[idx + 1] = color.g * random(0.45, 1);
        colors[idx + 2] = color.b * random(0.45, 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color",    new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.024, transparent: true, opacity: 0.65,
        depthWrite: false, vertexColors: true, blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geometry, material);
    jarvisGroup.add(points);
    return points;
}

const outerParticles = createOuterParticles();

const lineGroup = new THREE.Group();
jarvisGroup.add(lineGroup);

function createLatitudeLines() {
    for (let row = 0; row < LATITUDE_LINES; row++) {
        const normalized = -0.88 + (row / (LATITUDE_LINES - 1)) * 1.76;
        const points = [];
        const segments = 150;
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const phi = Math.acos(normalized);
            const radius = organicRadius(theta, phi, 0, 0);
            const ringRadius = Math.sqrt(1 - normalized * normalized) * radius;
            points.push(new THREE.Vector3(
                Math.cos(theta) * ringRadius,
                normalized * radius,
                Math.sin(theta) * ringRadius
            ));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        let color;
        if (normalized > 0.4) color = 0x1e9cff;
        else if (normalized > -0.05) color = 0x704cff;
        else if (normalized > -0.55) color = 0xff36d4;
        else color = 0xff6336;

        const material = new THREE.LineBasicMaterial({
            color, transparent: true, opacity: 0.18,
            blending: THREE.AdditiveBlending, depthWrite: false
        });

        const line = new THREE.LineLoop(geometry, material);
        line.userData.row = row;
        lineGroup.add(line);
    }
}
createLatitudeLines();

function createLongitudeLines() {
    for (let column = 0; column < LONGITUDE_LINES; column++) {
        const longitude = (column / LONGITUDE_LINES) * Math.PI * 2;
        const points = [];
        const segments = 100;
        for (let i = 0; i <= segments; i++) {
            const phi = (i / segments) * Math.PI;
            const normalized = Math.cos(phi);
            const theta = longitude;
            const radius = organicRadius(theta, phi, 0, 0);
            const ringRadius = Math.sin(phi) * radius;
            points.push(new THREE.Vector3(
                Math.cos(theta) * ringRadius,
                normalized * radius,
                Math.sin(theta) * ringRadius
            ));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        let color;
        if (column % 3 === 0) color = 0x27a9ff;
        else if (column % 3 === 1) color = 0x914cff;
        else color = 0xff36d4;

        const material = new THREE.LineBasicMaterial({
            color, transparent: true, opacity: 0.14,
            blending: THREE.AdditiveBlending, depthWrite: false
        });

        const line = new THREE.Line(geometry, material);
        line.userData.column = column;
        lineGroup.add(line);
    }
}
createLongitudeLines();

const orbitGroup = new THREE.Group();
jarvisGroup.add(orbitGroup);

function createOrbit(radius, rx, ry, rz, color, opacity) {
    const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
    const points = curve.getPoints(220);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    material.userDataBaseOpacity = opacity;
    const line = new THREE.LineLoop(geometry, material);
    line.rotation.x = rx; line.rotation.y = ry; line.rotation.z = rz;
    orbitGroup.add(line);
    return line;
}

const orbit1 = createOrbit(2.95, 1.15, 0.15, 0.2, 0x168cff, 0.38);
const orbit2 = createOrbit(3.00, 2.00, 0.70, 0.5, 0xb14cff, 0.30);
const orbit3 = createOrbit(3.05, 0.40, 1.40, 1.1, 0xff22d6, 0.30);
const orbit4 = createOrbit(3.15, 1.90, 2.10, 0.3, 0x00bfff, 0.25);

const energyDots = [];
function createEnergyDots() {
    for (let i = 0; i < 55; i++) {
        const geometry = new THREE.SphereGeometry(random(0.018, 0.040), 6, 6);
        let color;
        if (i % 4 === 0) color = 0x38b8ff;
        else if (i % 4 === 1) color = 0x814cff;
        else if (i % 4 === 2) color = 0xff38d8;
        else color = 0xff6338;

        const material = new THREE.MeshBasicMaterial({ color });
        const dot = new THREE.Mesh(geometry, material);
        dot.userData = {
            orbit: i % 4,
            angle: Math.random() * Math.PI * 2,
            speed: random(0.15, 0.50),
            radius: random(2.72, 3.20)
        };
        orbitGroup.add(dot);
        energyDots.push(dot);
    }
}
createEnergyDots();

const coreGeometry = new THREE.SphereGeometry(0.95, 32, 32);
const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0x3525aa, transparent: true, opacity: 0.08,
    blending: THREE.AdditiveBlending, depthWrite: false
});
const core = new THREE.Mesh(coreGeometry, coreMaterial);
jarvisGroup.add(core);

function createBackgroundStars() {
    const count = 750;
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const radius = random(8, 20);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(random(-1, 1));
        const idx = i * 3;
        positions[idx]     = Math.sin(phi) * Math.cos(theta) * radius;
        positions[idx + 1] = Math.cos(phi) * radius;
        positions[idx + 2] = Math.sin(phi) * Math.sin(theta) * radius;
        colors[idx]     = random(0.05, 0.20);
        colors[idx + 1] = random(0.08, 0.30);
        colors[idx + 2] = random(0.25, 0.65);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color",    new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 0.012, transparent: true, opacity: 0.35,
        depthWrite: false, vertexColors: true
    });

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);
    return stars;
}
const backgroundStars = createBackgroundStars();

function updateSurface(speakingAmount) {
    const attr = surface.geometry.attributes.position;
    const positions = attr.array;
    const seeds = surface.geometry.attributes.seed.array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const idx = i * 3;
        const oldX = positions[idx], oldY = positions[idx + 1], oldZ = positions[idx + 2];
        const distance = Math.sqrt(oldX * oldX + oldY * oldY + oldZ * oldZ);
        if (distance === 0) continue;

        const normalizedY = oldY / distance;
        const theta = Math.atan2(oldZ, oldX);
        const phi = Math.acos(clamp(normalizedY, -1, 1));

        let radius = organicRadius(theta, phi, time, speakingAmount);
        const travelingWave = Math.sin(theta * 7 + phi * 4 - time * 2.2 + seeds[i] * 0.002);
        radius += travelingWave * (0.045 + speakingAmount * 0.18);
        radius += Math.sin(time * 3.5 + seeds[i]) * (0.004 + speakingAmount * 0.025);
        radius += speakingAmount * Math.sin(time * 3 + seeds[i] * 0.001) * 0.10;

        const ring = Math.sin(phi);
        positions[idx]     = Math.cos(theta) * ring * radius;
        positions[idx + 1] = Math.cos(phi) * radius;
        positions[idx + 2] = Math.sin(theta) * ring * radius;
    }
    attr.needsUpdate = true;
}

function updateLines(speakingAmount) {
    let lineIndex = 0;
    lineGroup.children.forEach(line => {
        if (lineIndex < LATITUDE_LINES) {
            const row = line.userData.row;
            const normalized = -0.88 + (row / (LATITUDE_LINES - 1)) * 1.76;
            const positions = line.geometry.attributes.position.array;
            const segments = 150;
            for (let i = 0; i <= segments; i++) {
                const idx = i * 3;
                const theta = (i / segments) * Math.PI * 2;
                const phi = Math.acos(normalized);
                let radius = organicRadius(theta, phi, time, speakingAmount);
                radius += Math.sin(theta * 5 + time * 2.0 + row) * (0.035 + speakingAmount * 0.12);
                const ring = Math.sqrt(1 - normalized * normalized);
                positions[idx]     = Math.cos(theta) * ring * radius;
                positions[idx + 1] = normalized * radius;
                positions[idx + 2] = Math.sin(theta) * ring * radius;
            }
            line.geometry.attributes.position.needsUpdate = true;
            line.material.opacity = 0.13 + speakingAmount * 0.24;
            lineIndex++;
        } else {
            const column = line.userData.column;
            const positions = line.geometry.attributes.position.array;
            const segments = 100;
            for (let i = 0; i <= segments; i++) {
                const idx = i * 3;
                const phi = (i / segments) * Math.PI;
                const theta = (column / LONGITUDE_LINES) * Math.PI * 2;
                let radius = organicRadius(theta, phi, time, speakingAmount);
                const wave = Math.sin(phi * 8 + time * 1.8 + column) * (0.025 + speakingAmount * 0.10);
                radius += wave;
                const ring = Math.sin(phi);
                positions[idx]     = Math.cos(theta) * ring * radius;
                positions[idx + 1] = Math.cos(phi) * radius;
                positions[idx + 2] = Math.sin(theta) * ring * radius;
            }
            line.geometry.attributes.position.needsUpdate = true;
            line.material.opacity = 0.10 + speakingAmount * 0.20;
        }
    });
}

function updateOuterParticles(speakingAmount) {
    const positions = outerParticles.geometry.attributes.position.array;
    for (let i = 0; i < OUTER_PARTICLES; i++) {
        const idx = i * 3;
        const x = positions[idx], y = positions[idx + 1], z = positions[idx + 2];
        const distance = Math.sqrt(x * x + y * y + z * z);
        if (distance === 0) continue;
        const nx = x / distance, ny = y / distance, nz = z / distance;
        const movement = Math.sin(time * 1.8 + i * 0.31) * (0.012 + speakingAmount * 0.10);
        const expansion = speakingAmount * (0.18 + Math.sin(time * 3 + i) * 0.12);
        const newDistance = distance + movement + expansion;
        positions[idx]     = nx * newDistance;
        positions[idx + 1] = ny * newDistance;
        positions[idx + 2] = nz * newDistance;
    }
    outerParticles.geometry.attributes.position.needsUpdate = true;
}

function updateEnergyDots(speakingAmount) {
    energyDots.forEach(dot => {
        const data = dot.userData;
        data.angle += (data.speed * 0.008) * (1 + speakingAmount * 5);
        const radius = data.radius + speakingAmount * 0.20;
        let x = Math.cos(data.angle) * radius;
        let y = Math.sin(data.angle) * radius * 0.25;
        let z = Math.sin(data.angle) * radius;
        if (data.orbit === 1) { y = Math.sin(data.angle) * radius; z = Math.cos(data.angle) * radius * 0.25; }
        if (data.orbit === 2) { x = Math.cos(data.angle) * radius * 0.25; y = Math.sin(data.angle) * radius; z = Math.cos(data.angle) * radius; }
        if (data.orbit === 3) { x = Math.cos(data.angle) * radius; y = Math.sin(data.angle) * radius * 0.55; z = Math.sin(data.angle) * radius; }
        dot.position.set(x, y, z);
        dot.scale.setScalar(0.8 + speakingAmount * 2.2);
    });
}

function updateOrbits(speakingAmount) {
    orbitGroup.rotation.y += 0.0012 + speakingAmount * 0.009;
    orbitGroup.rotation.x += 0.0004 + speakingAmount * 0.003;
    orbitGroup.rotation.z += 0.00025 + speakingAmount * 0.002;
    [orbit1, orbit2, orbit3, orbit4].forEach(o => {
        o.material.opacity = o.material.userDataBaseOpacity + speakingAmount * 0.22;
    });
}

function updateMainRotation(speakingAmount) {
    jarvisGroup.rotation.y += 0.0009 + speakingAmount * 0.008;
    jarvisGroup.rotation.x = Math.sin(time * 0.22) * 0.055;
    jarvisGroup.rotation.z = Math.sin(time * 0.17) * 0.025;
    const breathing = 1 + Math.sin(time * 1.2) * 0.012 +
        speakingAmount * (0.045 + Math.sin(time * 4) * 0.025);
    jarvisGroup.scale.setScalar(breathing);
}

function updateGlow(speakingAmount) {
    if (bloomPass) {
        bloomPass.strength = 1.8 + speakingAmount * 3.0;
        bloomPass.radius = 0.82 + speakingAmount * 0.25;
    }
    core.scale.setScalar(1 + speakingAmount * (0.8 + Math.sin(time * 4) * 0.25));
    core.material.opacity = 0.06 + speakingAmount * 0.16;
}

function updateBackground(speakingAmount) {
    backgroundStars.rotation.y += 0.00005 + speakingAmount * 0.00015;
    backgroundStars.rotation.x += 0.00001;
}

function animate() {
    requestAnimationFrame(animate);
    voiceLevel += (targetVoiceLevel - voiceLevel) * 0.10;

    let speakingAmount;
    if (speaking) {
        speakingAmount = Math.max(voiceLevel, 0.25 + Math.sin(time * 5) * 0.08);
    } else speakingAmount = 0;

    time += 0.008 + speakingAmount * 0.018;

    updateSurface(speakingAmount);
    updateLines(speakingAmount);
    updateOuterParticles(speakingAmount);
    updateEnergyDots(speakingAmount);
    updateOrbits(speakingAmount);
    updateMainRotation(speakingAmount);
    updateGlow(speakingAmount);
    updateBackground(speakingAmount);

    if (composer) composer.render();
    else renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    if (bloomPass) bloomPass.resolution.set(window.innerWidth, window.innerHeight);
    fitOrbToScreen();
});

window.JARVIS = {
    startSpeaking() { speaking = true; },
    stopSpeaking() { speaking = false; targetVoiceLevel = 0; },
    setVoiceLevel(level) { targetVoiceLevel = clamp(level, 0, 1); },
    isSpeaking() { return speaking; }
};
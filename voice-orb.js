import * as THREE from 'three';

// ============================================
// JARVIS VOICE ORB — 3D PARTICLE SPHERE
// ============================================
const canvas = document.getElementById('voice-orb-canvas');
if (!canvas) {
    console.warn('voice-orb-canvas not found');
} else {
    const orbScene = new THREE.Scene();
    const orbCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    orbCamera.position.set(0, 0, 6);

    const orbRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true
    });
    orbRenderer.setSize(300, 300, false);
    orbRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    orbRenderer.setClearColor(0x000000, 0);

    // ============================================
    // COLOR STATE (borrowed from upload page JS)
    // ============================================
    const ORB_COLORS = {
        idle:     { top: 0x00c8ff, mid: 0x8040ff, bottom: 0xff00aa }, // Default cyan/purple/pink
        success:  { top: 0x00ff88, mid: 0x00cc66, bottom: 0x008844 }, // Green (like upload success)
        error:    { top: 0xff0055, mid: 0xcc0044, bottom: 0x880030 }  // Pink/red (like upload error)
    };

    let currentColorSet = { ...ORB_COLORS.idle };
    let targetColorSet = { ...ORB_COLORS.idle };

    // ============================================
    // PARTICLE SPHERE
    // ============================================
    const particleCount = 3000;
    const radius = 2.0;

    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colorTop = new THREE.Color(currentColorSet.top);
    const colorMid = new THREE.Color(currentColorSet.mid);
    const colorBottom = new THREE.Color(currentColorSet.bottom);

    for (let i = 0; i < particleCount; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / particleCount);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        const t = (y + radius) / (2 * radius);
        let col;
        if (t > 0.5) {
            col = colorMid.clone().lerp(colorTop, (t - 0.5) * 2);
        } else {
            col = colorBottom.clone().lerp(colorMid, t * 2);
        }
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });

    const particleSphere = new THREE.Points(particleGeometry, particleMaterial);
    orbScene.add(particleSphere);

    // ============================================
    // INNER CORE
    // ============================================
    const coreCount = 1500;
    const coreRadius = 1.2;
    const corePositions = new Float32Array(coreCount * 3);
    const coreColors = new Float32Array(coreCount * 3);

    for (let i = 0; i < coreCount; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / coreCount);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;

        const x = coreRadius * Math.sin(phi) * Math.cos(theta);
        const y = coreRadius * Math.cos(phi);
        const z = coreRadius * Math.sin(phi) * Math.sin(theta);

        corePositions[i * 3] = x;
        corePositions[i * 3 + 1] = y;
        corePositions[i * 3 + 2] = z;

        const t = (y + coreRadius) / (2 * coreRadius);
        let col;
        if (t > 0.5) {
            col = colorMid.clone().lerp(colorTop, (t - 0.5) * 2);
        } else {
            col = colorBottom.clone().lerp(colorMid, t * 2);
        }
        coreColors[i * 3] = col.r;
        coreColors[i * 3 + 1] = col.g;
        coreColors[i * 3 + 2] = col.b;
    }

    const coreGeometry = new THREE.BufferGeometry();
    coreGeometry.setAttribute('position', new THREE.BufferAttribute(corePositions, 3));
    coreGeometry.setAttribute('color', new THREE.BufferAttribute(coreColors, 3));

    const coreMaterial = new THREE.PointsMaterial({
        size: 0.04,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });

    const coreSphere = new THREE.Points(coreGeometry, coreMaterial);
    orbScene.add(coreSphere);

    // ============================================
    // ORBIT RINGS
    // ============================================
    const ringGroup = new THREE.Group();

    function createOrbitRing(color, tilt) {
        const points = [];
        const segments = 128;
        const ringRadius = 2.4;

        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                Math.cos(angle) * ringRadius,
                0,
                Math.sin(angle) * ringRadius
            ));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending
        });

        const ring = new THREE.Line(geometry, material);
        ring.rotation.x = tilt.x;
        ring.rotation.y = tilt.y;
        ring.rotation.z = tilt.z;

        ringGroup.add(ring);
        return ring;
    }

    createOrbitRing(0x00c8ff, { x: Math.PI / 3, y: 0, z: 0 });
    createOrbitRing(0xff00aa, { x: -Math.PI / 4, y: Math.PI / 6, z: 0 });
    createOrbitRing(0x8040ff, { x: Math.PI / 2, y: 0, z: Math.PI / 5 });
    createOrbitRing(0x00c8ff, { x: Math.PI / 6, y: Math.PI / 4, z: Math.PI / 3 });

    orbScene.add(ringGroup);

    // ============================================
    // FLOATING DUST
    // ============================================
    const dustCount = 200;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
        dustPositions[i * 3] = (Math.random() - 0.5) * 10;
        dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 10;
        dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
        color: 0x00c8ff,
        size: 0.03,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    orbScene.add(dust);

    // ============================================
    // ANIMATION
    // ============================================
    let speakingIntensity = 0;
    let targetIntensity = 0;
    const clock = new THREE.Clock();

    function animateOrb() {
        requestAnimationFrame(animateOrb);
        const delta = clock.getDelta();
        const elapsed = clock.getElapsedTime();

        speakingIntensity += (targetIntensity - speakingIntensity) * 0.1;

        // Smooth color transitions
        for (const key of ['top', 'mid', 'bottom']) {
            currentColorSet[key] = lerpColor(currentColorSet[key], targetColorSet[key], 0.05);
        }

        // Update particle colors on the fly
        const cTop = new THREE.Color(currentColorSet.top);
        const cMid = new THREE.Color(currentColorSet.mid);
        const cBottom = new THREE.Color(currentColorSet.bottom);

        const colorAttr = particleGeometry.attributes.color;
        for (let i = 0; i < particleCount; i++) {
            const y = positions[i * 3 + 1];
            const t = (y + radius) / (2 * radius);
            let col;
            if (t > 0.5) col = cMid.clone().lerp(cTop, (t - 0.5) * 2);
            else col = cBottom.clone().lerp(cMid, t * 2);
            colorAttr.array[i * 3] = col.r;
            colorAttr.array[i * 3 + 1] = col.g;
            colorAttr.array[i * 3 + 2] = col.b;
        }
        colorAttr.needsUpdate = true;

        const coreColorAttr = coreGeometry.attributes.color;
        for (let i = 0; i < coreCount; i++) {
            const y = corePositions[i * 3 + 1];
            const t = (y + coreRadius) / (2 * coreRadius);
            let col;
            if (t > 0.5) col = cMid.clone().lerp(cTop, (t - 0.5) * 2);
            else col = cBottom.clone().lerp(cMid, t * 2);
            coreColorAttr.array[i * 3] = col.r;
            coreColorAttr.array[i * 3 + 1] = col.g;
            coreColorAttr.array[i * 3 + 2] = col.b;
        }
        coreColorAttr.needsUpdate = true;

        // Update ring colors
        ringGroup.children.forEach((ring, idx) => {
            ring.material.color.set(currentColorSet.top);
        });
        dustMaterial.color.set(currentColorSet.top);

        // Rotation
        particleSphere.rotation.y += delta * 0.75;
        particleSphere.rotation.x = Math.sin(elapsed * 0.8) * 0.15;

        coreSphere.rotation.y -= delta * 1.2;
        coreSphere.rotation.x = Math.cos(elapsed * 1.0) * 0.2;

        ringGroup.rotation.y += delta * 0.5;
        ringGroup.rotation.x = Math.sin(elapsed * 0.6) * 0.25;

        // Breathing
        const baseScale = 1.0 + speakingIntensity * 0.3;
        const breath = Math.sin(elapsed * 2) * 0.02;
        particleSphere.scale.setScalar(baseScale + breath);
        coreSphere.scale.setScalar(1.0 + speakingIntensity * 0.4 + breath);
        ringGroup.scale.setScalar(1.0 + speakingIntensity * 0.15);

        particleMaterial.opacity = 0.7 + speakingIntensity * 0.3;
        coreMaterial.opacity = 0.5 + speakingIntensity * 0.5;

        dust.rotation.y += delta * 0.15;

        orbRenderer.render(orbScene, orbCamera);
    }
    animateOrb();

    // ============================================
    // COLOR HELPERS
    // ============================================
    function lerpColor(a, b, t) {
        const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
        const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
        const rr = Math.round(ar + (br - ar) * t);
        const rg = Math.round(ag + (bg - ag) * t);
        const rb = Math.round(ab + (bb - ab) * t);
        return (rr << 16) | (rg << 8) | rb;
    }

    // ============================================
    // PUBLIC API — control color from other scripts
    // ============================================
    window.VoiceOrb = {
        setIdle: () => {
            targetColorSet = { ...ORB_COLORS.idle };
        },
        setSuccess: () => {
            targetColorSet = { ...ORB_COLORS.success };
            // Auto-revert to idle after 1.5 seconds
            clearTimeout(window.__orbRevertTimeout);
            window.__orbRevertTimeout = setTimeout(() => {
                targetColorSet = { ...ORB_COLORS.idle };
            }, 1500);
        },
        setError: () => {
            targetColorSet = { ...ORB_COLORS.error };
            clearTimeout(window.__orbRevertTimeout);
            window.__orbRevertTimeout = setTimeout(() => {
                targetColorSet = { ...ORB_COLORS.idle };
            }, 1500);
        },
        setColor: (top, mid, bottom) => {
            targetColorSet = { top, mid, bottom };
        }
    };

    // ============================================
    // SPEECH STATE DETECTION
    // ============================================
    const observer = new MutationObserver(() => {
        if (document.body.classList.contains('voice-speaking')) {
            targetIntensity = 1.0;
        } else {
            targetIntensity = 0.0;
        }
    });

    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
    });

    console.log('✨ Voice orb particle system initialized');
}
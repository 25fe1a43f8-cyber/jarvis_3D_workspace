// ============================================
// ✋ GESTURE CONTROL — camera only
// 🖐️ Orbit | ☝️ Pointer | 🤏 Click/Grab | ✌️ MOVE (car XYZ)
// 🖐️🖐️ Zoom | 🤘 Split | 🖐️+🤏 Reset
// ============================================

const CONFIG = {
    MIN_CONFIDENCE: 0.6,
    HAND_LOST_TIMEOUT: 500,
    DETECT_INTERVAL: 16,
    PINCH_THRESHOLD: 0.10,
    POINTER_SEND_INTERVAL: 16,
    AIR_CLICK_MAX_DURATION: 300,
    AIR_CLICK_COOLDOWN: 400,
    ZOOM_SENS: 800,
    ZOOM_DEADZONE: 0.005,
    HOLD_TIME: 500,

    // ✌️ MOVE (car translation)
    AXIS_SENS_X: 25.0,
    AXIS_SENS_Y: 25.0,
    AXIS_SENS_Z: 20.0,
    AXIS_DEADZONE: 0.008,
    AXIS_SMOOTH: 0.15,
    AXIS_HOLD_TIME: 80,
    AXIS_Z_RANGE: 0.15,

    DIRECTION_LOG_THRESHOLD: 0.03,
};

const state = {
    lastHandSeen: 0,
    handPresent: false,
    gestureLog: [],
    handCount: 0,
    zoomOriginDist: 0,
    zoomActive: false,
    twoHandGesture: null,
    twoHandStartTime: 0,
    twoHandFired: false,
    axisActive: false,
    axisOriginX: 0.5, axisOriginY: 0.5, axisOriginZ: 0.5,
    axisLastSentX: 0.5, axisLastSentY: 0.5, axisLastSentZ: 0.5,
    axisHoldTimer: 0,
    axisSmoothedX: 0.5, axisSmoothedY: 0.5, axisSmoothedZ: 0.5,
};

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const currentGestureEl = document.getElementById('current-gesture');
const currentConfidenceEl = document.getElementById('current-confidence');
const fingersUpEl = document.getElementById('fingers-up');
const palmXEl = document.getElementById('palm-x');
const palmYEl = document.getElementById('palm-y');
const lastActionEl = document.getElementById('last-action');
const gestureLogEl = document.getElementById('gesture-log');
const noCamEl = document.getElementById('no-cam');
const axisXEl = document.getElementById('axis-x');
const axisYEl = document.getElementById('axis-y');
const axisZEl = document.getElementById('axis-z');

const canvasCtx = overlay.getContext('2d');

// ============================================
// ORBIT MODE
// ============================================
const ORBIT = {
    active: false, originX: 0, originY: 0,
    SENS_X: 7.0, SENS_Y: 5.0,
    DEADZONE: 0.002, SMOOTH: 0.20, HOLD_TIME: 150,
};
let smoothedOrbitX = 0.5, smoothedOrbitY = 0.5;
let orbitHoldTimer = 0;

// ============================================
// PINCH STATE
// ============================================
let previousGestureName = null;
let wasPinchActive = false;
let pinchStartTime = 0;
let pinchStartedFromPoint = false;
let airClickFired = false;
let grabActive = false;
let lastAirClickTime = 0;

// ============================================
// POINTER SMOOTHING
// ============================================
let smoothedPointerX = 0.5, smoothedPointerY = 0.5;
const POINTER_SMOOTH = 0.35;
let lastPointerSendTime = 0;

// ---- Channels ----
let cmdChannel = null;
try { cmdChannel = new BroadcastChannel('bmw_m4_gestures'); } catch (e) {}
let pointerChannel = null;
try { pointerChannel = new BroadcastChannel('bmw_m4_pointer'); } catch (e) {}

function sendCommand(action, args = []) {
    const payload = { action, args, ts: Date.now() };
    if (cmdChannel) { try { cmdChannel.postMessage({ action, args }); } catch (e) {} }
    try { localStorage.setItem('__bmw_m4_gesture_cmd', JSON.stringify(payload)); } catch (e) {}
    if (!['__orbit', '__dolly', '__axis'].includes(action)) console.log(`📡 Sent: ${action}`, args);
}

function sendPointer(x, y, pinching = false, action = null) {
    const payload = { x, y, pinching, action, ts: Date.now() };
    if (pointerChannel) { try { pointerChannel.postMessage(payload); } catch (e) {} }
    try { localStorage.setItem('__bmw_m4_pointer', JSON.stringify(payload)); } catch (e) {}
    if (action) console.log(`👆 Pointer: ${action}`, x.toFixed(2), y.toFixed(2));
}

function sendOrbitCommand(yawOffset, pitchOffset) {
    const payload = { action: '__orbit', args: [yawOffset, pitchOffset], ts: Date.now() };
    if (cmdChannel) { try { cmdChannel.postMessage(payload); } catch (e) {} }
    try { localStorage.setItem('__bmw_m4_gesture_cmd', JSON.stringify(payload)); } catch (e) {}
}

function sendDollyCommand(delta) {
    const payload = { action: '__dolly', args: [delta], ts: Date.now() };
    if (cmdChannel) { try { cmdChannel.postMessage(payload); } catch (e) {} }
    try { localStorage.setItem('__bmw_m4_gesture_cmd', JSON.stringify(payload)); } catch (e) {}
}

function sendAxisCommand(dx, dy, dz) {
    const payload = { action: '__axis', args: [dx, dy, dz], ts: Date.now() };
    if (cmdChannel) { try { cmdChannel.postMessage(payload); } catch (e) {} }
    try { localStorage.setItem('__bmw_m4_gesture_cmd', JSON.stringify(payload)); } catch (e) {}
}

// ============================================
// FINGER STATE + GESTURE DETECTION
// ============================================
function getFingerState(landmarks) {
    const indexUp  = landmarks[8].y  < landmarks[6].y;
    const middleUp = landmarks[12].y < landmarks[10].y;
    const ringUp   = landmarks[16].y < landmarks[14].y;
    const pinkyUp  = landmarks[20].y < landmarks[18].y;
    const wrist = landmarks[0];
    const dTip = Math.hypot(landmarks[4].x - wrist.x, landmarks[4].y - wrist.y);
    const dIP  = Math.hypot(landmarks[3].x - wrist.x, landmarks[3].y - wrist.y);
    const thumbUp = dTip > dIP * 1.15;
    return {
        index: indexUp, middle: middleUp, ring: ringUp, pinky: pinkyUp, thumb: thumbUp,
        totalUp: [thumbUp, indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length,
    };
}

function getGesture(landmarks) {
    const f = getFingerState(landmarks);
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const isPinching = pinchDist < CONFIG.PINCH_THRESHOLD;

    let result;
    if (f.index && f.middle && !f.ring && !f.pinky) result = { name: 'PEACE', emoji: '✌️', isPinching };
    else if (f.index && !f.middle && !f.ring && f.pinky) result = { name: 'ROCK', emoji: '🤘', isPinching };
    else if (f.index && f.middle && f.ring && f.pinky && f.thumb) result = { name: 'OPEN_PALM', emoji: '🖐️', isPinching };
    else if (!f.index && !f.middle && !f.ring && !f.pinky) result = { name: 'FIST', emoji: '✊', isPinching };
    else if (isPinching) result = { name: 'PINCH', emoji: '🤏', isPinching: true };
    else if (f.index && !f.middle && !f.ring && !f.pinky) result = { name: 'POINT', emoji: '☝️', isPinching: false };
    else result = { name: null, emoji: '·', isPinching: false };

    result._prev = previousGestureName;
    previousGestureName = result.name;
    return result;
}

// ============================================
// MODES
// ============================================

// 🖐️ ORBIT — guard against PEACE
function updateOrbitMode(landmarks, gestureName) {
    if (!landmarks) return;

    // ⛔ PEACE is reserved for car movement — never trigger orbit
    if (gestureName === 'PEACE') {
        if (ORBIT.active) {
            ORBIT.active = false;
            sendCommand('setOrbitMode', [false]);
            addLog('🖐️ Orbit OFF (peace)');
        }
        orbitHoldTimer = 0;
        return;
    }

    const palm = landmarks[9];
    smoothedOrbitX = smoothedOrbitX * ORBIT.SMOOTH + palm.x * (1 - ORBIT.SMOOTH);
    smoothedOrbitY = smoothedOrbitY * ORBIT.SMOOTH + palm.y * (1 - ORBIT.SMOOTH);

    const isPalm = gestureName === 'OPEN_PALM';
    const now = performance.now();

    if (isPalm && !ORBIT.active) {
        if (!orbitHoldTimer) orbitHoldTimer = now;
        if (now - orbitHoldTimer > ORBIT.HOLD_TIME) {
            ORBIT.active = true;
            ORBIT.originX = smoothedOrbitX;
            ORBIT.originY = smoothedOrbitY;
            sendCommand('setOrbitMode', [true]);
            addLog('🖐️ Orbit ON');
            orbitHoldTimer = 0;
        }
    } else if (!isPalm && ORBIT.active) {
        ORBIT.active = false;
        orbitHoldTimer = 0;
        sendCommand('setOrbitMode', [false]);
        addLog('🖐️ Orbit OFF');
    } else if (!isPalm) {
        orbitHoldTimer = 0;
    }

    if (!ORBIT.active) return;

    const dx = smoothedOrbitX - ORBIT.originX;
    const dy = smoothedOrbitY - ORBIT.originY;
    const deadzone = (v) => Math.abs(v) < ORBIT.DEADZONE ? 0 : v - Math.sign(v) * ORBIT.DEADZONE;
    const ddx = deadzone(dx), ddy = deadzone(dy);
    if (ddx === 0 && ddy === 0) return;

    sendOrbitCommand(-ddx * ORBIT.SENS_X, ddy * ORBIT.SENS_Y);
    ORBIT.originX = smoothedOrbitX;
    ORBIT.originY = smoothedOrbitY;
}

// ☝️ POINTER
function updatePointerMode(landmarks, gestureName) {
    if (!landmarks) return;
    if (gestureName !== 'POINT') return;
    const tip = landmarks[8];
    smoothedPointerX = smoothedPointerX * (1 - POINTER_SMOOTH) + tip.x * POINTER_SMOOTH;
    smoothedPointerY = smoothedPointerY * (1 - POINTER_SMOOTH) + tip.y * POINTER_SMOOTH;
    const now = performance.now();
    if (now - lastPointerSendTime < CONFIG.POINTER_SEND_INTERVAL) return;
    lastPointerSendTime = now;
    sendPointer(smoothedPointerX, smoothedPointerY, false);
}

// 🤏 PINCH
function updatePinchAction(landmarks, gesture) {
    if (!landmarks) return;
    const now = performance.now();
    const isPinching = gesture.name === 'PINCH';
    const tip = landmarks[8];
    if (isPinching) {
        if (!wasPinchActive) {
            pinchStartTime = now;
            pinchStartedFromPoint = (gesture._prev === 'POINT');
            airClickFired = false;
            grabActive = false;
            wasPinchActive = true;
        }
        const pinchDuration = now - pinchStartTime;
        const canAirClick = pinchStartedFromPoint && (now - lastAirClickTime > CONFIG.AIR_CLICK_COOLDOWN);
        if (canAirClick && !airClickFired && pinchDuration < CONFIG.AIR_CLICK_MAX_DURATION) {
            sendPointer(tip.x, tip.y, true, 'airClick');
            addLog('☝️ Air click');
            airClickFired = true;
            lastAirClickTime = now;
            return;
        }
        if (airClickFired) { sendPointer(tip.x, tip.y, true); return; }
        if (!grabActive) {
            grabActive = true;
            sendPointer(tip.x, tip.y, true, 'pinchStart');
            addLog('🤏 Grab START');
        } else {
            sendPointer(tip.x, tip.y, true, 'pinchMove');
        }
    } else if (wasPinchActive) {
        if (grabActive) {
            sendPointer(tip.x, tip.y, false, 'pinchEnd');
            addLog('🤏 Grab END');
        }
        wasPinchActive = false;
        grabActive = false;
        airClickFired = false;
        pinchStartedFromPoint = false;
    }
}

// ============================================
// ✌️ AXIS MODE — locked origin, hand-still = car-still
// ============================================
function estimateAxisZ(landmarks) {
    const wrist = landmarks[0];
    const indexMCP = landmarks[5];
    const handSize = Math.hypot(wrist.x - indexMCP.x, wrist.y - indexMCP.y, wrist.z - indexMCP.z);
    const sizeNorm = Math.min(1, Math.max(0, (handSize - 0.06) / CONFIG.AXIS_Z_RANGE));
    const zDiff = landmarks[9].z - wrist.z;
    const zNorm = Math.min(1, Math.max(0, 0.5 - zDiff * 2));
    return Math.min(0.95, Math.max(0.05, sizeNorm * 0.7 + zNorm * 0.3));
}

function buildDirectionalTag(dx, dy, dz) {
    const T = CONFIG.DIRECTION_LOG_THRESHOLD;
    const tags = [];
    if (dz >  T) tags.push('🤜 FORWARD');
    if (dz < -T) tags.push('🤛 BACK');
    if (dx < -T) tags.push('👈 LEFT');
    if (dx >  T) tags.push('👉 RIGHT');
    if (dy >  T) tags.push('⬆️ UP');
    if (dy < -T) tags.push('⬇️ DOWN');
    return tags;
}

function updateAxisMode(landmarks, gestureName, now) {
    if (!landmarks || gestureName !== 'PEACE') {
        state.axisActive = false;
        state.axisHoldTimer = 0;
        return;
    }

    const palm = landmarks[9];
    const rawX = palm.x, rawY = palm.y, rawZ = estimateAxisZ(landmarks);

    // Smooth raw values
    state.axisSmoothedX = state.axisSmoothedX * CONFIG.AXIS_SMOOTH + rawX * (1 - CONFIG.AXIS_SMOOTH);
    state.axisSmoothedY = state.axisSmoothedY * CONFIG.AXIS_SMOOTH + rawY * (1 - CONFIG.AXIS_SMOOTH);
    state.axisSmoothedZ = state.axisSmoothedZ * CONFIG.AXIS_SMOOTH + rawZ * (1 - CONFIG.AXIS_SMOOTH);

    // Lock origin on activation — never changes while PEACE is held
    if (!state.axisActive) {
        if (!state.axisHoldTimer) state.axisHoldTimer = now;
        if (now - state.axisHoldTimer > CONFIG.AXIS_HOLD_TIME) {
            state.axisActive = true;
            state.axisOriginX = state.axisSmoothedX;
            state.axisOriginY = state.axisSmoothedY;
            state.axisOriginZ = state.axisSmoothedZ;
            state.axisLastSentX = state.axisSmoothedX;
            state.axisLastSentY = state.axisSmoothedY;
            state.axisLastSentZ = state.axisSmoothedZ;
            sendCommand('setAxisMode', [true]);
            addLog('✌️ MOVE mode ON');
            state.axisHoldTimer = 0;
        }
        return;
    }

    // Compare CURRENT hand to the LOCKED origin
    const dx = state.axisSmoothedX - state.axisOriginX;
    const dy = state.axisSmoothedY - state.axisOriginY;
    const dz = state.axisSmoothedZ - state.axisOriginZ;

    // Deadzone — ignore hand jitter so car stays still when hand is still
    const deadzone = (v) => Math.abs(v) < CONFIG.AXIS_DEADZONE ? 0 : v - Math.sign(v) * CONFIG.AXIS_DEADZONE;
    const ddx = deadzone(dx);
    const ddy = deadzone(dy);
    const ddz = deadzone(dz);

    // Rate-limit: only send when hand has moved since the last sent frame
    const deltaSinceLastX = Math.abs(state.axisSmoothedX - state.axisLastSentX);
    const deltaSinceLastY = Math.abs(state.axisSmoothedY - state.axisLastSentY);
    const deltaSinceLastZ = Math.abs(state.axisSmoothedZ - state.axisLastSentZ);
    if (deltaSinceLastX < 0.003 && deltaSinceLastY < 0.003 && deltaSinceLastZ < 0.003) return;

    // Hand inside deadzone of origin → car stays still
    if (ddx === 0 && ddy === 0 && ddz === 0) {
        state.axisLastSentX = state.axisSmoothedX;
        state.axisLastSentY = state.axisSmoothedY;
        state.axisLastSentZ = state.axisSmoothedZ;
        return;
    }

    // Map hand delta → car delta
    // hand right   → car right (+X)
    // hand up      → car up    (+Y)
    // hand closer  → car forward (+Z)
    const axisDX =  ddx * CONFIG.AXIS_SENS_X;
    const axisDY = -ddy * CONFIG.AXIS_SENS_Y;
    const axisDZ =  ddz * CONFIG.AXIS_SENS_Z;

    sendAxisCommand(axisDX, axisDY, axisDZ);

    const dirs = buildDirectionalTag(axisDX, axisDY, axisDZ);
    if (dirs.length) addLog(`✌️ ${dirs.join(' ')}`);

    state.axisLastSentX = state.axisSmoothedX;
    state.axisLastSentY = state.axisSmoothedY;
    state.axisLastSentZ = state.axisSmoothedZ;

    if (axisXEl) axisXEl.textContent = state.axisSmoothedX.toFixed(3);
    if (axisYEl) axisYEl.textContent = state.axisSmoothedY.toFixed(3);
    if (axisZEl) axisZEl.textContent = state.axisSmoothedZ.toFixed(3);
}

// ============================================
// TWO-HAND HANDLERS
// ============================================
function handleTwoHands(lm1, lm2, now) {
    const g1 = getGesture(lm1);
    const g2 = getGesture(lm2);
    const palm1 = lm1[9], palm2 = lm2[9];
    const dist = Math.hypot(palm1.x - palm2.x, palm1.y - palm2.y);
    const names = [g1.name, g2.name].sort().join('+');

    if (names === 'OPEN_PALM+PINCH') {
        if (state.twoHandGesture !== 'reset') {
            state.twoHandGesture = 'reset';
            state.twoHandStartTime = now;
            state.twoHandFired = false;
        }
        const held = now - state.twoHandStartTime;
        const progress = Math.min(1, held / CONFIG.HOLD_TIME);
        if (!state.twoHandFired && progress >= 1) {
            sendCommand('unsplitAll', []);
            sendCommand('restoreAllVisibility', []);
            sendCommand('closeAllPanels', []);
            addLog('🖐️🤏 RESET');
            state.twoHandFired = true;
        }
        currentGestureEl.textContent = '🖐️🤏 RESET';
        setStatus(`🖐️🤏 RESET ${state.twoHandFired ? '✓' : Math.round(progress*100)+'%'}`, 'loading');
        return;
    }
    if (g1.name === 'ROCK' && g2.name === 'ROCK') {
        if (state.twoHandGesture !== 'split') {
            state.twoHandGesture = 'split';
            state.twoHandStartTime = now;
            state.twoHandFired = false;
        }
        const held = now - state.twoHandStartTime;
        const progress = Math.min(1, held / CONFIG.HOLD_TIME);
        if (!state.twoHandFired && progress >= 1) {
            sendCommand('splitAll', []);
            addLog('🤘🤘 SPLIT');
            state.twoHandFired = true;
        }
        currentGestureEl.textContent = '🤘🤘 SPLIT';
        setStatus(`🤘🤘 SPLIT ${state.twoHandFired ? '✓' : Math.round(progress*100)+'%'}`, 'loading');
        return;
    }
    if (g1.name === 'OPEN_PALM' && g2.name === 'OPEN_PALM') {
        if (!state.zoomActive) {
            state.zoomActive = true;
            state.zoomOriginDist = dist;
            sendCommand('setZoomMode', [true]);
            addLog('🖐️🖐️ Zoom ON');
        }
        const delta = state.zoomOriginDist - dist;
        if (Math.abs(delta) > CONFIG.ZOOM_DEADZONE) {
            sendDollyCommand(delta * CONFIG.ZOOM_SENS);
            state.zoomOriginDist = dist;
        }
        currentGestureEl.textContent = '🖐️🖐️ ZOOM';
        setStatus('🖐️🖐️ Zoom', 'ok');
        return;
    }
    if (state.twoHandGesture) { state.twoHandGesture = null; state.twoHandFired = false; }
    if (state.zoomActive) {
        state.zoomActive = false;
        sendCommand('setZoomMode', [false]);
    }
    currentGestureEl.textContent = `${g1.emoji}+${g2.emoji}`;
    setStatus('🤚🤚 Two hands', 'ok');
}

// ============================================
// DRAWING
// ============================================
function drawFingertipMarker(ctx, landmarks, isPinching) {
    if (!landmarks || !landmarks[8]) return;
    const tip = landmarks[8];
    const x = tip.x * ctx.canvas.width;
    const y = tip.y * ctx.canvas.height;
    const color = isPinching ? '#00ff88' : '#00e5ff';
    const size = isPinching ? 20 : 12;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.stroke();
    if (isPinching) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }
    ctx.restore();
}

function drawModeIndicator(ctx) {
    const y = 30;
    const modes = [];
    if (ORBIT.active) modes.push({ label: '🖐️ ORBIT', color: '#00e5ff' });
    if (state.axisActive) modes.push({ label: '✌️ MOVE', color: '#00ff88' });
    if (grabActive) modes.push({ label: '🤏 GRAB', color: '#00ff88' });
    if (state.zoomActive) modes.push({ label: '🖐️🖐️ ZOOM', color: '#00ff88' });
    if (state.twoHandGesture === 'split') modes.push({ label: '🤘 SPLIT', color: '#ff3b30' });
    if (state.twoHandGesture === 'reset') modes.push({ label: '🖐️🤏 RESET', color: '#ffcc00' });
    if (!modes.length) return;
    let x = 20;
    ctx.save();
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    for (const m of modes) {
        const textW = ctx.measureText(m.label).width;
        const padX = 12;
        const boxW = textW + padX * 2;
        const boxH = 26;
        ctx.beginPath();
        ctx.roundRect(x, y - boxH / 2, boxW, boxH, 13);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x, y - boxH / 2, boxW, boxH, 13);
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = m.color;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.fillStyle = m.color;
        ctx.fillText(m.label, x + padX, y);
        x += boxW + 8;
    }
    ctx.restore();
}

// ============================================
// LOGGING
// ============================================
function addLog(text) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    state.gestureLog.unshift({ time, text });
    if (state.gestureLog.length > 30) state.gestureLog.pop();
    gestureLogEl.innerHTML = state.gestureLog
        .map(e => `<div class="log-entry"><span class="log-time">${e.time}</span><span class="log-text">${e.text}</span></div>`)
        .join('');
    if (lastActionEl) lastActionEl.textContent = text;
}
function setStatus(text, cls) { statusText.textContent = text; statusDot.className = 'status-dot ' + cls; }

// ============================================
// MEDIAPIPE HANDS
// ============================================
const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: CONFIG.MIN_CONFIDENCE,
    minTrackingConfidence: 0.5
});
hands.onResults(onResults);

let lastFrameTime = 0;

function onResults(results) {
    const now = performance.now();
    if (now - lastFrameTime < CONFIG.DETECT_INTERVAL) return;
    lastFrameTime = now;

    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, overlay.width, overlay.height);
    canvasCtx.drawImage(results.image, 0, 0, overlay.width, overlay.height);
    canvasCtx.restore();

    const hands_lm = results.multiHandLandmarks || [];
    state.handCount = hands_lm.length;

    if (hands_lm.length === 0) {
        sendPointer(0, 0, false, 'hide');
        if (ORBIT.active) {
            ORBIT.active = false;
            sendCommand('setOrbitMode', [false]);
            addLog('🖐️ Orbit OFF');
        }
        if (state.axisActive) {
            state.axisActive = false;
            sendCommand('setAxisMode', [false]);
            addLog('✌️ MOVE OFF');
        }
        if (state.zoomActive) {
            state.zoomActive = false;
            sendCommand('setZoomMode', [false]);
        }
        orbitHoldTimer = 0;
        state.twoHandGesture = null;
        state.twoHandFired = false;
        state.axisHoldTimer = 0;
        wasPinchActive = false;
        grabActive = false;
        airClickFired = false;
        pinchStartedFromPoint = false;
        previousGestureName = null;

        if (state.handPresent && (now - state.lastHandSeen > CONFIG.HAND_LOST_TIMEOUT)) {
            state.handPresent = false;
            currentGestureEl.textContent = '—';
            currentConfidenceEl.textContent = 'conf —';
            fingersUpEl.textContent = '0';
            setStatus('Camera on — show hand', 'ok');
        }
        return;
    }

    state.handPresent = true;
    state.lastHandSeen = now;

    hands_lm.forEach(lm => {
        if (window.drawConnectors && window.HAND_CONNECTIONS) {
            drawConnectors(canvasCtx, lm, HAND_CONNECTIONS, { color: '#00e5ff', lineWidth: 3 });
            drawLandmarks(canvasCtx, lm, { color: '#ffffff', fillColor: '#00e5ff', lineWidth: 1, radius: 4 });
        }
    });

    if (hands_lm.length === 2) {
        if (ORBIT.active) { ORBIT.active = false; sendCommand('setOrbitMode', [false]); }
        if (state.axisActive) { state.axisActive = false; sendCommand('setAxisMode', [false]); }
        wasPinchActive = false; grabActive = false; airClickFired = false; pinchStartedFromPoint = false;
        handleTwoHands(hands_lm[0], hands_lm[1], now);
        drawModeIndicator(canvasCtx);
        return;
    }

    if (state.zoomActive) { state.zoomActive = false; sendCommand('setZoomMode', [false]); }
    state.twoHandGesture = null;
    state.twoHandFired = false;

    const landmarks = hands_lm[0];
    const confidence = results.multiHandedness?.[0]?.score || 0;
    const gesture = getGesture(landmarks);
    const isPinching = gesture.isPinching;

    drawFingertipMarker(canvasCtx, landmarks, isPinching);

    updateAxisMode(landmarks, gesture.name, now);
    updateOrbitMode(landmarks, gesture.name);
    updatePointerMode(landmarks, gesture.name);
    updatePinchAction(landmarks, gesture);

    drawModeIndicator(canvasCtx);

    const f = getFingerState(landmarks);
    fingersUpEl.textContent = f.totalUp;
    palmXEl.textContent = landmarks[9].x.toFixed(2);
    palmYEl.textContent = landmarks[9].y.toFixed(2);
    currentGestureEl.textContent = gesture.name ? `${gesture.emoji} ${gesture.name}` : '·';
    currentConfidenceEl.textContent = `conf ${(confidence * 100).toFixed(0)}%`;

    if (gesture.name === 'OPEN_PALM') setStatus('🖐️ Orbit', 'ok');
    else if (gesture.name === 'POINT') setStatus('☝️ Pointer', 'ok');
    else if (gesture.name === 'PINCH') setStatus('🤏 Click / Grab', 'ok');
    else if (gesture.name === 'PEACE') setStatus('✌️ MOVE: 🤜FWD 🤛BACK 👈LEFT 👉RIGHT', 'ok');
    else if (gesture.name === 'ROCK') setStatus('🤘 Rock', 'ok');
    else if (gesture.name === 'FIST') setStatus('✊ Fist', 'ok');
    else setStatus('Listening…', 'ok');
}

// ============================================
// CAMERA (video only, no mic)
// ============================================
async function setupCamera() {
    setStatus('Starting camera…', 'loading');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        const mpCamera = new Camera(video, {
            onFrame: async () => { await hands.send({ image: video }); },
            width: 640, height: 480
        });
        mpCamera.start();

        setStatus('Camera on — show hand', 'ok');
        addLog('✅ Ready — gestures only');
    } catch (err) {
        console.error('Camera error:', err);
        noCamEl.classList.remove('hidden');
        setStatus('❌ Camera failed', 'err');
        addLog('❌ Camera denied');
    }
}

window.addEventListener('load', () => {
    addLog('📡 Waiting for main app…');
    setTimeout(() => { addLog('✅ Ready — show hand'); }, 800);
    setupCamera();
});

console.log('✋ Gesture module loaded (camera only)');
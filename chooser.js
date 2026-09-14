/* ============================================================
   CHOOSER — Holographic HUD + voice selection + mini 3D preview
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const hasSpeech = typeof SpeechRecognition === 'function';

    const dropZone       = document.getElementById('dropZone');
    const browseBtn      = document.getElementById('browseBtn');
    const fileInput      = document.getElementById('fileInput');
    const statusText     = document.getElementById('statusText');
    const statusDot      = document.querySelector('.status-dot');
    const scanLine       = document.querySelector('.scan-line');
    const uploadTextMain = document.getElementById('uploadTextMain');
    const uploadTextSub  = document.getElementById('uploadTextSub');
    const voiceStatusEl  = document.getElementById('voice-status');
    const btnDefault     = document.getElementById('btn-default');
    const btnConfirm     = document.getElementById('btn-confirm');
    const logBox         = document.getElementById('chooser-log');
    const previewImage   = document.getElementById('preview-image');

    let selectedModel  = 'bmw';
    let pendingConfirm = false;
    let recognition    = null;
    let micEnabled     = false;
    let speaking       = false;
    let processing     = false;
    let restartTimer   = null;

    // ============================================
    // MINI 3D PREVIEW
    // ============================================
    const miniCanvasEl = document.getElementById('mini-canvas');
    let miniRenderer, miniScene, miniCamera, miniCar, miniLoaded = false;

    function initMini3D() {
        if (!miniCanvasEl || miniLoaded) return;
        miniLoaded = true;

        const width  = miniCanvasEl.clientWidth  || 320;
        const height = miniCanvasEl.clientHeight || 260;

        miniScene = new THREE.Scene();
        miniScene.background = null;

        miniCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        miniCamera.position.set(3, 1.6, 4);
        miniCamera.lookAt(0, 0.5, 0);

        miniRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        miniRenderer.setSize(width, height, false);
        miniRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        miniRenderer.setClearColor(0x000000, 0);
        miniRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        miniRenderer.toneMappingExposure = 1.3;
        miniCanvasEl.appendChild(miniRenderer.domElement);

        // Lights
        miniScene.add(new THREE.AmbientLight(0xffffff, 1.6));
        const dir = new THREE.DirectionalLight(0x00f3ff, 2.0);
        dir.position.set(4, 6, 4);
        miniScene.add(dir);
        const fill = new THREE.DirectionalLight(0x00f3ff, 1.0);
        fill.position.set(-4, 3, -4);
        miniScene.add(fill);

        // Rotating cylinder "pedestal"
        const ringGeo = new THREE.TorusGeometry(1.5, 0.01, 8, 96);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.7 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.05;
        miniScene.add(ring);

        // Load BMW model
        const loader = new GLTFLoader();
        loader.load(
            './assets/bmw_m4.glb',
            (gltf) => {
                miniCar = gltf.scene;
                // Auto-fit
                const box = new THREE.Box3().setFromObject(miniCar);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 3.0 / maxDim;
                miniCar.scale.setScalar(scale);
                const box2 = new THREE.Box3().setFromObject(miniCar);
                const center = box2.getCenter(new THREE.Vector3());
                miniCar.position.sub(center);
                miniCar.position.y += 0.25;
                miniScene.add(miniCar);
                log('✓ 3D preview loaded');
            },
            undefined,
            (err) => {
                console.warn('Mini 3D preview failed to load:', err);
                log('⚠ 3D preview unavailable');
            }
        );

        // Animate the mini preview
        function animateMini() {
            requestAnimationFrame(animateMini);
            if (miniCar) {
                miniCar.rotation.y += 0.008;
            }
            if (miniRenderer && miniScene && miniCamera) {
                miniRenderer.render(miniScene, miniCamera);
            }
        }
        animateMini();

        // Resize observer so it fits any panel size
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
                if (!miniRenderer) return;
                const w = miniCanvasEl.clientWidth;
                const h = miniCanvasEl.clientHeight;
                if (w < 10 || h < 10) return;
                miniCamera.aspect = w / h;
                miniCamera.updateProjectionMatrix();
                miniRenderer.setSize(w, h, false);
            });
            ro.observe(miniCanvasEl);
        }
    }

    // ---------- Logging ----------
    function log(msg, strong = false) {
        const line = document.createElement('div');
        line.className = 'log-line';
        if (strong) line.innerHTML = `<strong>${msg}</strong>`;
        else line.textContent = msg;
        logBox.appendChild(line);
        logBox.scrollTop = logBox.scrollHeight;
        while (logBox.children.length > 20) logBox.removeChild(logBox.firstChild);
    }

    function setVoiceStatus(text, cls) {
        if (!voiceStatusEl) return;
        voiceStatusEl.textContent = text;
        voiceStatusEl.className = 'status-pill' + (cls ? ' ' + cls : '');
    }

    // ---------- Selection ----------
    function selectBmw() {
        selectedModel = 'bmw';
        uploadTextMain.textContent = 'MODEL READY';
        uploadTextSub.textContent = 'BMW M4 · 21.48 MB';
        btnConfirm.disabled = false;
        pendingConfirm = true;
        if (previewImage) previewImage.src = './assets/bmw_m4.jpg';
        log('→ Selected: BMW M4 (default)', true);
    }

    function selectCustom(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        const validExtensions = ['glb', 'gltf', 'obj', 'fbx', 'png', 'jpg', 'jpeg'];
        if (!validExtensions.includes(ext)) {
            statusText.textContent = 'SYS.ERROR: INVALID FORMAT';
            statusText.style.color = '#ff0055';
            statusDot.style.backgroundColor = '#ff0055';
            statusDot.style.boxShadow = '0 0 10px #ff0055';
            return;
        }
        selectedModel = 'custom';
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        uploadTextMain.textContent = 'MODEL READY';
        uploadTextSub.textContent = `${file.name} · ${sizeMB} MB`;
        btnConfirm.disabled = false;
        pendingConfirm = true;

        // If image, update the preview image
        if (['png', 'jpg', 'jpeg'].includes(ext) && previewImage) {
            const url = URL.createObjectURL(file);
            previewImage.src = url;
        }

        statusText.textContent = `SYS.LOADED: ${file.name}`;
        statusText.style.color = '#00ff88';
        statusDot.style.backgroundColor = '#00ff88';
        statusDot.style.boxShadow = '0 0 10px #00ff88';
        if (scanLine) {
            scanLine.style.background = 'linear-gradient(90deg, transparent, #00ff88, transparent)';
            scanLine.style.boxShadow = '0 0 15px #00ff88';
        }
        log('→ Selected: ' + file.name, true);
    }

    function confirmSelection() {
        if (!pendingConfirm) { log('⚠ Nothing to confirm yet.'); return; }
        log('✅ Confirmed. Loading 3D model…', true);
        try { localStorage.setItem('__jarvis_selected_model', selectedModel); } catch (e) {}
        setTimeout(() => { window.location.href = 'car.html'; }, 1400);
    }

    // ---------- UI wiring ----------
    browseBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectCustom(e.target.files[0]);
            speak('Custom model selected. Say confirm to proceed.');
        }
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
    });
    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, () => dropZone.classList.add('dragover'));
    });
    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, () => dropZone.classList.remove('dragover'));
    });
    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            selectCustom(files[0]);
            speak('Custom model selected. Say confirm to proceed.');
        }
    });

    btnDefault.addEventListener('click', () => {
        selectBmw();
        speak('BMW M4 selected. Say confirm to proceed.');
    });

    btnConfirm.addEventListener('click', confirmSelection);

    // ---------- Speech synthesis ----------
    function chooseVoice() {
        const voices = window.speechSynthesis?.getVoices?.() || [];
        const english = voices.filter(v => /^en(-|_)/i.test(v.lang));
        const preferred = [/Daniel/i, /Google UK English Male/i, /Microsoft George/i, /Alex/i, /Google US English/i];
        for (const p of preferred) {
            const f = english.find(v => p.test(v.name));
            if (f) return f;
        }
        return english[0] || voices[0] || null;
    }

    function speak(text, onEnd) {
        const clean = String(text || '').trim();
        if (!clean || !micEnabled) { if (typeof onEnd === 'function') onEnd(); return; }
        stopRecognition();
        window.speechSynthesis.cancel();
        speaking = true;
        setVoiceStatus('SPEAKING', 'speaking');

        const utt = new SpeechSynthesisUtterance(clean);
        utt.lang = 'en-US';
        utt.rate = 0.94;
        utt.pitch = 0.82;
        const v = chooseVoice();
        if (v) utt.voice = v;

        const done = () => {
            speaking = false;
            if (typeof onEnd === 'function') onEnd();
            if (micEnabled) { setVoiceStatus('LISTENING'); scheduleRestart(); }
            else setVoiceStatus('ONLINE');
        };
        utt.onend = done;
        utt.onerror = done;
        window.speechSynthesis.speak(utt);
    }

    // ---------- Speech recognition ----------
    function stopRecognition() { if (recognition) try { recognition.stop(); } catch (_) {} }

    function startRecognition() {
        if (!micEnabled || speaking || processing || !recognition) return;
        clearTimeout(restartTimer);
        try { recognition.start(); } catch (err) {
            if (err?.name !== 'InvalidStateError') scheduleRestart();
        }
    }
    function scheduleRestart() {
        if (!micEnabled || speaking || processing || !recognition) return;
        clearTimeout(restartTimer);
        restartTimer = setTimeout(startRecognition, 250);
    }

    function handleTranscript(raw) {
        const text = String(raw || '').toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text || !micEnabled) return;
        log('🎤 Heard: ' + text);

        if (!pendingConfirm && (
            text.includes('choose bmw') || text.includes('select bmw') ||
            text.includes('use bmw')    || text.includes('bmw')        ||
            text.includes('default')    || text.includes('bmw m4')
        )) {
            selectBmw();
            speak('You chose the BMW M4. Please say confirm to proceed.');
            return;
        }

        if (pendingConfirm && (
            text === 'confirm'      || text.includes('confirm') ||
            text.includes('yes')    || text.includes('proceed') ||
            text.includes('go ahead') || text.includes('continue') ||
            text.includes('load it') || text.includes('load the model')
        )) {
            processing = true;
            speak('Loading the 3D model. Please wait.', () => confirmSelection());
            return;
        }

        if (text.includes('cancel') || text.includes('go back') || text === 'back') {
            speak('Cancelling. Returning to the assistant.', () => {
                window.location.href = 'jarvis.html';
            });
            return;
        }

        if (text.includes('upload') || text.includes('browse') || text.includes('choose file') || text.includes('my file')) {
            speak('Please click the browse button to select your file.');
            fileInput.click();
            return;
        }

        if (pendingConfirm) speak('Say confirm to proceed, or cancel to go back.');
        else speak('Say choose BMW to use the default model, or upload your own.');
    }

    function createRecognition() {
        if (!hasSpeech) return null;
        const r = new SpeechRecognition();
        r.continuous = true;
        r.interimResults = false;
        r.lang = 'en-US';
        r.maxAlternatives = 1;
        r.onstart = () => { if (micEnabled && !speaking && !processing) setVoiceStatus('LISTENING'); };
        r.onresult = e => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const res = e.results[i];
                if (!res.isFinal) continue;
                const t = res[0]?.transcript?.trim();
                if (t) handleTranscript(t);
            }
        };
        r.onerror = e => {
            console.warn('SpeechRecognition error:', e.error);
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                micEnabled = false;
                setVoiceStatus('MIC DENIED');
            }
        };
        r.onend = () => { if (micEnabled && !speaking && !processing) scheduleRestart(); };
        return r;
    }

    // ---------- Boot ----------
    async function boot() {
        selectBmw();
        initMini3D();

        if (!hasSpeech) {
            setVoiceStatus('NO VOICE');
            log('SpeechRecognition not available — use Chrome or Edge.');
            return;
        }
        recognition = createRecognition();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
            micEnabled = true;
            setVoiceStatus('LISTENING');
            startRecognition();
            setTimeout(() => {
                speak('The BMW M4 is selected by default. Say choose BMW to use it, or upload your own.');
            }, 400);
        } catch (err) {
            console.error('Mic permission error:', err);
            setVoiceStatus('MIC BLOCKED');
            log('Microphone permission denied. Reload and allow.');
        }
    }

    window.addEventListener('beforeunload', () => {
        micEnabled = false;
        stopRecognition();
        window.speechSynthesis.cancel();
        if (miniRenderer) miniRenderer.dispose();
    });

    boot();
})();
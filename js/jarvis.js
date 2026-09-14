/* ============================================================
   JARVIS — greeting + routing to chooser
============================================================ */
(() => {
    const orbCanvas = document.getElementById("orbCanvas");

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
    const hasSpeech = typeof SpeechRecognition === "function";

    let micEnabled = false;
    let speaking = false;
    let processing = false;
    let recognition = null;
    let restartTimer = null;

    function normalize(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/[.,!?;:]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function setOrbMode(mode) {
        document.body.dataset.jarvisMode = mode;
        if (!window.JARVIS) return;
        if (mode === "speaking") { JARVIS.startSpeaking(); JARVIS.setVoiceLevel(0.75); }
        else if (mode === "off") { JARVIS.stopSpeaking(); }
        else if (mode === "listening") { JARVIS.setVoiceLevel(0.18); }
        else if (mode === "processing") { JARVIS.setVoiceLevel(0.35); }
    }

    function stopRecognition() { if (recognition) try { recognition.stop(); } catch (_) {} }

    function startRecognition() {
        if (!micEnabled || speaking || processing || !recognition) return;
        clearTimeout(restartTimer);
        try { recognition.start(); } catch (err) {
            if (err?.name !== "InvalidStateError") scheduleRestart();
        }
    }
    function scheduleRestart() {
        if (!micEnabled || speaking || processing || !recognition) return;
        clearTimeout(restartTimer);
        restartTimer = setTimeout(startRecognition, 250);
    }

    function chooseVoice() {
        const voices = window.speechSynthesis?.getVoices?.() || [];
        const english = voices.filter(v => /^en(-|_)/i.test(v.lang));
        const preferred = [/Daniel/i, /Google UK English Male/i, /Microsoft George/i, /Microsoft Ryan/i, /Alex/i, /Google US English/i];
        for (const p of preferred) {
            const f = english.find(v => p.test(v.name));
            if (f) return f;
        }
        return english[0] || voices[0] || null;
    }

    function speak(text, onEnd) {
        const clean = String(text || "").trim();
        if (!clean || !micEnabled) { if (typeof onEnd === "function") onEnd(); return; }
        stopRecognition();
        window.speechSynthesis.cancel();
        speaking = true;
        setOrbMode("speaking");
        const utt = new SpeechSynthesisUtterance(clean);
        utt.lang = "en-US"; utt.rate = 0.94; utt.pitch = 0.82;
        const v = chooseVoice();
        if (v) utt.voice = v;
        const done = () => {
            speaking = false;
            if (typeof onEnd === "function") onEnd();
            if (micEnabled) { setOrbMode("listening"); scheduleRestart(); }
            else setOrbMode("off");
        };
        utt.onend = done;
        utt.onerror = done;
        window.speechSynthesis.speak(utt);
    }

    function goToChooser() {
        stopRecognition();
        micEnabled = false;
        window.location.href = "chooser.html";
    }

    function handleTranscript(raw) {
        const text = normalize(raw);
        if (!text || !micEnabled) return;
        console.log("🎤 Heard:", text);

        const uploadPhrases = [
            "upload image", "upload a image", "upload an image",
            "upload photo", "upload picture", "upload a picture",
            "choose image", "select image", "pick image",
            "load image", "change image", "add image",
            "upload", "choose car", "select car"
        ];
        if (uploadPhrases.some(p => text.includes(p))) {
            processing = true;
            speak("Opening the model chooser.", () => goToChooser());
            return;
        }

        speak("Just say upload image to choose your car.");
    }

    function createRecognition() {
        if (!hasSpeech) return null;
        const r = new SpeechRecognition();
        r.continuous = true;
        r.interimResults = false;
        r.lang = "en-US";
        r.maxAlternatives = 1;
        r.onstart = () => { if (micEnabled && !speaking && !processing) setOrbMode("listening"); };
        r.onresult = e => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const res = e.results[i];
                if (!res.isFinal) continue;
                const t = res[0]?.transcript?.trim();
                if (t) handleTranscript(t);
            }
        };
        r.onerror = e => {
            console.warn("SpeechRecognition:", e.error);
            if (e.error === "not-allowed" || e.error === "service-not-allowed") {
                micEnabled = false; setOrbMode("off");
            }
        };
        r.onend = () => { if (micEnabled && !speaking && !processing) scheduleRestart(); };
        return r;
    }

    function stopVoice() {
        micEnabled = false; processing = false;
        clearTimeout(restartTimer);
        stopRecognition();
        window.speechSynthesis.cancel();
        speaking = false;
        setOrbMode("off");
    }

    async function startVoice() {
        if (!hasSpeech) { alert("Voice recognition needs Chrome or Edge."); return; }
        micEnabled = true;
        if (!recognition) recognition = createRecognition();
        setOrbMode("listening");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
            startRecognition();
            setTimeout(() => {
                if (micEnabled && !speaking) speak("Hello. How can I help you today?");
            }, 400);
        } catch (err) {
            console.error("Mic permission:", err);
            stopVoice();
            alert("Microphone access required. Please allow it and click the orb again.");
        }
    }

    function toggleVoice() { if (micEnabled) stopVoice(); else startVoice(); }

    if (orbCanvas) orbCanvas.addEventListener("click", toggleVoice);
    window.addEventListener("beforeunload", stopVoice);

    window.JARVISVoice = {
        start: startVoice, stop: stopVoice, toggle: toggleVoice,
        isEnabled: () => micEnabled
    };

    setOrbMode("off");
    console.log("JARVIS Page 1 ready — click the orb to begin.");
})();
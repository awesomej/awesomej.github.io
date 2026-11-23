import { createClient, AnamEvent } from "https://esm.sh/@anam-ai/js-sdk@latest";

const NEXT_KEYS = [32, 34, 39, 78];
const DEFAULT_SOUNDS = {
    outlook: new URL("./audio/outlook.mp3", import.meta.url).href,
    slack: new URL("./audio/slack.mp3", import.meta.url).href
};

Reveal.initialize({
    controls: true,
    progress: true,
    hash: true,
    history: true,
    center: false,
    width: 1200,
    height: 700,
    slideNumber: "c/t",
    transition: "slide",
    backgroundTransition: "slide",
    keyboard: Object.fromEntries(NEXT_KEYS.map(key => [key, handleNext])),
    plugins: [RevealNotes]
});

let activeClient = null;
let activeSlide = null;
let reactionTimers = [];
let audioContext = null;
let ambienceWanted = false;
let overviewWheelDelta = 0;
let overviewWheelTimer = null;

const ambienceFrame = document.getElementById("starbucks-ambience-player");

function sendAmbienceCommand(func, args = []) {
    ambienceFrame?.contentWindow?.postMessage(JSON.stringify({
        event: "command",
        func,
        args
    }), "https://www.youtube.com");
}

function startStarbucksAmbience(restart = false) {
    ambienceWanted = true;
    if (restart) sendAmbienceCommand("seekTo", [0, true]);
    sendAmbienceCommand("setVolume", [38]);
    sendAmbienceCommand("unMute");
    sendAmbienceCommand("playVideo");
}

function startStarbucksAmbienceWithRetry(restart = false) {
    startStarbucksAmbience(restart);
    [250, 700].forEach(delay => setTimeout(() => {
        if (ambienceWanted) startStarbucksAmbience(false);
    }, delay));
}

function stopStarbucksAmbience() {
    ambienceWanted = false;
    sendAmbienceCommand("mute");
    sendAmbienceCommand("pauseVideo");
}

function syncStarbucksAmbience(slide, restart = false) {
    if (slide?.matches("[data-starbucks-ambience]")) startStarbucksAmbienceWithRetry(restart);
    else stopStarbucksAmbience();
}

ambienceFrame?.addEventListener("load", () => {
    if (ambienceWanted) startStarbucksAmbienceWithRetry(false);
});

document.addEventListener("pointerdown", () => {
    if (Reveal.getCurrentSlide()?.matches("[data-starbucks-ambience]")) startStarbucksAmbience(false);
}, true);

document.addEventListener("keydown", () => {
    if (Reveal.getCurrentSlide()?.matches("[data-starbucks-ambience]")) startStarbucksAmbience(false);
}, true);

function elementsFor(slide) {
    return {
        start: slide.querySelector("[data-start-call]"),
        end: slide.querySelector("[data-end-call]"),
        status: slide.querySelector("[data-call-status]"),
        error: slide.querySelector("[data-call-error]"),
        stage: slide.querySelector(".avatar-stage"),
        video: slide.querySelector("video")
    };
}

function setStatus(slide, label, state = "idle") {
    const status = slide?.querySelector("[data-call-status]");
    if (!status) return;
    status.textContent = label;
    status.dataset.state = state;
}

function goToSlide(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const indices = Reveal.getIndices(target);
    Reveal.slide(indices.h, indices.v);
}

async function stopCall() {
    const client = activeClient;
    const slide = activeSlide;
    activeClient = null;
    activeSlide = null;
    if (client) {
        try { await client.stopStreaming(); } catch (error) { console.warn("Anam session cleanup failed", error); }
    }
    if (slide) {
        const ui = elementsFor(slide);
        ui.stage.classList.remove("is-live");
        ui.video.srcObject = null;
        ui.start.disabled = false;
        ui.end.disabled = true;
        setStatus(slide, "Meeting ended");
    }
}

async function endCallAndReturn(slide) {
    const destination = slide.dataset.callReturn;
    await stopCall();
    if (destination) goToSlide(destination);
}

async function startCall(slide) {
    const ui = elementsFor(slide);
    const persona = slide.dataset.persona;
    const endpoint = window.OBSERVABILITY_DEMO_CONFIG?.anamSessionEndpoint;

    ui.error.textContent = "";
    if (!endpoint) {
        ui.error.textContent = "Anam is not configured yet. Add the deployed token endpoint to config.js.";
        setStatus(slide, "Setup required", "error");
        return;
    }

    await stopCall();
    activeSlide = slide;
    ui.start.disabled = true;
    setStatus(slide, "Connecting…", "connecting");

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ persona })
        });
        const payload = await response.json();
        if (!response.ok || !payload.sessionToken) throw new Error(payload.error || "The session token request failed.");

        const client = createClient(payload.sessionToken);
        activeClient = client;
        client.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => setStatus(slide, "Connected", "connected"));
        client.addListener(AnamEvent.SESSION_READY, () => {
            setStatus(slide, "Live / microphone on", "connected");
            ui.stage.classList.add("is-live");
            ui.end.disabled = false;
        });
        client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
            if (activeSlide === slide) stopCall();
        });
        await client.streamToVideoElement(ui.video.id);
    } catch (error) {
        ui.error.textContent = error instanceof Error ? error.message : "Unable to start the Anam meeting.";
        setStatus(slide, "Connection failed", "error");
        ui.start.disabled = false;
        activeClient = null;
        activeSlide = null;
    }
}

function handleNext(event) {
    event?.preventDefault?.();

    if (Reveal.isOverview()) {
        Reveal.right();
        return false;
    }

    const slide = Reveal.getCurrentSlide();

    if (slide?.matches("[data-persona]")) {
        if (activeSlide === slide) endCallAndReturn(slide);
        else startCall(slide);
        return false;
    }

    if (slide?.id === "choose-call") {
        goToSlide("evidence");
        return false;
    }

    Reveal.next();
    return false;
}

function handleOverviewWheel(event) {
    if (!Reveal.isOverview()) return;

    event.preventDefault();
    overviewWheelDelta += Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;

    clearTimeout(overviewWheelTimer);
    overviewWheelTimer = setTimeout(() => { overviewWheelDelta = 0; }, 180);

    if (Math.abs(overviewWheelDelta) < 40) return;
    overviewWheelDelta > 0 ? Reveal.right() : Reveal.left();
    overviewWheelDelta = 0;
}

function handleOverviewSelection(event) {
    if (!Reveal.isOverview()) return;

    const slide = event.target.closest?.(".reveal .slides section:not(.stack)");
    if (!slide) return;

    const indices = Reveal.getIndices(slide);
    event.preventDefault();
    event.stopPropagation();
    Reveal.toggleOverview(false);
    Reveal.slide(indices.h, indices.v);
}

function syntheticPing(kind) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();
    audioContext.resume();
    const now = audioContext.currentTime;
    const notes = kind === "slack" ? [659, 880] : [740, 988];
    notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = kind === "slack" ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, now + index * .09);
        gain.gain.exponentialRampToValueAtTime(.12, now + index * .09 + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, now + index * .09 + .16);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(now + index * .09);
        oscillator.stop(now + index * .09 + .17);
    });
}

function playNotification(kind) {
    const source = window.OBSERVABILITY_DEMO_CONFIG?.notificationSounds?.[kind] || DEFAULT_SOUNDS[kind];
    const sound = new Audio(source);
    sound.volume = .65;
    sound.play().catch(() => syntheticPing(kind));
}

function clearReaction() {
    reactionTimers.forEach(clearTimeout);
    reactionTimers = [];
    document.querySelectorAll("[data-sequence].is-visible").forEach(element => element.classList.remove("is-visible"));
}

function runReaction(slide) {
    clearReaction();
    const timing = slide.dataset.reaction === "calendar"
        ? [180, 460, 810, 1190, 1510, 1870, 2260, 2710, 3090, 3540, 4020, 4580, 5150]
        : [300, 730, 1180, 1780, 2180, 2840, 3510, 4230, 4860, 5740, 6620, 7440, 8490, 9700];

    slide.querySelectorAll("[data-sequence]").forEach(element => {
        const sequence = Number(element.dataset.sequence);
        const timer = setTimeout(() => {
            element.classList.add("is-visible");
            const kind = element.classList.contains("outlook-toast") || element.classList.contains("incoming-event") ? "outlook" : "slack";
            playNotification(kind);
        }, timing[sequence - 1] ?? sequence * 600);
        reactionTimers.push(timer);
    });
}

document.querySelectorAll("[data-persona]").forEach(slide => {
    slide.querySelector("[data-start-call]").addEventListener("click", () => startCall(slide));
    slide.querySelector("[data-end-call]").addEventListener("click", () => endCallAndReturn(slide));
});

document.querySelectorAll("[data-choice]").forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();
        goToSlide(link.dataset.choice);
    });
});

document.addEventListener("keydown", event => {
    if (Reveal.getCurrentSlide()?.id !== "choose-call") return;
    const choices = { "1": "product-call", "2": "commercial-call", "3": "engineering-call" };
    if (choices[event.key]) {
        event.preventDefault();
        goToSlide(choices[event.key]);
    }
}, true);

document.addEventListener("wheel", handleOverviewWheel, { passive: false });
document.addEventListener("click", handleOverviewSelection, true);

Reveal.on("overviewhidden", () => {
    overviewWheelDelta = 0;
    clearTimeout(overviewWheelTimer);
});

Reveal.on("ready", () => {
    syncStarbucksAmbience(Reveal.getCurrentSlide(), false);
    document.querySelector(".navigate-right")?.addEventListener("click", event => {
        const slide = Reveal.getCurrentSlide();
        if (!slide?.matches("[data-persona], #choose-call")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        handleNext(event);
    }, true);
});

Reveal.on("slidechanged", event => {
    clearReaction();
    syncStarbucksAmbience(event.currentSlide, true);
    if (activeSlide && event.currentSlide !== activeSlide) stopCall();
    if (event.currentSlide.matches("[data-reaction]")) runReaction(event.currentSlide);
});

window.addEventListener("beforeunload", () => {
    if (activeClient) activeClient.stopStreaming();
});

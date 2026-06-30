import {
  DEFAULT_CONFIG,
  createPauseDetector,
  missingBrowserFeatures,
} from "./app-core.js";

const apiStatus = document.querySelector("#api-status");
const testOpenAIButton = document.querySelector("#test-openai-button");
const captureButton = document.querySelector("#capture-button");
const stopButton = document.querySelector("#stop-button");
const translateButton = document.querySelector("#translate-button");
const copyButton = document.querySelector("#copy-button");
const exportButton = document.querySelector("#export-button");
const sourceText = document.querySelector("#source-text");
const translatedText = document.querySelector("#translated-text");
const chunkSeconds = document.querySelector("#chunk-seconds");
const meterBar = document.querySelector("#meter-bar");
const captureState = document.querySelector("#capture-state");
const phraseCount = document.querySelector("#phrase-count");
const lastLatency = document.querySelector("#last-latency");
const log = document.querySelector("#log");

let config = { ...DEFAULT_CONFIG };
let stream = null;
let recorder = null;
let audioContext = null;
let meterFrame = null;
let transcribeQueue = Promise.resolve();
let pauseDetector = null;
let completedPhraseCount = 0;

function setLog(message) {
  log.textContent = message;
}

function setRuntimeState(state) {
  captureState.textContent = state;
}

function recordPhraseLatency(startedAt) {
  completedPhraseCount += 1;
  phraseCount.textContent = String(completedPhraseCount);
  lastLatency.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
}

async function readConfig() {
  try {
    const response = await fetch("/api/config");
    if (response.ok) {
      config = await response.json();
    }
  } catch {
    setLog("Using built-in browser defaults.");
  }

  chunkSeconds.value = config.chunk_seconds;
  apiStatus.textContent = `OpenAI API ready (${config.transcription_model}, ${config.translation_model})`;
  checkBrowserSupport();
}

function checkBrowserSupport() {
  const missing = missingBrowserFeatures(window, navigator);
  if (missing.length === 0) {
    setRuntimeState("Ready");
    return true;
  }

  setRuntimeState("Unsupported");
  setLog(`This browser is missing: ${missing.join(", ")}.`);
  captureButton.disabled = true;
  return false;
}

function appendSource(text) {
  const cleanText = text.trim();
  if (!cleanText) return;

  sourceText.value = `${sourceText.value}${sourceText.value ? "\n" : ""}${cleanText}`;
  sourceText.scrollTop = sourceText.scrollHeight;
}

function appendTranslation(text) {
  const cleanText = text.trim();
  if (!cleanText) return;

  translatedText.value = `${translatedText.value}${translatedText.value ? "\n" : ""}${cleanText}`;
  translatedText.scrollTop = translatedText.scrollHeight;
}

function setCaptureState(isCapturing) {
  captureButton.disabled = isCapturing;
  stopButton.disabled = !isCapturing;
}

async function transcribeAudioBlob(blob) {
  const form = new FormData();
  form.append("file", blob, "recording.webm");
  form.append("language", "indonesian");

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return (data.text || "").trim();
}

async function transcribeBlob(blob, startedAt = performance.now()) {
  setRuntimeState("Transcribing");
  const transcript = await transcribeAudioBlob(blob);
  if (!transcript) {
    setRuntimeState("Listening");
    return;
  }

  appendSource(transcript);
  setRuntimeState("Translating");
  const translation = await translateText(transcript);
  appendTranslation(translation);
  recordPhraseLatency(startedAt);
  setRuntimeState("Listening");
}

function startMeter(activeStream) {
  audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(activeStream);
  const levels = new Uint8Array(analyser.frequencyBinCount);
  source.connect(analyser);

  function tick() {
    analyser.getByteFrequencyData(levels);
    const peak = Math.max(...levels);
    const level = peak / 255;
    meterBar.style.width = `${Math.min(100, Math.round(level * 100))}%`;

    maybeFlushOnPause(level);
    meterFrame = requestAnimationFrame(tick);
  }

  tick();
}

function maybeFlushOnPause(level) {
  if (!pauseDetector) return;
  pauseDetector.sample(level);
}

function supportedMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startCapture() {
  if (!checkBrowserSupport()) return;

  stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("No audio track was shared. Choose a tab/window and enable audio sharing.");
  }

  startMeter(new MediaStream(audioTracks));
  const mimeType = supportedMimeType();
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return;

    const startedAt = performance.now();
    transcribeQueue = transcribeQueue
      .then(() => transcribeBlob(event.data, startedAt))
      .catch((error) => {
        setRuntimeState("Error");
        setLog(error.message);
      });
  };
  pauseDetector = createPauseDetector({
    maxChunkMs: Number(chunkSeconds.value) * 1000,
    onFlush: () => {
      if (!recorder || recorder.state !== "recording") return;
      recorder.requestData();
      setRuntimeState("Processing");
      setLog("Processing phrase...");
    },
  });
  recorder.start();
  setCaptureState(true);
  setRuntimeState("Listening");
  setLog("Listening for speech pauses...");
}

function stopCapture() {
  if (recorder && recorder.state !== "inactive") recorder.stop();
  if (meterFrame) cancelAnimationFrame(meterFrame);
  if (audioContext) audioContext.close();
  if (stream) stream.getTracks().forEach((track) => track.stop());
  if (pauseDetector) pauseDetector.reset();
  meterBar.style.width = "0%";
  setCaptureState(false);
  setRuntimeState("Idle");
  setLog("Capture stopped.");
}

async function translateText(text) {
  setLog("Translating...");

  const response = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source_text: text }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  setLog("Translation updated.");
  return data.translation || "";
}

async function translateCurrentText() {
  const text = sourceText.value.trim();
  if (!text) {
    setLog("Add Indonesian text first.");
    return;
  }

  translateButton.disabled = true;
  try {
    translatedText.value = await translateText(text);
    translatedText.scrollTop = translatedText.scrollHeight;
  } finally {
    translateButton.disabled = false;
  }
}

async function testServerConnection() {
  testOpenAIButton.disabled = true;
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source_text: "Tuhan itu baik." }),
    });

    if (response.ok) {
      setLog("Backend translation test passed.");
    } else {
      const message = await response.text();
      setLog(`Backend translation test failed: ${message}`);
    }
  } catch (error) {
    setLog(`Backend translation test failed: ${error.message}`);
  } finally {
    testOpenAIButton.disabled = false;
  }
}

function exportTranscript() {
  const body = [
    "FireTong transcript",
    "",
    "Indonesian",
    sourceText.value,
    "",
    "English",
    translatedText.value,
  ].join("\n");
  const blob = new Blob([body], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "firetong-transcript.txt";
  link.click();
  URL.revokeObjectURL(url);
  setLog("Exported transcript.");
}

captureButton.addEventListener("click", async () => {
  try {
    await startCapture();
  } catch (error) {
    setCaptureState(false);
    setLog(error.message);
  }
});

stopButton.addEventListener("click", stopCapture);
translateButton.addEventListener("click", translateCurrentText);
copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(translatedText.value);
  setLog("Copied translation.");
});
exportButton.addEventListener("click", exportTranscript);
testOpenAIButton.addEventListener("click", testServerConnection);

readConfig().catch((error) => setLog(error.message));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => {
    setLog("Service worker registration failed.");
  });
}

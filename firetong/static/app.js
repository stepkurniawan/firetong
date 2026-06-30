import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
import {
  DEFAULT_CONFIG,
  buildTranslationRequest,
  createPauseDetector,
  missingBrowserFeatures,
} from "./app-core.js";

const apiStatus = document.querySelector("#api-status");
const apiKeyInput = document.querySelector("#api-key");
const saveKeyButton = document.querySelector("#save-key-button");
const testOpenAIButton = document.querySelector("#test-openai-button");
const loadModelButton = document.querySelector("#load-model-button");
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
let transcriberPromise = null;
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

function savedApiKey() {
  return localStorage.getItem("firetong.openai_api_key") || "";
}

function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (key) {
    localStorage.setItem("firetong.openai_api_key", key);
    apiStatus.textContent = `Translation ready (${config.translation_model})`;
    setLog("API key saved in this browser.");
  } else {
    localStorage.removeItem("firetong.openai_api_key");
    apiStatus.textContent = "Add OpenAI key for translation";
    setLog("API key removed.");
  }
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
  apiKeyInput.value = savedApiKey();
  apiStatus.textContent = savedApiKey()
    ? `Translation ready (${config.translation_model})`
    : "Add OpenAI key for translation";
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
  loadModelButton.disabled = true;
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

async function getTranscriber() {
  if (!transcriberPromise) {
    setLog(`Loading ${config.transcription_model}. First load can take a minute.`);
    transcriberPromise = pipeline("automatic-speech-recognition", config.transcription_model);
  }

  return transcriberPromise;
}

async function warmUpTranscriber() {
  loadModelButton.disabled = true;
  try {
    await getTranscriber();
    setLog(`${config.transcription_model} is ready.`);
  } catch (error) {
    transcriberPromise = null;
    throw error;
  } finally {
    loadModelButton.disabled = false;
  }
}

async function decodeToMono16k(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const sourceContext = new AudioContext();
  const audioBuffer = await sourceContext.decodeAudioData(arrayBuffer);
  await sourceContext.close();

  const offlineContext = new OfflineAudioContext(
    1,
    Math.ceil(audioBuffer.duration * 16000),
    16000,
  );
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start(0);

  const rendered = await offlineContext.startRendering();
  return rendered.getChannelData(0);
}

async function transcribeBlob(blob, startedAt = performance.now()) {
  setRuntimeState("Transcribing");
  const transcriber = await getTranscriber();
  const audio = await decodeToMono16k(blob);
  if (audio.length < 1600) {
    setRuntimeState("Listening");
    return;
  }

  const result = await transcriber(audio, {
    language: "indonesian",
    task: "transcribe",
  });
  const transcript = Array.isArray(result) ? result.map((item) => item.text).join(" ") : result.text;
  const cleanTranscript = (transcript || "").trim();
  if (!cleanTranscript) {
    setRuntimeState("Listening");
    return;
  }

  appendSource(cleanTranscript);
  setRuntimeState("Translating");
  const translation = await translateText(cleanTranscript);
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

  try {
    await warmUpTranscriber();
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
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
  const apiKey = savedApiKey();
  if (!apiKey) {
    setLog("Add an OpenAI API key to translate.");
    return "";
  }

  setLog("Translating...");

  const request = buildTranslationRequest({ config, apiKey, text });
  const response = await fetch(request.url, request.options);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  setLog("Translation updated.");
  return data.choices?.[0]?.message?.content?.trim() || "";
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

async function testOpenAIConnection() {
  testOpenAIButton.disabled = true;
  try {
    const translation = await translateText("Tuhan itu baik.");
    if (translation) {
      setLog("OpenAI translation test passed.");
    }
  } catch (error) {
    setLog(`OpenAI translation test failed: ${error.message}`);
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

saveKeyButton.addEventListener("click", saveApiKey);
testOpenAIButton.addEventListener("click", testOpenAIConnection);
loadModelButton.addEventListener("click", async () => {
  try {
    await warmUpTranscriber();
  } catch (error) {
    setLog(error.message);
  }
});
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

readConfig().catch((error) => setLog(error.message));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => {
    setLog("Service worker registration failed.");
  });
}

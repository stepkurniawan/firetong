import {
  DEFAULT_CONFIG,
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
const meterBar = document.querySelector("#meter-bar");
const captureState = document.querySelector("#capture-state");
const phraseCount = document.querySelector("#phrase-count");
const lastLatency = document.querySelector("#last-latency");
const log = document.querySelector("#log");

let config = { ...DEFAULT_CONFIG };
let stream = null;
let peerConnection = null;
let realtimeChannel = null;
let audioContext = null;
let meterFrame = null;
let completedPhraseCount = 0;
let sourceFinalText = "";
let interimSegments = new Map();

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

  apiStatus.textContent = `OpenAI API ready (realtime transcription, ${config.translation_model})`;
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
  sourceFinalText = sourceText.value.trim();
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

function stopMeter() {
  if (meterFrame) cancelAnimationFrame(meterFrame);
  if (audioContext) audioContext.close();
  meterFrame = null;
  audioContext = null;
  meterBar.style.width = "0%";
}

async function fetchRealtimeToken() {
  const response = await fetch("/api/realtime/token");
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  if (!data.value) {
    throw new Error("Realtime token response did not include a client secret.");
  }
  return data.value;
}

function renderLiveSource() {
  const interimText = [...interimSegments.values()]
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n");
  sourceText.value = [sourceFinalText, interimText].filter(Boolean).join("\n");
  sourceText.scrollTop = sourceText.scrollHeight;
}

function upsertInterimSegment(itemId, delta) {
  const segment = interimSegments.get(itemId) || {
    text: "",
    startedAt: performance.now(),
  };
  segment.text = `${segment.text}${delta}`;
  interimSegments.set(itemId, segment);
  renderLiveSource();
}

async function finalizeInterimSegment(itemId, transcript) {
  const segment = interimSegments.get(itemId);
  const startedAt = segment?.startedAt || performance.now();
  const cleanTranscript = (transcript || segment?.text || "").trim();
  interimSegments.delete(itemId);

  if (!cleanTranscript) {
    renderLiveSource();
    return;
  }

  sourceFinalText = `${sourceFinalText}${sourceFinalText ? "\n" : ""}${cleanTranscript}`;
  renderLiveSource();
  recordPhraseLatency(startedAt);
  setRuntimeState("Translating");

  try {
    const translation = await translateText(cleanTranscript);
    appendTranslation(translation);
    if (peerConnection) setRuntimeState("Live");
  } catch (error) {
    setRuntimeState("Error");
    setLog(error.message);
  }
}

function handleRealtimeEvent(event) {
  if (event.type === "conversation.item.input_audio_transcription.delta") {
    upsertInterimSegment(event.item_id, event.delta || "");
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    finalizeInterimSegment(event.item_id, event.transcript || "");
  }

  if (event.type === "error") {
    setRuntimeState("Error");
    setLog(event.error?.message || "Realtime transcription failed.");
  }
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

    meterFrame = requestAnimationFrame(tick);
  }

  tick();
}

async function startRealtimeCapture(activeStream, audioTracks) {
  setRuntimeState("Connecting");
  setLog("Connecting live transcription...");

  const realtimeToken = await fetchRealtimeToken();
  const audioStream = new MediaStream(audioTracks);
  startMeter(audioStream);

  peerConnection = new RTCPeerConnection();
  realtimeChannel = peerConnection.createDataChannel("oai-events");
  realtimeChannel.addEventListener("open", () => {
    setRuntimeState("Live");
    setLog("Live transcription is running.");
  });
  realtimeChannel.addEventListener("message", (event) => {
    handleRealtimeEvent(JSON.parse(event.data));
  });
  realtimeChannel.addEventListener("error", () => {
    setRuntimeState("Error");
    setLog("Realtime transcription channel failed.");
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    if (peerConnection.connectionState === "connected") {
      setRuntimeState("Live");
    }
    if (peerConnection.connectionState === "connecting") {
      setRuntimeState("Connecting");
    }
    if (peerConnection.connectionState === "disconnected") {
      setRuntimeState("Reconnecting");
    }
    if (peerConnection.connectionState === "failed") {
      setRuntimeState("Error");
      setLog("Realtime connection failed.");
    }
  });

  peerConnection.addTrack(audioTracks[0], audioStream);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const sdpResponse = await fetch(`${config.openai_base_url}/realtime/calls`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${realtimeToken}`,
      "Content-Type": "application/sdp",
    },
  });

  if (!sdpResponse.ok) {
    throw new Error(await sdpResponse.text());
  }

  await peerConnection.setRemoteDescription({
    type: "answer",
    sdp: await sdpResponse.text(),
  });

  setCaptureState(true);
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

  sourceFinalText = sourceText.value.trim();
  interimSegments = new Map();

  await startRealtimeCapture(stream, audioTracks);
}

function stopCapture() {
  if (realtimeChannel) realtimeChannel.close();
  if (peerConnection) peerConnection.close();
  stopMeter();
  if (stream) stream.getTracks().forEach((track) => track.stop());
  realtimeChannel = null;
  peerConnection = null;
  stream = null;
  interimSegments = new Map();
  sourceFinalText = sourceText.value.trim();
  setCaptureState(false);
  setRuntimeState("Stopped");
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

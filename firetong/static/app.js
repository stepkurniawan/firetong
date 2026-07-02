import {
  DEFAULT_CONFIG,
  missingBrowserFeatures,
} from "./app-core.js";

const apiStatus = document.querySelector("#api-status");
const testOpenAIButton = document.querySelector("#test-openai-button");
const captureButton = document.querySelector("#capture-button");
const stopButton = document.querySelector("#stop-button");
const copyButton = document.querySelector("#copy-button");
const exportButton = document.querySelector("#export-button");
const sourceText = document.querySelector("#source-text");
const translatedText = document.querySelector("#translated-text");
const liveTranslation = document.querySelector("#live-translation");
const meterBar = document.querySelector("#meter-bar");
const captureState = document.querySelector("#capture-state");
const phraseCount = document.querySelector("#phrase-count");
const lastLatency = document.querySelector("#last-latency");
const log = document.querySelector("#log");

const PHRASE_BOUNDARY_PATTERN = /[.!?。！？]/;
const TRANSCRIPTION_COMMIT_IDLE_MS = 900;

let config = { ...DEFAULT_CONFIG };
let stream = null;
let peerConnection = null;
let realtimeChannel = null;
let transcriptionPeerConnection = null;
let transcriptionRealtimeChannel = null;
let audioContext = null;
let meterFrame = null;
let completedPhraseCount = 0;
let phraseStartedAt = null;
let transcriptionCommitTimer = null;
let transcriptionItems = new Map();
let sourceFromTranscription = false;
let sourceTranscript = "";
let translatedTranscript = "";

function addAudioSendTrack(peerConnectionToUpdate, audioTrack, audioStream) {
  peerConnectionToUpdate.addTransceiver(audioTrack, {
    direction: "sendonly",
    streams: [audioStream],
  });
}

function forceSendOnlyAudioSdp(sdp) {
  return sdp.replaceAll("a=sendrecv", "a=sendonly").replaceAll("a=recvonly", "a=inactive");
}

function setLog(message) {
  log.textContent = message;
}

function setRuntimeState(state) {
  captureState.textContent = state;
}

function setCaptureState(isCapturing) {
  captureButton.disabled = isCapturing;
  stopButton.disabled = !isCapturing;
}

function renderTranscripts() {
  sourceText.value = sourceTranscript.trimStart();
  translatedText.value = translatedTranscript.trimStart();
  sourceText.scrollTop = sourceText.scrollHeight;
  translatedText.scrollTop = translatedText.scrollHeight;
  liveTranslation.hidden = true;
  liveTranslation.textContent = "";
}

function resetRealtimeState() {
  sourceTranscript = sourceText.value.trim();
  translatedTranscript = translatedText.value.trim();
  phraseStartedAt = null;
  transcriptionItems = new Map();
  sourceFromTranscription = false;
  renderTranscripts();
}

function recordPhraseLatency(startedAt) {
  completedPhraseCount += 1;
  phraseCount.textContent = String(completedPhraseCount);
  lastLatency.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)}s`;
}

function markSourceProgress(delta) {
  if (!delta) return;

  if (!phraseStartedAt) phraseStartedAt = performance.now();
  sourceTranscript = `${sourceTranscript}${delta}`;
  renderTranscripts();

  if (PHRASE_BOUNDARY_PATTERN.test(delta)) {
    recordPhraseLatency(phraseStartedAt);
    phraseStartedAt = null;
  }
}

function appendTranslatedText(delta) {
  if (!delta) return;

  translatedTranscript = `${translatedTranscript}${delta}`;
  renderTranscripts();
}

function commitTranscriptionBuffer() {
  if (!transcriptionRealtimeChannel || transcriptionRealtimeChannel.readyState !== "open") return;

  transcriptionRealtimeChannel.send(
    JSON.stringify({
      type: "input_audio_buffer.commit",
    }),
  );
}

function scheduleTranscriptionCommit() {
  if (transcriptionCommitTimer) clearTimeout(transcriptionCommitTimer);

  transcriptionCommitTimer = setTimeout(() => {
    transcriptionCommitTimer = null;
    commitTranscriptionBuffer();
    if (transcriptionRealtimeChannel?.readyState === "open") {
      scheduleTranscriptionCommit();
    }
  }, TRANSCRIPTION_COMMIT_IDLE_MS);
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

  apiStatus.textContent = `OpenAI API ready (${config.realtime_translation_model})`;
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

function getFullTranslationText() {
  return translatedTranscript.trim();
}

async function fetchRealtimeTranslationToken() {
  const response = await fetch("/api/realtime/translation-token");
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  if (!data.value) {
    throw new Error("Realtime translation token response did not include a client secret.");
  }
  return data.value;
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

function handleRealtimeTranscriptionEvent(event) {
  if (event.type === "conversation.item.input_audio_transcription.delta") {
    sourceFromTranscription = true;
    const itemId = event.item_id || "current";
    const currentText = transcriptionItems.get(itemId) || "";
    transcriptionItems.set(itemId, `${currentText}${event.delta || ""}`);
    markSourceProgress(event.delta || "");
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    sourceFromTranscription = true;
    const itemId = event.item_id || "current";
    const currentText = (transcriptionItems.get(itemId) || "").trim();
    const transcript = (event.transcript || "").trim();
    if (!currentText && transcript) {
      markSourceProgress(transcript);
    }
    transcriptionItems.delete(itemId);

    if (phraseStartedAt) {
      recordPhraseLatency(phraseStartedAt);
      phraseStartedAt = null;
    }
  }

  if (event.type === "error") {
    setRuntimeState("Error");
    setLog(event.error?.message || "Realtime transcription failed.");
  }
}

function handleRealtimeTranslationEvent(event) {
  if (event.type === "session.input_transcript.delta" && !sourceFromTranscription) {
    markSourceProgress(event.delta || "");
  }

  if (event.type === "session.output_transcript.delta") {
    appendTranslatedText(event.delta || "");
  }

  if (event.type === "session.closed") {
    setRuntimeState("Stopped");
  }

  if (event.type === "error") {
    setRuntimeState("Error");
    setLog(event.error?.message || "Realtime translation failed.");
  }
}

async function startRealtimeTranscription(audioTracks) {
  const realtimeToken = await fetchRealtimeToken();
  const audioTrack = audioTracks[0].clone();
  const audioStream = new MediaStream([audioTrack]);

  transcriptionPeerConnection = new RTCPeerConnection();
  addAudioSendTrack(transcriptionPeerConnection, audioTrack, audioStream);

  transcriptionRealtimeChannel = transcriptionPeerConnection.createDataChannel("oai-events");
  transcriptionRealtimeChannel.addEventListener("open", scheduleTranscriptionCommit);
  transcriptionRealtimeChannel.addEventListener("message", (event) => {
    handleRealtimeTranscriptionEvent(JSON.parse(event.data));
  });
  transcriptionRealtimeChannel.addEventListener("error", () => {
    setRuntimeState("Error");
    setLog("Realtime transcription channel failed.");
  });

  transcriptionPeerConnection.addEventListener("connectionstatechange", () => {
    if (transcriptionPeerConnection.connectionState === "failed") {
      setRuntimeState("Error");
      setLog("Realtime transcription connection failed.");
    }
  });

  const offer = await transcriptionPeerConnection.createOffer();
  offer.sdp = forceSendOnlyAudioSdp(offer.sdp);
  await transcriptionPeerConnection.setLocalDescription(offer);

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

  await transcriptionPeerConnection.setRemoteDescription({
    type: "answer",
    sdp: await sdpResponse.text(),
  });
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

function stopMeter() {
  if (meterFrame) cancelAnimationFrame(meterFrame);
  if (audioContext) audioContext.close();
  meterFrame = null;
  audioContext = null;
  meterBar.style.width = "0%";
}

async function startRealtimeTranslation(audioTracks) {
  setRuntimeState("Connecting");
  setLog("Connecting OpenAI Realtime translation...");

  const translationToken = await fetchRealtimeTranslationToken();
  const audioTrack = audioTracks[0].clone();
  const audioStream = new MediaStream([audioTrack]);
  startMeter(new MediaStream(audioTracks));

  peerConnection = new RTCPeerConnection();
  addAudioSendTrack(peerConnection, audioTrack, audioStream);

  realtimeChannel = peerConnection.createDataChannel("oai-events");
  realtimeChannel.addEventListener("open", () => {
    setRuntimeState("Live");
    setLog("Realtime translation is running.");
  });
  realtimeChannel.addEventListener("message", (event) => {
    handleRealtimeTranslationEvent(JSON.parse(event.data));
  });
  realtimeChannel.addEventListener("error", () => {
    setRuntimeState("Error");
    setLog("Realtime translation channel failed.");
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
      setLog("Realtime translation connection failed.");
    }
  });

  const offer = await peerConnection.createOffer();
  offer.sdp = forceSendOnlyAudioSdp(offer.sdp);
  await peerConnection.setLocalDescription(offer);

  const sdpResponse = await fetch(`${config.openai_base_url}/realtime/translations/calls`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${translationToken}`,
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

  resetRealtimeState();

  try {
    await Promise.all([
      startRealtimeTranscription(audioTracks),
      startRealtimeTranslation(audioTracks),
    ]);
    setCaptureState(true);
  } catch (error) {
    cleanupCapture();
    throw error;
  }
}

function cleanupCapture() {
  if (transcriptionCommitTimer) clearTimeout(transcriptionCommitTimer);
  if (peerConnection) {
    peerConnection.getSenders().forEach((sender) => sender.track?.stop());
  }
  if (transcriptionPeerConnection) {
    transcriptionPeerConnection.getSenders().forEach((sender) => sender.track?.stop());
  }
  if (realtimeChannel) realtimeChannel.close();
  if (transcriptionRealtimeChannel) transcriptionRealtimeChannel.close();
  if (peerConnection) peerConnection.close();
  if (transcriptionPeerConnection) transcriptionPeerConnection.close();
  stopMeter();
  if (stream) stream.getTracks().forEach((track) => track.stop());
  realtimeChannel = null;
  transcriptionRealtimeChannel = null;
  transcriptionCommitTimer = null;
  peerConnection = null;
  transcriptionPeerConnection = null;
  transcriptionItems = new Map();
  sourceFromTranscription = false;
  stream = null;
}

async function stopCapture() {
  cleanupCapture();
  setCaptureState(false);
  setRuntimeState("Stopped");
  setLog("Capture stopped.");
}

async function testServerConnection() {
  testOpenAIButton.disabled = true;
  try {
    const [transcriptionResponse, translationResponse] = await Promise.all([
      fetch("/api/realtime/token"),
      fetch("/api/realtime/translation-token"),
    ]);

    if (transcriptionResponse.ok && translationResponse.ok) {
      setLog("Realtime transcription and translation test passed.");
    } else {
      const message = await (transcriptionResponse.ok ? translationResponse : transcriptionResponse).text();
      setLog(`Realtime transcription/translation test failed: ${message}`);
    }
  } catch (error) {
    setLog(`Realtime transcription/translation test failed: ${error.message}`);
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
    getFullTranslationText(),
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

stopButton.addEventListener("click", () => {
  stopCapture().catch((error) => setLog(error.message));
});
copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(getFullTranslationText());
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

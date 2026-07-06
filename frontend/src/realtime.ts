import {
  buildRealtimeLanguageUrl,
  type AppConfig,
  type RealtimeLanguage,
} from "./app-core";
import {
  applyRealtimeTranscriptionEvent,
  applyRealtimeTranslationEvent,
  createRealtimeEventState,
  type RealtimeEvent,
  type RealtimeEventState,
} from "./realtime-events";

type CaptureCallbacks = {
  onCapturingChange(isCapturing: boolean): void;
  onLog(message: string): void;
  onMeter(levelPercent: number): void;
  onResetTranscripts(): void;
  onSourceComplete(): void;
  onSourceDelta(delta: string): void;
  onState(state: string): void;
  onTranslationDelta(delta: string): void;
};

const TRANSCRIPTION_COMMIT_IDLE_MS = 600;
const AUDIO_DETECTED_LEVEL = 0.03;
const SPOKEN_PHRASE_SILENCE_MS = 700;
const TRANSLATION_SETTLED_MS = 900;

type RealtimeTimingState = {
  startedAt: number;
  firstAudioDetectedAt: number | null;
  firstTranslationDeltaAt: number | null;
  isSpeaking: boolean;
  lastSpeechAt: number | null;
  pendingPhraseEndedAt: number | null;
  phraseEndedTimer: number | null;
  translationSettledTimer: number | null;
  phraseCount: number;
};

export type AudioCaptureMode = "desktop" | "microphone";

export type AudioCaptureOptions = {
  inputTranscriptEnabled: boolean;
  inputLanguage: RealtimeLanguage;
  outputLanguage: RealtimeLanguage;
  mode: AudioCaptureMode;
  microphoneDeviceId?: string;
};

export class RealtimeCapture {
  private stream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private realtimeChannel: RTCDataChannel | null = null;
  private transcriptionPeerConnection: RTCPeerConnection | null = null;
  private transcriptionRealtimeChannel: RTCDataChannel | null = null;
  private transcriptionAudioSender: RTCRtpSender | null = null;
  private audioContext: AudioContext | null = null;
  private meterFrame: number | null = null;
  private transcriptionCommitTimer: number | null = null;
  private transcriptionChannelOpen = false;
  private transcriptionPeerConnected = false;
  private lastTranscriptionCommitBytesSent = 0;
  private eventState: RealtimeEventState = createRealtimeEventState();
  private timing: RealtimeTimingState | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly callbacks: CaptureCallbacks,
  ) {}

  async start(options: AudioCaptureOptions): Promise<void> {
    this.resetTiming();
    this.stream = await this.captureAudio(options);

    const audioTracks = this.stream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.stopSharedMedia();
      throw new Error(this.noAudioTrackMessage(options.mode));
    }

    this.eventState = createRealtimeEventState(options.inputTranscriptEnabled);
    this.callbacks.onResetTranscripts();

    try {
      const realtimeSessions = [
        this.startRealtimeTranslation(audioTracks, options.outputLanguage),
      ];
      if (options.inputTranscriptEnabled) {
        realtimeSessions.unshift(
          this.startRealtimeTranscription(
            audioTracks,
            options.inputLanguage,
            options.outputLanguage,
          ),
        );
      }
      await Promise.all(realtimeSessions);
      this.callbacks.onCapturingChange(true);
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  stop(): void {
    this.cleanup();
    this.callbacks.onCapturingChange(false);
    this.callbacks.onState("Stopped");
    this.callbacks.onLog("Capture stopped.");
  }

  private addAudioSendTrack(
    peerConnectionToUpdate: RTCPeerConnection,
    audioTrack: MediaStreamTrack,
    audioStream: MediaStream,
  ): RTCRtpSender {
    return peerConnectionToUpdate.addTrack(audioTrack, audioStream);
  }

  private async captureAudio(options: AudioCaptureOptions): Promise<MediaStream> {
    if (options.mode === "microphone") {
      return navigator.mediaDevices.getUserMedia({
        audio: this.microphoneAudioConstraints(options.microphoneDeviceId),
        video: false,
      });
    }

    return navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
  }

  private microphoneAudioConstraints(deviceId?: string): MediaTrackConstraints | true {
    if (!deviceId || deviceId === "default") return true;

    return {
      deviceId: { exact: deviceId },
    };
  }

  private noAudioTrackMessage(mode: AudioCaptureMode): string {
    if (mode === "microphone") {
      return "No microphone audio track was captured. Choose another audio input or allow microphone access.";
    }

    return "No audio track was shared. Choose a tab/window and enable audio sharing.";
  }

  private async fetchRealtimeTranslationToken(outputLanguage: RealtimeLanguage): Promise<string> {
    const response = await fetch(
      buildRealtimeLanguageUrl(
        "/api/realtime/translation-token",
        "output_language",
        outputLanguage,
      ),
    );
    if (!response.ok) throw new Error(await response.text());

    const data = (await response.json()) as { value?: string };
    if (!data.value) {
      throw new Error("Realtime translation token response did not include a client secret.");
    }
    return data.value;
  }

  private async fetchRealtimeToken(
    inputLanguage: RealtimeLanguage,
    outputLanguage: RealtimeLanguage,
  ): Promise<string> {
    const response = await fetch(
      buildRealtimeLanguageUrl(
        "/api/realtime/token",
        "input_language",
        inputLanguage,
        { output_language: outputLanguage },
      ),
    );
    if (!response.ok) throw new Error(await response.text());

    const data = (await response.json()) as { value?: string };
    if (!data.value) {
      throw new Error("Realtime token response did not include a client secret.");
    }
    return data.value;
  }

  private async hasNewTranscriptionAudio(): Promise<boolean> {
    if (!this.transcriptionAudioSender) return false;

    const stats = await this.transcriptionAudioSender.getStats();
    let bytesSent = 0;

    stats.forEach((stat) => {
      if (stat.type === "outbound-rtp" && "bytesSent" in stat) {
        bytesSent += Number(stat.bytesSent || 0);
      }
    });

    if (bytesSent <= this.lastTranscriptionCommitBytesSent) return false;

    this.lastTranscriptionCommitBytesSent = bytesSent;
    return true;
  }

  private async commitTranscriptionBuffer(): Promise<void> {
    if (!this.transcriptionRealtimeChannel || this.transcriptionRealtimeChannel.readyState !== "open") {
      return;
    }

    if (!(await this.hasNewTranscriptionAudio())) return;

    this.transcriptionRealtimeChannel.send(
      JSON.stringify({
        type: "input_audio_buffer.commit",
      }),
    );
  }

  private scheduleTranscriptionCommitIfReady(): void {
    if (!this.transcriptionChannelOpen || !this.transcriptionPeerConnected) return;
    this.scheduleTranscriptionCommit();
  }

  private scheduleTranscriptionCommit = (): void => {
    if (this.transcriptionCommitTimer) clearTimeout(this.transcriptionCommitTimer);

    this.transcriptionCommitTimer = window.setTimeout(() => {
      this.transcriptionCommitTimer = null;
      void this.commitTranscriptionBuffer();
      if (this.transcriptionRealtimeChannel?.readyState === "open") {
        this.scheduleTranscriptionCommit();
      }
    }, TRANSCRIPTION_COMMIT_IDLE_MS);
  };

  private handleRealtimeTranscriptionEvent(event: RealtimeEvent): void {
    applyRealtimeTranscriptionEvent(event, this.eventState, this.callbacks);
  }

  private handleRealtimeTranslationEvent(event: RealtimeEvent): void {
    if (event.type === "session.output_transcript.delta") {
      this.recordTranslationDeltaTiming();
    }
    applyRealtimeTranslationEvent(event, this.eventState, this.callbacks);
  }

  private resetTiming(): void {
    this.clearTimingTimers();
    this.timing = {
      startedAt: performance.now(),
      firstAudioDetectedAt: null,
      firstTranslationDeltaAt: null,
      isSpeaking: false,
      lastSpeechAt: null,
      pendingPhraseEndedAt: null,
      phraseEndedTimer: null,
      translationSettledTimer: null,
      phraseCount: 0,
    };
  }

  private clearTimingTimers(): void {
    if (this.timing?.phraseEndedTimer) clearTimeout(this.timing.phraseEndedTimer);
    if (this.timing?.translationSettledTimer) clearTimeout(this.timing.translationSettledTimer);
  }

  private logTiming(metric: string, durationMs: number, details: Record<string, unknown> = {}): void {
    console.info("[firetong:latency]", {
      metric,
      duration_ms: Math.round(durationMs),
      ...details,
    });
  }

  private recordTranslationChannelOpenTiming(): void {
    if (!this.timing) return;
    this.logTiming(
      "start_to_translation_channel_open",
      performance.now() - this.timing.startedAt,
    );
  }

  private recordAudioLevelTiming(level: number): void {
    if (!this.timing) return;

    const now = performance.now();
    const hasSpeech = level >= AUDIO_DETECTED_LEVEL;

    if (hasSpeech && this.timing.firstAudioDetectedAt === null) {
      this.timing.firstAudioDetectedAt = now;
      this.logTiming("start_to_first_audio_detected", now - this.timing.startedAt, {
        audio_level: Number(level.toFixed(3)),
      });
    }

    if (hasSpeech) {
      if (!this.timing.isSpeaking) {
        this.timing.isSpeaking = true;
        this.timing.phraseCount += 1;
        this.timing.pendingPhraseEndedAt = null;
        if (this.timing.translationSettledTimer) {
          clearTimeout(this.timing.translationSettledTimer);
          this.timing.translationSettledTimer = null;
        }
      }

      this.timing.lastSpeechAt = now;
      if (this.timing.phraseEndedTimer) {
        clearTimeout(this.timing.phraseEndedTimer);
        this.timing.phraseEndedTimer = null;
      }
      return;
    }

    if (!this.timing.isSpeaking || this.timing.phraseEndedTimer || this.timing.lastSpeechAt === null) {
      return;
    }

    this.timing.phraseEndedTimer = window.setTimeout(() => {
      if (!this.timing?.lastSpeechAt) return;

      this.timing.isSpeaking = false;
      this.timing.pendingPhraseEndedAt = this.timing.lastSpeechAt;
      this.timing.phraseEndedTimer = null;
      this.scheduleTranslationSettledTiming();
    }, SPOKEN_PHRASE_SILENCE_MS);
  }

  private recordTranslationDeltaTiming(): void {
    if (!this.timing) return;

    const now = performance.now();
    if (this.timing.firstTranslationDeltaAt === null) {
      this.timing.firstTranslationDeltaAt = now;
      if (this.timing.firstAudioDetectedAt !== null) {
        this.logTiming(
          "first_audio_to_first_translation_delta",
          now - this.timing.firstAudioDetectedAt,
        );
      }
    }

    this.scheduleTranslationSettledTiming();
  }

  private scheduleTranslationSettledTiming(): void {
    if (!this.timing?.pendingPhraseEndedAt) return;

    if (this.timing.translationSettledTimer) clearTimeout(this.timing.translationSettledTimer);
    this.timing.translationSettledTimer = window.setTimeout(() => {
      if (!this.timing?.pendingPhraseEndedAt) return;

      this.logTiming(
        "spoken_phrase_end_to_translation_settled",
        performance.now() - this.timing.pendingPhraseEndedAt,
        { phrase: this.timing.phraseCount },
      );
      this.timing.pendingPhraseEndedAt = null;
      this.timing.translationSettledTimer = null;
    }, TRANSLATION_SETTLED_MS);
  }

  private async startRealtimeTranscription(
    audioTracks: MediaStreamTrack[],
    inputLanguage: RealtimeLanguage,
    outputLanguage: RealtimeLanguage,
  ): Promise<void> {
    const realtimeToken = await this.fetchRealtimeToken(inputLanguage, outputLanguage);
    const audioTrack = audioTracks[0].clone();
    const audioStream = new MediaStream([audioTrack]);

    this.transcriptionPeerConnection = new RTCPeerConnection();
    this.transcriptionAudioSender = this.addAudioSendTrack(
      this.transcriptionPeerConnection,
      audioTrack,
      audioStream,
    );

    this.transcriptionRealtimeChannel = this.transcriptionPeerConnection.createDataChannel("oai-events");
    this.transcriptionRealtimeChannel.addEventListener("open", () => {
      this.transcriptionChannelOpen = true;
      this.scheduleTranscriptionCommitIfReady();
    });
    this.transcriptionRealtimeChannel.addEventListener("message", (event) => {
      this.handleRealtimeTranscriptionEvent(JSON.parse(event.data) as RealtimeEvent);
    });
    this.transcriptionRealtimeChannel.addEventListener("error", () => {
      this.callbacks.onState("Error");
      this.callbacks.onLog("Realtime transcription channel failed.");
    });

    this.transcriptionPeerConnection.addEventListener("connectionstatechange", () => {
      if (!this.transcriptionPeerConnection) return;

      if (this.transcriptionPeerConnection.connectionState === "connected") {
        this.transcriptionPeerConnected = true;
        this.scheduleTranscriptionCommitIfReady();
      }
      if (this.transcriptionPeerConnection.connectionState === "failed") {
        this.callbacks.onState("Error");
        this.callbacks.onLog("Realtime transcription connection failed.");
      }
    });

    const offer = await this.transcriptionPeerConnection.createOffer();
    await this.transcriptionPeerConnection.setLocalDescription(offer);

    const sdpResponse = await fetch(`${this.config.openai_base_url}/realtime/calls`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${realtimeToken}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) throw new Error(await sdpResponse.text());

    await this.transcriptionPeerConnection.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });
  }

  private async startRealtimeTranslation(
    audioTracks: MediaStreamTrack[],
    outputLanguage: RealtimeLanguage,
  ): Promise<void> {
    this.callbacks.onState("Connecting");
    this.callbacks.onLog("Connecting OpenAI Realtime translation...");

    const translationToken = await this.fetchRealtimeTranslationToken(outputLanguage);
    const audioTrack = audioTracks[0].clone();
    const audioStream = new MediaStream([audioTrack]);
    this.startMeter(new MediaStream(audioTracks));

    this.peerConnection = new RTCPeerConnection();
    this.addAudioSendTrack(this.peerConnection, audioTrack, audioStream);
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;
    this.remoteAudio.muted = true;
    this.peerConnection.addEventListener("track", (event) => {
      if (this.remoteAudio) this.remoteAudio.srcObject = event.streams[0];
    });

    this.realtimeChannel = this.peerConnection.createDataChannel("oai-events");
    this.realtimeChannel.addEventListener("open", () => {
      this.recordTranslationChannelOpenTiming();
      this.callbacks.onState("Live");
      this.callbacks.onLog("Realtime translation is running.");
    });
    this.realtimeChannel.addEventListener("message", (event) => {
      this.handleRealtimeTranslationEvent(JSON.parse(event.data) as RealtimeEvent);
    });
    this.realtimeChannel.addEventListener("error", () => {
      this.callbacks.onState("Error");
      this.callbacks.onLog("Realtime translation channel failed.");
    });

    this.peerConnection.addEventListener("connectionstatechange", () => {
      if (!this.peerConnection) return;

      if (this.peerConnection.connectionState === "connected") this.callbacks.onState("Live");
      if (this.peerConnection.connectionState === "connecting") this.callbacks.onState("Connecting");
      if (this.peerConnection.connectionState === "disconnected") this.callbacks.onState("Reconnecting");
      if (this.peerConnection.connectionState === "failed") {
        this.callbacks.onState("Error");
        this.callbacks.onLog("Realtime translation connection failed.");
      }
    });

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    const sdpResponse = await fetch(`${this.config.openai_base_url}/realtime/translations/calls`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${translationToken}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) throw new Error(await sdpResponse.text());

    await this.peerConnection.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });
  }

  private startMeter(activeStream: MediaStream): void {
    this.audioContext = new AudioContext();
    const analyser = this.audioContext.createAnalyser();
    const source = this.audioContext.createMediaStreamSource(activeStream);
    const levels = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);

    const tick = () => {
      analyser.getByteFrequencyData(levels);
      const peak = Math.max(...levels);
      const level = peak / 255;
      this.recordAudioLevelTiming(level);
      this.callbacks.onMeter(Math.min(100, Math.round(level * 100)));
      this.meterFrame = requestAnimationFrame(tick);
    };

    tick();
  }

  private stopMeter(): void {
    if (this.meterFrame) cancelAnimationFrame(this.meterFrame);
    if (this.audioContext) void this.audioContext.close();
    this.meterFrame = null;
    this.audioContext = null;
    this.callbacks.onMeter(0);
  }

  private cleanup(): void {
    if (this.transcriptionCommitTimer) clearTimeout(this.transcriptionCommitTimer);
    this.clearTimingTimers();
    this.peerConnection?.getSenders().forEach((sender) => sender.track?.stop());
    this.transcriptionPeerConnection?.getSenders().forEach((sender) => sender.track?.stop());
    this.realtimeChannel?.close();
    this.transcriptionRealtimeChannel?.close();
    this.peerConnection?.close();
    this.transcriptionPeerConnection?.close();
    this.stopMeter();
    this.stopSharedMedia();
    if (this.remoteAudio) this.remoteAudio.srcObject = null;

    this.realtimeChannel = null;
    this.remoteAudio = null;
    this.transcriptionRealtimeChannel = null;
    this.transcriptionAudioSender = null;
    this.transcriptionCommitTimer = null;
    this.transcriptionChannelOpen = false;
    this.transcriptionPeerConnected = false;
    this.lastTranscriptionCommitBytesSent = 0;
    this.peerConnection = null;
    this.transcriptionPeerConnection = null;
    this.eventState = createRealtimeEventState();
    this.timing = null;
  }

  private stopSharedMedia(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

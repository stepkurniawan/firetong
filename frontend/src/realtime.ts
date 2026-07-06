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
const WEBRTC_STATS_INTERVAL_MS = 5000;
const AUDIO_WITHOUT_TRANSLATION_LOG_STEP_MS = 500;

type RealtimeMetricsState = {
  lastTranslationDeltaAt: number | null;
  audioPresent: boolean;
  audioWithoutTranslationStartedAt: number | null;
  longestAudioWithoutTranslationMs: number;
  lastAudioWithoutTranslationLogMs: number;
  webrtcStatsTimer: number | null;
  lastOutboundBytesSent: number | null;
  lastOutboundStatsAt: number | null;
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
  private metrics: RealtimeMetricsState | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly callbacks: CaptureCallbacks,
  ) {}

  async start(options: AudioCaptureOptions): Promise<void> {
    this.resetMetrics();
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
      this.recordTranslationDeltaMetrics(event.delta || "");
    }
    applyRealtimeTranslationEvent(event, this.eventState, this.callbacks);
  }

  private resetMetrics(): void {
    this.clearMetricsTimers();
    this.metrics = {
      lastTranslationDeltaAt: null,
      audioPresent: false,
      audioWithoutTranslationStartedAt: null,
      longestAudioWithoutTranslationMs: 0,
      lastAudioWithoutTranslationLogMs: 0,
      webrtcStatsTimer: null,
      lastOutboundBytesSent: null,
      lastOutboundStatsAt: null,
    };
  }

  private clearMetricsTimers(): void {
    if (this.metrics?.webrtcStatsTimer) clearInterval(this.metrics.webrtcStatsTimer);
  }

  private logLatency(metric: string, details: Record<string, unknown> = {}): void {
    console.info("[firetong:latency]", {
      metric,
      ...details,
    });
  }

  private logDuration(
    metric: string,
    durationMs: number,
    details: Record<string, unknown> = {},
  ): void {
    this.logLatency(metric, {
      duration_ms: Math.round(durationMs),
      ...details,
    });
  }

  private recordAudioLevelMetrics(level: number): void {
    if (!this.metrics) return;
    const now = performance.now();
    const hasAudio = level >= AUDIO_DETECTED_LEVEL;

    if (!hasAudio) {
      this.metrics.audioPresent = false;
      this.metrics.audioWithoutTranslationStartedAt = null;
      this.metrics.lastAudioWithoutTranslationLogMs = 0;
      return;
    }

    this.metrics.audioPresent = true;
    if (this.metrics.lastTranslationDeltaAt === null) {
      this.metrics.audioWithoutTranslationStartedAt = null;
      this.metrics.lastAudioWithoutTranslationLogMs = 0;
      return;
    }

    if (this.metrics.audioWithoutTranslationStartedAt === null) {
      this.metrics.audioWithoutTranslationStartedAt = now;
      this.metrics.lastAudioWithoutTranslationLogMs = 0;
      return;
    }

    const currentGapMs = now - this.metrics.audioWithoutTranslationStartedAt;
    const shouldLogNewLongest =
      currentGapMs > this.metrics.longestAudioWithoutTranslationMs &&
      currentGapMs - this.metrics.lastAudioWithoutTranslationLogMs >=
        AUDIO_WITHOUT_TRANSLATION_LOG_STEP_MS;

    if (shouldLogNewLongest) {
      this.metrics.longestAudioWithoutTranslationMs = currentGapMs;
      this.metrics.lastAudioWithoutTranslationLogMs = currentGapMs;
      this.logDuration("longest_audio_present_without_translation_delta", currentGapMs, {
        audio_level: Number(level.toFixed(3)),
      });
    }
  }

  private recordTranslationDeltaMetrics(delta: string): void {
    if (!this.metrics) return;

    const now = performance.now();
    if (this.metrics.lastTranslationDeltaAt !== null) {
      this.logDuration(
        "translation_delta_gap",
        now - this.metrics.lastTranslationDeltaAt,
        { delta_length: delta.length },
      );
    }

    if (this.metrics.audioWithoutTranslationStartedAt !== null) {
      const gapMs = now - this.metrics.audioWithoutTranslationStartedAt;
      if (gapMs > this.metrics.longestAudioWithoutTranslationMs) {
        this.metrics.longestAudioWithoutTranslationMs = gapMs;
        this.logDuration("longest_audio_present_without_translation_delta", gapMs, {
          delta_length: delta.length,
        });
      }
    }

    this.metrics.lastTranslationDeltaAt = now;
    this.metrics.audioWithoutTranslationStartedAt = this.metrics.audioPresent ? now : null;
    this.metrics.lastAudioWithoutTranslationLogMs = 0;
  }

  private startWebRtcStatsLogging(): void {
    if (!this.metrics || this.metrics.webrtcStatsTimer) return;

    this.metrics.webrtcStatsTimer = window.setInterval(() => {
      void this.logWebRtcStats();
    }, WEBRTC_STATS_INTERVAL_MS);
    void this.logWebRtcStats();
  }

  private numericStat(stat: RTCStats & Record<string, unknown>, key: string): number | null {
    const value = stat[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private roundNullable(value: number | null, digits = 0): number | null {
    if (value === null) return null;

    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  private async logWebRtcStats(): Promise<void> {
    if (!this.peerConnection || !this.metrics) return;

    const metrics = this.metrics;
    const stats = await this.peerConnection.getStats();
    if (this.metrics !== metrics) return;

    const snapshot = {
      rttMs: null as number | null,
      jitterMs: null as number | null,
      packetsLost: null as number | null,
      outboundPacketsSent: null as number | null,
      outboundAudioKbps: null as number | null,
    };

    stats.forEach((rawStat) => {
      const stat = rawStat as RTCStats & Record<string, unknown>;
      const kind = stat.kind || stat.mediaType;

      if (stat.type === "candidate-pair" && (stat.selected || stat.nominated)) {
        const rtt = this.numericStat(stat, "currentRoundTripTime");
        if (rtt !== null) snapshot.rttMs = rtt * 1000;
      }

      if (
        (stat.type === "remote-inbound-rtp" || stat.type === "inbound-rtp") &&
        kind === "audio"
      ) {
        const rtt = this.numericStat(stat, "roundTripTime");
        const jitter = this.numericStat(stat, "jitter");
        const packetsLost = this.numericStat(stat, "packetsLost");

        if (rtt !== null) snapshot.rttMs = rtt * 1000;
        if (jitter !== null) snapshot.jitterMs = jitter * 1000;
        if (packetsLost !== null) snapshot.packetsLost = packetsLost;
      }

      if (stat.type === "outbound-rtp" && kind === "audio") {
        const bytesSent = this.numericStat(stat, "bytesSent");
        const packetsSent = this.numericStat(stat, "packetsSent");

        snapshot.outboundPacketsSent = packetsSent;
        if (
          bytesSent !== null &&
          metrics.lastOutboundBytesSent !== null &&
          metrics.lastOutboundStatsAt !== null &&
          stat.timestamp > metrics.lastOutboundStatsAt
        ) {
          const elapsedSeconds = (stat.timestamp - metrics.lastOutboundStatsAt) / 1000;
          snapshot.outboundAudioKbps =
            ((bytesSent - metrics.lastOutboundBytesSent) * 8) /
            elapsedSeconds /
            1000;
        }

        metrics.lastOutboundBytesSent = bytesSent;
        metrics.lastOutboundStatsAt = stat.timestamp;
      }
    });

    this.logLatency("webrtc_stats", {
      rtt_ms: this.roundNullable(snapshot.rttMs),
      jitter_ms: this.roundNullable(snapshot.jitterMs),
      packets_lost: snapshot.packetsLost,
      outbound_audio_kbps: this.roundNullable(snapshot.outboundAudioKbps, 1),
      outbound_packets_sent: snapshot.outboundPacketsSent,
    });
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
      this.callbacks.onState("Live");
      this.callbacks.onLog("Realtime translation is running.");
      this.startWebRtcStatsLogging();
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
      this.recordAudioLevelMetrics(level);
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
    this.clearMetricsTimers();
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
    this.metrics = null;
  }

  private stopSharedMedia(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

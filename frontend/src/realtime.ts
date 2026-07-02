import type { AppConfig } from "./app-core";

type RealtimeEvent = {
  type: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  error?: {
    message?: string;
  };
};

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

const TRANSCRIPTION_COMMIT_IDLE_MS = 900;

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
  private transcriptionItems = new Map<string, string>();
  private sourceFromTranscription = false;

  constructor(
    private readonly config: AppConfig,
    private readonly callbacks: CaptureCallbacks,
    private readonly openaiApiKeyOverride = "",
  ) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    const audioTracks = this.stream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.stopSharedMedia();
      throw new Error("No audio track was shared. Choose a tab/window and enable audio sharing.");
    }

    this.callbacks.onResetTranscripts();

    try {
      await Promise.all([
        this.startRealtimeTranscription(audioTracks),
        this.startRealtimeTranslation(audioTracks),
      ]);
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

  private async fetchRealtimeTranslationToken(): Promise<string> {
    const response = await fetch("/api/realtime/translation-token", {
      headers: this.openaiApiKeyHeaders(),
    });
    if (!response.ok) throw new Error(await response.text());

    const data = (await response.json()) as { value?: string };
    if (!data.value) {
      throw new Error("Realtime translation token response did not include a client secret.");
    }
    return data.value;
  }

  private async fetchRealtimeToken(): Promise<string> {
    const response = await fetch("/api/realtime/token", {
      headers: this.openaiApiKeyHeaders(),
    });
    if (!response.ok) throw new Error(await response.text());

    const data = (await response.json()) as { value?: string };
    if (!data.value) {
      throw new Error("Realtime token response did not include a client secret.");
    }
    return data.value;
  }

  private openaiApiKeyHeaders(): HeadersInit {
    const apiKey = this.openaiApiKeyOverride.trim();
    return apiKey ? { "X-OpenAI-API-Key": apiKey } : {};
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
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      this.sourceFromTranscription = true;
      const itemId = event.item_id || "current";
      const currentText = this.transcriptionItems.get(itemId) || "";
      this.transcriptionItems.set(itemId, `${currentText}${event.delta || ""}`);
      this.callbacks.onSourceDelta(event.delta || "");
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      this.sourceFromTranscription = true;
      const itemId = event.item_id || "current";
      const currentText = (this.transcriptionItems.get(itemId) || "").trim();
      const transcript = (event.transcript || "").trim();
      if (!currentText && transcript) {
        this.callbacks.onSourceDelta(transcript);
      }
      this.transcriptionItems.delete(itemId);
      this.callbacks.onSourceComplete();
    }

    if (event.type === "error") {
      this.callbacks.onState("Error");
      this.callbacks.onLog(event.error?.message || "Realtime transcription failed.");
    }
  }

  private handleRealtimeTranslationEvent(event: RealtimeEvent): void {
    if (event.type === "session.input_transcript.delta" && !this.sourceFromTranscription) {
      this.callbacks.onSourceDelta(event.delta || "");
    }

    if (event.type === "session.output_transcript.delta") {
      this.callbacks.onTranslationDelta(event.delta || "");
    }

    if (event.type === "session.closed") {
      this.callbacks.onState("Stopped");
    }

    if (event.type === "error") {
      this.callbacks.onState("Error");
      this.callbacks.onLog(event.error?.message || "Realtime translation failed.");
    }
  }

  private async startRealtimeTranscription(audioTracks: MediaStreamTrack[]): Promise<void> {
    const realtimeToken = await this.fetchRealtimeToken();
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

  private async startRealtimeTranslation(audioTracks: MediaStreamTrack[]): Promise<void> {
    this.callbacks.onState("Connecting");
    this.callbacks.onLog("Connecting OpenAI Realtime translation...");

    const translationToken = await this.fetchRealtimeTranslationToken();
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
    this.transcriptionItems = new Map();
    this.sourceFromTranscription = false;
  }

  private stopSharedMedia(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

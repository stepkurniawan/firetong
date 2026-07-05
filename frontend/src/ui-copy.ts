import type { LiveStatusKind } from "./LiveStatus.svelte";
import type { AudioCaptureMode } from "./realtime";

export function statusTitleFor(status: LiveStatusKind): string {
  if (status === "checking") return "Checking connection";
  if (status === "connecting") return "Connecting";
  if (status === "listening") return "Listening";
  if (status === "no-audio") return "No audio detected";
  if (status === "reconnecting") return "Reconnecting";
  if (status === "error") return "Needs attention";
  if (status === "stopped") return "Stopped";
  if (status === "unsupported") return "Browser unsupported";
  return "Ready";
}

export function noAudioMessage(audioCaptureMode: AudioCaptureMode): string {
  if (audioCaptureMode === "microphone") {
    return "The session is live, but the selected microphone is not picking up sound.";
  }

  return "The session is live, but no shared tab or desktop audio is coming through.";
}

export function languagePairErrorMessage(): string {
  return "Input and output languages must be different.";
}

export function formatUsd(value: number | null): string {
  if (value === null) return "--";

  const roundedUpValue = Math.ceil(Math.max(0, value - Number.EPSILON) * 10) / 10;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(roundedUpValue);
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

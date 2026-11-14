import { t } from "../../i18n";

export type VoicePhase = "idle" | "preparing" | "requesting" | "recording" | "transcribing";

export function voiceButtonLabel(phase: VoicePhase) {
  if (phase === "recording") return t("conversation.voice.stopRecording");
  if (phase === "preparing") return t("conversation.voice.downloadingModel");
  if (phase === "requesting") return t("conversation.voice.requestingMic");
  if (phase === "transcribing") return t("conversation.voice.transcribing");
  return t("conversation.voice.createPrompt");
}

export function formatVoiceDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function voiceCaptureError(error: unknown) {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return t("conversation.voice.micBlocked");
  }
  if (error instanceof DOMException && error.name === "NotFoundError") return t("conversation.voice.noMic");
  return t("conversation.voice.startFailed");
}

export function voiceTranscriptionError(error: unknown): string {
  return error instanceof Error ? error.message : t("conversation.voice.transcribeFailed");
}

/**
 * The voice layer is deliberately thin and provider-agnostic.
 *
 * The default implementation uses the browser's built-in Web Speech API, which
 * costs nothing and needs no API key. Swapping in a paid provider (ElevenLabs
 * for a natural prospect voice, Deepgram for better transcription, or a
 * realtime speech-to-speech API) means writing one more module that satisfies
 * these interfaces — no changes to the call console.
 */

export type VoiceHint = "male" | "female" | "neutral";

export interface SttHandlers {
  /** Fired continuously as the rep speaks. Not stable — for display only. */
  onPartial: (text: string) => void;
  /** Fired when the recogniser commits a phrase. */
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  /** Fired when the recogniser stops for any reason. */
  onEnd: () => void;
}

export interface SttSession {
  stop: () => void;
  /** Stop immediately and discard anything pending. */
  abort: () => void;
}

export interface SpeechToText {
  readonly available: boolean;
  /** Why the provider is unavailable, when it is. */
  readonly unavailableReason?: string;
  listen: (handlers: SttHandlers) => SttSession;
}

export interface SpeakOptions {
  voiceHint?: VoiceHint;
  /** 0.5-2.0, where 1 is the platform default. */
  rate?: number;
}

export interface TextToSpeech {
  readonly available: boolean;
  readonly unavailableReason?: string;
  /** Resolves when the utterance finishes, or immediately if cancelled. */
  speak: (text: string, options?: SpeakOptions) => Promise<void>;
  /** Stops mid-sentence. Used for barge-in when the rep talks over the prospect. */
  cancel: () => void;
  readonly speaking: boolean;
}

export interface VoiceProvider {
  id: string;
  label: string;
  stt: SpeechToText;
  tts: TextToSpeech;
}

"use client";

import { browserVoiceProvider } from "./browser";
import type { VoiceProvider } from "./types";

export * from "./types";
export { browserVoiceProvider };

/**
 * Returns the active voice provider.
 *
 * Today there is exactly one. To add a paid provider, implement the
 * `VoiceProvider` interface in a new module and select it here — for example
 * behind a `NEXT_PUBLIC_VOICE_PROVIDER` env var. Nothing else in the app reads
 * the Web Speech API directly.
 */
export function getVoiceProvider(): VoiceProvider {
  return browserVoiceProvider;
}

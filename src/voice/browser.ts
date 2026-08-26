"use client";

import type {
  SpeakOptions,
  SpeechToText,
  SttHandlers,
  SttSession,
  TextToSpeech,
  VoiceHint,
  VoiceProvider,
} from "./types";

function recognitionCtor(): typeof SpeechRecognition | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

class BrowserStt implements SpeechToText {
  get available(): boolean {
    return Boolean(recognitionCtor());
  }

  get unavailableReason(): string | undefined {
    if (this.available) return undefined;
    return "This browser has no Web Speech recognition. Chrome, Edge, or Safari 16.4+ are supported; Firefox is not.";
  }

  listen(handlers: SttHandlers): SttSession {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      handlers.onError(this.unavailableReason!);
      handlers.onEnd();
      return { stop: () => {}, abort: () => {} };
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.maxAlternatives = 1;

    // The recogniser stops itself after a stretch of silence. On a sales call
    // the rep goes quiet a lot while the prospect talks, so we restart it until
    // the caller explicitly stops the session.
    let stopped = false;

    recognition.onresult = (event) => {
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) handlers.onFinal(trimmed);
        } else {
          partial += text;
        }
      }
      if (partial.trim()) handlers.onPartial(partial.trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are routine on a call — not worth surfacing.
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopped = true;
        handlers.onError(
          "Microphone access was denied. Allow the mic in your browser's site settings and start the call again.",
        );
        return;
      }
      handlers.onError(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      if (stopped) {
        handlers.onEnd();
        return;
      }
      try {
        recognition.start();
      } catch {
        // Restarting too quickly throws; the call console will retry on the
        // next turn rather than us busy-looping here.
        handlers.onEnd();
      }
    };

    try {
      recognition.start();
    } catch (err) {
      handlers.onError(err instanceof Error ? err.message : "Could not start the microphone.");
      handlers.onEnd();
    }

    return {
      stop: () => {
        stopped = true;
        recognition.stop();
      },
      abort: () => {
        stopped = true;
        recognition.abort();
      },
    };
  }
}

class BrowserTts implements TextToSpeech {
  private current: SpeechSynthesisUtterance | null = null;

  get available(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  get unavailableReason(): string | undefined {
    return this.available ? undefined : "This browser has no speech synthesis.";
  }

  get speaking(): boolean {
    return this.available && window.speechSynthesis.speaking;
  }

  private pickVoice(hint: VoiceHint | undefined): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    const preferred = voices.filter((v) => v.lang.startsWith("en"));
    const pool = preferred.length ? preferred : voices;

    if (!hint || hint === "neutral") return pool[0];

    // Voice metadata does not expose gender, so match on the name patterns the
    // major platforms actually use.
    const femalePattern =
      /female|samantha|victoria|karen|moira|tessa|fiona|serena|zira|susan|allison|ava|joanna/i;
    const malePattern = /male|daniel|alex|fred|thomas|oliver|david|mark|george|arthur|matthew/i;

    const pattern = hint === "female" ? femalePattern : malePattern;
    const opposite = hint === "female" ? malePattern : femalePattern;

    return (
      pool.find((v) => pattern.test(v.name)) ??
      pool.find((v) => !opposite.test(v.name)) ??
      pool[0]
    );
  }

  /** Voices load asynchronously on first use in some browsers. */
  private async ensureVoices(): Promise<void> {
    if (window.speechSynthesis.getVoices().length > 0) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      window.speechSynthesis.addEventListener(
        "voiceschanged",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    if (!this.available || !text.trim()) return;
    await this.ensureVoices();

    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = this.pickVoice(options.voiceHint);
      if (voice) utterance.voice = voice;
      // Slightly quick — real prospects don't speak at dictation pace.
      utterance.rate = options.rate ?? 1.05;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (this.current === utterance) this.current = null;
        resolve();
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      this.current = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }

  cancel(): void {
    if (!this.available) return;
    this.current = null;
    window.speechSynthesis.cancel();
  }
}

export const browserVoiceProvider: VoiceProvider = {
  id: "browser",
  label: "Browser speech (free)",
  stt: new BrowserStt(),
  tts: new BrowserTts(),
};

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getVoiceProvider } from "@/voice";
import { buildGreeting } from "@/lib/prompts";
import type { CallType, Persona, Turn } from "@/lib/types";

export type CallPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended";

export type CallOutcome = "meeting_booked" | "hung_up" | "rep_ended" | null;

export interface CallSessionOptions {
  persona: Persona;
  callType: CallType;
  repName: string;
  /**
   * Keep the mic open while the prospect is talking so the rep can interrupt.
   * Requires headphones — with speakers the mic transcribes the prospect's own
   * synthesised voice and the call derails.
   */
  allowBargeIn?: boolean;
  /** Silence in milliseconds that marks the end of the rep's turn. */
  endOfTurnMs?: number;
}

export interface CallSession {
  phase: CallPhase;
  transcript: Turn[];
  /** What the rep is saying right now, before it is committed to the transcript. */
  partial: string;
  /** The prospect's reply as it streams in. */
  streaming: string;
  outcome: CallOutcome;
  elapsedSec: number;
  error: string | null;
  micSupported: boolean;
  start: () => Promise<void>;
  /** Commits whatever the rep has said so far without waiting for silence. */
  submitTurn: () => void;
  hangUp: () => void;
}

export function useCallSession(options: CallSessionOptions): CallSession {
  const { persona, callType, allowBargeIn = false, endOfTurnMs = 1500 } = options;

  const [phase, setPhase] = useState<CallPhase>("idle");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [partial, setPartial] = useState("");
  const [streaming, setStreaming] = useState("");
  const [outcome, setOutcome] = useState<CallOutcome>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const voice = useRef(getVoiceProvider());
  const session = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const pending = useRef<string[]>([]);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef<Turn[]>([]);
  const phaseRef = useRef<CallPhase>("idle");
  const startedAt = useRef<number>(0);
  const busy = useRef(false);

  const micSupported = voice.current.stt.available;

  /**
   * Reads the live phase. Going through a function call (rather than touching
   * `phaseRef.current` inline) stops TypeScript narrowing the phase at one
   * check and holding that narrowing across an await, where it is no longer true.
   */
  const isEnded = useCallback(() => phaseRef.current === "ended", []);

  const setPhaseSafe = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    session.current?.abort();
    session.current = null;
    setPartial("");
  }, [clearSilenceTimer]);

  /* ------------------------------------------------------------ call timer */

  useEffect(() => {
    if (phase === "idle" || phase === "ended") return;
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  /* --------------------------------------------------------------- cleanup */

  useEffect(() => {
    const tts = voice.current.tts;
    return () => {
      clearSilenceTimer();
      session.current?.abort();
      tts.cancel();
    };
  }, [clearSilenceTimer]);

  /* ------------------------------------------------------- prospect speaks */

  const speakAsProspect = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setPhaseSafe("speaking");
      if (!allowBargeIn) stopListening();
      await voice.current.tts.speak(text, { voiceHint: persona.voiceHint });
    },
    [allowBargeIn, persona.voiceHint, setPhaseSafe, stopListening],
  );

  /* ----------------------------------------------------------- end of call */

  const endCall = useCallback(
    (why: CallOutcome) => {
      clearSilenceTimer();
      session.current?.abort();
      session.current = null;
      voice.current.tts.cancel();
      setPartial("");
      setStreaming("");
      setOutcome(why);
      setPhaseSafe("ended");
    },
    [clearSilenceTimer, setPhaseSafe],
  );

  /* --------------------------------------------------- one turn of the call */

  // Declared as a ref so the recogniser callbacks always reach the latest copy
  // without tearing down and rebuilding the recogniser on every render.
  const runTurnRef = useRef<(repText: string) => Promise<void>>(async () => {});

  const startListening = useCallback(() => {
    if (isEnded()) return;
    if (session.current) return;
    if (!voice.current.stt.available) return;

    setPhaseSafe("listening");

    session.current = voice.current.stt.listen({
      onPartial: (text) => {
        setPartial(text);
        // Rep talking over the prospect: cut the synthesised voice off.
        if (allowBargeIn && voice.current.tts.speaking) voice.current.tts.cancel();
      },
      onFinal: (text) => {
        pending.current.push(text);
        setPartial("");
        clearSilenceTimer();
        silenceTimer.current = setTimeout(() => {
          const said = pending.current.join(" ").trim();
          pending.current = [];
          if (said) void runTurnRef.current(said);
        }, endOfTurnMs);
      },
      onError: (message) => setError(message),
      onEnd: () => {
        session.current = null;
      },
    });
  }, [allowBargeIn, clearSilenceTimer, endOfTurnMs, isEnded, setPhaseSafe]);

  const runTurn = useCallback(
    async (repText: string) => {
      if (busy.current || isEnded()) return;
      busy.current = true;
      clearSilenceTimer();

      try {
        const repTurn: Turn = {
          speaker: "rep",
          text: repText,
          at: Date.now() - startedAt.current,
        };
        const nextTranscript = [...transcriptRef.current, repTurn];
        transcriptRef.current = nextTranscript;
        setTranscript(nextTranscript);

        setPhaseSafe("thinking");
        setStreaming("");
        if (!allowBargeIn) stopListening();

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            personaId: persona.id,
            callType,
            transcript: nextTranscript,
          }),
        });

        if (!response.ok || !response.body) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error ?? `Request failed (${response.status}).`);
        }

        const { text, signals } = await consumeStream(response.body, (chunk) =>
          setStreaming((prev) => prev + chunk),
        );

        if (isEnded()) return;

        const prospectTurn: Turn = {
          speaker: "prospect",
          text,
          at: Date.now() - startedAt.current,
        };
        const withProspect = [...transcriptRef.current, prospectTurn];
        transcriptRef.current = withProspect;
        setTranscript(withProspect);
        setStreaming("");

        await speakAsProspect(text);

        if (signals.meetingBooked) return endCall("meeting_booked");
        if (signals.hangup) return endCall("hung_up");

        if (!isEnded()) startListening();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong on that turn.");
        setStreaming("");
        if (!isEnded()) startListening();
      } finally {
        busy.current = false;
      }
    },
    [
      allowBargeIn,
      callType,
      clearSilenceTimer,
      endCall,
      isEnded,
      persona.id,
      setPhaseSafe,
      speakAsProspect,
      startListening,
      stopListening,
    ],
  );

  runTurnRef.current = runTurn;

  /* ------------------------------------------------------------ public API */

  const start = useCallback(async () => {
    setError(null);
    setOutcome(null);
    setTranscript([]);
    transcriptRef.current = [];
    pending.current = [];
    startedAt.current = Date.now();
    setElapsedSec(0);
    setPhaseSafe("connecting");

    if (!voice.current.stt.available) {
      setError(voice.current.stt.unavailableReason ?? "Microphone input is unavailable.");
    }

    // The prospect picks up first, exactly as on a real dial.
    const greeting = buildGreeting(persona, callType);
    const greetingTurn: Turn = { speaker: "prospect", text: greeting, at: 0 };
    transcriptRef.current = [greetingTurn];
    setTranscript([greetingTurn]);

    await speakAsProspect(greeting);
    if (!isEnded()) startListening();
  }, [callType, isEnded, persona, setPhaseSafe, speakAsProspect, startListening]);

  const submitTurn = useCallback(() => {
    clearSilenceTimer();
    const said = [...pending.current, partial].join(" ").trim();
    pending.current = [];
    setPartial("");
    if (said) void runTurnRef.current(said);
  }, [clearSilenceTimer, partial]);

  const hangUp = useCallback(() => endCall("rep_ended"), [endCall]);

  return {
    phase,
    transcript,
    partial,
    streaming,
    outcome,
    elapsedSec,
    error,
    micSupported,
    start,
    submitTurn,
    hangUp,
  };
}

/** Reads the NDJSON turn stream, forwarding deltas and returning the final turn. */
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (chunk: string) => void,
): Promise<{ text: string; signals: { hangup: boolean; meetingBooked: boolean } }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let text = "";
  let signals = { hangup: false, meetingBooked: false };

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as
      | { t: "delta"; text: string }
      | { t: "done"; text: string; signals: typeof signals }
      | { t: "error"; message: string };

    if (event.t === "delta") {
      text += event.text;
      onDelta(event.text);
    } else if (event.t === "done") {
      text = event.text;
      signals = event.signals;
    } else {
      throw new Error(event.message);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  handleLine(buffer);

  return { text, signals };
}

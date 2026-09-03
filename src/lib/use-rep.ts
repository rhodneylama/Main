"use client";

import { useCallback, useEffect, useState } from "react";
import type { Rep } from "./types";

const STORAGE_KEY = "salesfloor.rep";

export interface RepIdentity {
  id: string;
  name: string;
}

/**
 * Who is using this browser. The app has no login — it is an internal wall-board
 * plus a practice tool — so a rep picks their name once and it sticks. Anything
 * that awards points needs this, so it also tells callers when it's still unset.
 */
export function useRepIdentity() {
  const [rep, setRep] = useState<RepIdentity | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setRep(JSON.parse(raw) as RepIdentity);
    } catch {
      /* private browsing, or a value from an older version — start fresh */
    }
    setLoaded(true);
  }, []);

  const choose = useCallback((next: RepIdentity | null) => {
    setRep(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to do — the choice just won't survive a refresh */
    }
  }, []);

  return { rep, loaded, choose };
}

/** Fetches the roster once. Used by every "who are you" picker. */
export function useRoster() {
  const [reps, setReps] = useState<Rep[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reps")
      .then((r) => r.json())
      .then((data: { reps?: Rep[] }) => {
        if (!cancelled) setReps(data.reps ?? []);
      })
      .catch(() => {
        /* the picker falls back to free-text entry */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return reps;
}

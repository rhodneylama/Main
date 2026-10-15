import { describe, expect, it } from "vitest";
import { guessRep, parseTranscript } from "../src/replay/parse.js";

describe("parseTranscript", () => {
  it("reads bracketed timestamps and merges same-speaker runs", () => {
    const lines = parseTranscript(
      "[00:00:02] Rep: How did you start?\n[00:00:10] Owner: Garage.\n[00:00:20] Owner: Six trucks now.\n[00:01:05] Rep: Nice.",
    );
    expect(lines.map((l) => [l.speaker, l.text, l.atMs])).toEqual([
      ["Rep", "How did you start?", 2000],
      ["Owner", "Garage. Six trucks now.", 10000],
      ["Rep", "Nice.", 65000],
    ]);
  });

  it("reads Zoom VTT captions", () => {
    const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nAlex: Hi there\n\n2\n00:00:04.500 --> 00:00:06.000\nSam: Hello";
    expect(parseTranscript(vtt, "call.vtt").map((l) => [l.speaker, l.text, l.atMs])).toEqual([
      ["Alex", "Hi there", 1000],
      ["Sam", "Hello", 4500],
    ]);
  });

  it("reads header-style exports with text underneath", () => {
    const otter = "Alex Smith  0:00\nHow many calls do you miss?\n\nSam Jones  0:04\nA lot.\nMaybe twenty a week.";
    expect(parseTranscript(otter).map((l) => [l.speaker, l.text, l.atMs])).toEqual([
      ["Alex Smith", "How many calls do you miss?", 0],
      ["Sam Jones", "A lot. Maybe twenty a week.", 4000],
    ]);
  });

  it("estimates times for plain speaker lines", () => {
    const lines = parseTranscript("Alex: one two three four five\nSam: ok");
    expect(lines[0].atMs).toBe(0);
    expect(lines[1].atMs).toBe(2600);
  });

  it("reads Recall JSON", () => {
    const json = JSON.stringify([
      { participant: { name: "Alex" }, words: [{ text: "Hi", start_timestamp: { relative: 1.5 } }, { text: "there" }] },
    ]);
    expect(parseTranscript(json, "x.json")).toEqual([{ speaker: "Alex", text: "Hi there", atMs: 1500 }]);
  });

  it("splits long monologues into timed chunks", () => {
    const sentence = "We run six trucks across the north side of town every day. ";
    const lines = parseTranscript(`[00:00:00] Owner: ${sentence.repeat(12)}`);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.speaker === "Owner")).toBe(true);
    expect(lines[1].atMs).toBeGreaterThan(lines[0].atMs);
  });

  it("guesses the rep as the speaker asking the most questions", () => {
    const lines = parseTranscript("Alex: How many trucks? Who answers?\nSam: Six. My wife.\nAlex: What do jobs average?");
    expect(guessRep(lines)).toBe("Alex");
  });
});

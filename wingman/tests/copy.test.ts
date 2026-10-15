import { describe, expect, it } from "vitest";
import { cleanCopy } from "../src/brain/copy.js";

describe("cleanCopy", () => {
  it("fixes punctuation rules in place", () => {
    expect(cleanCopy("Ask about after hours — they miss calls!").text).toBe("Ask about after hours, they miss calls.");
    expect(cleanCopy("Next step: ask about weekends").text).toBe("Next step, ask about weekends");
  });

  it("leaves clock times alone", () => {
    expect(cleanCopy("Ask what happens after 5:30").text).toBe("Ask what happens after 5:30");
  });

  it("flags banned words without rewriting them", () => {
    const { text, warnings } = cleanCopy("Ask how many leads go to the call center");
    expect(text).toBe("Ask how many leads go to the call center");
    expect(warnings).toEqual(["says lead instead of appointment", "says call center"]);
  });
});

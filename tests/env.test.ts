import { describe, expect, it } from "vitest";
import { nonEmpty } from "@/lib/env";

/**
 * Regression cover for a real deployment failure: Railway reads .env.example,
 * pre-creates every variable it finds, and passes the ones you never filled in
 * as empty strings. `??` treats "" as a real value, so an untouched field in a
 * hosting dashboard silently replaced every default — including the database
 * path, and the currency code, which threw a RangeError on every money value.
 */
describe("nonEmpty", () => {
  it("treats an empty or blank string as unset", () => {
    expect(nonEmpty("")).toBeUndefined();
    expect(nonEmpty("   ")).toBeUndefined();
    expect(nonEmpty("\t\n")).toBeUndefined();
  });

  it("treats a missing variable as unset", () => {
    expect(nonEmpty(undefined)).toBeUndefined();
    expect(nonEmpty(null)).toBeUndefined();
  });

  it("keeps a real value, trimmed of stray whitespace", () => {
    expect(nonEmpty("GBP")).toBe("GBP");
    expect(nonEmpty("  /data/salesfloor.db  ")).toBe("/data/salesfloor.db");
  });

  it("falls back with ?? once a blank value is normalised", () => {
    expect(nonEmpty("") ?? "USD").toBe("USD");
    expect(nonEmpty("EUR") ?? "USD").toBe("EUR");
  });
});

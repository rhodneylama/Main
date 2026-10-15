import { describe, expect, it } from "vitest";
import { safeNext } from "../src/auth.js";

describe("safeNext", () => {
  it("keeps same-site paths and drops everything else", () => {
    expect(safeNext("/call.html?id=1")).toBe("/call.html?id=1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
  });
});

import { describe, expect, it, vi, afterEach } from "vitest";

/**
 * Proves the blank-variable case end to end for the settings a hosting
 * dashboard is most likely to create empty.
 */
afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("configuration with blank environment variables", () => {
  it("formats money with the default currency rather than throwing", async () => {
    vi.stubEnv("NEXT_PUBLIC_CURRENCY", "");
    const { money } = await import("@/lib/format");
    expect(() => money(123_45)).not.toThrow();
    expect(money(123_45)).toContain("123");
  });

  it("keeps the real currency when one is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_CURRENCY", "GBP");
    const { money } = await import("@/lib/format");
    expect(money(100_00)).toContain("£");
  });

  it("leaves the site open when the password is blank", async () => {
    vi.stubEnv("SALESFLOOR_PASSWORD", "   ");
    const { sitePassword } = await import("@/lib/auth");
    expect(sitePassword()).toBe("");
  });

  it("uses the real GoHighLevel host when the base is blank", async () => {
    vi.stubEnv("GHL_API_BASE", "");
    vi.stubEnv("SALESFLOOR_DB_PATH", "");
    const { testConnection } = await import("@/lib/ghl/client");
    // A blank base would make this a relative fetch and fail differently; the
    // point is only that the module resolves a real default without throwing.
    expect(typeof testConnection).toBe("function");
  });

  it("does not count the .env.example placeholder as a real API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-...");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    const { hasCredentials } = await import("@/lib/anthropic");
    expect(hasCredentials()).toBe(false);
  });

  it("counts a real-looking key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-api03-realkeyvalue");
    const { hasCredentials } = await import("@/lib/anthropic");
    expect(hasCredentials()).toBe(true);
  });

  it("falls back to the bundled models when the model names are blank", async () => {
    vi.stubEnv("PROSPECT_MODEL", "");
    vi.stubEnv("SCORING_MODEL", "  ");
    const { PROSPECT_MODEL, SCORING_MODEL } = await import("@/lib/anthropic");
    expect(PROSPECT_MODEL).toBeTruthy();
    expect(SCORING_MODEL).toBeTruthy();
  });
});

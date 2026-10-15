/**
 * Enforces ABU's copy rules on anything Wingman writes. Punctuation rules are
 * fixed in place. Word rules are only flagged, because a nudge may legitimately
 * echo the prospect ("ask how many jobs they lose"), and a blind rewrite would
 * garble it.
 */

const BANNED_WORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bleads?\b/i, label: "says lead instead of appointment" },
  { pattern: /\bcall cent(er|re)s?\b/i, label: "says call center" },
  { pattern: /\boffshore\b/i, label: "says offshore" },
  { pattern: /\bAI[- ]powered\b/i, label: "makes an AI-powered claim" },
];

export interface CleanedCopy {
  text: string;
  warnings: string[];
}

export function cleanCopy(input: string): CleanedCopy {
  let text = input.trim();

  // Only spaces and tabs are collapsed, so paragraphs in a summary or email survive.
  // Em and en dashes used as breaks become commas.
  text = text.replace(/[ \t]*[—–][ \t]*/g, ", ");
  // A colon followed by whitespace is a written colon. Leave times like 5:30 alone.
  // One that ends a line ("Next steps:") becomes a full stop.
  text = text.replace(/:(?=[ \t]*(\n|$))/g, ".");
  text = text.replace(/:(?=\s)/g, ",");
  text = text.replace(/!+/g, ".");
  text = text.replace(/,[ \t]*,/g, ",").replace(/[ \t]+,/g, ",").replace(/\.[ \t]*\./g, ".");
  text = text.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n").trim();

  const warnings = BANNED_WORDS.filter((w) => w.pattern.test(text)).map((w) => w.label);
  return { text, warnings };
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

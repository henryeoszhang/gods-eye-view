// Pure lookup shared by the runtime and its test: no DOM, no imports.
//
// A language pack is { entries, patterns }. `entries` is an exact map; `patterns`
// is an ordered list of [RegExp, build] for the strings the app composes at
// runtime ("Live Flights: OFF", "CelesTrak · never"). Patterns are tried only
// when the exact lookup misses.

/**
 * Translate one rendered string, preserving the whitespace that surrounds it.
 * Lookup is exact and case-sensitive so Material Symbols ligatures ("draw",
 * "public", "normal") can never collide with the UI words that share a spelling.
 * A miss returns the input unchanged — English is the fallback, never a blank.
 */
export function translate(pack, raw) {
  if (typeof raw !== 'string' || !raw) return raw;
  const lead = raw.length - raw.trimStart().length;
  const tail = raw.length - raw.trimEnd().length;
  const core = raw.slice(lead, raw.length - tail);
  if (!core || !pack) return raw;
  const hit = pack.entries?.[core] ?? matchPattern(pack.patterns, core);
  if (typeof hit !== 'string' || !hit) return raw;
  return raw.slice(0, lead) + hit + raw.slice(raw.length - tail);
}

/** First matching pattern wins. Patterns must not be global: `exec` is stateful. */
function matchPattern(patterns, core) {
  for (const [pattern, build] of patterns ?? []) {
    const match = pattern.exec(core);
    if (match) return build(...match.slice(1));
  }
  return undefined;
}

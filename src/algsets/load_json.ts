// Data files are imported with `?raw` and parsed here, rather than imported as
// `.json`. A plain JSON import compiles to a JavaScript object literal, so the
// engine parses megabytes of *source syntax*; `JSON.parse` on one string is the
// engine's fast path for the same result. For the biggest set (edge_comms) that
// is the difference between parsing 1.9 MB of literals and one JSON.parse call.
//
// scripts/vite-plugin-json-raw.mjs minifies the string on the way into the
// bundle, so the pretty-printed (reviewable) source files don't ship their
// indentation.
export const parseRaw = <T>(raw: string): T => JSON.parse(raw) as T

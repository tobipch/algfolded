/**
 * The algset data files are imported with `?raw` so they arrive as one string
 * and go through JSON.parse — far cheaper than having the JS engine parse a
 * multi-megabyte object literal, which is what a plain `.json` import compiles
 * to. `?raw` ships the file byte for byte, though, and the committed files are
 * pretty-printed (2-space indent) so their diffs stay reviewable.
 *
 * This plugin strips that formatting on the way into the bundle: sources stay
 * readable, the bundle ships the compact form. Applies only to `.json?raw`
 * ids, so other `?raw` imports are untouched.
 */
export default function jsonRaw() {
  return {
    name: 'algfolded:json-raw-minify',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.json\?raw$/.test(id)) return null
      // `code` is Vite's generated module: export default "<escaped file>".
      const match = /export default (".*")\s*;?\s*$/s.exec(code)
      if (!match) return null
      let text
      try {
        text = JSON.parse(match[1]) // unescape the string literal
      } catch {
        return null
      }
      let minified
      try {
        minified = JSON.stringify(JSON.parse(text))
      } catch {
        return null // not valid JSON — leave it alone rather than corrupt it
      }
      return { code: `export default ${JSON.stringify(minified)};`, map: null }
    },
  }
}

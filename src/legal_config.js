// Operator details for /imprint and /privacy.
//
// This is the only file to edit -- the legal pages pull these values in every
// language, so the address lives in one place instead of in four locale files.
// Any field left as an empty string is skipped in the rendered page rather than
// printed as a blank line.
export const legalConfig = {
  // Name of the person or organisation running the site.
  operatorName: 'Tobias Peter',

  // Optional -- an empty array omits the address block entirely.
  //
  // A postal address is required for commercial sites (DE: DDG section 5; CH:
  // UWG art. 3 lit. s covers paid offerings). Algfolded is free and sells
  // nothing, so neither applies. What does apply -- revDSG art. 19 and GDPR
  // art. 13 -- asks for "identity and contact details" and does not spell out
  // a postal address, so name plus a working email is defensible here.
  //
  // One entry per printed line, e.g.
  //   ['Musterstrasse 1', '8000 Zürich', 'Schweiz']
  addressLines: [],

  // Contact address for data protection requests. Required: the information
  // duty is only met if people can actually reach you. An alias that forwards
  // to your inbox works and keeps your personal address off the page.
  email: 'tobias.peter@bluewin.ch',

  // Optional, leave empty to omit.
  phone: '',

  // Shown as "last updated" on both pages. Bump it whenever the text changes.
  lastUpdated: '2026-08-03',

  // Where the site and its data are hosted. Named in the privacy policy as the
  // processors that necessarily see visitor data.
  hosting: {
    frontend: 'Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA',
    database: 'Hostpoint AG, Neue Jonastrasse 60, 8640 Rapperswil, Switzerland',
  },

  sourceCodeUrl: 'https://github.com/tobipch/algfolded',
}

// True once the operator has replaced the placeholders above. The pages show a
// visible warning while this is false, so an unfilled imprint can't quietly go
// live and look finished.
export function isConfigComplete(config) {
  const filled = (v) => typeof v === 'string' && v.trim() !== '' && !v.startsWith('TODO')
  // The address is optional (see above), so an empty list passes. Any line
  // that *is* present has to be real, so a half-edited address can't ship.
  return filled(config.operatorName)
      && filled(config.email)
      && (config.addressLines ?? []).every(filled)
}

export function isLegalConfigComplete() {
  return isConfigComplete(legalConfig)
}

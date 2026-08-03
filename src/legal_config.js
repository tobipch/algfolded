// Operator details for /imprint and /privacy.
//
// This is the only file to edit -- the legal pages pull these values in every
// language, so the address lives in one place instead of in four locale files.
// Any field left as an empty string is skipped in the rendered page rather than
// printed as a blank line.
export const legalConfig = {
  // Name of the person or organisation running the site.
  operatorName: 'TODO: Name',

  // Street, postcode/city, country -- one array entry per printed line.
  addressLines: [
    'TODO: Strasse und Nummer',
    'TODO: PLZ und Ort',
    'TODO: Land',
  ],

  // Contact address for data protection requests. Required: the information
  // duty is only met if people can actually reach you.
  email: 'TODO: kontakt@example.com',

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
export function isLegalConfigComplete() {
  const filled = (v) => typeof v === 'string' && v.trim() !== '' && !v.startsWith('TODO')
  return filled(legalConfig.operatorName)
      && filled(legalConfig.email)
      && legalConfig.addressLines.every(filled)
}

'use strict';

/* ==========================================================================
   REDACT — strip personal names and dollar amounts from the public mirror.
   The local database keeps the full text; only exported JSON is redacted.
   ========================================================================== */

const NAME_RULES = [
  [/\bDad\s*\/\s*Pete Wicher\b/g, 'Landlord / Owner'],
  [/\bPete Wicher\b/g, 'Owner'],
  [/\bPete\b/g, 'Owner'],
  [/\bDad\b/g, 'the Owner'],
];

function redact(value) {
  let out = String(value == null ? '' : value);
  for (const [pattern, replacement] of NAME_RULES) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(/\$\s?[\d,]+(?:\.\d{1,2})?/g, () => '$[redacted]');
  out = out.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, () => '[redacted email]');
  return out;
}

module.exports = { redact };

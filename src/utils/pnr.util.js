// src/utils/pnr.util.js
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomChars(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

/**
 * Generate a PNR of length 6-8, prefix optional
 */
exports.generatePNR = (prefix = '') => {
  return (prefix ? prefix + '-' : '') + randomChars(6);
};

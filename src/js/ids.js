// ids.js - helper for generating patient codes
// Uses crypto.getRandomValues so codes are unpredictable on the client

const ALPHANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generatePatientCode(prefix = 'PX') {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const randomPart = Array.from(bytes, (byte) => ALPHANUM[byte % ALPHANUM.length]).join('');
  return `${prefix}-${randomPart}`;
}

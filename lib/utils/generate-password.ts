import { randomInt } from 'crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '@$!%*&_#';
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

/**
 * Generate a random temporary password that satisfies the application's
 * password policy: at least one lowercase, uppercase, digit, and special char.
 * Returns a 12-character string using a cryptographically secure RNG.
 */
export function generateTemporaryPassword(): string {
  const pickFrom = (chars: string) => chars[randomInt(chars.length)];

  // Guarantee one of each required class
  const required = [pickFrom(UPPER), pickFrom(LOWER), pickFrom(DIGITS), pickFrom(SPECIAL)];

  // Fill remaining characters
  const extra = Array.from({ length: 8 }, () => pickFrom(ALL));

  // Fisher-Yates shuffle using crypto.randomInt
  const chars = [...required, ...extra];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

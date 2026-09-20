import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * Hash plain text password using bcrypt with salt rounds 12.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare plain text password against stored bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Password strength validator.
 * Requirements: Minimum 8 characters, at least one uppercase letter,
 * one lowercase letter, and one number.
 */
export function isStrongPassword(password: string): boolean {
  if (password.length < 8) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasUpper && hasLower && hasNumber;
}

import bcrypt from "bcryptjs";

/**
 * Hash a password using bcrypt
 *
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verify a password against a hash
 *
 * @param password - Plain text password
 * @param hash - Hashed password
 * @returns True if password matches hash
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a random password
 *
 * @param length - Length of the password (default 12)
 * @returns Random password string
 */
export function generateRandomPassword(length: number = 12): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  const randomValues = new Uint8Array(length);

  // Get cryptographically secure random values
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    password += charset[randomValues[i] % charset.length];
  }

  return password;
}

/**
 * Validate password strength
 * Returns object with validity and reasons for invalidity
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (password.length < 8) {
    reasons.push("La contraseña debe tener al menos 8 caracteres");
  }

  if (!/[a-z]/.test(password)) {
    reasons.push("La contraseña debe contener al menos una letra minúscula");
  }

  if (!/[A-Z]/.test(password)) {
    reasons.push("La contraseña debe contener al menos una letra mayúscula");
  }

  if (!/[0-9]/.test(password)) {
    reasons.push("La contraseña debe contener al menos un número");
  }

  if (!/[!@#$%^&*]/.test(password)) {
    reasons.push(
      "La contraseña debe contener al menos un carácter especial (!@#$%^&*)",
    );
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

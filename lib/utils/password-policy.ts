import { getSystemSettings } from '@/lib/server/system-settings';

/**
 * Validate a plaintext password against the current system settings policy.
 * Returns null if the password is valid, or a human-readable error string if not.
 */
export async function validatePassword(password: string): Promise<string | null> {
  const settings = await getSystemSettings();

  if (password.length < settings.passwordMinLength) {
    return `Password must be at least ${settings.passwordMinLength} characters`;
  }
  if (settings.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (settings.passwordRequireLowercase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (settings.passwordRequireNumbers && !/\d/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (settings.passwordRequireSpecial && !/[@$!%*?&_\-#]/.test(password)) {
    return 'Password must contain at least one special character (@$!%*?&_-#)';
  }

  return null;
}

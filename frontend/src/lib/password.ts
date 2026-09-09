import { ApiError, changePassword, changePasswordErrorMessage } from "@/api/client";

export { changePassword, changePasswordErrorMessage };

export function validatePasswordChange(
  current: string,
  next: string,
  confirm: string
): string | null {
  if (!current) return "Enter your current password.";
  if (!next || next.length < 8) return "New password must be at least 8 characters.";
  if (current === next) {
    return "New password must be different from the current password.";
  }
  if (next !== confirm) return "New password and confirmation do not match.";
  return null;
}

export function mapChangePasswordError(err: unknown): string {
  if (err instanceof ApiError) return changePasswordErrorMessage(err);
  if (err instanceof Error) return changePasswordErrorMessage(err);
  return "Could not change password. Try again.";
}

export function ownPasswordPayload(
  hasPassword: boolean,
  currentPassword: string,
  newPassword: string,
): { currentPassword?: string; newPassword: string } {
  return hasPassword ? { currentPassword, newPassword } : { newPassword };
}

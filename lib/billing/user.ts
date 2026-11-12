/**
 * Placeholder until Track B merges `lib/account/user.ts`; then every import
 * of this file switches to that one and this file is deleted.
 * Everyone is the same user, which is only acceptable on a preview.
 */
export async function getUserId(request: Request): Promise<string | null> {
  void request;
  return "placeholder-user";
}

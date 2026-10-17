/**
 * Beta access: HTTP Basic auth against a fixed list of testers.
 *
 * BETA_USERS holds comma-separated "login:password" pairs. When it is unset,
 * access is open in development and closed in production, so a deploy that
 * forgets the variable never ends up public.
 */

export type BetaUsers = Map<string, string>;

export function parseBetaUsers(raw: string | undefined): BetaUsers {
  const users: BetaUsers = new Map();
  for (const entry of (raw ?? "").split(",")) {
    const separator = entry.indexOf(":");
    if (separator <= 0) continue;
    const login = entry.slice(0, separator).trim();
    const password = entry.slice(separator + 1).trim();
    if (login && password) users.set(login, password);
  }
  return users;
}

function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export type AccessDecision = "allow" | "challenge" | "closed";

export function checkBetaAccess(
  authorization: string | null,
  users: BetaUsers,
  isProduction: boolean,
): AccessDecision {
  if (users.size === 0) return isProduction ? "closed" : "allow";
  if (!authorization?.startsWith("Basic ")) return "challenge";

  let decoded: string;
  try {
    decoded = atob(authorization.slice("Basic ".length));
  } catch {
    return "challenge";
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return "challenge";
  const login = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  const expected = users.get(login);
  // Compare against a dummy when the login is unknown so timing does not leak it.
  const ok = constantTimeEqual(password, expected ?? "\u0000".repeat(password.length + 1));
  return ok && expected !== undefined ? "allow" : "challenge";
}

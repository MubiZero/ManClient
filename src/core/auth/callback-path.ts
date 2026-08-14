/** Anything at or below this is a control character or a space; browsers strip them while normalising. */
const LAST_CONTROL_CODE_POINT = 0x20;
const DELETE_CODE_POINT = 0x7f;

/**
 * Where a sign-in may send the person afterwards.
 *
 * The value arrives in a link anyone can write — the Telegram bot builds one, but so could a stranger
 * in a chat — so it is treated as a destination *request*, not a destination. Only a path inside this
 * app survives; anything a browser could read as another origin is dropped and the caller falls back
 * to its own default. Without that check the login screen becomes an open redirect: a link showing our
 * domain, taking a password, and landing on somebody else's copy of it.
 */
export function safeCallbackPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  // Checked before the prefix tests below, because a stripped tab or newline turns a string we would
  // have rejected into one the browser happily reads as a scheme.
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= LAST_CONTROL_CODE_POINT || code === DELETE_CODE_POINT) return null;
  }
  if (!value.startsWith("/")) return null;
  // "//host" and "/\host" are both read as protocol-relative URLs — a different origin.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

import { generateKeyPairSync, sign } from "node:crypto";

/**
 * Clerk-shaped session tokens signed with a key pair generated per test run.
 *
 * Passing `jwtKey` to the real verifier makes it check these tokens exactly
 * as it checks Clerk's, with no network. Only the key differs from
 * production.
 */

/** A syntactically valid development publishable key for example.clerk.accounts.dev. */
export const TEST_PUBLISHABLE_KEY =
  "pk_test_" + Buffer.from("example.clerk.accounts.dev$").toString("base64");
/** Unused by local verification; the Clerk client requires a value. */
export const TEST_SECRET_KEY = "sk_test_" + "0".repeat(48);

export interface TokenOptions {
  /** Seconds until expiry; negative for an expired token. Defaults to 60. */
  expiresIn?: number;
  /** Seconds until the token becomes valid (future `nbf`). Defaults to 0. */
  notBefore?: number;
}

export function createTestTokens() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwtKey = publicKey.export({ type: "spki", format: "pem" }).toString();
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

  const signWith = (key: typeof privateKey, claims: Record<string, unknown>, options: TokenOptions) => {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT", kid: "ins_test" };
    const payload = {
      iss: "https://example.clerk.accounts.dev",
      sid: "sess_test",
      v: 2,
      iat: now - 5,
      nbf: now - 5 + (options.notBefore ?? 0),
      exp: now + (options.expiresIn ?? 60),
      ...claims,
    };
    const body = encode(header) + "." + encode(payload);
    return body + "." + sign("RSA-SHA256", Buffer.from(body), key).toString("base64url");
  };

  return {
    jwtKey,
    /** A token for Clerk user `sub` with the given extra claims. */
    issue: (claims: Record<string, unknown> & { sub: string }, options: TokenOptions = {}) =>
      signWith(privateKey, claims, options),
    /** A correctly shaped token signed with a different key. */
    forge: (claims: Record<string, unknown> & { sub: string }) => signWith(other.privateKey, claims, {}),
  };
}

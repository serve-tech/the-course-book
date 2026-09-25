import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createDatabase } from "../db/client";
import { contractDocument } from "./emit";

/**
 * Guards on the published contract. The generated Swift and Kotlin clients
 * and installed app builds depend on it, so these rules fail the build
 * rather than surface in an app review.
 */

const committed: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../contract/openapi.json", import.meta.url)), "utf8"),
);
const document = contractDocument();

interface Operation {
  operationId?: string;
  tags?: string[];
  security?: Record<string, string[]>[];
  parameters?: { name: string; in: string }[];
}
interface SchemaObject {
  properties?: Record<string, unknown>;
  required?: string[];
}

const operations = Object.entries(document.paths).flatMap(([path, item]) =>
  (["get", "put", "post", "delete"] as const).flatMap((method) => {
    const operation = (item as Partial<Record<typeof method, Operation>>)[method];
    return operation ? [{ path, method, operation }] : [];
  }),
);

const schemas = Object.entries(document.components?.schemas ?? {}) as [string, SchemaObject][];

/** Walk any JSON value and collect every object key. */
const keys = (value: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) for (const item of value) keys(item, found);
  else if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      found.add(key);
      keys(child, found);
    }
  return found;
};

describe("published contract", () => {
  it("matches contract/openapi.json (run `pnpm contract:emit` after changing routes)", () => {
    expect(JSON.parse(JSON.stringify(document))).toEqual(committed);
  });

  it("is served unchanged at /v1/openapi.json", async () => {
    const app = createApp({
      db: createDatabase("postgres://contract@127.0.0.1:1/contract").db,
      verifySession: () => Promise.resolve(null),
      provisioner: { resolve: () => Promise.reject(new Error("unused")), forget: () => undefined },
      search: { search: () => Promise.resolve([]) },
      webOrigins: [],
      clientConfig: { minimumVersions: { ios: "0.0.0", android: "0.0.0" }, privacyUrl: "https://coursebook.golf/privacy", accountDeletionUrl: "https://coursebook.golf/account" },
    });
    const response = await app.request("/v1/openapi.json");
    expect(await response.json()).toEqual(committed);
  });

  it("names every operation uniquely and tags it", () => {
    const ids = operations.map(({ operation }) => operation.operationId);
    expect(ids.every((id) => typeof id === "string" && /^[a-z][A-Za-z]+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(operations.every(({ operation }) => (operation.tags?.length ?? 0) > 0)).toBe(true);
  });

  it("uses no polymorphic schemas, which generate poorly in Swift and Kotlin", () => {
    const used = keys(document);
    for (const keyword of ["oneOf", "anyOf", "allOf", "discriminator"]) expect(used.has(keyword)).toBe(false);
  });

  it("never exposes an email property", () => {
    for (const [, schema] of schemas) expect(Object.keys(schema.properties ?? {})).not.toContain("email");
  });

  it("marks every response field required so clients never see it missing", () => {
    for (const [name, schema] of schemas) {
      if (name.endsWith("Request")) continue;
      expect({ name, required: [...(schema.required ?? [])].sort() }).toEqual({
        name,
        required: Object.keys(schema.properties ?? {}).sort(),
      });
    }
  });

  it("rejects every secured operation without a token", async () => {
    const app = createApp({
      db: createDatabase("postgres://contract@127.0.0.1:1/contract").db,
      verifySession: () => Promise.resolve(null),
      provisioner: { resolve: () => Promise.reject(new Error("must not be reached")), forget: () => undefined },
      search: { search: () => Promise.reject(new Error("must not be reached")) },
      webOrigins: [],
      clientConfig: { minimumVersions: { ios: "0.0.0", android: "0.0.0" }, privacyUrl: "https://coursebook.golf/privacy", accountDeletionUrl: "https://coursebook.golf/account" },
    });
    const samples: Record<string, string> = {
      courseId: "11111111-1111-4111-8111-111111111111",
      username: "someone",
      q: "Arcadia",
    };
    const secured = operations.filter(({ operation }) => (operation.security?.length ?? 0) > 0);
    expect(secured.length).toBeGreaterThan(0);
    for (const { path, method, operation } of secured) {
      let url = path.replace(/\{(\w+)\}/g, (_match, name: string) => samples[name] ?? "x");
      const query = (operation.parameters ?? []).filter((p) => p.in === "query" && samples[p.name]);
      if (query.length) url += "?" + query.map((p) => p.name + "=" + (samples[p.name] ?? "")).join("&");
      const response = await app.request(url, {
        method: method.toUpperCase(),
        ...(method === "get" || method === "delete" ? {} : { headers: { "content-type": "application/json" }, body: "{}" }),
      });
      expect({ operation: operation.operationId, status: response.status }).toEqual({ operation: operation.operationId, status: 401 });
    }
  });
});

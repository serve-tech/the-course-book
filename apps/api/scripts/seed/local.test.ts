import { describe, expect, it } from "vitest";
import { isLocalDatabaseUrl } from "./local";

describe("isLocalDatabaseUrl", () => {
  it.each([
    { url: "postgres://coursebook:coursebook@localhost:5433/coursebook", local: true },
    { url: "postgresql://user@127.0.0.1/db", local: true },
    { url: "postgres://user@[::1]:5432/db", local: true },
    { url: "postgresql://user:secret@dpg-abc123-a.ohio-postgres.render.com/coursebook?sslmode=require", local: false },
    { url: "postgres://user@aws-0-us-east-1.pooler.supabase.com:5432/postgres", local: false },
    { url: "postgres://user@localhost.example.com/db", local: false },
    { url: "postgres:///db?host=/var/run/postgresql", local: false },
    { url: "not a url", local: false },
  ])("$url -> $local", ({ url, local }) => {
    expect(isLocalDatabaseUrl(url)).toBe(local);
  });
});

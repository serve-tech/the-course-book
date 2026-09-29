import { describe, expect, it } from "vitest";
import {
  createProvisioner,
  identityFromClaims,
  identityFromClerkUser,
  type AppUser,
  type Identity,
} from "./provisioning";

describe("identity from session claims", () => {
  it("reads the custom claims and defaults the display name", () => {
    expect(
      identityFromClaims({ sub: "user_1", username: "golfer_1", email: "g@example.com" }),
    ).toEqual({ username: "golfer_1", displayName: "golfer_1", email: "g@example.com", avatarUrl: null });
  });

  it("uses the name claim and ignores claims it does not know", () => {
    expect(
      identityFromClaims({ username: "golfer_1", name: " Golfer One ", first_name: "Golfer", id: "user_1" }),
    ).toEqual({ username: "golfer_1", displayName: "Golfer One", email: null, avatarUrl: null });
  });

  it("returns undefined without a username claim so the backend is consulted", () => {
    expect(identityFromClaims({ sub: "user_1" })).toBeUndefined();
    expect(identityFromClaims(null)).toBeUndefined();
  });
});

describe("identity from a Clerk user", () => {
  it.each([
    {
      user: { username: "golfer_1", fullName: "Golfer One", primaryEmailAddress: { emailAddress: "g@example.com" }, imageUrl: "https://img/1" },
      expected: { username: "golfer_1", displayName: "Golfer One", email: "g@example.com", avatarUrl: "https://img/1" },
    },
    {
      user: { username: null, fullName: null, primaryEmailAddress: null, imageUrl: "" },
      expected: { username: "", displayName: "", email: null, avatarUrl: null },
    },
  ])("maps $user.username", ({ user, expected }) => {
    expect(identityFromClerkUser(user)).toEqual(expected);
  });
});

/** A provisioner over recording fakes for the database upsert and Clerk lookup. */
function harness(ttlMs = 1000) {
  let clock = 0;
  const provisioned: [string, Identity][] = [];
  const fetched: string[] = [];
  const provisioner = createProvisioner({
    ttlMs,
    now: () => clock,
    provision: (clerkId, identity): Promise<AppUser> => {
      provisioned.push([clerkId, identity]);
      return Promise.resolve({ id: clerkId, username: identity.username, displayName: identity.displayName });
    },
    fetchIdentity: (clerkId) => {
      fetched.push(clerkId);
      return Promise.resolve({ username: "fetched_" + clerkId, displayName: "Fetched", email: null, avatarUrl: null });
    },
  });
  return {
    provisioner,
    provisioned,
    fetched,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const claims = (username: string, name = "Golfer") => ({ username, name });

describe("provisioner cache", () => {
  it("provisions once per user within the TTL", async () => {
    const h = harness();
    await h.provisioner.resolve("u1", claims("golfer_1"));
    await h.provisioner.resolve("u1", claims("golfer_1"));
    expect(h.provisioned).toHaveLength(1);
  });

  it("provisions again after the TTL expires", async () => {
    const h = harness(1000);
    await h.provisioner.resolve("u1", claims("golfer_1"));
    h.advance(1000);
    await h.provisioner.resolve("u1", claims("golfer_1"));
    expect(h.provisioned).toHaveLength(2);
  });

  it("provisions again when the claims carry a changed identity", async () => {
    const h = harness();
    await h.provisioner.resolve("u1", claims("golfer_1", "Old"));
    const user = await h.provisioner.resolve("u1", claims("golfer_1", "New"));
    expect(h.provisioned).toHaveLength(2);
    expect(user.displayName).toBe("New");
  });

  it("fetches identity only on a cache miss when claims lack it", async () => {
    const h = harness();
    await h.provisioner.resolve("u1", {});
    await h.provisioner.resolve("u1", {});
    expect(h.fetched).toEqual(["u1"]);
    expect(h.provisioned).toHaveLength(1);
  });

  it("provisions again after forget", async () => {
    const h = harness();
    await h.provisioner.resolve("u1", claims("golfer_1"));
    h.provisioner.forget("u1");
    await h.provisioner.resolve("u1", claims("golfer_1"));
    expect(h.provisioned).toHaveLength(2);
  });

  it("keeps users separate", async () => {
    const h = harness();
    const first = await h.provisioner.resolve("u1", claims("golfer_1"));
    const second = await h.provisioner.resolve("u2", claims("golfer_2"));
    expect([first.id, second.id]).toEqual(["u1", "u2"]);
    expect(h.provisioned).toHaveLength(2);
  });

  it("does not cache a failed provision", async () => {
    let attempts = 0;
    const provisioner = createProvisioner({
      provision: () => {
        attempts += 1;
        return Promise.reject(new Error("database unavailable"));
      },
      fetchIdentity: () => Promise.reject(new Error("unused")),
    });
    await expect(provisioner.resolve("u1", claims("golfer_1"))).rejects.toThrow("database unavailable");
    await expect(provisioner.resolve("u1", claims("golfer_1"))).rejects.toThrow("database unavailable");
    expect(attempts).toBe(2);
  });
});

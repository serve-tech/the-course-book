import { describe, expect, it, vi } from "vitest";
import { clerkImportAccounts } from "./run";

const HASH = "$2a$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234";

function fakeClerkUsers() {
  type Found = { data: { id: string; username: string; fullName: string }[]; totalCount: number };
  const createUser = vi.fn<(params: unknown) => Promise<{ id: string }>>().mockResolvedValue({ id: "user_new" });
  const getUserList = vi
    .fn<(params: unknown) => Promise<Found>>()
    .mockResolvedValue({ data: [{ id: "user_1", username: "golfer", fullName: "One Golfer" }], totalCount: 1 });
  return { createUser, getUserList };
}

describe("Clerk import accounts", () => {
  it("imports a bcrypt digest as the member's password", async () => {
    const users = fakeClerkUsers();
    const accounts = clerkImportAccounts(users as never);
    await accounts.create({ email: "one@example.com", username: "golfer", firstName: "One", externalId: "sb-1", passwordDigest: HASH });
    expect(users.createUser).toHaveBeenCalledWith({
      emailAddress: ["one@example.com"],
      username: "golfer",
      firstName: "One",
      externalId: "sb-1",
      passwordDigest: HASH,
      passwordHasher: "bcrypt",
    });
  });

  it("creates a member without a password when there is no digest", async () => {
    const users = fakeClerkUsers();
    await clerkImportAccounts(users as never).create({ email: "two@example.com", username: "bee", firstName: "Bee", externalId: "sb-2", passwordDigest: null });
    expect(users.createUser.mock.calls[0]?.[0]).toEqual({
      emailAddress: ["two@example.com"],
      username: "bee",
      firstName: "Bee",
      externalId: "sb-2",
      skipPasswordRequirement: true,
    });
  });

  it("finds an account by email", async () => {
    const users = fakeClerkUsers();
    await expect(clerkImportAccounts(users as never).findByEmail("one@example.com")).resolves.toEqual({
      id: "user_1",
      username: "golfer",
      fullName: "One Golfer",
    });
    expect(users.getUserList).toHaveBeenCalledWith({ emailAddress: ["one@example.com"] });
  });
});

import { ClerkAPIResponseError } from "@clerk/backend/errors";
import { describe, expect, it } from "vitest";
import { createClerkAccountDirectory } from "./accounts";

const clerkFailing = (error: Error) => createClerkAccountDirectory({ users: { deleteUser: () => Promise.reject(error) } });

describe("Clerk account directory", () => {
  it("deletes the user", async () => {
    const deleted: string[] = [];
    const directory = createClerkAccountDirectory({
      users: {
        deleteUser: (id) => {
          deleted.push(id);
          return Promise.resolve({});
        },
      },
    });
    await directory.deleteUser("user_1");
    expect(deleted).toEqual(["user_1"]);
  });

  it("treats an already deleted user as done", async () => {
    await expect(clerkFailing(new ClerkAPIResponseError("Not Found", { data: [], status: 404 })).deleteUser("user_1")).resolves.toBeUndefined();
  });

  it.each([
    ["a Clerk server error", new ClerkAPIResponseError("Server Error", { data: [], status: 500 })],
    ["a network failure", new TypeError("fetch failed")],
  ])("reports %s", async (_label, error) => {
    await expect(clerkFailing(error).deleteUser("user_1")).rejects.toBe(error);
  });
});

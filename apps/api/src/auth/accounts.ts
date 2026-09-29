import { isClerkAPIResponseError } from "@clerk/backend/errors";

/** The identity provider's side of account deletion. */
export interface AccountDirectory {
  /**
   * Delete the Clerk user and with it every session and sign-in method.
   * Succeeds when the user is already gone, so a retried deletion finishes.
   */
  deleteUser(clerkId: string): Promise<void>;
}

/** The subset of the Clerk Backend API client this needs. */
export interface ClerkUsersApi {
  users: { deleteUser(userId: string): Promise<unknown> };
}

export function createClerkAccountDirectory(clerk: ClerkUsersApi): AccountDirectory {
  return {
    async deleteUser(clerkId) {
      try {
        await clerk.users.deleteUser(clerkId);
      } catch (error) {
        if (isClerkAPIResponseError(error) && error.status === 404) return;
        throw error;
      }
    },
  };
}

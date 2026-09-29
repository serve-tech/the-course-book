import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider, useLoaderData } from "react-router";
import type { FriendRequests, MemberRelationship, PublicMember } from "@coursebook/domain/friends/types";
import { Relationship } from "@coursebook/domain/friends/types";
import { clientAction, clientLoader } from "../../routes/friends";
import { FriendsPage } from "./FriendsPage";

const transport = vi.hoisted(() => vi.fn<(request: Request) => Promise<Response>>());
vi.mock("@clerk/react-router", () => ({ getToken: () => Promise.resolve("test-token") }));
vi.mock("../../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/api")>();
  const { createApiClient } = await import("../../lib/api/client");
  return {
    ...original,
    api: createApiClient({ baseUrl: "https://api.example.test", getToken: () => Promise.resolve("test-token"), fetch: transport }),
  };
});

const alice = { username: "alice", displayName: "Alice" };
const bravo = { username: "bravo", displayName: "Bravo" };
const charlie = { username: "charlie", displayName: "Charlie" };
const notify = vi.fn<(message: string) => void>();
const routers: ReturnType<typeof createMemoryRouter>[] = [];
let requests: FriendRequests;
let members: PublicMember[];
let hits: MemberRelationship[];
let write: (request: Request) => Promise<Response>;

/** Controlled HTTP response; the component, action, fetcher and loader stay real. */
function deferredResponse() {
  let resolve: (response: Response) => void = () => { throw new Error("response not initialized"); };
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function Page() {
  const data = useLoaderData<typeof clientLoader>();
  return <FriendsPage {...data} notify={notify} />;
}

async function openFriends(path = "/friends") {
  const router = createMemoryRouter([{
    path: "/friends/:username?",
    loader: (args) => clientLoader({ ...args, serverLoader: () => Promise.resolve(undefined) }),
    action: (args) => clientAction({ ...args, serverAction: () => Promise.resolve(undefined) }),
    Component: Page,
    hydrateFallbackElement: <p>Loading friends…</p>,
  }], { initialEntries: [path] });
  routers.push(router);
  render(<RouterProvider router={router} />);
  await screen.findByLabelText("Add a friend");
}

function person(name: string) {
  const row = screen.getByText(name, { selector: ".course" }).closest(".friend-person");
  if (!(row instanceof HTMLElement)) throw new Error("missing member row");
  return within(row);
}

beforeEach(() => {
  requests = { incoming: [alice, bravo], outgoing: [charlie] };
  members = [];
  hits = [];
  notify.mockReset();
  write = () => Promise.reject(new Error("unexpected mutation"));
  transport.mockReset();
  transport.mockImplementation((request) => {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET") return write(request);
    if (path === "/v1/members") return Promise.resolve(Response.json({ members, nextCursor: null }));
    if (path === "/v1/me/friend-requests") return Promise.resolve(Response.json(requests));
    if (path === "/v1/member-search") return Promise.resolve(Response.json({ results: hits }));
    if (path === "/v1/members/alice") return Promise.resolve(Response.json({ member: alice, courses: [] }));
    throw new Error("unexpected request: " + path);
  });
});

afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
});

describe("friend action serialization", () => {
  it("reserves the shared action while navigating away before removal", async () => {
    requests = { incoming: [bravo], outgoing: [charlie] };
    members = [alice];
    await openFriends("/friends/alice");
    fireEvent.click(screen.getByRole("button", { name: "Remove friend…" }));

    const navigation = deferredResponse();
    const serve = transport.getMockImplementation();
    if (!serve) throw new Error("missing HTTP transport");
    transport.mockImplementation((request) => new URL(request.url).pathname === "/v1/members"
      ? navigation.promise
      : serve(request));
    write = () => {
      members = [];
      transport.mockImplementation(serve);
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    expect(person("bravo").getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(person("charlie").getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(transport.mock.calls.filter(([request]) => request.method !== "GET")).toHaveLength(0);

    navigation.resolve(Response.json({ members: [alice], nextCursor: null }));
    await waitFor(() => { expect(notify).toHaveBeenCalledWith("alice is no longer your friend."); });
    expect(transport.mock.calls.filter(([request]) => request.method === "DELETE")).toHaveLength(1);
    expect(person("bravo").getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.queryByRole("option", { name: "alice" })).not.toBeInTheDocument();
  });

  it.each([false, true])("keeps other member actions disabled until a request settles (failure=%s)", async (fails) => {
    const pending = deferredResponse();
    write = () => pending.promise;
    hits = [{ member: { username: "delta", displayName: "Delta" }, relationship: Relationship.None }];
    await openFriends();
    fireEvent.change(screen.getByLabelText("Add a friend"), { target: { value: "delta" } });
    await screen.findByRole("button", { name: "Add friend" });
    fireEvent.click(person("alice").getByRole("button", { name: "Accept" }));
    await waitFor(() => { expect(transport.mock.calls.filter(([request]) => request.method === "PUT")).toHaveLength(1); });

    expect(person("bravo").getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(person("bravo").getByRole("button", { name: "Decline" })).toBeDisabled();
    expect(person("charlie").getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add friend" })).toBeDisabled();
    fireEvent.click(person("bravo").getByRole("button", { name: "Accept" }));
    expect(transport.mock.calls.filter(([request]) => request.method !== "GET")).toHaveLength(1);

    if (!fails) {
      requests = { ...requests, incoming: [bravo] };
      members = [alice];
    }
    pending.resolve(fails
      ? Response.json({ error: { code: "internal", message: "Could not accept Alice.", requestId: null, fields: null } }, { status: 500 })
      : Response.json({ member: alice, relationship: Relationship.Friends }));
    await waitFor(() => { expect(notify).toHaveBeenCalledWith(fails ? "Could not accept Alice." : "You and alice are now friends."); });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(person("bravo").getByRole("button", { name: "Accept" })).toBeEnabled();
    if (!fails) expect(screen.getByRole("option", { name: "alice" })).toBeInTheDocument();
  });
});

describe("search relationship refresh", () => {
  it("removes the old Accept result after declining, until the refreshed search answers", async () => {
    requests = { incoming: [alice], outgoing: [] };
    hits = [{ member: alice, relationship: Relationship.Incoming }];
    await openFriends();
    fireEvent.change(screen.getByLabelText("Add a friend"), { target: { value: "alice" } });
    await waitFor(() => { expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(2); });

    const refreshed = deferredResponse();
    const serve = transport.getMockImplementation();
    if (!serve) throw new Error("missing HTTP transport");
    transport.mockImplementation((request) => new URL(request.url).pathname === "/v1/member-search"
      ? refreshed.promise
      : serve(request));
    write = () => {
      requests = { incoming: [], outgoing: [] };
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => { expect(notify).toHaveBeenCalledWith("Request from alice declined."); });
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    await waitFor(() => { expect(transport.mock.calls.filter(([request]) => new URL(request.url).pathname === "/v1/member-search")).toHaveLength(2); });
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();

    await act(async () => {
      refreshed.resolve(Response.json({ results: [{ member: alice, relationship: Relationship.None }] }));
      await refreshed.promise;
    });
    expect(await screen.findByRole("button", { name: "Add friend" })).toBeEnabled();
    expect(transport.mock.calls.filter(([request]) => request.method === "PUT")).toHaveLength(0);
  });
});

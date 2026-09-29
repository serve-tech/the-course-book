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
let aliceIsFriend: boolean;
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
  aliceIsFriend = true;
  notify.mockReset();
  write = () => Promise.reject(new Error("unexpected mutation"));
  transport.mockReset();
  transport.mockImplementation((request) => {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET") return write(request);
    if (path === "/v1/members") return Promise.resolve(Response.json({ members, nextCursor: null }));
    if (path === "/v1/me/friend-requests") return Promise.resolve(Response.json(requests));
    if (path === "/v1/member-search") return Promise.resolve(Response.json({ results: hits }));
    if (path === "/v1/members/alice")
      return Promise.resolve(aliceIsFriend
        ? Response.json({ member: alice, courses: [] })
        : Response.json({ error: { code: "member_not_found", message: "No member with that username.", requestId: null, fields: null } }, { status: 404 }));
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
      // As the API does: once removed, alice's list is 404 for this viewer.
      members = [];
      aliceIsFriend = false;
      transport.mockImplementation(serve);
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    const listLoads = () => transport.mock.calls.filter(([request]) => new URL(request.url).pathname === "/v1/members").length;
    const loadsBefore = listLoads();
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    await waitFor(() => { expect(listLoads()).toBeGreaterThan(loadsBefore); });
    expect(person("bravo").getByRole("button", { name: "Accept" })).toBeDisabled();
    expect(person("charlie").getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(transport.mock.calls.filter(([request]) => request.method !== "GET")).toHaveLength(0);

    navigation.resolve(Response.json({ members: [alice], nextCursor: null }));
    await waitFor(() => { expect(notify).toHaveBeenCalledWith("alice is no longer your friend."); });
    expect(transport.mock.calls.filter(([request]) => request.method === "DELETE")).toHaveLength(1);
    const [router] = routers;
    expect(router?.state.location.pathname).toBe("/friends");
    expect(router?.state.historyAction).toBe("REPLACE");
    expect(router?.state.errors).toBeNull();
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

describe("member search", () => {
  const searches = () =>
    transport.mock.calls.map(([request]) => request).filter((request) => new URL(request.url).pathname === "/v1/member-search");

  it("asks nothing below three characters", async () => {
    await openFriends();
    fireEvent.change(screen.getByLabelText("Add a friend"), { target: { value: "al" } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searches()).toHaveLength(0);
    expect(document.querySelector("#friendSearchResults")).toBeNull();
  });

  it("shows only the latest query's answer when an older one arrives late", async () => {
    const early = deferredResponse();
    const serve = transport.getMockImplementation();
    if (!serve) throw new Error("missing HTTP transport");
    transport.mockImplementation((request) => new URL(request.url).searchParams.get("q") === "alp" ? early.promise : serve(request));
    hits = [{ member: alice, relationship: Relationship.None }];
    await openFriends();

    fireEvent.change(screen.getByLabelText("Add a friend"), { target: { value: "alp" } });
    await waitFor(() => { expect(searches()).toHaveLength(1); });
    fireEvent.change(screen.getByLabelText("Add a friend"), { target: { value: "alice" } });
    await screen.findByText("alice", { selector: "#friendSearchResults .course" });
    expect(searches()[0]?.signal.aborted).toBe(true);

    await act(async () => {
      early.resolve(Response.json({ results: [{ member: bravo, relationship: Relationship.None }] }));
      await early.promise;
    });
    expect(screen.queryByText("bravo", { selector: "#friendSearchResults .course" })).not.toBeInTheDocument();
  });

  it("explains a failed search in words, not the browser's", async () => {
    const serve = transport.getMockImplementation();
    if (!serve) throw new Error("missing HTTP transport");
    transport.mockImplementation((request) =>
      new URL(request.url).pathname === "/v1/member-search" ? Promise.reject(new TypeError("Failed to fetch")) : serve(request),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await openFriends();
    fireEvent.change(screen.getByLabelText("Add a friend"), { target: { value: "alice" } });
    expect(await screen.findByText("Could not reach the server. Check your connection and try again.")).toBeInTheDocument();
    warn.mockRestore();
  });
});

describe("friend action failures", () => {
  it("reports a network failure and keeps the page usable", async () => {
    write = () => Promise.reject(new TypeError("Failed to fetch"));
    await openFriends();
    fireEvent.click(person("alice").getByRole("button", { name: "Accept" }));
    await waitFor(() => { expect(notify).toHaveBeenCalledWith("Could not reach the server. Check your connection and try again."); });
    expect(person("alice").getByRole("button", { name: "Accept" })).toBeEnabled();
  });

  it("logs an unexpected error and reports it without replacing the page", async () => {
    write = () => Promise.reject(new RangeError("boom"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await openFriends();
    fireEvent.click(person("alice").getByRole("button", { name: "Accept" }));
    await waitFor(() => { expect(notify).toHaveBeenCalledWith("Something went wrong. Please try again."); });
    expect(logged).toHaveBeenCalled();
    expect(screen.getByLabelText("Add a friend")).toBeInTheDocument();
    logged.mockRestore();
  });

  it("cancels the viewer's own request", async () => {
    write = (request) => {
      expect([request.method, new URL(request.url).pathname]).toEqual(["DELETE", "/v1/me/friends/charlie"]);
      requests = { ...requests, outgoing: [] };
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    await openFriends();
    fireEvent.click(person("charlie").getByRole("button", { name: "Cancel" }));
    await waitFor(() => { expect(notify).toHaveBeenCalledWith("Request to charlie canceled."); });
    expect(screen.queryByText("charlie", { selector: ".course" })).not.toBeInTheDocument();
  });
});

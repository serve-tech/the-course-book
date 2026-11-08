import { describe, expect, it, vi } from "vitest";
import { createWebShell } from "./web-shell";

const page = (body: string, status = 200) => Promise.resolve(new Response(body, { status }));

function setup() {
  let time = 1_000_000;
  const fetchPage = vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
  const onError = vi.fn<(error: unknown) => void>();
  const shell = createWebShell({ url: "https://coursebook.golf", onError, fetchPage, now: () => time });
  return {
    shell,
    fetchPage,
    onError,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("createWebShell", () => {
  it("reads index.html, then reuses the copy while it is fresh", async () => {
    const { shell, fetchPage, advance } = setup();
    fetchPage.mockImplementation(() => page("<html>one</html>"));
    expect(await shell.read()).toBe("<html>one</html>");
    expect(fetchPage.mock.calls[0]?.[0]).toBe("https://coursebook.golf/index.html");
    advance(29_000);
    await shell.read();
    expect(fetchPage).toHaveBeenCalledOnce();
  });

  it("reads a new copy once the old one is stale, so a new build's assets are named", async () => {
    const { shell, fetchPage, advance } = setup();
    fetchPage.mockImplementationOnce(() => page("old")).mockImplementationOnce(() => page("new"));
    await shell.read();
    advance(31_000);
    expect(await shell.read()).toBe("new");
  });

  it("keeps serving the last good copy when a read fails, and reports it", async () => {
    const { shell, fetchPage, onError, advance } = setup();
    fetchPage.mockImplementationOnce(() => page("good")).mockImplementationOnce(() => page("down", 503));
    await shell.read();
    advance(31_000);
    expect(await shell.read()).toBe("good");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("answers null when no copy has ever been read", async () => {
    const { shell, fetchPage, onError } = setup();
    fetchPage.mockRejectedValue(new Error("offline"));
    expect(await shell.read()).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("tries again on the next link after a failed first read", async () => {
    const { shell, fetchPage } = setup();
    fetchPage.mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(() => page("back"));
    await shell.read();
    expect(await shell.read()).toBe("back");
  });

  it("shares one read among links that arrive together", async () => {
    const { shell, fetchPage } = setup();
    fetchPage.mockImplementation(() => page("one"));
    await Promise.all([shell.read(), shell.read(), shell.read()]);
    expect(fetchPage).toHaveBeenCalledOnce();
  });
});

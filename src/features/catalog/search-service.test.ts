import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "../../test/fixtures";
import { SearchService } from "./search-service";

const apiCourse = {
  id: "api-test",
  name: "Test Alpha Links",
  city: "Detroit",
  state: "MI",
  country: "USA",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("course discovery", () => {
  it("calls the default fetch with its global receiver instead of the service instance", async () => {
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json([apiCourse]));
    });
    vi.stubGlobal("fetch", fetcher);
    const service = new SearchService(fixture().catalog);

    const results = await service.search(
      "Test Alpha",
      123,
      new AbortController().signal,
    );

    expect(results.map((result) => result.course.name)).toEqual([
      "Test Alpha Links",
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.opengolfapi.org/v1/courses/search?q=Test%20Alpha&limit=50&_cb=123",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("does not substitute local catalog matches for an empty API result", async () => {
    const f = fixture();
    const known = f.catalog.all()[0];
    if (!known) throw new Error("Expected a bundled course fixture");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    const service = new SearchService(f.catalog, fetcher);

    await expect(
      service.search(known.name, 123, new AbortController().signal),
    ).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports an upstream failure instead of presenting an empty search", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const report = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const service = new SearchService(fixture().catalog, fetcher);

    await expect(
      service.search("Test Alpha", 123, new AbortController().signal),
    ).rejects.toThrow("Course search is temporarily unavailable");
    expect(report).toHaveBeenCalled();
  });
  it("searches and caches the CSV fallback when the REST API fails", async () => {
    const csv =
      'id,name,city,state,country\r\nalpha,"Alpha, ""Old"" Links",Detroit,MI,USA\r\nbeta,Beta Links,Detroit,MI,USA\r\n';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(csv))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = new SearchService(fixture().catalog, fetcher);

    const first = await service.search(
      "Alpha",
      123,
      new AbortController().signal,
    );
    const second = await service.search(
      "Beta",
      124,
      new AbortController().signal,
    );

    expect(first.map((result) => result.course.name)).toEqual([
      'Alpha, "Old" Links',
    ]);
    expect(second.map((result) => result.course.name)).toEqual(["Beta Links"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://raw.githubusercontent.com/opengolfapi/data/main/opengolfapi-us.csv",
      expect.objectContaining({ headers: { Accept: "text/csv" } }),
    );
  });
  it("preserves cancellation when the dataset request fails after abort", async () => {
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementationOnce(() => {
        controller.abort();
        return Promise.reject(new Error("Request interrupted"));
      });
    const report = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const service = new SearchService(fixture().catalog, fetcher);

    await expect(
      service.search("Alpha", 123, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(report).toHaveBeenCalledTimes(1);
  });
});

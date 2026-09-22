import { afterEach, describe, expect, it, vi } from "vitest";
import { courseSchema } from "../features/catalog/course";
import { SEARCH_UNAVAILABLE, createCourseSearch } from "./search.server";

const known = courseSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Alpha Links",
  location: "Detroit, MI, USA",
  city: "Detroit",
  state: "MI",
  country: "USA",
});

const apiCourse = {
  id: "api-test",
  name: "Test Alpha Links",
  city: "Detroit",
  state: "MI",
  country: "USA",
};

const deps = (fetcher: typeof fetch) => ({
  fetcher,
  catalog: () => Promise.resolve([known]),
  apiUrl: "https://api.example.test/v1/courses/search",
  csvUrl: "https://data.example.test/courses.csv",
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("course search", () => {
  it("resolves API hits to catalog courses and keeps the catalog out of empty results", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([apiCourse]));
    const service = createCourseSearch(deps(fetcher));

    const results = await service.search("Test Alpha");
    expect(results.map((result) => result.course.id)).toEqual([known.id]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ href: "https://api.example.test/v1/courses/search?q=Test+Alpha&limit=50" }),
      expect.objectContaining({ cache: "no-store" }),
    );

    fetcher.mockResolvedValue(Response.json([]));
    await expect(service.search(known.name)).resolves.toEqual([]);
  });

  it("returns unknown courses with their API identity", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([{ name: "Mystery Meadows", city: "Nowhere", state: "KS" }]),
    );
    const results = await createCourseSearch(deps(fetcher)).search("Mystery");
    expect(results[0]?.course).toMatchObject({ name: "Mystery Meadows", country: "USA", state: "KS" });
    expect(results[0]?.course.id).toMatch(/^api-/);
  });

  it("reports an upstream failure instead of presenting an empty search", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(createCourseSearch(deps(fetcher)).search("Test Alpha")).rejects.toThrow(SEARCH_UNAVAILABLE);
    expect(warn).toHaveBeenCalled();
  });

  it("searches and caches the CSV dataset when the REST API fails", async () => {
    const csv = 'id,name,city,state,country\r\nalpha,"Alpha, ""Old"" Links",Detroit,MI,USA\r\nbeta,Beta Links,Detroit,MI,USA\r\n';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(csv))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = createCourseSearch(deps(fetcher));

    const first = await service.search("Alpha");
    const second = await service.search("Beta");
    expect(first.map((result) => result.course.name)).toEqual(['Alpha, "Old" Links']);
    expect(second.map((result) => result.course.name)).toEqual(["Beta Links"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://data.example.test/courses.csv",
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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(createCourseSearch(deps(fetcher)).search("Alpha", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("ignores queries shorter than two characters", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createCourseSearch(deps(fetcher)).search(" a ")).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

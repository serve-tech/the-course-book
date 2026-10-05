import { afterEach, describe, expect, it, vi } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import { SEARCH_UNAVAILABLE, createCourseSearch } from "./search";

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
    expect(results.map((result) => result.catalogId)).toEqual([known.id]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ href: "https://api.example.test/v1/courses/search?q=Test+Alpha&limit=50&offset=0" }),
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
    expect(results[0]?.catalogId).toBeNull();
  });

  // OpenGolfAPI's own course ids are uuids, like catalog ids; a uuid-shaped id
  // once made an unknown course look like a catalog course, and logging it
  // failed with course_not_found.
  it.each([
    ["no id", {}],
    ["a non-uuid id", { id: "og-7" }],
    ["an OpenGolfAPI uuid id", { id: "b25a4e85-561a-4ca4-8028-7c3480c9bbc0" }],
  ])("marks an unknown course with %s as outside the catalog", async (_label, identity) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([{ ...identity, name: "Mystery Meadows", city: "Nowhere", state: "KS" }]),
    );
    const [result] = await createCourseSearch(deps(fetcher)).search("Mystery");
    expect(result?.course.name).toBe("Mystery Meadows");
    expect(result?.catalogId).toBeNull();
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

  it("reads beyond 50 upstream matches before alphabetizing", async () => {
    const records = Array.from({ length: 55 }, (_, index) => ({ id: `course-${index}`, name: `Oakland Course ${String(55 - index).padStart(2, "0")}` }));
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ courses: records.slice(0, 50), total: 55 }))
      .mockResolvedValueOnce(Response.json({ courses: records.slice(50), total: 55 }));
    const results = await createCourseSearch(deps(fetcher)).search("Oakland");
    expect(results).toHaveLength(55);
    expect(results[0]?.course.name).toBe("Oakland Course 01");
    expect(fetcher.mock.calls.map(([url]) => url instanceof Request ? url.url : url.toString())).toEqual([
      "https://api.example.test/v1/courses/search?q=Oakland&limit=50&offset=0",
      "https://api.example.test/v1/courses/search?q=Oakland&limit=50&offset=50",
    ]);
  });

  it("reads all pages of a legacy array response without a total", async () => {
    const records = Array.from({ length: 50 }, (_, index) => ({ id: `course-${index}`, name: `Oakland Course ${index}` }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(records)).mockResolvedValueOnce(Response.json([{ name: "Oakland University: Katke-Cousins" }]));
    const results = await createCourseSearch(deps(fetcher)).search("Oakland");
    expect(results).toHaveLength(51);
    expect(results.at(-1)?.course.name).toBe("Oakland University: Katke-Cousins");
  });

  it.each(["failed", "repeated", "incomplete"])("discards partial REST results and uses the complete dataset for a %s later page", async (failure) => {
    const first = Array.from({ length: 50 }, (_, index) => ({ id: `rest-${index}`, name: `Oakland REST ${index}` }));
    const names = Array.from({ length: 61 }, (_, index) => `Oakland Dataset ${String(61 - index).padStart(2, "0")}`);
    const csv = "id,name,city,state,country\n" + names.map((name, index) => `${index},${name},Rochester,MI,USA`).join("\n");
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ courses: first, total: 100 }))
      .mockResolvedValueOnce(failure === "failed" ? new Response(null, { status: 503 }) : Response.json({ courses: failure === "repeated" ? first : [], total: 100 }))
      .mockResolvedValueOnce(new Response(csv));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const results = await createCourseSearch(deps(fetcher)).search("Oakland");
    expect(results.map((hit) => hit.course.name)).toEqual([...names].reverse());
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not fall back after cancellation between upstream pages", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => {
      controller.abort();
      return Promise.resolve(Response.json({ courses: [{ name: "Oakland" }], total: 100 }));
    });
    await expect(createCourseSearch(deps(fetcher)).search("Oakland", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ignores queries shorter than two characters", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createCourseSearch(deps(fetcher)).search(" a ")).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

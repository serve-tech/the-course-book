import { describe, expect, it, vi } from "vitest";
import { createCommonsClient } from "./commons";
import { AppError, ErrorCode } from "./errors";

const info = (name: string, overrides: { width?: number; license?: string } = {}) => ({
  url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}`,
  descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}`,
  thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}/330px-${name}`,
  width: overrides.width ?? 2000,
  height: 1333,
  mime: "image/jpeg",
  extmetadata: { Artist: { value: "Ana" }, LicenseShortName: { value: overrides.license ?? "CC BY 2.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by/2.0" } },
});

/** The URL a fake fetch was called with. */
const requested = (fetcher: { mock: { calls: Parameters<typeof fetch>[] } }, index = 0) => {
  const input = fetcher.mock.calls[index]?.[0];
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (input?.url ?? ""));
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createCommonsClient", () => {
  it("searches bitmaps, identifies the app, and keeps usable photos in Commons' order", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        query: {
          pages: [
            { title: "File:Second.jpg", index: 2, imageinfo: [info("Second.jpg")] },
            { title: "File:Logo.jpg", index: 3, imageinfo: [info("Logo.jpg", { license: "GFDL" })] },
            { title: "File:First.jpg", index: 1, imageinfo: [info("First.jpg")] },
          ],
        },
      }),
    );
    const results = await createCommonsClient({ fetcher }).search("Arcadia Bluffs");
    expect(results.map((result) => result.file)).toEqual(["File:First.jpg", "File:Second.jpg"]);
    expect(results[0]).not.toHaveProperty("url");
    const params = requested(fetcher).searchParams;
    const init = fetcher.mock.calls[0]?.[1];
    expect(params.get("gsrsearch")).toBe("Arcadia Bluffs filetype:bitmap");
    expect(params.get("gsrnamespace")).toBe("6");
    expect(new Headers(init?.headers).get("User-Agent")).toBe("TheCourseBook/1.0 (https://coursebook.golf)");
  });

  it("finds nothing when Commons has no matches", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ batchcomplete: true }));
    await expect(createCommonsClient({ fetcher }).search("zzzz")).resolves.toEqual([]);
  });

  it("looks up one file with its display URL, or null when it is unusable", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ query: { pages: [{ title: "File:First.jpg", imageinfo: [info("First.jpg")] }] } }))
      .mockResolvedValueOnce(json({ query: { pages: [{ title: "File:Gone.jpg", missing: true }] } }));
    const client = createCommonsClient({ fetcher });
    await expect(client.file("File:First.jpg")).resolves.toMatchObject({
      file: "File:First.jpg",
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/First.jpg/1280px-First.jpg",
      credit: "Ana",
      license: "CC BY 2.0",
    });
    await expect(client.file("File:Gone.jpg")).resolves.toBeNull();
    expect(requested(fetcher).searchParams.get("titles")).toBe("File:First.jpg");
  });

  it.each([
    { name: "a busy answer", fetcher: () => Promise.resolve(json({}, 429)) },
    { name: "a network failure", fetcher: () => Promise.reject(new TypeError("fetch failed")) },
    { name: "an unreadable answer", fetcher: () => Promise.resolve(new Response("<html>", { status: 200 })) },
  ])("reports Commons as unavailable on $name", async ({ fetcher }) => {
    const error = await createCommonsClient({ fetcher: vi.fn<typeof fetch>(fetcher) })
      .search("x")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 503, code: ErrorCode.CommonsUnavailable });
  });
});

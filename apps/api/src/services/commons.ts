import type { CommonsCandidate } from "@coursebook/domain/curation/types";
import { commonsPhoto, commonsQuerySchema, PREVIEW_WIDTH, toCandidate, type CommonsPhoto } from "../domain/commons";
import { AppError, ErrorCode } from "./errors";

/**
 * Wikimedia Commons, for curators picking course photos (decision
 * 2026-11-13). Reads only: a file search and one file's details. Which
 * files are usable is decided in `domain/commons.ts`.
 *
 * Wikimedia asks every client to identify itself with a User-Agent that
 * names the app and a way to reach it; the site's address is the contact.
 * Reference: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
 */

const API_URL = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "TheCourseBook/1.0 (https://coursebook.golf)";
const TIMEOUT_MS = 10_000;
const SEARCH_LIMIT = "30";
const METADATA = "Artist|LicenseShortName|LicenseUrl|ImageDescription";

export const COMMONS_UNAVAILABLE = "Wikimedia Commons isn't answering right now. Try again in a minute.";

/** Commons serves its images from this host only; nothing else is downloaded. */
const IMAGE_HOST = "upload.wikimedia.org";
/** A 1280 px Commons thumbnail is a few hundred KB; a narrower original is rarely more than a few MB. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 20_000;

export interface CommonsClient {
  /** Usable photos whose Commons pages match `query`, best match first. */
  search(query: string): Promise<CommonsCandidate[]>;
  /** One file by its page title ("File:…"); null when it is missing or unusable. */
  file(title: string): Promise<CommonsPhoto | null>;
  /**
   * Download an image Commons serves (a `CommonsPhoto.url`), to keep a copy
   * of it in the app's own storage (#67).
   *
   * Raises:
   *     AppError: 503 `commons_unavailable` when Commons fails, the URL
   *         isn't on upload.wikimedia.org, or the image is over 25 MB.
   */
  image(url: string): Promise<Uint8Array>;
}

export interface CommonsDependencies {
  fetcher?: typeof fetch;
}

/**
 * A response body, read until `maxBytes`; null when it is longer. The
 * download stops there, so an unexpected file is never held whole.
 */
export async function readAtMost(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function createCommonsClient(deps: CommonsDependencies = {}): CommonsClient {
  const fetcher = deps.fetcher ?? ((input, init) => globalThis.fetch(input, init));
  const unavailable = (cause: unknown) => new AppError(503, ErrorCode.CommonsUnavailable, COMMONS_UNAVAILABLE, { cause });

  async function query(params: Record<string, string>) {
    const url = API_URL + "?" + new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params }).toString();
    let response: Response;
    try {
      response = await fetcher(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (cause) {
      throw new AppError(503, ErrorCode.CommonsUnavailable, COMMONS_UNAVAILABLE, { cause });
    }
    if (!response.ok) throw new AppError(503, ErrorCode.CommonsUnavailable, COMMONS_UNAVAILABLE, { cause: new Error("Commons answered " + String(response.status)) });
    const parsed = commonsQuerySchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new AppError(503, ErrorCode.CommonsUnavailable, COMMONS_UNAVAILABLE, { cause: parsed.error });
    return parsed.data.query?.pages ?? [];
  }

  const imageinfo = { prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: String(PREVIEW_WIDTH), iiextmetadatafilter: METADATA };

  return {
    async search(text) {
      const pages = await query({
        generator: "search",
        gsrsearch: text + " filetype:bitmap",
        gsrnamespace: "6",
        gsrlimit: SEARCH_LIMIT,
        ...imageinfo,
      });
      return pages
        .toSorted((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .flatMap((page) => {
          const photo = commonsPhoto(page);
          return photo ? [toCandidate(photo)] : [];
        });
    },
    async file(title) {
      const [page] = await query({ titles: title, ...imageinfo });
      return page ? commonsPhoto(page) : null;
    },
    async image(url) {
      if (!URL.canParse(url) || new URL(url).protocol !== "https:" || new URL(url).hostname !== IMAGE_HOST)
        throw unavailable(new Error("Not a Commons image address"));
      let response: Response;
      try {
        response = await fetcher(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
      } catch (cause) {
        throw unavailable(cause);
      }
      if (!response.ok) throw unavailable(new Error("Commons answered " + String(response.status) + " for an image"));
      let bytes: Uint8Array | null;
      try {
        bytes = await readAtMost(response, MAX_IMAGE_BYTES);
      } catch (cause) {
        throw unavailable(cause);
      }
      if (!bytes) throw unavailable(new Error("The Commons image is larger than " + String(MAX_IMAGE_BYTES) + " bytes"));
      return bytes;
    },
  };
}

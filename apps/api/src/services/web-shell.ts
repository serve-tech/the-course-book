/** Reads the web app's `index.html`; null when no copy has ever been read. */
export interface WebShell {
  read(): Promise<string | null>;
}

/** How long a copy is used before reading it again. Short, because it names the current build's assets. */
const FRESH_MS = 30_000;
/** A shared link waits on this read, so a slow web host must not hold it for long. */
const TIMEOUT_MS = 3_000;

/**
 * The web app's page, read from the static site, for a shared ranking link
 * (decision 2026-11-03, ranking-first product). The API and the web app deploy
 * separately, so the API cannot carry its own copy: it would name assets from
 * an older build.
 *
 * Args:
 *     url: The web app's origin.
 *     onError: Told about a failed read; the previous copy keeps being served.
 *     fetchPage: The HTTP client; a stand-in in tests.
 *     now: The clock, in milliseconds; a stand-in in tests.
 *
 * Returns:
 *     A reader that keeps one copy and shares a single read among concurrent callers.
 */
export function createWebShell({
  url,
  onError,
  fetchPage = (input, init) => fetch(input, init),
  now = () => Date.now(),
}: {
  url: string;
  onError: (error: unknown) => void;
  fetchPage?: (input: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
}): WebShell {
  let copy: string | null = null;
  let readAt = Number.NEGATIVE_INFINITY;
  let reading: Promise<string | null> | null = null;

  const refresh = async (): Promise<string | null> => {
    try {
      const response = await fetchPage(url + "/index.html", { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error("The web app answered " + String(response.status));
      copy = await response.text();
      readAt = now();
    } catch (error) {
      onError(error);
    }
    return copy;
  };

  return {
    read: () => {
      if (now() - readAt < FRESH_MS) return Promise.resolve(copy);
      reading ??= refresh().finally(() => {
        reading = null;
      });
      return reading;
    },
  };
}

import { gunzipSync } from "node:zlib";
import type { BrowserContext, Page } from "@playwright/test";
import { eventProperties } from "../../apps/web/app/lib/telemetry/metrics";

/** Decode the real SDK's public ingest wire format; the external collector is stubbed. */
function decode(body: Buffer, url: URL): unknown {
  if (url.searchParams.get("compression") === "gzip-js" || (body[0] === 0x1f && body[1] === 0x8b)) return JSON.parse(gunzipSync(body).toString());
  const text = body.toString();
  if (text.startsWith("data=")) {
    const data = new URLSearchParams(text).get("data") ?? "";
    return JSON.parse(Buffer.from(data, "base64").toString());
  }
  return JSON.parse(text);
}

export async function stubPosthog(browser: BrowserContext | Page) {
  const bodies: unknown[] = [];
  await browser.route(/^https:\/\/[^/]*posthog\.com\//, async (route) => {
    const request = route.request();
    const body = request.postDataBuffer();
    if (body && request.method() === "POST") bodies.push(decode(body, new URL(request.url())));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}", headers: { "access-control-allow-origin": "*" } });
  });
  return {
    bodies,
    measurements: () => bodies.flatMap((body) => {
      const batch: unknown[] = Array.isArray(body) ? body : typeof body === "object" && body !== null && "batch" in body && Array.isArray(body.batch) ? body.batch : [body];
      return batch.flatMap((event) => {
        if (typeof event !== "object" || event === null || !("event" in event) || event.event !== "coursebook_performance" || !("properties" in event)) return [];
        return [eventProperties.parse(event.properties)];
      });
    }),
  };
}

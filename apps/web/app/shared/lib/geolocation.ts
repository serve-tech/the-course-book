import { z } from "zod";
import type { SafeStorage } from "./storage";
import { stateCode } from "@coursebook/domain/catalog/geography";
const responseSchema = z.object({
  countryCode: z.string().optional(),
  principalSubdivisionCode: z.string().optional(),
});
export function detectState(
  storage: SafeStorage,
  onState: (code: string) => void,
): () => void {
  if (storage.read("theCourseBookLocationPromptVersion") !== "v2") {
    storage.write("theCourseBookLocationPromptVersion", "v2");
    storage.remove("theCourseBookSelectedState");
    onState("");
  }
  if (
    storage.read("theCourseBookSelectedState") ||
    !("geolocation" in navigator)
  )
    return () => undefined;
  let active = true;
  const controller = new AbortController();
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const url =
        "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" +
        String(position.coords.latitude) +
        "&longitude=" +
        String(position.coords.longitude) +
        "&localityLanguage=en";
      void fetch(url, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Location lookup failed");
          const data: unknown = await response.json(),
            parsed = responseSchema.parse(data);
          const code = stateCode(
            parsed.principalSubdivisionCode?.replace(/^US-/, "") ?? "",
          );
          if (
            active &&
            parsed.countryCode === "US" &&
            code &&
            code !== "DC" &&
            !storage.read("theCourseBookSelectedState")
          )
            onState(code);
        })
        .catch((error: unknown) => {
          if (active)
            console.warn("Optional state detection unavailable", error);
        });
    },
    (error) => {
      if (active)
        console.info("Optional location permission unavailable", error.message);
    },
    { enableHighAccuracy: false, maximumAge: 0, timeout: 10000 },
  );
  return () => {
    active = false;
    controller.abort();
  };
}

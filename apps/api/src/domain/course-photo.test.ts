import { describe, expect, it } from "vitest";
import { toCoursePhoto, type StoredPhoto } from "./course-photo";

const stored = (url: string, width: number, storageKey: string | null = null): StoredPhoto => ({
  url,
  width,
  credit: "Ana",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Pine.jpg",
  storageKey,
});

describe("toCoursePhoto", () => {
  it.each([
    {
      name: "a Commons display-size thumbnail",
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pine.jpg/1280px-Pine.jpg",
      width: 4000,
      storageKey: null,
      thumb: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pine.jpg/330px-Pine.jpg",
    },
    {
      name: "a Commons original narrower than the display size",
      url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Pine.jpg",
      width: 800,
      storageKey: null,
      thumb: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pine.jpg/330px-Pine.jpg",
    },
    {
      name: "a photo in the app's own storage",
      url: "https://photos.coursebook.golf/courses/c1/p1/hero.webp",
      width: 1280,
      storageKey: "courses/c1/p1",
      thumb: "https://photos.coursebook.golf/courses/c1/p1/card.webp",
    },
    {
      name: "a stored photo served under a path, as a local emulator serves its bucket",
      url: "http://localhost:9310/coursebook-photos-dev/courses/c1/p1/hero.webp",
      width: 900,
      storageKey: "courses/c1/p1",
      thumb: "http://localhost:9310/coursebook-photos-dev/courses/c1/p1/card.webp",
    },
  ])("gives $name a 330 px thumbnail", ({ url, width, storageKey, thumb }) => {
    const photo = toCoursePhoto(stored(url, width, storageKey));
    expect(photo.url).toBe(url);
    expect(photo.thumbUrl).toBe(thumb);
  });
});

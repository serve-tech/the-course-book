import { describe, expect, it } from "vitest";
import { toCoursePhoto, type StoredPhoto } from "./course-photo";

const stored = (url: string, width: number): StoredPhoto => ({
  url,
  width,
  credit: "Ana",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Pine.jpg",
});

describe("toCoursePhoto", () => {
  it.each([
    {
      name: "a display-size thumbnail",
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pine.jpg/1280px-Pine.jpg",
      width: 4000,
      thumb: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pine.jpg/330px-Pine.jpg",
    },
    {
      name: "an original narrower than the display size",
      url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Pine.jpg",
      width: 800,
      thumb: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pine.jpg/330px-Pine.jpg",
    },
  ])("gives $name a 330 px thumbnail", ({ url, width, thumb }) => {
    const photo = toCoursePhoto(stored(url, width));
    expect(photo.url).toBe(url);
    expect(photo.thumbUrl).toBe(thumb);
  });
});

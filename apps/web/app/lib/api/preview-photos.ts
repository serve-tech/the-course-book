import type { CoursePhoto } from "@coursebook/domain/catalog/course";

/**
 * TEMPORARY, local preview only: hand-picked Wikimedia Commons photos for a
 * few courses, so the photo cards and course page can be judged in the
 * running app before the API stores photos.
 *
 * Step 2 of the 2026-11-13 decision (course photos in R2, curator role)
 * replaces this with the API's `photo` field and deletes this module. The
 * images load straight from upload.wikimedia.org here, which Commons allows
 * but discourages; the real pipeline copies them to R2.
 *
 * Keyed by catalog name, because local and production course ids differ.
 * Courses without a photo of their own (Pacific Dunes, Bandon Trails, Old
 * Macdonald, Pinehurst No. 2, Franklin Hills on 2026-11-13) are left out on
 * purpose: a resort-wide or unidentified photo would show the wrong course.
 */
const PREVIEW_PHOTOS: Readonly<Record<string, CoursePhoto>> = {
  "Bandon Dunes": {
    url: "https://upload.wikimedia.org/wikipedia/commons/6/61/4th_green_at_Bandon.jpg",
    credit: "Matthewwlloyd",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:4th_green_at_Bandon.jpg",
  },
  "Oakland Hills Country Club: South": {
    url: "https://upload.wikimedia.org/wikipedia/commons/9/9d/Oakland_Hills_Country_Club_-_Bloomfield_Hills%2C_Michigan.jpg",
    credit: "GeorgeVezza",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Oakland_Hills_Country_Club_-_Bloomfield_Hills,_Michigan.jpg",
  },
  "Whistling Straits: Straits": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Whistling_Straits_golf_course%2C_far_shot.jpg/1280px-Whistling_Straits_golf_course%2C_far_shot.jpg",
    credit: "Specialkboyle",
    license: "Public domain",
    licenseUrl: null,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Whistling_Straits_golf_course,_far_shot.jpg",
  },
  "Arcadia Bluffs Golf Club": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/ArcadiaBluffs1011.jpg/1280px-ArcadiaBluffs1011.jpg",
    credit: "Benscripps",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:ArcadiaBluffs1011.jpg",
  },
  "Forest Dunes Golf Club": {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Forest_Dunes_8th_Hole.jpg/1280px-Forest_Dunes_8th_Hole.jpg",
    credit: "Benscripps",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Forest_Dunes_8th_Hole.jpg",
  },
};

/** The preview photo for a course, by its catalog name; null when there is none. */
export function previewPhoto(name: string): CoursePhoto | null {
  return PREVIEW_PHOTOS[name] ?? null;
}

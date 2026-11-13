import { describe, expect, it } from "vitest";
import { absoluteUrl, commonsPhoto, creditText, isAcceptedLicense, plainText, thumbnailUrl, type CommonsPage } from "./commons";

const page = (overrides: { mime?: string; width?: number; license?: string; artist?: string; missing?: boolean } = {}): CommonsPage => ({
  title: "File:ArcadiaBluffs1011.jpg",
  ...(overrides.missing ? { missing: true } : {}),
  imageinfo: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/8/8a/ArcadiaBluffs1011.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:ArcadiaBluffs1011.jpg",
      thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/ArcadiaBluffs1011.jpg/330px-ArcadiaBluffs1011.jpg",
      width: overrides.width ?? 1936,
      height: 1390,
      mime: overrides.mime ?? "image/jpeg",
      extmetadata: {
        Artist: { value: overrides.artist ?? '<a href="//commons.wikimedia.org/wiki/User:Benscripps">Benscripps</a>' },
        LicenseShortName: { value: overrides.license ?? "CC BY-SA 3.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/3.0" },
        ImageDescription: { value: "Picture of <b>Arcadia Bluffs</b> &amp; Lake Michigan." },
      },
    },
  ],
});

describe("isAcceptedLicense", () => {
  it.each(["CC BY-SA 4.0", "CC BY-SA 3.0", "CC BY 2.0", "cc by-sa 3.0 de", "CC0", "Public domain", "No restrictions"])("accepts %s", (name) => {
    expect(isAcceptedLicense(name)).toBe(true);
  });

  it.each(["GFDL", "FAL", "CC BY-NC 2.0", "CC BY-ND 4.0", "CC BY-NC-SA 3.0", "", "Attribution"])("rejects %s", (name) => {
    expect(isAcceptedLicense(name)).toBe(false);
  });
});

describe("thumbnailUrl", () => {
  it.each([
    {
      name: "a wide photo gets a thumbnail",
      url: "https://upload.wikimedia.org/wikipedia/commons/8/8a/ArcadiaBluffs1011.jpg",
      width: 1936,
      expected: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/ArcadiaBluffs1011.jpg/1280px-ArcadiaBluffs1011.jpg",
    },
    {
      name: "an encoded name keeps its encoding",
      url: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Whistling_Straits_golf_course%2C_far_shot.jpg",
      width: 1944,
      expected:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Whistling_Straits_golf_course%2C_far_shot.jpg/1280px-Whistling_Straits_golf_course%2C_far_shot.jpg",
    },
    {
      name: "tracking parameters are dropped",
      url: "https://upload.wikimedia.org/wikipedia/commons/8/8a/ArcadiaBluffs1011.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo",
      width: 1936,
      expected: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/ArcadiaBluffs1011.jpg/1280px-ArcadiaBluffs1011.jpg",
    },
    {
      name: "a narrow photo stays the original",
      url: "https://upload.wikimedia.org/wikipedia/commons/9/9d/Oakland.jpg",
      width: 1250,
      expected: "https://upload.wikimedia.org/wikipedia/commons/9/9d/Oakland.jpg",
    },
  ])("$name", ({ url, width, expected }) => {
    expect(thumbnailUrl(url, width, 1280)).toBe(expected);
  });
});

describe("absoluteUrl", () => {
  it.each([
    { value: "https://creativecommons.org/licenses/by/2.0", expected: "https://creativecommons.org/licenses/by/2.0" },
    { value: "//creativecommons.org/licenses/by-sa/3.0", expected: "https://creativecommons.org/licenses/by-sa/3.0" },
    { value: "not a url", expected: null },
    { value: "javascript:alert(1)", expected: null },
    { value: undefined, expected: null },
  ])("reads $value as $expected", ({ value, expected }) => {
    expect(absoluteUrl(value)).toBe(expected);
  });
});

describe("plainText", () => {
  it("drops tags and decodes the common entities", () => {
    expect(plainText('<a href="x">Dan&nbsp;Perry</a> &amp; <i>friends</i>')).toBe("Dan Perry & friends");
  });
});

describe("creditText", () => {
  it.each([
    ['<a href="//commons.wikimedia.org/wiki/User:Frjlove">Frjlove</a> (<a href="//commons.wikimedia.org/wiki/User_talk:Frjlove">talk</a>)', "Frjlove"],
    ['<a href="x">Ana</a> (<a href="y">talk</a> | <a href="z">contribs</a>)', "Ana"],
    ["Benscripps", "Benscripps"],
    ["Talk Radio (talking heads)", "Talk Radio (talking heads)"],
  ])("reads %s as %s", (html, credit) => {
    expect(creditText(html)).toBe(credit);
  });
});

describe("commonsPhoto", () => {
  it("returns the credit as text, the license and a display-width URL", () => {
    expect(commonsPhoto(page())).toEqual({
      file: "File:ArcadiaBluffs1011.jpg",
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/ArcadiaBluffs1011.jpg/1280px-ArcadiaBluffs1011.jpg",
      thumbUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/ArcadiaBluffs1011.jpg/330px-ArcadiaBluffs1011.jpg",
      width: 1936,
      height: 1390,
      credit: "Benscripps",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:ArcadiaBluffs1011.jpg",
      description: "Picture of Arcadia Bluffs & Lake Michigan.",
    });
  });

  it("credits Wikimedia Commons when the file names no author", () => {
    expect(commonsPhoto(page({ artist: "" }))?.credit).toBe("Wikimedia Commons");
  });

  it.each([
    { name: "a missing file", input: page({ missing: true }) },
    { name: "a vector drawing", input: page({ mime: "image/svg+xml" }) },
    { name: "a small photo", input: page({ width: 499 }) },
    { name: "a license the app does not accept", input: page({ license: "GFDL" }) },
  ])("leaves out $name", ({ input }) => {
    expect(commonsPhoto(input)).toBeNull();
  });
});

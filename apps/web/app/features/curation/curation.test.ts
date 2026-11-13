import { courseSchema, type CoursePhoto } from "@coursebook/domain/catalog/course";
import { describe, expect, it } from "vitest";
import { commonsQuery, curatePath, curationList, CurationFilter, filterCourses, membersNote, openingFilter, photoProgress } from "./curation";

const photo: CoursePhoto = { url: "https://x/a.jpg", credit: "Ana", license: "CC BY 2.0", licenseUrl: null, sourceUrl: "https://x" };
const entry = (id: string, withPhoto: boolean, members = 1) => ({ course: courseSchema.parse({ id, name: id, location: "", photo: withPhoto ? photo : null }), members });

describe("filterCourses", () => {
  const courses = [entry("a", false, 3), entry("b", true, 2), entry("c", false, 1)];

  it.each([
    { filter: CurationFilter.Missing, ids: ["a", "c"] },
    { filter: CurationFilter.All, ids: ["a", "b", "c"] },
  ])("$filter keeps $ids in order", ({ filter, ids }) => {
    expect(filterCourses(courses, filter).map((item) => item.course.id)).toEqual(ids);
  });

  it("counts photos", () => {
    expect(photoProgress(courses)).toEqual({ withPhoto: 1, total: 3 });
  });
});

describe("openingFilter", () => {
  it.each([
    { name: "some courses lack a photo", courses: [entry("a", true), entry("b", false)], filter: CurationFilter.Missing },
    { name: "every course has one", courses: [entry("a", true)], filter: CurationFilter.All },
    { name: "there are no courses", courses: [], filter: CurationFilter.All },
  ])("opens on $filter when $name", ({ courses, filter }) => {
    expect(openingFilter(courses)).toBe(filter);
  });
});

describe("commonsQuery", () => {
  it.each([
    ["Oakland Hills Country Club: South", "Oakland Hills Country Club"],
    ["Ballybunion Golf Club (Old)", "Ballybunion Golf Club"],
    ["Royal Melbourne Golf Club (West)", "Royal Melbourne Golf Club"],
    ["Pacific Dunes", "Pacific Dunes"],
    ["  Whistling  Straits: Straits ", "Whistling Straits"],
  ])("searches %s as %s", (name, query) => {
    expect(commonsQuery(name)).toBe(query);
  });
});

describe("curationList", () => {
  it.each([
    { slug: "world", list: { type: "global", scope: "GLOBAL" } },
    { slug: "usa-public", list: { type: "usa_public", scope: "USA_PUBLIC" } },
    { slug: "international", list: { type: "world", scope: "WORLD" } },
    { slug: "state-mi", list: null },
    { slug: "nonsense", list: null },
    { slug: null, list: null },
  ])("reads $slug as $list", ({ slug, list }) => {
    expect(curationList(slug)).toEqual(list);
  });
});

describe("curatePath", () => {
  const usa = { type: "usa", scope: "USA" };
  it.each([
    { args: {}, path: "/curate" },
    { args: { list: usa }, path: "/curate?from=usa" },
    { args: { courseId: "c1" }, path: "/curate?course=c1" },
    { args: { list: usa, courseId: "c1" }, path: "/curate?course=c1&from=usa" },
  ])("builds $path", ({ args, path }) => {
    expect(curatePath(args)).toBe(path);
  });
});

describe("membersNote", () => {
  it.each([
    [1, "1 member"],
    [3, "3 members"],
  ])("%i reads %s", (members, note) => {
    expect(membersNote(members)).toBe(note);
  });
});

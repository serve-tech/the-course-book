import { describe, it, expect } from "vitest";
import { fixture, courseRow } from "../../test/fixtures";
import { courseSchema } from "./course";
describe("catalog persistence identity", () => {
  it.each(["Detroit", ""])(
    "preserves explicit state for a custom course (city=%s)",
    async (city) => {
      const f = fixture(),
        course = courseSchema.parse({
          id: "custom-new",
          name: "New Test Course",
          location: [city, "MI", "USA"].filter(Boolean).join(", "),
          city,
          state: "MI",
          country: "USA",
        });
      await f.catalog.ensure(course);
      expect(f.catalogRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ state: "MI", city: city || null }),
      );
    },
  );
  it("preserves account identity when public catalog loads first and refreshes its metadata", () => {
    const f = fixture(),
      row = courseRow();
    f.catalog.fromRow(row);
    const local = courseSchema.parse({
      id: "custom-old",
      name: row.name,
      location: "USA",
    });
    f.catalog.restore([local]);
    expect(f.catalog.fromRow(row, [local.id]).id).toBe(local.id);
    expect(
      f.catalog.fromRow({ ...row, city: "Changed City" }, [local.id]).location,
    ).toBe("Changed City, MI, USA");
  });
});

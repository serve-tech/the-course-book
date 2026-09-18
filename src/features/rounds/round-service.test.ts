import { describe, it, expect, vi } from "vitest";
import { fixture, courseRow, membership, round } from "../../test/fixtures";
import { AddRoundMode } from "./round-service";
describe("round mutations", () => {
  it("logging an existing course never writes its personal ranking", async () => {
    const f = fixture(),
      course = f.catalog.fromRow(courseRow());
    f.memberships.membership.mockResolvedValue(membership());
    await f.service.log(course, 2);
    expect(f.rounds.add).toHaveBeenCalledWith("A", "db-a", 2);
    expect(f.memberships.update).not.toHaveBeenCalled();
    expect(f.memberships.add).not.toHaveBeenCalled();
  });
  it("Top add creates the first round for an existing remote zero-round membership", async () => {
    const f = fixture(),
      course = f.catalog.fromRow(courseRow());
    f.memberships.membership.mockResolvedValue(membership());
    await f.service.log(course, 1, AddRoundMode.Top);
    expect(f.rounds.add).toHaveBeenCalledWith("A", "db-a", 1);
    expect(f.memberships.update).not.toHaveBeenCalled();
  });
  it("rolls back only newly inserted rounds if membership insertion fails", async () => {
    const f = fixture(),
      course = f.catalog.fromRow(courseRow());
    f.memberships.add.mockRejectedValue(new Error("membership failure"));
    await expect(f.service.log(course, 1)).rejects.toThrow(
      "membership failure",
    );
    expect(f.rounds.remove).toHaveBeenCalledWith("A", ["round-a"]);
  });
  it("surfaces partial success when compensation also fails", async () => {
    const f = fixture(),
      course = f.catalog.fromRow(courseRow());
    f.memberships.add.mockRejectedValue(new Error("membership failure"));
    f.rounds.remove.mockRejectedValue(new Error("rollback failure"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(f.service.log(course, 1)).rejects.toThrow(
      "Refresh before retrying",
    );
  });
  it("reducing count keeps newest rounds", async () => {
    const f = fixture(),
      course = f.catalog.fromRow(courseRow());
    f.rounds.forCourse.mockResolvedValue([
      round("newest"),
      round("middle"),
      round("oldest"),
    ]);
    await f.service.setCount(course, 1);
    expect(f.rounds.remove).toHaveBeenCalledWith("A", ["middle", "oldest"]);
    expect(f.memberships.update).not.toHaveBeenCalled();
  });
  it("deleting the final round removes membership", async () => {
    const f = fixture(),
      course = f.catalog.fromRow(courseRow());
    expect(await f.service.deleteRound(course, "last")).toBe(true);
    expect(f.rounds.remove).toHaveBeenCalledWith("A", ["last"]);
    expect(f.memberships.remove).toHaveBeenCalledWith("A", "db-a");
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  fixture,
  user,
  courseRow,
  membership,
  deferred,
} from "../../test/fixtures";
import { emptyAccount } from "./account-state";
import type { Membership } from "./journal-repository";
describe("account synchronization", () => {
  it("never rewrites populated cloud rankings on a fresh browser", async () => {
    const f = fixture();
    f.memberships.memberships.mockResolvedValue([membership()]);
    await f.journal.hydrate();
    await f.journal.migrateLegacy();
    expect(f.memberships.update).not.toHaveBeenCalled();
    expect(f.memberships.add).not.toHaveBeenCalled();
    expect(f.rounds.add).not.toHaveBeenCalled();
  });
  it("migrates membership without fabricating rounds", async () => {
    const f = fixture(),
      course = f.catalog.fromRow(courseRow());
    f.cache.save("A", {
      ...emptyAccount(),
      myList: [course.id],
      played: { [course.id]: 9 },
    });
    f.journal.activate(null);
    f.journal.activate(user());
    await f.journal.hydrate();
    await f.journal.migrateLegacy();
    expect(f.memberships.add).toHaveBeenCalledWith("A", "db-a", 0, 1);
    expect(f.rounds.add).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "rejects pending account A hydration after switch (return to A: %s)",
    async (returnToA) => {
      const f = fixture(),
        pending = deferred<Membership[]>();
      f.memberships.memberships.mockReturnValue(pending.promise);
      const result = f.journal.hydrate();
      const assertion = expect(result).rejects.toThrow("account changed");
      f.journal.activate(user("B"));
      if (returnToA) f.journal.activate(user("A"));
      pending.resolve([membership()]);
      await assertion;
      expect(f.journal.getSnapshot().account.myList).toEqual([]);
    },
  );
  it("discards stale hydration after a local reorder", async () => {
    const f = fixture(),
      first = f.catalog.fromRow(courseRow()),
      second = f.catalog.fromRow(courseRow("db-b"));
    f.cache.save("A", { ...emptyAccount(), myList: [first.id, second.id] });
    f.journal.activate(null);
    f.journal.activate(user());
    const pending = deferred<Membership[]>();
    f.memberships.memberships.mockReturnValueOnce(pending.promise);
    const hydration = f.journal.hydrate();
    await f.journal.move(second.id, 1);
    pending.resolve([membership()]);
    expect(await hydration).toBe(false);
    expect(f.journal.getSnapshot().account.myList).toEqual([
      second.id,
      first.id,
    ]);
  });
});

it("does not migrate B from an unfinished A startup", async () => {
  const f = fixture(),
    pending =
      deferred<Awaited<ReturnType<typeof f.catalogRepository.usaCatalog>>>();
  f.catalogRepository.usaCatalog.mockReturnValue(pending.promise);
  const startup = f.journal.initialize();
  const rejected = expect(startup).rejects.toThrow("account changed");
  await vi.waitFor(() => {
    expect(f.catalogRepository.usaCatalog).toHaveBeenCalled();
  });
  const course = f.catalog.fromRow(courseRow());
  f.cache.save("B", {
    ...emptyAccount(),
    myList: [course.id],
    played: { [course.id]: 8 },
  });
  f.journal.activate(user("B"));
  pending.resolve([]);
  await rejected;
  expect(f.memberships.add).not.toHaveBeenCalled();
  expect(f.memberships.update).not.toHaveBeenCalled();
});

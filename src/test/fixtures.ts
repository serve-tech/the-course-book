import { vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { SafeStorage } from "../shared/lib/storage";
import { AccountCache } from "../features/journal/account-state";
import { CatalogService } from "../features/catalog/catalog-service";
import type {
  CatalogRepository,
  CourseRow,
} from "../features/catalog/catalog-repository";
import type {
  JournalRepository,
  Membership,
} from "../features/journal/journal-repository";
import type {
  RoundRepository,
  Round,
} from "../features/rounds/round-repository";
import { JournalStore } from "../features/journal/journal-store";
import { RoundService } from "../features/rounds/round-service";
export const user = (id = "A"): User => ({
  id,
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
});
export const courseRow = (id = "db-a"): CourseRow => ({
  id,
  name: "Test Links " + id,
  city: "Detroit",
  state: "MI",
  country: "USA",
  created_at: null,
  is_custom: false,
  logo_url: null,
  website_url: null,
});
export const membership = (
  course_id = "db-a",
  personal_rank = 1,
): Membership => ({
  id: "membership-" + course_id,
  user_id: "A",
  course_id,
  personal_rank,
  times_played: 99,
  created_at: null,
  updated_at: null,
  first_played: null,
  last_played: null,
  notes: null,
});
export const round = (id = "round-a", course_id = "db-a"): Round => ({
  id,
  user_id: "A",
  course_id,
  played_at: "2026-01-01",
  created_at: null,
  notes: null,
  score: null,
  tees: null,
});
export function fixture() {
  const data = new Map<string, string>(),
    storage = new SafeStorage({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    });
  const catalogRepository = {
    courses: vi
      .fn<CatalogRepository["courses"]>()
      .mockResolvedValue([courseRow()]),
    byName: vi.fn<CatalogRepository["byName"]>().mockResolvedValue([]),
    insert: vi.fn<CatalogRepository["insert"]>().mockResolvedValue("inserted"),
    usaCatalog: vi.fn<CatalogRepository["usaCatalog"]>().mockResolvedValue([]),
    rankings: vi.fn<CatalogRepository["rankings"]>().mockResolvedValue([]),
  };
  const memberships = {
    memberships: vi
      .fn<JournalRepository["memberships"]>()
      .mockResolvedValue([]),
    membership: vi
      .fn<JournalRepository["membership"]>()
      .mockResolvedValue(null),
    add: vi.fn<JournalRepository["add"]>().mockResolvedValue(),
    update: vi.fn<JournalRepository["update"]>().mockResolvedValue(),
    remove: vi.fn<JournalRepository["remove"]>().mockResolvedValue(),
  };
  const rounds = {
    all: vi.fn<RoundRepository["all"]>().mockResolvedValue([]),
    forCourse: vi.fn<RoundRepository["forCourse"]>().mockResolvedValue([]),
    add: vi.fn<RoundRepository["add"]>().mockResolvedValue([round()]),
    remove: vi.fn<RoundRepository["remove"]>().mockResolvedValue(),
  };
  const catalog = new CatalogService(catalogRepository, storage),
    cache = new AccountCache(storage),
    journal = new JournalStore(cache, catalog, memberships, rounds, storage);
  journal.activate(user());
  return {
    data,
    storage,
    cache,
    catalog,
    catalogRepository,
    memberships,
    rounds,
    journal,
    service: new RoundService(journal, memberships, rounds),
  };
}
export function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

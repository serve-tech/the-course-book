import type { User } from "@supabase/supabase-js";
import {
  AccountCache,
  emptyAccount,
  canApplyHydration,
  reconcileAccount,
  moveCourse,
  removeCourse,
  type AccountState,
} from "./account-state";
import type { CatalogService } from "../catalog/catalog-service";
import type { JournalRepository } from "./journal-repository";
import type { RoundRepository } from "../rounds/round-repository";
import type { SafeStorage } from "../../shared/lib/storage";
import type { Course } from "../catalog/course";
export interface JournalSnapshot {
  user: User | null;
  account: AccountState;
  ready: boolean;
}
export interface OwnerToken {
  id: string;
  generation: number;
}
export class JournalStore {
  private snapshot: JournalSnapshot = {
    user: null,
    account: emptyAccount(),
    ready: false,
  };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private readonly cache: AccountCache,
    readonly catalog: CatalogService,
    private readonly repository: JournalRepository,
    private readonly rounds: RoundRepository,
    private readonly storage: SafeStorage,
  ) {}
  getSnapshot = (): JournalSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(snapshot: JournalSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
  activate(user: User | null): void {
    if (user?.id === this.snapshot.user?.id) return;
    this.generation++;
    this.queue = Promise.resolve();
    const account = this.cache.load(user?.id ?? null);
    this.catalog.restore(account.courseRecords);
    this.publish({ user, account, ready: !!user });
  }
  owner(): OwnerToken {
    const user = this.snapshot.user;
    if (!user || !this.snapshot.ready)
      throw new Error("Sign in before adding a course");
    return { id: user.id, generation: this.generation };
  }
  assertOwner(token: OwnerToken): void {
    if (
      this.snapshot.user?.id !== token.id ||
      this.generation !== token.generation
    )
      throw new Error("Your account changed. Please try again.");
  }
  private commit(account: AccountState): void {
    const owner = this.snapshot.user?.id;
    if (!owner) return;
    const records = new Map(
      account.courseRecords.map((course) => [course.id, course]),
    );
    for (const course of this.catalog.customRecords(account.myList))
      records.set(course.id, course);
    const next = { ...account, courseRecords: [...records.values()] };
    this.cache.save(owner, next);
    this.publish({ ...this.snapshot, account: next });
  }
  remember(course: Course): void {
    this.catalog.replace(course);
    const state = this.snapshot.account;
    const records = state.courseRecords.filter(
      (record) => record.id !== course.id,
    );
    this.commit({ ...state, courseRecords: [...records, course] });
  }
  async hydrate(): Promise<boolean> {
    const token = this.owner(),
      start = this.snapshot.account;
    const [memberships, rounds] = await Promise.all([
      this.repository.memberships(token.id),
      this.rounds.all(token.id),
    ]);
    const rows = await this.catalog.rows([
      ...new Set([
        ...memberships.flatMap((row) => (row.course_id ? [row.course_id] : [])),
        ...rounds.flatMap((row) => (row.course_id ? [row.course_id] : [])),
      ]),
    ]);
    this.assertOwner(token);
    if (
      !canApplyHydration(
        token.id,
        start.orderRevision,
        start.myList,
        this.snapshot.user?.id ?? null,
        this.snapshot.account,
      )
    )
      return false;
    // Resolution is synchronous and occurs only after ownership/order checks.
    const resolved = new Map(
      rows.map((row) => [row.id, this.catalog.fromRow(row, start.myList)]),
    );
    const ranks = memberships.flatMap((row) => {
      const course = resolved.get(row.course_id ?? "");
      return course
        ? [{ id: course.id, rank: row.personal_rank || 999999 }]
        : [];
    });
    const roundIds = rounds.flatMap((row) => {
      const course = resolved.get(row.course_id ?? "");
      return course ? [course.id] : [];
    });
    this.commit(
      reconcileAccount(
        start,
        ranks,
        roundIds,
        new Map(this.catalog.all().map((course) => [course.id, course])),
      ),
    );
    return true;
  }
  async initialize(): Promise<void> {
    const token = this.owner();
    if (!(await this.hydrate())) return;
    await this.catalog.loadCatalog();
    this.assertOwner(token);
    await this.migrateLegacy();
  }
  async migrateLegacy(): Promise<void> {
    const token = this.owner(),
      key = "theCourseBookMigrated_" + token.id;
    if (this.storage.read(key) === "1") return;
    const existing = await this.repository.memberships(token.id);
    this.assertOwner(token);
    if (existing.length || !this.snapshot.account.myList.length) return;
    await this.syncOrder();
    this.assertOwner(token);
    this.storage.write(key, "1");
  }
  move(id: string, rank: number): Promise<void> {
    this.owner();
    this.commit(moveCourse(this.snapshot.account, id, rank));
    return this.syncOrder();
  }
  removeLocal(id: string): void {
    this.commit(removeCourse(this.snapshot.account, id));
  }
  syncOrder(): Promise<void> {
    const token = this.owner(),
      state = this.snapshot.account;
    const run = async () => {
      this.assertOwner(token);
      for (const [index, id] of state.myList.entries()) {
        const course = this.catalog.get(id);
        if (!course) continue;
        this.assertOwner(token);
        const dbId = await this.catalog.ensure(course);
        this.assertOwner(token);
        const member = await this.repository.membership(token.id, dbId);
        this.assertOwner(token);
        if (member)
          await this.repository.update(
            token.id,
            dbId,
            state.played[id] ?? 0,
            index + 1,
          );
        else
          await this.repository.add(
            token.id,
            dbId,
            state.played[id] ?? 0,
            index + 1,
          );
      }
      this.assertOwner(token);
      this.storage.write("theCourseBookMigrated_" + token.id, "1");
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.catch((error: unknown) => {
      console.warn("Personal ranking sync failed", error);
    });
    return pending;
  }
}

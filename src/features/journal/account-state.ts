import { z } from "zod";
import { courseSchema, type Course } from "../catalog/course";
import { equivalentCourses } from "../catalog/identity";
import type { SafeStorage } from "../../shared/lib/storage";

export const accountStateSchema = z.object({
  played: z.record(z.string(), z.number().nonnegative()).default({}),
  myList: z.array(z.string()).default([]),
  courseRecords: z.array(courseSchema).default([]),
  orderRevision: z.number().nonnegative().default(0),
});

export type AccountState = z.infer<typeof accountStateSchema>;

export const emptyAccount = (): AccountState => ({
  played: {},
  myList: [],
  courseRecords: [],
  orderRevision: 0,
});

const userKey = (owner: string) => "theCourseBook_user_" + owner;

export class AccountCache {
  constructor(private readonly storage: SafeStorage) {}

  load(owner: string | null): AccountState {
    if (!owner) return emptyAccount();

    if (this.storage.read(userKey(owner)) !== null)
      return this.storage.parse(
        userKey(owner),
        accountStateSchema,
        emptyAccount,
      );

    const legacy = this.storage.parse(
      "theCourseBook",
      accountStateSchema,
      emptyAccount,
    );

    if (
      !this.storage.read("theCourseBookLegacyOwner") &&
      (legacy.myList.length ||
        Object.keys(legacy.played).length ||
        legacy.courseRecords.length)
    ) {
      if (
        this.save(owner, legacy) &&
        this.storage.write("theCourseBookLegacyOwner", owner)
      )
        this.storage.remove("theCourseBook");

      return legacy;
    }

    return emptyAccount();
  }

  save(owner: string, state: AccountState): boolean {
    return this.storage.save(userKey(owner), state);
  }
}

export function moveCourse(
  state: AccountState,
  id: string,
  requestedRank: number,
): AccountState {
  if (!state.myList.includes(id)) return state;

  const order = state.myList.filter((item) => item !== id);

  const rank = Math.max(
    1,
    Math.min(state.myList.length, Math.floor(requestedRank) || 1),
  );

  order.splice(rank - 1, 0, id);

  return {
    ...state,
    myList: order,
    orderRevision: state.orderRevision + 1,
  };
}

export function removeCourse(state: AccountState, id: string): AccountState {
  const played = { ...state.played };

  Reflect.deleteProperty(played, id);

  return {
    ...state,
    played,
    myList: state.myList.filter((item) => item !== id),
    orderRevision: state.orderRevision + 1,
  };
}

export interface ResolvedMembership {
  id: string;
  rank: number;
}

export function reconcileAccount(
  state: AccountState,
  memberships: readonly ResolvedMembership[],
  roundCourseIds: readonly string[],
  catalog: ReadonlyMap<string, Course>,
): AccountState {
  const played: Record<string, number> = {};

  for (const id of roundCourseIds)
    played[id] = (played[id] ?? 0) + 1;

  // For an authenticated account, Supabase user_courses.personal_rank is the
  // authoritative My List order whenever memberships exist. A stale per-account
  // localStorage order must never override the cloud ranking.
  //
  // Courses represented only by rounds are still retained, but they are appended
  // after the cloud membership order. The local order is used only when there are
  // no cloud memberships yet, which preserves the one-time legacy migration path.
  let myList: string[];

  if (memberships.length) {
    const ordered: string[] = [];

    for (const membership of [...memberships].sort(
      (a, b) => a.rank - b.rank || a.id.localeCompare(b.id),
    )) {
      const duplicate = ordered.findIndex(
        (id) =>
          id !== membership.id &&
          equivalentCourses(catalog.get(id), catalog.get(membership.id)),
      );

      if (duplicate >= 0) ordered[duplicate] = membership.id;
      else if (!ordered.includes(membership.id)) ordered.push(membership.id);
    }

    for (const id of Object.keys(played)) {
      if (!ordered.includes(id)) ordered.push(id);
    }

    myList = ordered;
  } else {
    myList = [...state.myList];

    for (const id of Object.keys(played))
      if (!myList.includes(id)) myList.push(id);
  }

  return {
    ...state,
    played,
    myList: myList.filter(
      (id) =>
        catalog.has(id) ||
        state.courseRecords.some((course) => course.id === id),
    ),
  };
}

export function canApplyHydration(
  owner: string,
  revision: number,
  order: readonly string[],
  currentOwner: string | null,
  current: AccountState,
): boolean {
  return (
    owner === currentOwner &&
    revision === current.orderRevision &&
    order.length === current.myList.length &&
    order.every((id, index) => id === current.myList[index])
  );
}
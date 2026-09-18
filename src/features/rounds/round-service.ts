import type { Course } from "../catalog/course";
import type { JournalStore } from "../journal/journal-store";
import type { JournalRepository } from "../journal/journal-repository";
import type { Round, RoundRepository } from "./round-repository";
export enum AddRoundMode {
  Log = "log",
  Top = "top",
  Friend = "friend",
}
export function normalizeQuantity(value: number, minimum = 0): number {
  return Math.max(
    minimum,
    Math.floor(Number.isFinite(value) ? value : minimum),
  );
}
export class RoundService {
  constructor(
    private readonly journal: JournalStore,
    private readonly memberships: JournalRepository,
    private readonly rounds: RoundRepository,
  ) {}
  async log(
    course: Course,
    quantity: number,
    mode = AddRoundMode.Log,
    rank?: number,
  ): Promise<void> {
    course = this.journal.catalog.resolveSelection(course);
    const token = this.journal.owner(),
      dbId = await this.journal.catalog.ensure(course);
    this.journal.assertOwner(token);
    const existing = await this.memberships.membership(token.id, dbId);
    this.journal.assertOwner(token);
    if (mode === AddRoundMode.Friend && existing) return;
    const previous =
      mode === AddRoundMode.Top
        ? await this.rounds.forCourse(token.id, dbId)
        : [];
    this.journal.assertOwner(token);
    const count = normalizeQuantity(quantity, 1);
    const inserted =
      mode === AddRoundMode.Top && previous.length
        ? []
        : await this.rounds.add(token.id, dbId, count);
    this.journal.assertOwner(token);
    try {
      if (!existing)
        await this.memberships.add(
          token.id,
          dbId,
          count,
          rank ?? this.journal.getSnapshot().account.myList.length + 1,
        );
    } catch (error) {
      // Do not leave an invisible successful round insertion that a retry duplicates.
      try {
        this.journal.assertOwner(token);
        await this.rounds.remove(
          token.id,
          inserted.map((round) => round.id),
        );
      } catch (rollbackError) {
        console.error("Round rollback failed", rollbackError);
        throw new AggregateError(
          [error, rollbackError],
          "Rounds were saved, but the list could not be updated. Refresh before retrying.",
          { cause: rollbackError },
        );
      }
      throw error;
    }
    this.journal.assertOwner(token);
    await this.journal.hydrate();
  }
  async history(course: Course): Promise<Round[]> {
    const token = this.journal.owner(),
      dbId = await this.journal.catalog.ensure(course);
    this.journal.assertOwner(token);
    const rows = await this.rounds.forCourse(token.id, dbId);
    this.journal.assertOwner(token);
    return rows;
  }
  async setCount(
    course: Course,
    quantity: number,
    removeMembershipLocally = false,
  ): Promise<void> {
    const token = this.journal.owner(),
      dbId = await this.journal.catalog.ensure(course);
    this.journal.assertOwner(token);
    const rows = await this.rounds.forCourse(token.id, dbId);
    this.journal.assertOwner(token);
    const count = normalizeQuantity(quantity);
    if (count < rows.length)
      await this.rounds.remove(
        token.id,
        rows.slice(count).map((round) => round.id),
      );
    if (count > rows.length)
      await this.rounds.add(token.id, dbId, count - rows.length);
    this.journal.assertOwner(token);
    if (count === 0) {
      await this.memberships.remove(token.id, dbId);
      this.journal.assertOwner(token);
      if (removeMembershipLocally) this.journal.removeLocal(course.id);
    }
    await this.journal.hydrate();
  }
  async deleteRound(course: Course, roundId: string): Promise<boolean> {
    const token = this.journal.owner(),
      dbId = await this.journal.catalog.ensure(course);
    this.journal.assertOwner(token);
    await this.rounds.remove(token.id, [roundId]);
    this.journal.assertOwner(token);
    const remaining = await this.rounds.forCourse(token.id, dbId);
    this.journal.assertOwner(token);
    if (!remaining.length) {
      await this.memberships.remove(token.id, dbId);
      this.journal.assertOwner(token);
      this.journal.removeLocal(course.id);
    }
    await this.journal.hydrate();
    return remaining.length === 0;
  }
}

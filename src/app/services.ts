import { createCourseBookClient } from "../infrastructure/supabase/client";
import { SafeStorage } from "../shared/lib/storage";
import { createCatalogRepository } from "../features/catalog/catalog-repository";
import { CatalogService } from "../features/catalog/catalog-service";
import { SearchService } from "../features/catalog/search-service";
import { createAuthRepository } from "../features/auth/auth-repository";
import { createJournalRepository } from "../features/journal/journal-repository";
import { createRoundRepository } from "../features/rounds/round-repository";
import { createFriendsRepository } from "../features/friends/friends-repository";
import { AccountCache } from "../features/journal/account-state";
import { JournalStore } from "../features/journal/journal-store";
import { RoundService } from "../features/rounds/round-service";
export function createServices() {
  const client = createCourseBookClient(),
    storage = new SafeStorage(localStorage);
  const catalog = new CatalogService(createCatalogRepository(client), storage);
  const memberships = createJournalRepository(client),
    roundRepository = createRoundRepository(client);
  const journal = new JournalStore(
    new AccountCache(storage),
    catalog,
    memberships,
    roundRepository,
    storage,
  );
  return {
    storage,
    catalog,
    journal,
    memberships,
    auth: createAuthRepository(client),
    friends: createFriendsRepository(client),
    rounds: new RoundService(journal, memberships, roundRepository),
    search: new SearchService(catalog, storage),
  };
}
export type Services = ReturnType<typeof createServices>;

import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toFeedItem } from "../contract/mappers";
import { getFeed } from "../contract/routes";
import { encodeCursor } from "../domain/cursor";
import type { AppEnv } from "../http/env";
import { feedCursorSchema, friendsFeed } from "../services/feed";
import { guarded } from "./guard";
import { DEFAULT_TIMELINE_PAGE, pageCursor } from "./members";

/** The Home feed: friends' activity for the token's member, a page at a time. */
export function registerFeedRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(guarded(getFeed), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { cursor, limit } = c.req.valid("query");
    const page = await friendsFeed(deps.db, user.id, {
      after: pageCursor(cursor, feedCursorSchema),
      limit: limit ?? DEFAULT_TIMELINE_PAGE,
    });
    return c.json({ items: page.items.map(toFeedItem), nextCursor: page.next ? encodeCursor(page.next) : null }, 200);
  });
}

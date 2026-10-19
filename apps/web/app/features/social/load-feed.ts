import { api, unwrap } from "../../lib/api";
import { fromFeedItem } from "../../lib/api/mappers";

const FIRST_PAGE = 30;

/** Shared feed read for Classic Home and Activity; call only after checking the session. */
export async function loadFeed() {
  const [feed, friends] = await Promise.all([
    api
      .GET("/v1/feed", { params: { query: { limit: FIRST_PAGE } } })
      .then(unwrap),
    api.GET("/v1/members", { params: { query: { limit: 1 } } }).then(unwrap),
  ]);
  return {
    first: {
      items: feed.items.flatMap((item) => fromFeedItem(item) ?? []),
      nextCursor: feed.nextCursor,
    },
    hasFriends: friends.members.length > 0,
  };
}

# Photo rows with a featured top three, not full photo cards

**Date:** 2026-11-13
**Status:** Accepted

## Context

The image-led ranking (2026-11-13-course-photos-in-r2-curator-role-course-pages-and-image-led-ranking.md) drew every course as a full-width photo card, modelled on Top 100 Golf Courses' ranking pages, and the maintainer asked for the Courses page and member lists to match. Once they did, the maintainer worried that the app might look too much like Top 100. They also found long lists hard to scroll on a phone. Measured at 390 px wide, each card took 410 px, so the World Top 100 was about 41,000 px: two courses per screen.

Top 100's pages are editorial and read once, and the photo is the content. Our members mostly do two other things: look over their own ranking (courses they already know) and work through checklists of 100 ("played it? who else has? what's next?"). Both are scanning tasks, and the details that matter (rank, name, the Played tick, friends) were small text under a large picture. The 290 courses on the national lists will also mostly show the placeholder until curators fill them, and a wall of full-width placeholders looks empty.

## Options Considered

1. **Keep full photo cards everywhere**
   - Pros: the most vivid.
   - Cons: two courses per phone screen; placeholders dominate; 100 display-size images per list.
2. **Compact rows without photos (as before)**
   - Pros: densest.
   - Cons: the plain, flat look the photo work set out to fix.
3. **Rows with a small photo everywhere, plus the top three of a whole list as photo cards**
   - Pros: about four times denser on a phone (Home rows about 100 px; Top list rows about 150 px with buttons; World Top 100 about 15,300 px); keeps the colour where it matters (your podium, a list's best); placeholders shrink to tiles; thumbnails cut the image weight.
   - Cons: two layouts to maintain in one component; thumbnails are too small for a credit chip.
4. **A cards/rows toggle (Letterboxd-style)**
   - Pros: members choose.
   - Cons: pushes the decision onto them; the default still has to be right.

## Decision

Option 3. Every list draws courses as rows with a 3:2 photo thumbnail (84 px on phones, 120 px wider; 96 or 72 px in Reorder). When a list is shown whole (no search and no played filter), its top three are photo cards: #1 across a phone with #2 and #3 beside each other; three across on wider screens. This applies to the member's ranking, the Courses page, member lists, a friend's ranking and public `/r/` links. Rows and cards are the same `<li>` in one `<ol>`, so the list stays one ordered list and ids and data hooks don't change. Members' rows open the course page.

The look stays ours rather than Top 100's: gold Playfair rank numerals, contour-line placeholders, the Played tick, friends' avatars and the member's own rank. Those last three are details Top 100 cannot show.

The API gives each photo a 330 px `thumbUrl` (Commons' standard thumbnail of the original) so rows don't load the 1280 px display image.

## Consequences

- Supersedes the "photo cards for browsing" layout in the image-led ranking decision. Reorder keeps rows with drag handles; only the top three change shape when entering it.
- Thumbnails credit the photographer on hover (`title`), and the full credit and licence are on the course page they link to. Cards and the course page show the credit chip. Visitors' rows don't link anywhere (a course page needs a member), so for them the hover text is the only credit on a thumbnail.
- On phones, Top list rows are still about 150 px because the Log a round and Want to play buttons take a line and published-rank pills wrap. Tightening them (for example fewer pills on phones) is a separate call.

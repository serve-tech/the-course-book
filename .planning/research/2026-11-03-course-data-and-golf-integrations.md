# Course data and golf integrations

**Date:** 2026-11-03
**Supports:** [Ranking-first product](../decisions/2026-11-03-ranking-first-product-one-master-ranking-with-derived-top-n-views.md)

## OpenGolfAPI US dataset, measured

Source: `opengolfapi-us.csv` from github.com/opengolfapi/data (the API's `OPENGOLF_CSV_URL` default), downloaded 2026-11-03, compared with `0001_seed_catalog.sql`. Names were matched with a port of `normalizeName` plus state. The "same words" tier is a rough heuristic and was not reviewed by hand.

**Coverage**

| Field | Filled |
| --- | --- |
| Rows | 15,667 |
| Latitude, longitude, state | 100% |
| City | 98% |
| Type | 93% |
| Par | 89% |
| Architect | 3% |
| Total yardage | 3% |
| OSM id | 22% |

- Courses per state: median 182, Michigan 844. The seeded catalog has a median of 17 and Michigan 189.
- Type values include public, private, semi-private, municipal, resort, military and combinations such as `private/resort`.

**Match against the 1,270 US catalog courses**

| Result | All | USA Public 100 |
| --- | --- | --- |
| Exact name and state | 768 | 34 |
| Same words, different name | 229 | 32 |
| Not found | 273 | 34 |

**Type accuracy, small samples**

- USA Top 100 courses not on the Public 100, 61 matched: 54 private, 3 private/resort, 3 blank, 1 public.
- USA Public 100, 34 matched: 25 with a public, resort or semi-private label, 2 private, 4 private/resort, 3 blank.
- So the label is useful but not clean. `private/resort` needs a rule, and the published Public 100 should override it.

**Quality problems**

- The whole Bandon Dunes resort is absent; no row has "Bandon", "Pacific Dunes", "Old Macdonald" or "Sheep Ranch" in its name. Spanish Bay, Mammoth Dunes and others look absent too.
- Names are messy: `Pebble Beach Golf Linkstm`, `Black At Bethpage State Park Golf Course`.
- Duplicates: Shadow Creek has four rows, Augusta National two.
- `holes` is unreliable: Augusta National shows 16 and 12.

**Conclusion.** Use it to add the long tail, coordinates and course type. Do not let it replace or rename catalog rows. About 270 catalog courses would need coordinates from elsewhere.

## ODbL

- OpenGolfAPI's terms require the credit "© OpenStreetMap contributors (ODbL 1.0) via OpenGolfAPI" wherever the data appears, and derivative databases must be shared under the same terms. Commercial products are allowed.
- OSMF's Collective Database Guideline treats independent datasets differently from derivative ones, and cross-references are the main risk. It covers OSM data only and is not a court ruling.
- Not resolved: whether a merged catalog that member rankings point to is a derivative database, and what would have to be published. Needs a human read before any merge.
- The web app's only mention is "Showing results from OpenGolfAPI." in the search dialog (`LogRoundDialog.tsx:297`). That is not the required credit, and nothing credits the data once Search more courses has stored it in catalog rows.

## GHIN

- The official route is USGA's Golfer Product Access program ([form](https://form.jotform.com/222006675143146)): annual fee $6,000, signed agreement, "primarily designed to provide handicap integration", US only. Retrieving scoring records is a listed integration point. It asks for iOS and Android app locations and customer counts. Confirm the fee with USGA; the form is undated.
- Consumer GHIN terms, seen only as search excerpts because the page returned 403, give a limited, personal, non-commercial right. Do not collect members' GHIN passwords.
- Golfers can view score history in the Stats tab. No golfer-facing CSV export was found; club administrators have Export to Excel.

## 18Birdies

No public API was found (independent profile, not 18Birdies' own statement). Its help center says playing data cannot be exported to a spreadsheet. GDPR or CCPA requests and emailed scorecards are the only ways out.

## Tall ranking image

- **Screenshot gesture.** Sources found say page JavaScript cannot detect or handle a screenshot, because the capture belongs to the operating system. A native wrapper can get an iOS screenshot event. No official Apple or browser-vendor source was read for this.
- **Canvas limit.** A 2022 blog reports iOS Safari caps canvas area at 16,777,216 pixels, and other reports say limits vary by device and fail silently. No current Apple specification was found. At 1080 wide that allows about 15,500 px of height. Test on real devices.
- **Sharing a file.** web.dev lists file sharing as Chrome 128, Edge 93, Safari 12.1 and Firefox behind a flag. Check `navigator.canShare()` with the file, and fall back to a download. Mobile support was not confirmed against MDN or caniuse.
- **Not confirmed.** Which fantasy football app the owner showed, and whether the behavior is the app's or his phone's own scrolling screenshot. No RuneLite feature that stitches all bank tabs into one tall image was found; the nearest is the Bank Value History plugin's optional bank screenshot.
- **Not tested.** How much messaging apps compress a very tall image, and whether it stays readable.

## Share link previews

Render static sites allow a rewrite destination that is "a full, publicly accessible URL" ([docs](https://render.com/docs/redirects-rewrites)), but the docs do not describe how the proxy treats headers or responses. Test before relying on it.

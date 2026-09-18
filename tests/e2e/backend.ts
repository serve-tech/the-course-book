import type { Page } from "@playwright/test";
export const owner = "11111111-1111-4111-8111-111111111111";
export const friend = "22222222-2222-4222-8222-222222222222";
const course = (id: string, name: string) => ({
  id,
  name,
  city: "Detroit",
  state: "MI",
  country: "USA",
  created_at: null,
  is_custom: false,
  logo_url: null,
  website_url: null,
});
export async function mockBackend(page: Page) {
  const courses = [
    course("a", "Test Alpha Links"),
    course("b", "Test Beta Links"),
    course("c", "Test Gamma Links"),
  ];
  const memberships = [
    {
      id: "ma",
      user_id: owner,
      course_id: "a",
      personal_rank: 2,
      times_played: 99,
    },
    {
      id: "mb",
      user_id: owner,
      course_id: "b",
      personal_rank: 1,
      times_played: 99,
    },
    {
      id: "mf",
      user_id: friend,
      course_id: "a",
      personal_rank: 1,
      times_played: 1,
    },
    {
      id: "mg",
      user_id: friend,
      course_id: "c",
      personal_rank: 2,
      times_played: 1,
    },
  ];
  let rounds = [
    { id: "ra", user_id: owner, course_id: "a", played_at: "2026-01-01" },
    { id: "rb", user_id: owner, course_id: "b", played_at: "2026-02-01" },
  ];
  const writes: { table: string; method: string; body: unknown }[] = [];
  const signIns: unknown[] = [];
  const user = {
    id: owner,
    email: "golfer@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { username: "testgolfer" },
    created_at: "2026-01-01T00:00:00Z",
  };
  const token =
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: owner,
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url") +
    ".synthetic-signature";
  await page.addInitScript(() => {
    localStorage.setItem("theCourseBookLocationPromptVersion", "v2");
    localStorage.setItem("theCourseBookSelectedState", "MI");
  });
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      await route.continue();
      return;
    }
    if (!url.hostname.endsWith(".supabase.co")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.pathname.endsWith("/token")) {
      signIns.push(request.postDataJSON());
      await json({
        access_token: token,
        refresh_token: "synthetic-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      });
      return;
    }
    if (url.pathname.endsWith("/user")) {
      await json(user);
      return;
    }
    if (url.pathname.endsWith("/logout")) {
      await route.fulfill({ status: 204 });
      return;
    }
    const table = url.pathname.split("/").at(-1) ?? "",
      method = request.method(),
      body = request.postData() ? request.postDataJSON() : null;
    const matches = (row: Record<string, unknown>) =>
      [...url.searchParams].every(([key, value]) => {
        if (["select", "order", "limit", "offset"].includes(key)) return true;
        if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
        if (value.startsWith("in.("))
          return value
            .slice(4, -1)
            .split(",")
            .map((item) => item.replaceAll('"', ""))
            .includes(String(row[key]));
        return true;
      });
    if (method !== "GET") writes.push({ table, method, body });
    if (table === "profiles") {
      await json([
        {
          id: owner,
          username: "testgolfer",
          display_name: "Test Golfer",
          email: user.email,
        },
        {
          id: friend,
          username: "friendgolfer",
          display_name: "Friend",
          email: "friend@example.com",
        },
      ]);
      return;
    }
    if (table === "course_rankings") {
      await json(
        courses.map((item, index) => ({
          id: "rank" + index,
          course_id: item.id,
          rank: index + 1,
          ranking_type: "state",
          scope_code: "MI",
          source: "fixture",
          source_year: 2026,
          source_url: null,
        })),
      );
      return;
    }
    if (table === "courses") {
      if (method === "POST") {
        const inserted = { ...body, id: "new" + courses.length };
        courses.push(inserted);
        await json(
          request.headers()["accept"]?.includes("object")
            ? { id: inserted.id }
            : [inserted],
        );
        return;
      }
      await json(courses.filter(matches));
      return;
    }
    if (table === "user_courses") {
      if (method === "POST") {
        memberships.push({ ...body, id: "m" + memberships.length });
        await json(null, 201);
        return;
      }
      if (method === "PATCH") {
        memberships.filter(matches).forEach((row) => Object.assign(row, body));
        await json(null);
        return;
      }
      if (method === "DELETE") {
        for (let index = memberships.length - 1; index >= 0; index--)
          if (matches(memberships[index]!)) memberships.splice(index, 1);
        await json(null);
        return;
      }
      await json(
        memberships
          .filter(matches)
          .sort((a, b) => a.personal_rank - b.personal_rank),
      );
      return;
    }
    if (table === "rounds") {
      if (method === "POST") {
        const added = (Array.isArray(body) ? body : [body]).map(
          (row, index) => ({
            ...row,
            id: "new-round-" + rounds.length + "-" + index,
          }),
        );
        rounds.push(...added);
        await json(added, 201);
        return;
      }
      if (method === "DELETE") {
        rounds = rounds.filter((row) => !matches(row));
        await json(null);
        return;
      }
      const descending = url.searchParams.get("order")?.includes("desc");
      await json(
        rounds
          .filter(matches)
          .sort(
            (a, b) =>
              (descending ? -1 : 1) * a.played_at.localeCompare(b.played_at),
          ),
      );
      return;
    }
    throw new Error(
      "Unmocked backend request: " + request.method() + " " + url.pathname,
    );
  });
  return { writes, signIns, courses, memberships };
}

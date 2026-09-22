/**
 * Stand-in for OpenGolfAPI during browser tests. The app searches from the
 * server, so a Playwright route handler cannot intercept it; this tiny HTTP
 * server does instead. Queries containing "fallback" get a 503 from the REST
 * endpoint so the dataset fallback path is exercised without global state.
 */
import { createServer } from "node:http";

interface StubCourse {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
}

const courses: StubCourse[] = [
  { id: "api-alpha", name: "Test Alpha Links", city: "Detroit", state: "MI", country: "USA" },
  { id: "api-beta", name: "Test Beta Links", city: "Detroit", state: "MI", country: "USA" },
  { id: "api-mystery", name: "Mystery Meadows", city: "Nowhere", state: "KS", country: "USA" },
  { id: "api-fallback", name: "Fallback Test Links", city: "Detroit", state: "MI", country: "USA" },
];

const csv = () =>
  ["id,name,city,state,country"]
    .concat(courses.map((c) => [c.id, c.name, c.city, c.state, c.country].join(",")))
    .join("\n") + "\n";

const port = Number(process.env["OPENGOLF_STUB_PORT"] ?? 3999);

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === "/v1/courses/search") {
    const query = (url.searchParams.get("q") ?? "").toLowerCase();
    if (query.includes("fallback")) {
      response.writeHead(503, { "content-type": "text/plain" });
      response.end("Unavailable");
      return;
    }
    const matches = courses.filter((course) => course.name.toLowerCase().includes(query));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ courses: matches }));
    return;
  }
  if (url.pathname === "/opengolfapi-us.csv") {
    response.writeHead(200, { "content-type": "text/csv" });
    response.end(csv());
    return;
  }
  response.writeHead(404);
  response.end();
}).listen(port, "127.0.0.1", () => {
  console.log(`OpenGolfAPI stub listening on http://127.0.0.1:${String(port)}`);
});

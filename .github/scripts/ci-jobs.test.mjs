import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EVERYTHING, forEvent, jobsFor } from "./ci-jobs.mjs";

const NOTHING = { verify: false, browser: false, docker: false };
const VERIFY_ONLY = { verify: true, browser: false, docker: false };
const NO_IMAGE = { verify: true, browser: true, docker: false };

describe("jobsFor", () => {
  /** @type {[string, string[], import("./ci-jobs.mjs").Jobs][]} */
  const cases = [
    ["a planning note", [".planning/decisions/2026-11-16-stats.md"], NOTHING],
    ["the architecture doc", ["docs/architecture.md"], NOTHING],
    ["a README anywhere, even beside code", ["contract/README.md", "apps/api/README.md"], NOTHING],
    ["Render's Blueprint, which CI does not test", ["render.yaml"], NOTHING],
    ["the example environment file", [".env.example"], NOTHING],
    ["an issue template", [".github/ISSUE_TEMPLATE/bug.md", ".github/pull_request_template.md"], NOTHING],
    ["editor and agent settings", [".idea/workspace.xml", ".vscode/settings.json", ".claude/settings.json"], NOTHING],

    ["a web unit test", ["apps/web/app/features/social/stats.test.ts"], VERIFY_ONLY],
    ["a component test", ["apps/web/app/features/share/ShareActions.test.tsx"], VERIFY_ONLY],
    ["an API database test", ["apps/api/src/services/journal.db.test.ts"], VERIFY_ONLY],
    ["a domain test", ["packages/domain/src/sharing/view.test.ts"], VERIFY_ONLY],
    ["tests beside docs", ["docs/testing.md", "apps/web/app/lib/api/client.test.ts"], VERIFY_ONLY],

    ["a web component", ["apps/web/app/features/social/StatsView.tsx"], NO_IMAGE],
    ["a web stylesheet", ["apps/web/app/features/social/stats.module.css"], NO_IMAGE],
    ["the Playwright suite", ["tests/e2e/course-book.spec.ts"], NO_IMAGE],
    ["the generated contract", ["contract/openapi.json", "apps/web/app/lib/api/schema.d.ts"], NO_IMAGE],
    ["the lint config", ["eslint.config.js"], NO_IMAGE],
    ["the Node version", [".nvmrc"], NO_IMAGE],
    ["a web change with its test and a doc", ["apps/web/app/routes/home.tsx", "apps/web/app/routes/home.test.tsx", "docs/architecture.md"], NO_IMAGE],

    ["an API service", ["apps/api/src/services/journal.ts"], EVERYTHING],
    ["a migration", ["apps/api/src/db/migrations/0007_played_and_ranked.sql"], EVERYTHING],
    ["the Dockerfile", ["apps/api/Dockerfile"], EVERYTHING],
    ["an API test helper, which is not a unit test", ["apps/api/src/test/db.ts"], EVERYTHING],
    ["the shared domain package", ["packages/domain/src/sharing/view.ts"], EVERYTHING],
    ["the lockfile", ["pnpm-lock.yaml"], EVERYTHING],
    ["the root package", ["package.json"], EVERYTHING],
    ["another package's manifest, which the image copies", ["apps/web/package.json"], EVERYTHING],
    ["what decides the image's build context", [".dockerignore"], EVERYTHING],
    ["a web change beside an API change", ["apps/web/app/routes/home.tsx", "apps/api/src/app.ts"], EVERYTHING],

    ["the workflow, which can change any job", [".github/workflows/ci.yml"], EVERYTHING],
    ["this rule, even beside docs only", [".github/scripts/ci-jobs.mjs", "docs/testing.md"], EVERYTHING],
    ["no files at all, which is not to be trusted", [], EVERYTHING],
  ];

  for (const [name, files, jobs] of cases) {
    it(name, () => {
      assert.deepEqual(jobsFor(files), jobs);
    });
  }

  it("never skips verify when browser or the image runs", () => {
    for (const [, files] of cases) {
      const jobs = jobsFor(files);
      assert.ok(jobs.verify || (!jobs.browser && !jobs.docker), files.join(", "));
    }
  });

  it("names every path the Dockerfile copies as something the image is built from", () => {
    const dockerfile = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../apps/api/Dockerfile"), "utf8");
    const copied = dockerfile
      .split("\n")
      .filter((line) => line.startsWith("COPY ") && !line.includes("--from="))
      .flatMap((line) => line.split(/\s+/).slice(1, -1));
    assert.ok(copied.length >= 9, "expected the build stage's COPY lines");
    for (const path of copied) assert.ok(jobsFor([path]).docker || jobsFor([path + "/src/main.ts"]).docker, path + " is copied into the image but would not start the docker job");
  });
});

describe("forEvent", () => {
  it("leaves the browser suite out of a pull request, whatever changed", () => {
    assert.deepEqual(forEvent(EVERYTHING, "pull_request"), { verify: true, browser: false, docker: true });
    assert.deepEqual(forEvent(NO_IMAGE, "pull_request"), VERIFY_ONLY);
    assert.deepEqual(forEvent(NOTHING, "pull_request"), NOTHING);
  });

  for (const event of ["push", "workflow_dispatch", undefined]) {
    it("changes nothing for " + String(event), () => {
      assert.deepEqual(forEvent(EVERYTHING, event), EVERYTHING);
      assert.deepEqual(forEvent(NO_IMAGE, event), NO_IMAGE);
    });
  }
});

describe("the command", () => {
  const script = fileURLToPath(new URL("./ci-jobs.mjs", import.meta.url));

  /**
   * A repository with one commit on main, then `files` changed in a second.
   *
   * @param {string[]} files
   * @returns {{ dir: string, before: string }}
   */
  const repository = (files) => {
    const dir = mkdtempSync(join(tmpdir(), "ci-jobs-"));
    /** @param {string[]} args */
    const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    git(["init", "-q", "-b", "main"]);
    git(["config", "user.email", "ci@example.test"]);
    git(["config", "user.name", "CI"]);
    git(["commit", "-q", "--allow-empty", "-m", "first"]);
    const before = git(["rev-parse", "HEAD"]);
    for (const file of files) {
      execFileSync("mkdir", ["-p", join(dir, dirname(file))]);
      writeFileSync(join(dir, file), "changed\n");
    }
    git(["add", "-A"]);
    git(["commit", "-q", "--allow-empty", "-m", "second"]);
    return { dir, before };
  };

  /**
   * Run the command as the workflow does and read what it wrote.
   *
   * @param {string} dir
   * @param {Record<string, string>} env
   */
  const outputs = (dir, env) => {
    const file = join(dir, "outputs.txt");
    writeFileSync(file, "");
    execFileSync("node", [script], { cwd: dir, env: { PATH: process.env.PATH ?? "", GITHUB_OUTPUT: file, ...env }, encoding: "utf8" });
    return readFileSync(file, "utf8").trim().split("\n").sort();
  };

  const ALL = ["browser=true", "docker=true", "verify=true"];

  it("reads a push to main against the commit main pointed at before", () => {
    const { dir, before } = repository(["docs/architecture.md", ".planning/note.md"]);
    try {
      assert.deepEqual(outputs(dir, { EVENT: "push", BEFORE_SHA: before }), ["browser=false", "docker=false", "verify=false"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads a pull request against its base, and leaves the browser suite to main", () => {
    const { dir, before } = repository(["apps/web/app/routes/home.tsx", "apps/api/src/app.ts"]);
    try {
      assert.deepEqual(outputs(dir, { EVENT: "pull_request", BASE_SHA: before }), ["browser=false", "docker=true", "verify=true"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs the browser suite for the same change once it is on main", () => {
    const { dir, before } = repository(["apps/web/app/routes/home.tsx"]);
    try {
      assert.deepEqual(outputs(dir, { EVENT: "push", BEFORE_SHA: before }), ["browser=true", "docker=false", "verify=true"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** @type {[string, Record<string, string>][]} */
  const untrusted = [
    ["a new branch, whose previous commit is all zeros", { EVENT: "push", BEFORE_SHA: "0".repeat(40) }],
    ["a previous commit that is not in the clone", { EVENT: "push", BEFORE_SHA: "1234567890123456789012345678901234567890" }],
    ["a run started by hand", { EVENT: "workflow_dispatch" }],
    ["no event at all", {}],
  ];
  for (const [name, env] of untrusted) {
    it("runs everything for " + name, () => {
      const { dir } = repository(["docs/architecture.md"]);
      try {
        assert.deepEqual(outputs(dir, env), ALL);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it("runs everything but the browser suite for a pull request with no base", () => {
    const { dir } = repository(["docs/architecture.md"]);
    try {
      assert.deepEqual(outputs(dir, { EVENT: "pull_request" }), ["browser=false", "docker=true", "verify=true"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs everything when the push changed no files", () => {
    const { dir, before } = repository([]);
    try {
      assert.deepEqual(outputs(dir, { EVENT: "push", BEFORE_SHA: before }), ALL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

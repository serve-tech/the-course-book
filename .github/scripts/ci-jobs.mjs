/**
 * Which CI jobs a change needs, so a run starts only those (issue #85).
 *
 * GitHub bills every job rounded up to a whole minute, and one full run is
 * about nine minutes: `verify` (lint, types, tests, build), `browser` (the
 * Playwright suite) and `docker` (the API image). Most changes need fewer.
 *
 * `jobsFor` is the rule: pure, and tested in `ci-jobs.test.mjs`. The rest of
 * this file is the command the workflow runs: it lists the changed files with
 * git and writes the answer to the step's outputs.
 *
 * Two constraints, as in serve-tech/serve-meters#490:
 *
 * 1. Fail open. When the changed files cannot be worked out (no base commit,
 *    a force-push, an empty diff), every job runs. A check skipped by mistake
 *    costs far more than a wasted minute.
 * 2. A change to the workflow or to these scripts runs everything, because it
 *    can change what any job does, this rule included.
 *
 * Plain JavaScript with no dependencies, because it runs before anything is
 * installed.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @typedef {object} Jobs
 * @property {boolean} verify - Run verify's steps: lint, types, drift gates, unit and database tests, build.
 * @property {boolean} browser - Run the Playwright suite.
 * @property {boolean} docker - Build and smoke-test the API image.
 */

/** @type {Jobs} */
export const EVERYTHING = Object.freeze({ verify: true, browser: true, docker: true });

/**
 * Files no job reads: prose, planning notes, editor settings, repository
 * settings outside the workflow, and Render's Blueprint (CI does not test
 * it; `tests/e2e/static-server.ts` mirrors its routes by hand).
 */
const INERT = [
  /\.md$/i,
  /^\.planning\//,
  /^docs\//,
  /^render\.yaml$/,
  /^\.env\.example$/,
  /^LICENSE$/,
  /^\.gitignore$/,
  /^\.(idea|vscode|claude)\//,
  /^\.github\/(?!workflows\/|scripts\/)/,
];

/** Changes that can alter any job: the workflow and these scripts. */
const CI_ITSELF = [/^\.github\/workflows\//, /^\.github\/scripts\//];

/** Unit and database tests, which only `verify` runs. The Playwright suite is `tests/e2e/`, which is not one of these. */
const UNIT_TEST = /^(apps|packages)\/.+\.test\.tsx?$/;

/** What the API image is built from: the lines `apps/api/Dockerfile` copies, and what decides the build context. */
const IMAGE = [
  /^apps\/api\//,
  /^packages\/domain\//,
  /^apps\/web\/package\.json$/,
  /^tests\/e2e\/package\.json$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^tsconfig\.base\.json$/,
  /^\.dockerignore$/,
];

/**
 * @param {RegExp[]} patterns
 * @param {string} file
 */
const matches = (patterns, file) => patterns.some((pattern) => pattern.test(file));

/**
 * The jobs a set of changed files needs.
 *
 * - Nothing but prose, planning notes and `render.yaml`: no job's steps.
 * - Unit tests: `verify` only. They are not part of the built app or the image.
 * - Anything else: `verify` and `browser`; `docker` too when the file is
 *   something the API image is built from.
 * - The workflow or these scripts, or no files at all: everything.
 *
 * @param {readonly string[]} files - Paths from the repository root.
 * @returns {Jobs}
 *
 * @example
 * jobsFor(["apps/web/app/routes/home.tsx"]) // { verify: true, browser: true, docker: false }
 * jobsFor(["docs/architecture.md"])         // { verify: false, browser: false, docker: false }
 */
export function jobsFor(files) {
  if (!files.length || files.some((file) => matches(CI_ITSELF, file))) return EVERYTHING;
  const code = files.filter((file) => !matches(INERT, file));
  const built = code.filter((file) => !UNIT_TEST.test(file));
  return {
    verify: code.length > 0,
    browser: built.length > 0,
    docker: built.some((file) => matches(IMAGE, file)),
  };
}

/**
 * @param {string[]} args
 * @returns {string}
 */
const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();

/**
 * The commit to compare with, for the event that started the run; null when
 * there is none to trust.
 *
 * @param {{ event: string | undefined, baseSha: string | undefined, beforeSha: string | undefined }} run
 * @returns {{ base: string } | { reason: string }}
 */
function baseFor({ event, baseSha, beforeSha }) {
  if (event === "pull_request") {
    if (!baseSha) return { reason: "no base commit" };
    // The merge base keeps the diff to what the pull request changed, whatever has landed on main since.
    return { base: git(["merge-base", baseSha, "HEAD"]) };
  }
  if (event === "push") {
    // All zeros means the branch was just created; a force-push can leave the old commit out of the clone.
    if (!beforeSha || /^0+$/.test(beforeSha)) return { reason: "no previous commit" };
    git(["cat-file", "-e", beforeSha + "^{commit}"]);
    return { base: beforeSha };
  }
  return { reason: "event " + String(event) };
}

/**
 * Work out the jobs for this run and write them to the step's outputs.
 *
 * @param {NodeJS.ProcessEnv} env
 */
function main(env) {
  /** @type {Jobs} */
  let jobs = EVERYTHING;
  try {
    const found = baseFor({ event: env.EVENT, baseSha: env.BASE_SHA, beforeSha: env.BEFORE_SHA });
    if ("reason" in found) {
      console.log("Running every job: " + found.reason + ".");
    } else {
      // No rename detection, so a file moved between areas counts in both.
      const files = git(["diff", "--name-only", "--no-renames", found.base, "HEAD"]).split("\n").filter(Boolean);
      console.log("Changed files since " + found.base + ":\n" + files.map((file) => "  " + file).join("\n"));
      jobs = jobsFor(files);
    }
  } catch (error) {
    console.log("Running every job: could not list the changed files (" + (error instanceof Error ? error.message.split("\n")[0] : String(error)) + ").");
  }
  const lines = Object.entries(jobs).map(([job, run]) => job + "=" + String(run));
  console.log("Jobs: " + lines.join(", "));
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, lines.join("\n") + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.env);

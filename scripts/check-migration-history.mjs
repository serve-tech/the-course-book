import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function compareMigrationVersions(localVersions, remoteVersions) {
  for (const versions of [localVersions, remoteVersions]) {
    if (versions.some(version => !/^\d{14}$/.test(version))) {
      throw new Error('Migration versions must be 14-digit timestamps.');
    }
    if (new Set(versions).size !== versions.length) {
      throw new Error('Duplicate migration versions found.');
    }
  }
  const local = new Set(localVersions);
  const remote = new Set(remoteVersions);
  return {
    missingLocally: [...remote].filter(version => !local.has(version)).sort(),
    pending: [...local].filter(version => !remote.has(version)).sort(),
  };
}

export function resolveProjectRef(config) {
  const ref = typeof config?.url === 'string' ? config.url.match(/^https:\/\/([a-z]{20})\.supabase\.co$/)?.[1] : undefined;
  if (!ref) throw new Error('Could not identify the frontend Supabase project.');
  return ref;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN to run the read-only check.');
  const config = JSON.parse(await readFile(new URL('../src/infrastructure/supabase/public-config.json', import.meta.url), 'utf8'));
  const projectRef = resolveProjectRef(config);
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url));
  const versions = files.filter(file => file.endsWith('.sql')).map(file => {
    const version = file.match(/^(\d{14})_.+\.sql$/)?.[1];
    if (!version) throw new Error(`Invalid migration filename: ${file}`);
    return version;
  });
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'select version from supabase_migrations.schema_migrations order by version',
      read_only: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Migration history lookup failed: HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.some(row => typeof row?.version !== 'string')) {
    throw new Error('Unexpected migration history response.');
  }
  const comparison = compareMigrationVersions(versions, rows.map(row => row.version));
  console.log(JSON.stringify({ projectRef, ...comparison }, null, 2));
  if (comparison.missingLocally.length || comparison.pending.length) {
    throw new Error('Migration histories differ; review the target and pending SQL before deployment.');
  }
  console.log('Migration versions match; no pending SQL.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

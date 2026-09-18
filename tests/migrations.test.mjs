import assert from 'node:assert/strict';
import test from 'node:test';
import { compareMigrationVersions, resolveProjectRef } from '../scripts/check-migration-history.mjs';

const original = ['20260915224029', '20260915224116', '20260916044654'];
const retiredBaseline = '20260917142631';

test('detects the original remote-history mismatch and unsafe pending retired baseline', () => {
  assert.deepEqual(compareMigrationVersions([retiredBaseline], original), {
    missingLocally: original,
    pending: [retiredBaseline],
  });
});

test('matching histories have no pending SQL regardless of order', () => {
  assert.deepEqual(compareMigrationVersions([...original].reverse(), original), {
    missingLocally: [], pending: [],
  });
});

test('reports new local SQL separately from missing remote migrations', () => {
  assert.deepEqual(compareMigrationVersions([...original, retiredBaseline], original), {
    missingLocally: [], pending: [retiredBaseline],
  });
});

for (const versions of [['invalid'], [retiredBaseline, retiredBaseline]]) {
  test(`rejects invalid migration history ${JSON.stringify(versions)}`, () => {
    assert.throws(() => compareMigrationVersions(versions, original));
    assert.throws(() => compareMigrationVersions(original, versions));
  });
}

test('resolves the React public configuration and rejects malformed targets', () => {
 assert.equal(resolveProjectRef({url:'https://naawqzwvegqbhioqqzkh.supabase.co'}),'naawqzwvegqbhioqqzkh');
 for(const config of [{}, {url:'https://example.com'}, {url:'https://naawqzwvegqbhioqqzkh.supabase.co.evil.test'}])assert.throws(()=>resolveProjectRef(config));
});

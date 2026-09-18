import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('./fixtures/legacy/index.html', import.meta.url), 'utf8');
const handlerStart = html.indexOf('document.getElementById("authSubmit").onclick=async()=>{');
const handlerEnd = html.indexOf('\nif(supabaseClient){', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'Locate the real auth submit handler');
const handler = html.slice(handlerStart, handlerEnd);

function createAuthForm({ mode = 'signin', identity, signupEmail = '', password = 'test-password' }) {
  const elements = { authSubmit: {}, authError: { textContent: '' } };
  const calls = { signIn: [], signUp: [], pendingEmails: [] };
  const context = {
    document: { getElementById: (id) => elements[id] },
    authMode: mode,
    authIdentity: { value: identity },
    authEmail: { value: signupEmail },
    authPassword: { value: password },
    authmodal: { classList: { remove() {} } },
    setPendingAuthEmail: (email) => calls.pendingEmails.push(email),
    supabaseClient: {
      auth: {
        async signInWithPassword(input) {
          calls.signIn.push(input);
          return { data: { session: {}, user: {} }, error: null };
        },
        async signUp(input) {
          calls.signUp.push(input);
          return { data: { session: null, user: {} }, error: null };
        },
      },
      from(table) {
        assert.equal(table, 'profiles');
        return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
      },
    },
  };
  vm.runInNewContext(handler, context, { filename: 'index.html:authSubmit' });
  return { calls, submit: elements.authSubmit.onclick, error: elements.authError };
}

for (const signupEmail of ['', 'old-signup@example.com']) {
  test(`sign-in submits visible email when hidden signup email is ${signupEmail ? 'stale' : 'empty'}`, async () => {
    const form = createAuthForm({ identity: '  golfer@example.com  ', signupEmail });
    await form.submit();
    assert.equal(form.calls.signIn.length, 1);
    assert.equal(form.calls.signIn[0].email, 'golfer@example.com');
    assert.equal(form.calls.signIn[0].password, 'test-password');
    assert.deepEqual(form.calls.pendingEmails, ['golfer@example.com']);
    assert.equal(form.calls.signUp.length, 0);
    assert.equal(form.error.textContent, '');
  });
}

test('signup submits the dedicated email and username fields', async () => {
  const form = createAuthForm({ mode: 'signup', identity: 'course_golfer', signupEmail: '  new@example.com  ' });
  await form.submit();
  assert.equal(form.calls.signUp.length, 1);
  assert.equal(form.calls.signUp[0].email, 'new@example.com');
  assert.equal(form.calls.signUp[0].options.data.username, 'course_golfer');
  assert.equal(form.calls.signUp[0].options.emailRedirectTo, 'https://serve-tech.github.io/the-course-book/');
  assert.equal(form.calls.signIn.length, 0);
  assert.deepEqual(form.calls.pendingEmails, ['new@example.com']);
  assert.match(form.error.textContent, /Check your email/);
});

test('invalid visible sign-in email cannot fall back to a stale signup email', async () => {
  const form = createAuthForm({ identity: 'not-an-email', signupEmail: 'old@example.com' });
  await form.submit();
  assert.equal(form.calls.signIn.length, 0);
  assert.equal(form.calls.signUp.length, 0);
  assert.equal(form.error.textContent, 'Enter a valid email address.');
});

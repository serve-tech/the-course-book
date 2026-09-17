# Port The Course Book before changing its application stack

**Date:** 2026-09-17
**Status:** Accepted

## Context

The user wants ownership under Serve Tech / Serve Electric before any React or Render work. They specified the product name The Course Book and explicitly approved copying existing accounts/password hashes and application data, plus reusing the original SMTP credential.

## Options Considered

1. Transfer original resources: retains identifiers but changes ownership of resources still used by the original app.
2. Copy into new resources: preserves the originals and provides a separate Serve-owned project, but requires new connection settings, auth redirects, fresh sessions, and separate configuration of SMTP.

## Decision

Create `serve-tech/the-course-book` and Supabase project The Course Book (`pungabwkrqhnxruodurf`) in Serve Electric. Preserve the existing single-file app, Git history, application schema, and approved data snapshot. Use GitHub Pages initially. Keep original remote resources intact. Remove the three original local clones after verifying the port. Defer React/Render work.

## Consequences

- The two backends are independent; future source writes do not sync automatically.
- Existing account IDs/password hashes are preserved, but users sign in again on the new site.
- The actual Resend key is needed to complete SMTP; the API's returned password hash is not reusable.
- The schema is recorded in a versioned baseline migration; private exports never enter Git.
- Existing behavior/access policies remain in effect, apart from the necessary fix for the discovered empty-email sign-in bug.

See [port verification](../../docs/port-2026-09-17.md) for counts and checks.

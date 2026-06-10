# Kaja MVP — session plan (2026-06-10)

Scratch tracking for the initial build. Canonical work items: GitHub Issues.

## Plan

- [x] Design agreed with user (see docs/DESIGN.md): Nostr + Blossom, public-first, browser-only PWA
- [x] Repo tonuonu/kaja created, branch `mvp`
- [x] Core lib: keys (NIP-07/NIP-49), events (kinds 0/1/3/7/10002, NIP-92), relays (SimplePool),
      outbox (offline-first, per-relay retry), feed (NIP-65 outbox model), Blossom (BUD-01/02/04), idb
- [x] Unit tests (vitest, 23 passing)
- [x] UI: onboarding/backup/unlock, feed + composer + media upload, people, settings, status bar
- [x] PWA: manifest, service worker (offline app shell), local fonts (no CDN)
- [x] E2E (Playwright + in-memory relay): A publishes → B follows, gets backfill + live post;
      reload restores cache behind passphrase lock — PASSING
- [x] CI workflow (unit + build + e2e), GitHub Pages deploy workflow
- [x] docker-compose strfry for local/self-hosted relay (not exercised in CI)
- [x] PR #1 merged, Pages live at tonuonu.github.io/kaja — verified working in production
- [x] Follower notifications (Lauri's request, 2026-06-10): live toast, "N new since last
      visit", Followers panel with follow-back. Caveat: unfollows undetectable (the
      unfollow event no longer tags us), so the followers list can overcount.

## Review

- Found & fixed during build: backup screen was unreachable (session started before
  backup confirmation — promoted to app-level `pendingBackup` gate); URL normalizers
  accepted foreign schemes (`ftp://nope` → `https://ftp`); absolute font paths broke
  GitHub Pages subpath hosting.
- Deliberately deferred (documented in DESIGN.md): replies/threads, reactions display
  (like sends kind 7 but counts aren't rendered), long-form posts, encrypted tier,
  eID attestations, image EXIF stripping (upload is as-is in v1 — flag to user).
- Public Blossom servers may rate-limit or require payment for uploads; default is
  blossom.primal.net, configurable in Settings.

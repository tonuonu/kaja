# Lessons

## 2026-06-10 — Lauri's "cannot post" (Safari, RELAYS 0, 'ks.enqueue' undefined)

**What happened:** `init()` failed at IndexedDB open, but the UI kept running with
undefined singletons (db/hub/outbox). The user could even reach onboarding again, which
could silently overwrite a stored identity. Two triggers for the open failure:
(1) stale service-worker-cached code (DB v1) meeting a database already upgraded to v2 →
VersionError; (2) browsers where IndexedDB is blocked/flaky (Safari "Block all cookies",
private modes).

**Rules going forward:**
1. A failed `init()` must *block* the UI (ErrorGate), never half-run. Any new singleton
   added to init must be covered by that gate.
2. The app HTML must be served network-first by the service worker. Stale-while-revalidate
   on navigations + a versioned IndexedDB schema = guaranteed VersionError window after
   every schema-bumping deploy.
3. Every IndexedDB schema bump needs: a `blocking()` handler (old tabs release and reload)
   and the VersionError self-heal path (purge caches/SW, reload once).
4. Key storage writes must be guarded: never overwrite an existing ncryptsec without an
   explicit logout first.

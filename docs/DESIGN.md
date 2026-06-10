# Kaja — Design

*Approved 2026-06-10. This is the design the MVP implements.*

## The problem

A social network / blog environment that is decentralized — relying on nobody — living
in browsers only. Publish content from the browser; friends' browsers learn about new
posts and show them like social media should; content stays available even when the
author is offline; the same static HTML works for everyone regardless of where it is
served from. (Original requirement set: 3cloud 2020–21, sns-test 2025, this design 2026.)

## The load-bearing constraint

Browsers cannot accept inbound connections, cannot join DHTs as servers, get tabs frozen
within minutes, and have evictable storage. A browser can never be a *peer* in the IPFS
sense — only an *edge client with a cache*. Every browser-P2P project for a decade has
hit this wall (js-ipfs, browser Helia). The consequence is accepted up front: a thin
always-on layer is **the backbone, not a workaround**. The design goal is to make that
layer as thin, dumb, commodity, and replaceable as possible.

## Decisions (with the user, 2026-06-10)

1. **Substrate**: properties matter, not IPFS. Chosen stack: **Nostr** (signed events
   over WebSocket relays) for posts/profiles/follows + **Blossom** (sha256-addressed
   blobs over HTTP) for media. Rationale: works browser-only today, large existing
   ecosystem, the firewall problem disappears into commodity relays.
2. **Privacy**: public-first; encrypted friends-only tier is a later phase.
3. **Infrastructure**: scale target is millions (not friends-only); rely on existing
   public relays first, add community/own nodes to taste; minimize required nodes.
4. **Architecture variant A** chosen over (B) Nostr + IPFS media and (C) own protocol.
   B composes with A later (same sha256 hashes, different transport); C was rejected
   for zero network effect and years of protocol maintenance.

## Requirement → mechanism

| Requirement | Mechanism |
|---|---|
| Lives in browsers only | The product is one static PWA; no backend of ours |
| Same HTML for everyone, any host | Identity is the keypair, not the URL; host on Pages/IPFS/USB |
| Stored in my browser first | Events signed locally, IndexedDB outbox; publishing works offline |
| Available globally | Outbox flushes to 3–5 relays over WebSocket |
| Friends see new posts live | Open relay subscription filtered on followed keys (~1 s latency) |
| Survives author offline | Relays store events; **anyone may re-publish signed events** (Echo button / auto-echo) and mirror blobs (BUD-04) |
| Community servers for firewalled users | Relays/Blossom servers are those servers; dozens of free public ones exist; strfry runs on a Pi |
| Scale to millions | NIP-65 outbox model: read from the relays your follows write to; no global index |

## Identity

- secp256k1 keypair generated in the browser; npub is the address.
- Key storage: NIP-07 extension if present, else NIP-49 (scrypt) passphrase-encrypted
  in localStorage with a forced backup step at onboarding.
- eIDAS/UDSP attestation layer (later phase): publish an event carrying an ASiC-E
  signature over the npub; clients show "government-verified human"; links to the
  UDSP manifest. Anti-spam web-of-trust built on these attestations.
- Key loss = identity loss (v1); social/eID recovery is future work.

## Data model (all standard Nostr kinds)

Profile kind 0 · note kind 1 · contacts kind 3 · repost kind 6 · reaction kind 7 ·
long-form kind 30023 (phase 2) · relay list kind 10002 · Blossom auth kind 24242.
Media referenced by URL + sha256 in NIP-92 `imeta` tags, so any mirror is verifiable.

## Flows

**Publish**: strip-EXIF/scale image → sha256 → PUT to Blossom (signed auth) → build
note with imeta → sign → IndexedDB outbox → optimistic render → flusher pushes to
write relays with per-relay retry (give up on stragglers only after ≥1 accept).

**Read**: load follows (kind 3) → fetch their kind 10002 relay lists → subscribe to the
union (capped) for kinds 1 + metadata since last sync → verify signatures client-side →
IndexedDB → render. Cache renders first; network tops up.

**Echo** (the persistence mechanism): re-publish a friend's signed event to your own
relays + BUD-04 mirror its blobs to your Blossom server. Manual per-post button and an
auto-echo setting.

## Error handling

Relay down → other relays have the data, reconnect with backoff. Blob 404 → try mirror
list. Bad signature → drop. Storage pressure → `navigator.storage.persist()`, LRU-evict
others' media, never own keys/outbox. No key → read-only lurking (future).

## Testing

Unit (vitest): event building/parsing, keys, outbox queue, Blossom auth.
E2E (Playwright + in-memory NIP-01 relay): two isolated browsers; A publishes, B
follows and receives via backfill and live; reload restores from cache behind unlock.

## Explicitly out of v1

Encrypted friends tier (NIP-44/17) · IPFS as second media backend · eID attestations &
web-of-trust · long-form kind 30023 UI · replies/threads (NIP-10/22 rendering) ·
mobile push while closed · key recovery.

## Honesty note

The one thing this does *not* do from the original vision: browsers re-serving cached
content directly to strangers, IPFS-style. Browser physics forbids it in any
architecture. The signed-event echo + blob mirroring achieves the same outcome (content
outlives author uptime) through the always-on layer instead.

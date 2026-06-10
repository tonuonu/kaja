# Kaja

**A social network that lives in browsers. Your posts echo through relays and friends —
and outlive your uptime.**

*Kaja* is Estonian for *echo*.

Kaja is a browser-only, decentralized social network client. There is no Kaja server,
no account database, no company. Identity is a keypair generated in your browser; posts
are signed [Nostr](https://nostr.com) events stored on interchangeable community relays;
photos are sha256-addressed blobs on [Blossom](https://github.com/hzrd149/blossom)
servers, verifiable from any mirror. The app itself is one static page — host it on
GitHub Pages, IPFS, your own server, or a USB stick; it is the same file for everyone,
and your identity travels with your key, not with the URL.

## How it fulfills the original idea

- **Publish from the browser** — posts are signed and stored locally first
  (IndexedDB outbox), then pushed to your relays. Publishing works offline; it syncs
  when you reconnect.
- **Friends see it like social media** — their browsers hold open WebSocket
  subscriptions filtered on the keys they follow. New posts arrive in ~1 second.
- **Content survives you going offline** — relays store your signed events, and any
  friend can *echo* them (re-publish to their relays, mirror your media). The Echo
  button — and the auto-echo setting — is the social contract that keeps the network
  alive. Nobody can forge an echo: every event carries your signature.
- **Community servers, minimized** — a relay is one binary
  ([strfry](https://github.com/hoytech/strfry)) that runs on a Raspberry Pi; dozens of
  free public ones already exist, so the network works with zero own infrastructure.
  `docker compose up -d` in this repo gives you your own.
- **Interoperable from day one** — Kaja speaks plain Nostr: your posts are readable in
  Damus, Amethyst, Primal, and every other Nostr app, and you can follow their millions
  of users from Kaja.

See [docs/DESIGN.md](docs/DESIGN.md) for the full architecture and the honest
constraints (why browsers can't be servers, and what that means).

## Quick start

```sh
npm ci
npm run dev          # local dev server
```

Open the printed URL, create an identity (save the nsec backup!), and post.
To follow someone, paste their `npub` under **People**. Give them yours from the same
page.

## Development

```sh
npm test             # unit tests (vitest)
npm run build        # typecheck + production build into dist/
npx playwright test  # e2e: two browsers exchange posts through an in-memory relay
docker compose up -d # optional: local strfry relay at ws://localhost:7777
```

## Deploying your own copy

Any static host works. This repo ships a GitHub Pages workflow: enable Pages
(Settings → Pages → Source: GitHub Actions) and push to `main`. The app is then at
`https://<user>.github.io/kaja/` — but remember, *which* copy of the HTML people open
does not matter.

## Status

Working MVP: identity (NIP-07 extension or NIP-49 encrypted local key), feed with live
updates (NIP-65 outbox model), offline-first posting, image upload (Blossom), follows,
echo/auto-echo, PWA offline shell. Roadmap (see DESIGN.md): replies and reactions
rendering, long-form posts, encrypted friends-only tier, eIDAS/UDSP identity
attestations, IPFS as a second media backend.

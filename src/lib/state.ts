import { signal } from '@preact/signals'
import type { Event } from 'nostr-tools'
import {
  buildContacts,
  buildNote,
  buildProfile,
  buildReaction,
  KIND_CONTACTS,
  KIND_PROFILE,
  parseContacts,
  parseImeta,
  parseProfile,
  type MediaRef,
  type ProfileContent,
} from './events'
import { getMeta, getSetting, listFollowers, openKajaDb, saveMeta, saveNote, setSetting, type Db } from './db'
import {
  decryptSecret,
  encryptSecret,
  generateIdentity,
  hasNip07,
  importSecret,
  LocalSigner,
  Nip07Signer,
  toNpub,
  toPubkeyHex,
  type Signer,
} from './keys'
import { DEFAULT_BLOSSOM_SERVERS, DEFAULT_RELAYS, RelayHub } from './relays'
import { Outbox } from './outbox'
import { FeedManager } from './feed'
import { mirrorBlob, uploadBlob } from './blossom'

const LS_NCRYPTSEC = 'kaja:ncryptsec'
const LS_METHOD = 'kaja:method'

export interface Session {
  signer: Signer
  pubkey: string
  method: 'local' | 'nip07'
}

// --- Reactive state ---------------------------------------------------
/** True once init() finished (db open, settings loaded, session restored). */
export const ready = signal(false)
export const session = signal<Session | null>(null)
/** True when a local key exists but has not been unlocked this session. */
export const locked = signal(false)
/** Freshly generated nsec awaiting user backup confirmation (blocks the UI until acknowledged). */
export const pendingBackup = signal<string | null>(null)
export const notes = signal<Event[]>([])
export const profiles = signal<Map<string, ProfileContent>>(new Map())
export const follows = signal<string[]>([])
/** People who follow us, newest first. Unfollows are not detectable, so this can overcount. */
export const followers = signal<string[]>([])
export const online = signal(typeof navigator !== 'undefined' ? navigator.onLine : true)
export const outboxPending = signal(0)
export const feedRelays = signal<string[]>([])
export const relays = signal<string[]>(DEFAULT_RELAYS)
export const blossomServers = signal<string[]>(DEFAULT_BLOSSOM_SERVERS)
export const autoEcho = signal(false)
export const toast = signal<string | null>(null)

// --- Singletons -------------------------------------------------------
let db: Db
let hub: RelayHub
let outbox: Outbox
let feed: FeedManager
const seenIds = new Set<string>()

export function showToast(message: string): void {
  toast.value = message
  setTimeout(() => {
    if (toast.value === message) toast.value = null
  }, 4000)
}

export async function init(): Promise<void> {
  db = await openKajaDb()
  hub = new RelayHub()
  outbox = new Outbox(db, (rs, ev) => hub.publish(rs, ev))
  outbox.onChange = (n) => (outboxPending.value = n)
  feed = new FeedManager(hub, db)

  relays.value = (await getSetting<string[]>(db, 'relays')) ?? DEFAULT_RELAYS
  blossomServers.value = (await getSetting<string[]>(db, 'blossom')) ?? DEFAULT_BLOSSOM_SERVERS
  autoEcho.value = (await getSetting<boolean>(db, 'autoEcho')) ?? false

  window.addEventListener('online', () => (online.value = true))
  window.addEventListener('offline', () => (online.value = false))
  outbox.start()

  // Ask the browser not to evict our storage under pressure.
  void navigator.storage?.persist?.().catch(() => undefined)

  const method = localStorage.getItem(LS_METHOD)
  if (method === 'nip07' && hasNip07()) {
    await startSession(new Nip07Signer(), 'nip07')
  } else if (localStorage.getItem(LS_NCRYPTSEC)) {
    locked.value = true
  }
}

// --- Identity ---------------------------------------------------------
export async function createIdentity(passphrase: string): Promise<string> {
  const id = generateIdentity()
  localStorage.setItem(LS_NCRYPTSEC, encryptSecret(id.sk, passphrase))
  localStorage.setItem(LS_METHOD, 'local')
  pendingBackup.value = id.nsec
  await startSession(new LocalSigner(id.sk), 'local')
  return id.nsec
}

export async function importIdentity(nsec: string, passphrase: string): Promise<void> {
  const sk = importSecret(nsec)
  localStorage.setItem(LS_NCRYPTSEC, encryptSecret(sk, passphrase))
  localStorage.setItem(LS_METHOD, 'local')
  await startSession(new LocalSigner(sk), 'local')
}

export async function unlock(passphrase: string): Promise<void> {
  const ncryptsec = localStorage.getItem(LS_NCRYPTSEC)
  if (!ncryptsec) throw new Error('No stored key')
  const sk = decryptSecret(ncryptsec, passphrase)
  await startSession(new LocalSigner(sk), 'local')
}

export async function loginWithExtension(): Promise<void> {
  localStorage.setItem(LS_METHOD, 'nip07')
  await startSession(new Nip07Signer(), 'nip07')
}

export function logout(): void {
  localStorage.removeItem(LS_NCRYPTSEC)
  localStorage.removeItem(LS_METHOD)
  feed.stop()
  session.value = null
  locked.value = false
  pendingBackup.value = null
  notes.value = []
  follows.value = []
  followers.value = []
  seenIds.clear()
}

async function startSession(signer: Signer, method: 'local' | 'nip07'): Promise<void> {
  const pubkey = await signer.getPublicKey()
  session.value = { signer, pubkey, method }
  locked.value = false
  const contacts = await getMeta(db, KIND_CONTACTS, pubkey)
  follows.value = contacts ? parseContacts(contacts) : []
  const profileEv = await getMeta(db, KIND_PROFILE, pubkey)
  if (profileEv) {
    const p = parseProfile(profileEv)
    if (p) upsertProfile(pubkey, p)
  }
  followers.value = await listFollowers(db)
  await restartFeed()
  void fetchProfiles(followers.value)
}

/** Fetches and caches kind 0 profiles we don't have yet (e.g. for followers). */
async function fetchProfiles(pubkeys: string[]): Promise<void> {
  const missing = pubkeys.filter((pk) => !profiles.value.has(pk))
  if (missing.length === 0) return
  const events = await hub.query(feedRelays.value.length > 0 ? feedRelays.value : relays.value, {
    kinds: [KIND_PROFILE],
    authors: missing,
  })
  for (const ev of events) await saveMeta(db, ev)
  for (const pk of missing) {
    const stored = await getMeta(db, KIND_PROFILE, pk)
    if (!stored) continue
    const p = parseProfile(stored)
    if (p) upsertProfile(pk, p)
  }
}

// --- Feed -------------------------------------------------------------
function upsertProfile(pubkey: string, p: ProfileContent): void {
  const next = new Map(profiles.value)
  next.set(pubkey, p)
  profiles.value = next
}

function insertNote(ev: Event): void {
  if (seenIds.has(ev.id)) return
  seenIds.add(ev.id)
  const next = [...notes.value, ev].sort((a, b) => b.created_at - a.created_at)
  notes.value = next.slice(0, 500)
}

export async function restartFeed(): Promise<void> {
  const s = session.value
  if (!s) return
  const authors = [s.pubkey, ...follows.value]
  await feed.start(relays.value, s.pubkey, authors, {
    onNote: (ev, live) => {
      insertNote(ev)
      if (live && autoEcho.value && ev.pubkey !== s.pubkey) void echoNote(ev, true)
    },
    onMeta: (ev) => {
      if (ev.kind === KIND_PROFILE) {
        const p = parseProfile(ev)
        if (p) upsertProfile(ev.pubkey, p)
      }
      if (ev.kind === KIND_CONTACTS && ev.pubkey === s.pubkey) {
        follows.value = parseContacts(ev)
      }
    },
    onNewFollowers: (pubkeys, phase) => {
      const known = new Set(followers.value)
      followers.value = [...pubkeys.filter((pk) => !known.has(pk)), ...followers.value]
      void fetchProfiles(pubkeys).then(() => {
        if (phase === 'live') {
          for (const pk of pubkeys) {
            const name = profiles.value.get(pk)?.name ?? shortNpub(pk)
            showToast(`${name} started following you`)
          }
        } else if (phase === 'backfill') {
          showToast(`${pubkeys.length} new follower${pubkeys.length > 1 ? 's' : ''} since your last visit`)
        }
        // 'baseline' (first ever scan) stays silent: they aren't news.
      })
    },
  })
  feedRelays.value = feed.relays
}

function shortNpub(pubkey: string): string {
  const npub = toNpub(pubkey)
  return `${npub.slice(0, 12)}…`
}

// --- Actions ----------------------------------------------------------
async function signAndQueue(template: Parameters<Signer['signEvent']>[0]): Promise<Event> {
  const s = session.value
  if (!s) throw new Error('Not logged in')
  const signed = await s.signer.signEvent(template)
  await outbox.enqueue(signed, relays.value)
  return signed
}

export async function publishNote(text: string, files: File[]): Promise<void> {
  const s = session.value
  if (!s) throw new Error('Not logged in')
  const media: MediaRef[] = []
  for (const file of files) {
    const server = blossomServers.value[0]
    if (!server) throw new Error('No Blossom server configured (Settings)')
    const descriptor = await uploadBlob(server, file, s.signer)
    media.push({ url: descriptor.url, sha256: descriptor.sha256, mime: file.type })
  }
  const signed = await signAndQueue(buildNote(text, media))
  await saveNote(db, signed)
  insertNote(signed)
}

export async function saveOwnProfile(p: ProfileContent): Promise<void> {
  const signed = await signAndQueue(buildProfile(p))
  await saveMeta(db, signed)
  upsertProfile(signed.pubkey, p)
}

export async function followUser(input: string): Promise<void> {
  const s = session.value
  if (!s) throw new Error('Not logged in')
  const pubkey = toPubkeyHex(input)
  if (pubkey === s.pubkey || follows.value.includes(pubkey)) return
  const next = [...follows.value, pubkey]
  const signed = await signAndQueue(buildContacts(next))
  await saveMeta(db, signed)
  follows.value = next
  await restartFeed()
}

export async function unfollowUser(pubkey: string): Promise<void> {
  const next = follows.value.filter((p) => p !== pubkey)
  const signed = await signAndQueue(buildContacts(next))
  await saveMeta(db, signed)
  follows.value = next
  await restartFeed()
}

export async function likeNote(target: Event): Promise<void> {
  await signAndQueue(buildReaction(target))
  showToast('Liked')
}

/**
 * The heart of "content outlives its author's uptime": re-publish a
 * friend's signed event to your own relays, and mirror its media blobs
 * to your Blossom server. Anyone can do this for anyone — signatures
 * make it tamper-proof.
 */
export async function echoNote(ev: Event, silent = false): Promise<void> {
  const s = session.value
  if (!s) return
  const result = await hub.publish(relays.value, ev)
  const media = parseImeta(ev)
  let mirrored = 0
  for (const m of media) {
    if (!m.sha256) continue
    for (const server of blossomServers.value) {
      try {
        await mirrorBlob(server, m.url, m.sha256, s.signer)
        mirrored++
        break
      } catch {
        // mirroring is best-effort; the event echo is what matters most
      }
    }
  }
  if (!silent) {
    showToast(`Echoed to ${result.accepted.length} relay(s)` + (mirrored ? `, ${mirrored} blob(s) mirrored` : ''))
  }
}

// --- Settings ---------------------------------------------------------
export async function saveRelays(urls: string[]): Promise<void> {
  relays.value = urls
  await setSetting(db, 'relays', urls)
  await restartFeed()
}

export async function saveBlossomServers(urls: string[]): Promise<void> {
  blossomServers.value = urls
  await setSetting(db, 'blossom', urls)
}

export async function saveAutoEcho(enabled: boolean): Promise<void> {
  autoEcho.value = enabled
  await setSetting(db, 'autoEcho', enabled)
}

export function connectedRelayCount(): number {
  return hub ? hub.connectedCount() : 0
}

import type { Event, EventTemplate } from 'nostr-tools'

export const KIND_PROFILE = 0
export const KIND_NOTE = 1
export const KIND_CONTACTS = 3
export const KIND_REPOST = 6
export const KIND_REACTION = 7
export const KIND_RELAY_LIST = 10002
export const KIND_BLOSSOM_AUTH = 24242

export interface ProfileContent {
  name?: string
  about?: string
  picture?: string
  nip05?: string
  website?: string
}

export interface MediaRef {
  url: string
  sha256?: string
  mime?: string
}

export interface RelayEntry {
  url: string
  read: boolean
  write: boolean
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Kind 1 note. Media URLs are appended to the content (so every Nostr
 * client renders them) and described in NIP-92 imeta tags (so clients
 * that verify hashes, like Kaja itself, can do so).
 */
export function buildNote(content: string, media: MediaRef[] = []): EventTemplate {
  const urls = media.map((m) => m.url)
  const fullContent = [content.trim(), ...urls].filter(Boolean).join('\n')
  const tags: string[][] = media.map((m) => {
    const parts = [`url ${m.url}`]
    if (m.sha256) parts.push(`x ${m.sha256}`)
    if (m.mime) parts.push(`m ${m.mime}`)
    return ['imeta', ...parts]
  })
  return { kind: KIND_NOTE, created_at: now(), tags, content: fullContent }
}

export function buildProfile(profile: ProfileContent): EventTemplate {
  return { kind: KIND_PROFILE, created_at: now(), tags: [], content: JSON.stringify(profile) }
}

export function buildContacts(pubkeys: string[]): EventTemplate {
  return {
    kind: KIND_CONTACTS,
    created_at: now(),
    tags: pubkeys.map((pk) => ['p', pk]),
    content: '',
  }
}

export function buildRelayList(urls: string[]): EventTemplate {
  return {
    kind: KIND_RELAY_LIST,
    created_at: now(),
    tags: urls.map((u) => ['r', u]),
    content: '',
  }
}

export function buildReaction(target: Event): EventTemplate {
  return {
    kind: KIND_REACTION,
    created_at: now(),
    tags: [
      ['e', target.id],
      ['p', target.pubkey],
      ['k', String(target.kind)],
    ],
    content: '+',
  }
}

export function parseProfile(ev: Event): ProfileContent | null {
  if (ev.kind !== KIND_PROFILE) return null
  try {
    const parsed = JSON.parse(ev.content)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as ProfileContent
  } catch {
    return null
  }
}

/** True if this contact list event includes the given pubkey (i.e. its author follows them). */
export function contactsInclude(ev: Event, pubkey: string): boolean {
  return ev.kind === KIND_CONTACTS && ev.tags.some((t) => t[0] === 'p' && t[1] === pubkey)
}

export function parseContacts(ev: Event): string[] {
  if (ev.kind !== KIND_CONTACTS) return []
  return ev.tags.filter((t) => t[0] === 'p' && /^[0-9a-f]{64}$/.test(t[1] ?? '')).map((t) => t[1])
}

export function parseRelayList(ev: Event): RelayEntry[] {
  if (ev.kind !== KIND_RELAY_LIST) return []
  const entries: RelayEntry[] = []
  for (const t of ev.tags) {
    if (t[0] !== 'r' || !t[1]) continue
    const url = normalizeRelayUrl(t[1])
    if (!url) continue
    const marker = t[2]
    entries.push({
      url,
      read: marker !== 'write',
      write: marker !== 'read',
    })
  }
  return entries
}

export function parseImeta(ev: Event): MediaRef[] {
  const refs: MediaRef[] = []
  for (const t of ev.tags) {
    if (t[0] !== 'imeta') continue
    const ref: MediaRef = { url: '' }
    for (const part of t.slice(1)) {
      const space = part.indexOf(' ')
      if (space < 0) continue
      const key = part.slice(0, space)
      const value = part.slice(space + 1)
      if (key === 'url') ref.url = value
      else if (key === 'x') ref.sha256 = value
      else if (key === 'm') ref.mime = value
    }
    if (ref.url) refs.push(ref)
  }
  return refs
}

/** Returns a normalized wss:// URL or null if it cannot be one. */
export function normalizeRelayUrl(input: string): string | null {
  let s = input.trim()
  if (!s) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (!/^wss?:\/\//i.test(s)) return null
  } else {
    s = `wss://${s}`
  }
  try {
    const u = new URL(s)
    if (u.protocol !== 'wss:' && u.protocol !== 'ws:') return null
    let out = u.toString()
    if (out.endsWith('/') && u.pathname === '/') out = out.slice(0, -1)
    return out
  } catch {
    return null
  }
}

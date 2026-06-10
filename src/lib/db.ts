import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Event } from 'nostr-tools'

export interface OutboxItem {
  id: string
  event: Event
  /** Relays that have not accepted this event yet. */
  remaining: string[]
  /** Relays that accepted it. */
  accepted: string[]
  attempts: number
  createdAt: number
}

interface KajaDB extends DBSchema {
  /** Kind 1 notes, the feed. */
  notes: {
    key: string
    value: Event
    indexes: { 'by-created': number; 'by-author': string }
  }
  /** Replaceable events (profile 0, contacts 3, relay list 10002), keyed `${kind}:${pubkey}`. */
  meta: {
    key: string
    value: Event
  }
  outbox: {
    key: string
    value: OutboxItem
  }
  settings: {
    key: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  }
  /** People whose contact list tags us, keyed by their pubkey. */
  followers: {
    key: string
    value: { pubkey: string; firstSeen: number }
  }
}

export type Db = IDBPDatabase<KajaDB>

export async function openKajaDb(): Promise<Db> {
  return openDB<KajaDB>('kaja', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('by-created', 'created_at')
        notes.createIndex('by-author', 'pubkey')
        db.createObjectStore('meta')
        db.createObjectStore('outbox', { keyPath: 'id' })
        db.createObjectStore('settings')
      }
      if (oldVersion < 2) {
        db.createObjectStore('followers', { keyPath: 'pubkey' })
      }
    },
  })
}

/** Records a follower; returns true only the first time this pubkey is seen. */
export async function addFollower(db: Db, pubkey: string, firstSeen: number): Promise<boolean> {
  const existing = await db.get('followers', pubkey)
  if (existing) return false
  await db.put('followers', { pubkey, firstSeen })
  return true
}

/** Follower pubkeys, newest first. Unfollows are not detectable (see feed.ts), so this can overcount. */
export async function listFollowers(db: Db): Promise<string[]> {
  const all = await db.getAll('followers')
  return all.sort((a, b) => b.firstSeen - a.firstSeen).map((f) => f.pubkey)
}

/** Stores a note; returns true if it was new. */
export async function saveNote(db: Db, ev: Event): Promise<boolean> {
  const existing = await db.get('notes', ev.id)
  if (existing) return false
  await db.put('notes', ev)
  return true
}

export async function listNotes(db: Db, authors: Set<string>, limit = 200): Promise<Event[]> {
  const out: Event[] = []
  let cursor = await db.transaction('notes').store.index('by-created').openCursor(null, 'prev')
  while (cursor && out.length < limit) {
    if (authors.size === 0 || authors.has(cursor.value.pubkey)) out.push(cursor.value)
    cursor = await cursor.continue()
  }
  return out
}

/** Stores a replaceable event, keeping only the newest per (kind, pubkey). Returns true if stored. */
export async function saveMeta(db: Db, ev: Event): Promise<boolean> {
  const key = `${ev.kind}:${ev.pubkey}`
  const existing = await db.get('meta', key)
  if (existing && existing.created_at >= ev.created_at) return false
  await db.put('meta', ev, key)
  return true
}

export async function getMeta(db: Db, kind: number, pubkey: string): Promise<Event | undefined> {
  return db.get('meta', `${kind}:${pubkey}`)
}

export async function outboxPut(db: Db, item: OutboxItem): Promise<void> {
  await db.put('outbox', item)
}

export async function outboxAll(db: Db): Promise<OutboxItem[]> {
  return db.getAll('outbox')
}

export async function outboxDelete(db: Db, id: string): Promise<void> {
  await db.delete('outbox', id)
}

export async function getSetting<T>(db: Db, key: string): Promise<T | undefined> {
  return db.get('settings', key)
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.put('settings', value, key)
}

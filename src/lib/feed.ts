import type { Event } from 'nostr-tools'
import type { SubCloser } from 'nostr-tools/abstract-pool'
import type { Db } from './db'
import { getMeta, listNotes, saveMeta, saveNote } from './db'
import { KIND_CONTACTS, KIND_NOTE, KIND_PROFILE, KIND_RELAY_LIST, parseRelayList } from './events'
import { MAX_FEED_RELAYS, type RelayHub } from './relays'

export interface FeedCallbacks {
  /** Called once per note id, ever (cache, backfill and live are deduplicated). */
  onNote: (ev: Event, live: boolean) => void
  onMeta?: (ev: Event) => void
}

/**
 * Drives the read path: local cache first, then author metadata
 * (profiles, contact lists, NIP-65 relay lists), then a backfill query
 * and a live subscription against the union of the authors' write
 * relays — the outbox model, which is what lets this scale without any
 * central index.
 */
export class FeedManager {
  #hub: RelayHub
  #db: Db
  #noteSub: SubCloser | undefined
  #metaSub: SubCloser | undefined
  /** Relays the feed actually connected to (for display/debugging). */
  relays: string[] = []

  constructor(hub: RelayHub, db: Db) {
    this.#hub = hub
    this.#db = db
  }

  async start(baseRelays: string[], authors: string[], cb: FeedCallbacks): Promise<void> {
    this.stop()
    const authorList = [...new Set(authors)]
    const authorSet = new Set(authorList)

    // 1. Local cache renders instantly, network only tops it up.
    for (const ev of await listNotes(this.#db, authorSet)) cb.onNote(ev, false)

    // 2. Fetch authors' metadata from the base relays.
    const metaKinds = [KIND_PROFILE, KIND_CONTACTS, KIND_RELAY_LIST]
    const metaEvents = await this.#hub.query(baseRelays, { kinds: metaKinds, authors: authorList })
    for (const ev of metaEvents) {
      if (await saveMeta(this.#db, ev)) cb.onMeta?.(ev)
    }

    // 3. Build the relay set: base relays + the authors' write relays.
    const relaySet = new Set(baseRelays)
    for (const pk of authorList) {
      const relayList = await getMeta(this.#db, KIND_RELAY_LIST, pk)
      if (!relayList) continue
      for (const entry of parseRelayList(relayList)) {
        if (entry.write && relaySet.size < MAX_FEED_RELAYS) relaySet.add(entry.url)
      }
    }
    this.relays = [...relaySet]

    // 4. Backfill recent notes.
    const backfill = await this.#hub.query(this.relays, {
      kinds: [KIND_NOTE],
      authors: authorList,
      limit: 100,
    })
    for (const ev of backfill.sort((a, b) => a.created_at - b.created_at)) {
      if (await saveNote(this.#db, ev)) cb.onNote(ev, false)
    }

    // 5. Live subscriptions: notes, and metadata updates.
    const since = Math.floor(Date.now() / 1000) - 60
    this.#noteSub = this.#hub.subscribe(
      this.relays,
      { kinds: [KIND_NOTE], authors: authorList, since },
      (ev) => {
        void saveNote(this.#db, ev).then((isNew) => {
          if (isNew) cb.onNote(ev, true)
        })
      },
    )
    this.#metaSub = this.#hub.subscribe(
      this.relays,
      { kinds: metaKinds, authors: authorList, since },
      (ev) => {
        void saveMeta(this.#db, ev).then((isNew) => {
          if (isNew) cb.onMeta?.(ev)
        })
      },
    )
  }

  stop(): void {
    this.#noteSub?.close()
    this.#metaSub?.close()
    this.#noteSub = undefined
    this.#metaSub = undefined
  }
}

import { SimplePool } from 'nostr-tools/pool'
import type { Event, Filter } from 'nostr-tools'
import type { SubCloser } from 'nostr-tools/abstract-pool'

/**
 * Well-known free public relays. These are defaults, not dependencies:
 * users can replace them in Settings, and every event is written to
 * several so no single relay matters.
 */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://offchain.pub',
]

export const DEFAULT_BLOSSOM_SERVERS = ['https://blossom.primal.net']

/** Max simultaneous relay connections for the live feed subscription. */
export const MAX_FEED_RELAYS = 12

export interface PublishResult {
  accepted: string[]
  failed: { relay: string; reason: string }[]
}

export class RelayHub {
  pool = new SimplePool()

  subscribe(relays: string[], filter: Filter, onevent: (ev: Event) => void, oneose?: () => void): SubCloser {
    return this.pool.subscribeMany(relays, filter, { onevent, oneose })
  }

  async query(relays: string[], filter: Filter, maxWait = 5000): Promise<Event[]> {
    try {
      return await this.pool.querySync(relays, filter, { maxWait })
    } catch {
      return []
    }
  }

  async publish(relays: string[], event: Event): Promise<PublishResult> {
    const results = await Promise.allSettled(this.pool.publish(relays, event))
    const out: PublishResult = { accepted: [], failed: [] }
    results.forEach((r, i) => {
      const relay = relays[i]
      if (r.status === 'fulfilled') out.accepted.push(relay)
      else out.failed.push({ relay, reason: String(r.reason) })
    })
    return out
  }

  connectedCount(): number {
    let n = 0
    for (const ok of this.pool.listConnectionStatus().values()) if (ok) n++
    return n
  }

  destroy(): void {
    this.pool.destroy()
  }
}

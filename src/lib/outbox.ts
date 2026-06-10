import type { Event } from 'nostr-tools'
import type { Db, OutboxItem } from './db'
import { outboxAll, outboxDelete, outboxPut } from './db'
import type { PublishResult } from './relays'

const MAX_ATTEMPTS_AFTER_ACCEPT = 10

export type PublishFn = (relays: string[], event: Event) => Promise<PublishResult>

/**
 * Offline-first publish queue. Events are signed and stored locally
 * first; this queue pushes them to relays whenever the network allows,
 * retrying per-relay until every target accepted (or we give up on
 * stragglers after the event is already safe on at least one relay).
 */
export class Outbox {
  #db: Db
  #publish: PublishFn
  #inFlight: Promise<void> | null = null
  #timer: ReturnType<typeof setInterval> | undefined
  onChange?: (pending: number) => void

  constructor(db: Db, publish: PublishFn) {
    this.#db = db
    this.#publish = publish
  }

  async enqueue(event: Event, relays: string[]): Promise<void> {
    const item: OutboxItem = {
      id: event.id,
      event,
      remaining: [...new Set(relays)],
      accepted: [],
      attempts: 0,
      createdAt: Date.now(),
    }
    await outboxPut(this.#db, item)
    await this.#notify()
    void this.flush()
  }

  async pendingCount(): Promise<number> {
    return (await outboxAll(this.#db)).length
  }

  /** Concurrent callers share the in-flight flush instead of stacking. */
  flush(): Promise<void> {
    if (this.#inFlight) return this.#inFlight
    if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve()
    this.#inFlight = this.#doFlush().finally(() => {
      this.#inFlight = null
    })
    return this.#inFlight
  }

  async #doFlush(): Promise<void> {
    try {
      for (const item of await outboxAll(this.#db)) {
        const result = await this.#publish(item.remaining, item.event)
        const accepted = new Set(result.accepted)
        item.remaining = item.remaining.filter((r) => !accepted.has(r))
        item.accepted.push(...result.accepted)
        item.attempts += 1
        const safeAndStale = item.accepted.length > 0 && item.attempts >= MAX_ATTEMPTS_AFTER_ACCEPT
        if (item.remaining.length === 0 || safeAndStale) {
          await outboxDelete(this.#db, item.id)
        } else {
          await outboxPut(this.#db, item)
        }
      }
    } finally {
      await this.#notify()
    }
  }

  /** Wire up automatic flushing: when we come online and on a slow heartbeat. */
  start(intervalMs = 30_000): void {
    window.addEventListener('online', () => void this.flush())
    this.#timer = setInterval(() => void this.flush(), intervalMs)
    void this.flush()
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer)
  }

  async #notify(): Promise<void> {
    if (this.onChange) this.onChange(await this.pendingCount())
  }
}

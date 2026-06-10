import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import { generateIdentity } from './keys'
import { openKajaDb, outboxAll, type Db } from './db'
import { Outbox } from './outbox'
import type { PublishResult } from './relays'

const id = generateIdentity()

function makeEvent(content: string) {
  return finalizeEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content }, id.sk)
}

let db: Db

beforeEach(async () => {
  indexedDB = new IDBFactory()
  db = await openKajaDb()
})

describe('Outbox', () => {
  it('delivers to all relays and clears the queue', async () => {
    const sent: string[][] = []
    const outbox = new Outbox(db, async (relays): Promise<PublishResult> => {
      sent.push(relays)
      return { accepted: relays, failed: [] }
    })
    await outbox.enqueue(makeEvent('tere'), ['wss://a', 'wss://b'])
    await outbox.flush()
    expect(await outboxAll(db)).toHaveLength(0)
    expect(sent).toEqual([['wss://a', 'wss://b']])
  })

  it('keeps retrying relays that rejected, without re-sending to ones that accepted', async () => {
    const calls: string[][] = []
    let failB = true
    const outbox = new Outbox(db, async (relays): Promise<PublishResult> => {
      calls.push([...relays])
      const accepted = relays.filter((r) => r === 'wss://a' || !failB)
      const failed = relays.filter((r) => !accepted.includes(r)).map((r) => ({ relay: r, reason: 'down' }))
      return { accepted, failed }
    })

    await outbox.enqueue(makeEvent('tere'), ['wss://a', 'wss://b'])
    await outbox.flush()
    let pending = await outboxAll(db)
    expect(pending).toHaveLength(1)
    expect(pending[0].remaining).toEqual(['wss://b'])
    expect(pending[0].accepted).toEqual(['wss://a'])

    failB = false
    await outbox.flush()
    expect(await outboxAll(db)).toHaveLength(0)
    expect(calls[0]).toEqual(['wss://a', 'wss://b'])
    // once a relay accepted, it must never be retried
    expect(calls.slice(1).every((c) => !c.includes('wss://a'))).toBe(true)
  })

  it('gives up on stragglers once the event is safe on at least one relay', async () => {
    const outbox = new Outbox(db, async (relays): Promise<PublishResult> => {
      return {
        accepted: relays.filter((r) => r === 'wss://a'),
        failed: relays.filter((r) => r !== 'wss://a').map((r) => ({ relay: r, reason: 'down' })),
      }
    })
    await outbox.enqueue(makeEvent('tere'), ['wss://a', 'wss://dead'])
    for (let i = 0; i < 12; i++) await outbox.flush()
    expect(await outboxAll(db)).toHaveLength(0)
  })

  it('keeps events that no relay accepted', async () => {
    const outbox = new Outbox(db, async (relays): Promise<PublishResult> => {
      return { accepted: [], failed: relays.map((r) => ({ relay: r, reason: 'offline' })) }
    })
    await outbox.enqueue(makeEvent('tere'), ['wss://a'])
    for (let i = 0; i < 20; i++) await outbox.flush()
    const pending = await outboxAll(db)
    expect(pending).toHaveLength(1)
    expect(pending[0].accepted).toEqual([])
  })

  it('reports pending count changes', async () => {
    const counts: number[] = []
    const outbox = new Outbox(db, async (): Promise<PublishResult> => {
      return { accepted: [], failed: [{ relay: 'wss://a', reason: 'down' }] }
    })
    outbox.onChange = (n) => counts.push(n)
    await outbox.enqueue(makeEvent('tere'), ['wss://a'])
    await outbox.flush()
    expect(counts.at(-1)).toBe(1)
  })
})

import { WebSocketServer } from 'ws'

/**
 * Minimal in-memory Nostr relay (NIP-01 subset: EVENT, REQ, CLOSE) for
 * hermetic end-to-end tests. No persistence, no signature checks — the
 * client under test verifies signatures itself.
 */
export function startRelay(port) {
  const events = []
  const wss = new WebSocketServer({ port, host: '127.0.0.1' })
  /** @type {Map<import('ws').WebSocket, Map<string, object[]>>} */
  const subscriptions = new Map()

  function matches(ev, filter) {
    if (filter.ids && !filter.ids.includes(ev.id)) return false
    if (filter.kinds && !filter.kinds.includes(ev.kind)) return false
    if (filter.authors && !filter.authors.includes(ev.pubkey)) return false
    if (typeof filter.since === 'number' && ev.created_at < filter.since) return false
    if (typeof filter.until === 'number' && ev.created_at > filter.until) return false
    return true
  }

  wss.on('connection', (ws) => {
    const mySubs = new Map()
    subscriptions.set(ws, mySubs)
    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      const [verb] = msg
      if (verb === 'EVENT') {
        const ev = msg[1]
        if (!events.some((e) => e.id === ev.id)) events.push(ev)
        ws.send(JSON.stringify(['OK', ev.id, true, '']))
        for (const [client, subs] of subscriptions) {
          for (const [subId, filters] of subs) {
            if (filters.some((f) => matches(ev, f))) {
              client.send(JSON.stringify(['EVENT', subId, ev]))
            }
          }
        }
      } else if (verb === 'REQ') {
        const subId = msg[1]
        const filters = msg.slice(2)
        mySubs.set(subId, filters)
        for (const ev of events) {
          if (filters.some((f) => matches(ev, f))) {
            ws.send(JSON.stringify(['EVENT', subId, ev]))
          }
        }
        ws.send(JSON.stringify(['EOSE', subId]))
      } else if (verb === 'CLOSE') {
        mySubs.delete(msg[1])
      }
    })
    ws.on('close', () => subscriptions.delete(ws))
  })

  return {
    port,
    eventCount: () => events.length,
    close: () => wss.close(),
  }
}

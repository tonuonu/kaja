import { describe, expect, it } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import { generateIdentity } from './keys'
import {
  buildContacts,
  buildNote,
  buildProfile,
  buildReaction,
  buildRelayList,
  normalizeRelayUrl,
  parseContacts,
  parseImeta,
  parseProfile,
  parseRelayList,
} from './events'

const id = generateIdentity()
const sign = (t: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(t, id.sk)

describe('note building', () => {
  it('appends media URLs to content and emits imeta tags', () => {
    const note = buildNote('Tere maailm', [
      { url: 'https://cdn.example/abc.jpg', sha256: 'a'.repeat(64), mime: 'image/jpeg' },
    ])
    expect(note.kind).toBe(1)
    expect(note.content).toBe('Tere maailm\nhttps://cdn.example/abc.jpg')
    const media = parseImeta(sign(note))
    expect(media).toEqual([
      { url: 'https://cdn.example/abc.jpg', sha256: 'a'.repeat(64), mime: 'image/jpeg' },
    ])
  })

  it('builds plain notes without tags', () => {
    const note = buildNote('lihtne postitus')
    expect(note.tags).toEqual([])
    expect(parseImeta(sign(note))).toEqual([])
  })
})

describe('profile round-trip', () => {
  it('serializes and parses profile content', () => {
    const ev = sign(buildProfile({ name: 'Tõnu', about: 'Ehitan kaja', picture: 'https://x/y.png' }))
    expect(parseProfile(ev)).toEqual({ name: 'Tõnu', about: 'Ehitan kaja', picture: 'https://x/y.png' })
  })

  it('returns null on malformed profile JSON', () => {
    const ev = sign({ kind: 0, created_at: 1, tags: [], content: 'not json' })
    expect(parseProfile(ev)).toBeNull()
  })
})

describe('contacts and relay lists', () => {
  it('round-trips contact lists and drops malformed p tags', () => {
    const other = generateIdentity()
    const ev = sign(buildContacts([other.pubkey]))
    ev.tags.push(['p', 'garbage'])
    expect(parseContacts(ev)).toEqual([other.pubkey])
  })

  it('parses relay list markers per NIP-65', () => {
    const ev = sign({
      kind: 10002,
      created_at: 1,
      tags: [
        ['r', 'wss://both.example'],
        ['r', 'wss://reads.example', 'read'],
        ['r', 'wss://writes.example', 'write'],
      ],
      content: '',
    })
    expect(parseRelayList(ev)).toEqual([
      { url: 'wss://both.example', read: true, write: true },
      { url: 'wss://reads.example', read: true, write: false },
      { url: 'wss://writes.example', read: false, write: true },
    ])
  })

  it('builds relay lists', () => {
    const ev = sign(buildRelayList(['wss://r.example']))
    expect(ev.tags).toEqual([['r', 'wss://r.example']])
  })
})

describe('reactions', () => {
  it('references the target event and author', () => {
    const target = sign(buildNote('algne'))
    const reaction = buildReaction(target)
    expect(reaction.content).toBe('+')
    expect(reaction.tags).toContainEqual(['e', target.id])
    expect(reaction.tags).toContainEqual(['p', target.pubkey])
  })
})

describe('relay URL normalization', () => {
  it('adds wss://, strips trailing slash, rejects junk', () => {
    expect(normalizeRelayUrl('relay.damus.io')).toBe('wss://relay.damus.io')
    expect(normalizeRelayUrl('wss://nos.lol/')).toBe('wss://nos.lol')
    expect(normalizeRelayUrl('wss://nos.lol/sub/path')).toBe('wss://nos.lol/sub/path')
    expect(normalizeRelayUrl('   ')).toBeNull()
    expect(normalizeRelayUrl('https://not-a-relay.example')).toBeNull()
    expect(normalizeRelayUrl('ftp://nope')).toBeNull()
  })
})

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { finalizeEvent } from 'nostr-tools/pure'
import { generateIdentity } from './keys'
import { contactsInclude, buildContacts } from './events'
import { addFollower, listFollowers, openKajaDb, type Db } from './db'

let db: Db

beforeEach(async () => {
  indexedDB = new IDBFactory()
  db = await openKajaDb()
})

describe('follower store', () => {
  it('reports a follower as new exactly once', async () => {
    const pk = generateIdentity().pubkey
    expect(await addFollower(db, pk, 100)).toBe(true)
    expect(await addFollower(db, pk, 200)).toBe(false)
    expect(await listFollowers(db)).toEqual([pk])
  })

  it('lists followers newest first', async () => {
    const a = generateIdentity().pubkey
    const b = generateIdentity().pubkey
    await addFollower(db, a, 100)
    await addFollower(db, b, 200)
    expect(await listFollowers(db)).toEqual([b, a])
  })
})

describe('contactsInclude', () => {
  it('detects whether a contact list follows a given pubkey', () => {
    const me = generateIdentity()
    const them = generateIdentity()
    const list = finalizeEvent(buildContacts([me.pubkey]), them.sk)
    expect(contactsInclude(list, me.pubkey)).toBe(true)
    expect(contactsInclude(list, them.pubkey)).toBe(false)
  })
})

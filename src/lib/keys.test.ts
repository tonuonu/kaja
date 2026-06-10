import { describe, expect, it } from 'vitest'
import { verifyEvent } from 'nostr-tools/pure'
import {
  decryptSecret,
  encryptSecret,
  generateIdentity,
  importSecret,
  LocalSigner,
  toNpub,
  toPubkeyHex,
} from './keys'

describe('identity', () => {
  it('generates a keypair with matching nsec/npub encodings', () => {
    const id = generateIdentity()
    expect(id.npub).toMatch(/^npub1/)
    expect(id.nsec).toMatch(/^nsec1/)
    expect(importSecret(id.nsec)).toEqual(id.sk)
    expect(toPubkeyHex(id.npub)).toBe(id.pubkey)
    expect(toNpub(id.pubkey)).toBe(id.npub)
  })

  it('imports hex secret keys', () => {
    const id = generateIdentity()
    const hex = [...id.sk].map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(importSecret(hex)).toEqual(id.sk)
  })

  it('rejects malformed keys', () => {
    expect(() => importSecret('not-a-key')).toThrow()
    expect(() => toPubkeyHex('npub1invalid')).toThrow()
  })

  it('round-trips NIP-49 passphrase encryption', () => {
    const id = generateIdentity()
    const ncryptsec = encryptSecret(id.sk, 'correct horse battery staple')
    expect(ncryptsec).toMatch(/^ncryptsec1/)
    expect(decryptSecret(ncryptsec, 'correct horse battery staple')).toEqual(id.sk)
    expect(() => decryptSecret(ncryptsec, 'wrong password')).toThrow()
  })

  it('produces events that verify', async () => {
    const id = generateIdentity()
    const signer = new LocalSigner(id.sk)
    const ev = await signer.signEvent({ kind: 1, created_at: 1700000000, tags: [], content: 'tere' })
    expect(ev.pubkey).toBe(id.pubkey)
    expect(verifyEvent(ev)).toBe(true)
  })
})

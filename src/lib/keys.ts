import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import type { Event, EventTemplate } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import * as nip49 from 'nostr-tools/nip49'

/**
 * A Signer hides where the private key lives: in memory (LocalSigner)
 * or inside a NIP-07 browser extension (Nip07Signer). The rest of the
 * app never touches key material directly.
 */
export interface Signer {
  getPublicKey(): Promise<string>
  signEvent(template: EventTemplate): Promise<Event>
}

export class LocalSigner implements Signer {
  #sk: Uint8Array

  constructor(sk: Uint8Array) {
    this.#sk = sk
  }

  async getPublicKey(): Promise<string> {
    return getPublicKey(this.#sk)
  }

  async signEvent(template: EventTemplate): Promise<Event> {
    return finalizeEvent(template, this.#sk)
  }

  nsec(): string {
    return nip19.nsecEncode(this.#sk)
  }
}

interface Nip07Provider {
  getPublicKey(): Promise<string>
  signEvent(template: EventTemplate): Promise<Event>
}

declare global {
  interface Window {
    nostr?: Nip07Provider
  }
}

export class Nip07Signer implements Signer {
  #provider: Nip07Provider

  constructor() {
    if (!window.nostr) throw new Error('No NIP-07 extension found')
    this.#provider = window.nostr
  }

  getPublicKey(): Promise<string> {
    return this.#provider.getPublicKey()
  }

  signEvent(template: EventTemplate): Promise<Event> {
    return this.#provider.signEvent(template)
  }
}

export function hasNip07(): boolean {
  return typeof window !== 'undefined' && !!window.nostr
}

export function generateIdentity(): { sk: Uint8Array; pubkey: string; npub: string; nsec: string } {
  const sk = generateSecretKey()
  const pubkey = getPublicKey(sk)
  return { sk, pubkey, npub: nip19.npubEncode(pubkey), nsec: nip19.nsecEncode(sk) }
}

/** Accepts nsec1... or 64-char hex and returns the raw secret key. */
export function importSecret(input: string): Uint8Array {
  const trimmed = input.trim()
  if (trimmed.startsWith('nsec1')) {
    const decoded = nip19.decode(trimmed)
    if (decoded.type !== 'nsec') throw new Error('Not an nsec key')
    return decoded.data
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return hexToBytes(trimmed)
  }
  throw new Error('Expected nsec1... or 64-character hex')
}

/** Accepts npub1..., nprofile1... or 64-char hex and returns the hex pubkey. */
export function toPubkeyHex(input: string): string {
  const trimmed = input.trim()
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase()
  const decoded = nip19.decode(trimmed)
  if (decoded.type === 'npub') return decoded.data
  if (decoded.type === 'nprofile') return decoded.data.pubkey
  throw new Error('Expected npub, nprofile or hex pubkey')
}

export function toNpub(pubkeyHex: string): string {
  return nip19.npubEncode(pubkeyHex)
}

/** NIP-49 passphrase encryption for at-rest key storage. */
export function encryptSecret(sk: Uint8Array, password: string): string {
  return nip49.encrypt(sk, password)
}

export function decryptSecret(ncryptsec: string, password: string): Uint8Array {
  return nip49.decrypt(ncryptsec, password)
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

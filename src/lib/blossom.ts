import type { EventTemplate } from 'nostr-tools'
import type { Signer } from './keys'
import { KIND_BLOSSOM_AUTH } from './events'

/**
 * Blossom (BUD-01/02/04): content-addressed blobs over HTTP.
 * A blob is identified by the sha256 of its bytes, so any copy from
 * any mirror is verifiable — same property as IPFS, browser-native
 * transport.
 */

export interface BlobDescriptor {
  url: string
  sha256: string
  size: number
  type?: string
}

export async function sha256Hex(data: Blob | Uint8Array): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** BUD-01 authorization event: kind 24242, t=action, x=blob hash, short expiration. */
export function buildBlossomAuth(action: 'upload' | 'delete', sha256: string, description: string): EventTemplate {
  const nowSec = Math.floor(Date.now() / 1000)
  return {
    kind: KIND_BLOSSOM_AUTH,
    created_at: nowSec,
    tags: [
      ['t', action],
      ['x', sha256],
      ['expiration', String(nowSec + 300)],
    ],
    content: description,
  }
}

export function normalizeServerUrl(input: string): string | null {
  let s = input.trim()
  if (!s) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (!/^https?:\/\//i.test(s)) return null
  } else {
    s = `https://${s}`
  }
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.origin
  } catch {
    return null
  }
}

async function authHeader(signer: Signer, template: EventTemplate): Promise<string> {
  const signed = await signer.signEvent(template)
  return `Nostr ${btoa(JSON.stringify(signed))}`
}

/** BUD-02 upload: PUT raw bytes, authorization in header, descriptor back. */
export async function uploadBlob(server: string, file: Blob, signer: Signer): Promise<BlobDescriptor> {
  const origin = normalizeServerUrl(server)
  if (!origin) throw new Error(`Invalid Blossom server: ${server}`)
  const hash = await sha256Hex(file)
  const auth = await authHeader(signer, buildBlossomAuth('upload', hash, `Upload blob ${hash}`))
  const res = await fetch(`${origin}/upload`, {
    method: 'PUT',
    headers: {
      Authorization: auth,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  })
  if (!res.ok) {
    const reason = res.headers.get('X-Reason') ?? (await res.text().catch(() => ''))
    throw new Error(`Upload to ${origin} failed (${res.status}): ${reason}`)
  }
  const descriptor = (await res.json()) as BlobDescriptor
  if (descriptor.sha256 && descriptor.sha256 !== hash) {
    throw new Error(`Server returned mismatching hash for upload to ${origin}`)
  }
  return { ...descriptor, sha256: hash }
}

/** BUD-04 mirror: ask one server to copy a blob from another. */
export async function mirrorBlob(server: string, sourceUrl: string, sha256: string, signer: Signer): Promise<void> {
  const origin = normalizeServerUrl(server)
  if (!origin) throw new Error(`Invalid Blossom server: ${server}`)
  const auth = await authHeader(signer, buildBlossomAuth('upload', sha256, `Mirror blob ${sha256}`))
  const res = await fetch(`${origin}/mirror`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: sourceUrl }),
  })
  if (!res.ok) {
    const reason = res.headers.get('X-Reason') ?? ''
    throw new Error(`Mirror on ${origin} failed (${res.status}): ${reason}`)
  }
}

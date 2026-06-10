import { describe, expect, it } from 'vitest'
import { buildBlossomAuth, normalizeServerUrl, sha256Hex } from './blossom'

describe('sha256Hex', () => {
  it('matches the known vector for "abc"', async () => {
    const hash = await sha256Hex(new TextEncoder().encode('abc'))
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes Blobs identically to raw bytes', async () => {
    const bytes = new TextEncoder().encode('kaja')
    expect(await sha256Hex(new Blob([bytes]))).toBe(await sha256Hex(bytes))
  })
})

describe('buildBlossomAuth', () => {
  it('emits a kind 24242 event with action, hash and expiration', () => {
    const sha = 'b'.repeat(64)
    const auth = buildBlossomAuth('upload', sha, 'Upload test')
    expect(auth.kind).toBe(24242)
    expect(auth.tags).toContainEqual(['t', 'upload'])
    expect(auth.tags).toContainEqual(['x', sha])
    const expiration = auth.tags.find((t) => t[0] === 'expiration')
    expect(Number(expiration?.[1])).toBeGreaterThan(auth.created_at)
  })
})

describe('normalizeServerUrl', () => {
  it('defaults to https and strips paths', () => {
    expect(normalizeServerUrl('blossom.primal.net')).toBe('https://blossom.primal.net')
    expect(normalizeServerUrl('https://cdn.example/path')).toBe('https://cdn.example')
    expect(normalizeServerUrl('ftp://nope')).toBeNull()
  })
})

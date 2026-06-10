import { toNpub } from '../lib/keys'

export function npubShort(pubkeyHex: string): string {
  const npub = toNpub(pubkeyHex)
  return `${npub.slice(0, 12)}…${npub.slice(-6)}`
}

export function timeAgo(unixSeconds: number): string {
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds)
  if (delta < 60) return 'now'
  if (delta < 3600) return `${Math.floor(delta / 60)}m`
  if (delta < 86400) return `${Math.floor(delta / 3600)}h`
  if (delta < 86400 * 30) return `${Math.floor(delta / 86400)}d`
  return new Date(unixSeconds * 1000).toLocaleDateString()
}

export function fullDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString()
}

const URL_RE = /https?:\/\/[^\s<>"]+/g
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)(\?[^\s]*)?$/i

export interface ContentPart {
  type: 'text' | 'link' | 'image'
  value: string
}

/** Splits note text into text/link/image parts for safe rendering (no innerHTML). */
export function splitContent(content: string, knownImageUrls: Set<string>): ContentPart[] {
  const parts: ContentPart[] = []
  let last = 0
  for (const match of content.matchAll(URL_RE)) {
    const url = match[0]
    const start = match.index ?? 0
    if (start > last) parts.push({ type: 'text', value: content.slice(last, start) })
    parts.push({ type: knownImageUrls.has(url) || IMAGE_RE.test(url) ? 'image' : 'link', value: url })
    last = start + url.length
  }
  if (last < content.length) parts.push({ type: 'text', value: content.slice(last) })
  return parts
}

/** Deterministic avatar gradient per pubkey, so people are recognizable without uploads. */
export function avatarGradient(pubkeyHex: string): string {
  const h1 = parseInt(pubkeyHex.slice(0, 4), 16) % 360
  const h2 = (h1 + 50) % 360
  return `linear-gradient(135deg, hsl(${h1} 65% 62%), hsl(${h2} 70% 45%))`
}

import { useState } from 'preact/hooks'
import type { Event } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import { parseImeta } from '../lib/events'
import { echoNote, likeNote, notes, profiles, publishNote, session, showToast } from '../lib/state'
import { Avatar } from './Avatar'
import { CopyIcon, EchoIcon, HeartIcon, ImageIcon } from './Icons'
import { fullDate, npubShort, splitContent, timeAgo } from './format'

function Composer() {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!text.trim() && files.length === 0) return
    setBusy(true)
    try {
      await publishNote(text, files)
      setText('')
      setFiles([])
      showToast('Published — queued to your relays')
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="composer">
      <textarea
        placeholder="What echoes today?"
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
      />
      <div class="row">
        <label class="iconbtn" title="Attach images">
          <ImageIcon />
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const list = (e.target as HTMLInputElement).files
              if (list) setFiles((prev) => [...prev, ...Array.from(list)])
              ;(e.target as HTMLInputElement).value = ''
            }}
          />
        </label>
        {files.map((f, i) => (
          <span class="attachment" key={`${f.name}-${i}`}>
            {f.name.length > 18 ? `${f.name.slice(0, 15)}…` : f.name}
            <button onClick={() => setFiles(files.filter((_, j) => j !== i))} title="Remove">
              ×
            </button>
          </span>
        ))}
        <span class="spacer" />
        <button class="btn primary small" disabled={busy || (!text.trim() && files.length === 0)} onClick={submit}>
          {busy ? 'Uploading…' : 'Publish'}
        </button>
      </div>
    </div>
  )
}

function GuestBanner() {
  return (
    <div class="composer">
      <p style={{ margin: '2px 0 10px' }}>
        You're looking around as a <b>guest</b> — reading is free and anonymous. To post, be
        followed, or react, create your identity. It takes ten seconds and needs no e-mail or
        phone.
      </p>
      <div class="row">
        <span class="hint">Tip: add people under People — guest follows are saved on this device.</span>
        <span class="spacer" />
        <button class="btn primary small" onClick={() => (window.location.hash = '#/welcome')}>
          Create your identity
        </button>
      </div>
    </div>
  )
}

/** Returns true (and nudges toward identity creation) when a signing action is attempted as guest. */
function requireIdentity(): boolean {
  if (session.value) return false
  showToast('Create your identity to do that — it takes ten seconds')
  window.location.hash = '#/welcome'
  return true
}

function PostCard({ ev, index }: { ev: Event; index: number }) {
  const [echoing, setEchoing] = useState(false)
  const profile = profiles.value.get(ev.pubkey)
  const media = parseImeta(ev)
  const mediaUrls = new Set(media.map((m) => m.url))
  const parts = splitContent(ev.content, mediaUrls)
  const images = parts.filter((p) => p.type === 'image')
  const isFresh = Date.now() / 1000 - ev.created_at < 300

  return (
    <article class={`post${isFresh ? ' live' : ''}`} style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}>
      <header>
        <Avatar pubkey={ev.pubkey} profile={profile} />
        <div class="who">
          <span class="name">{profile?.name ?? 'anonym'}</span>
          <span class="addr">{npubShort(ev.pubkey)}</span>
        </div>
        <time title={fullDate(ev.created_at)}>{timeAgo(ev.created_at)}</time>
      </header>
      <div class="body">
        {parts.map((p, i) =>
          p.type === 'text' ? (
            <span key={i}>{p.value}</span>
          ) : p.type === 'link' ? (
            <a key={i} href={p.value} target="_blank" rel="noopener noreferrer">
              {p.value}
            </a>
          ) : null,
        )}
      </div>
      {images.length > 0 && (
        <div class="media">
          {images.map((p) => (
            <img key={p.value} src={p.value} alt="" loading="lazy" />
          ))}
        </div>
      )}
      <footer>
        <button
          class="iconbtn"
          title="Like"
          onClick={() => {
            if (requireIdentity()) return
            void likeNote(ev).catch((e) => showToast(String(e)))
          }}
        >
          <HeartIcon />
        </button>
        <button
          class={`iconbtn${echoing ? ' echoing' : ''}`}
          title="Echo: re-publish to your relays and mirror media, so it survives the author going offline"
          onClick={() => {
            if (requireIdentity()) return
            setEchoing(true)
            setTimeout(() => setEchoing(false), 650)
            void echoNote(ev)
          }}
        >
          <EchoIcon />
        </button>
        <button
          class="iconbtn"
          title="Copy note address (works in any Nostr app)"
          onClick={() => {
            void navigator.clipboard.writeText(nip19.noteEncode(ev.id))
            showToast('Note address copied')
          }}
        >
          <CopyIcon />
        </button>
      </footer>
    </article>
  )
}

export function Feed() {
  return (
    <div class="view">
      {session.value ? <Composer /> : <GuestBanner />}
      {notes.value.length === 0 ? (
        <div class="empty">
          <p>Nothing here yet.</p>
          <p class="hint">
            Write your first post above, or add friends under <b>People</b> — their posts appear here
            live.
          </p>
        </div>
      ) : (
        notes.value.map((ev, i) => <PostCard key={ev.id} ev={ev} index={i} />)
      )}
    </div>
  )
}

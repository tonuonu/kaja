import { useState } from 'preact/hooks'
import { normalizeRelayUrl } from '../lib/events'
import { normalizeServerUrl } from '../lib/blossom'
import { LocalSigner } from '../lib/keys'
import {
  autoEcho,
  blossomServers,
  feedRelays,
  logout,
  profiles,
  relays,
  saveAutoEcho,
  saveBlossomServers,
  saveOwnProfile,
  saveRelays,
  session,
  showToast,
} from '../lib/state'

function ProfilePanel() {
  const me = session.value!
  const current = profiles.value.get(me.pubkey)
  const [name, setName] = useState(current?.name ?? '')
  const [about, setAbout] = useState(current?.about ?? '')
  const [picture, setPicture] = useState(current?.picture ?? '')
  const [busy, setBusy] = useState(false)

  return (
    <div class="panel">
      <h3>Profile</h3>
      <div class="field">
        <label>Name</label>
        <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </div>
      <div class="field">
        <label>About</label>
        <textarea value={about} onInput={(e) => setAbout((e.target as HTMLTextAreaElement).value)} />
      </div>
      <div class="field">
        <label>Picture URL</label>
        <input
          value={picture}
          placeholder="https://…"
          onInput={(e) => setPicture((e.target as HTMLInputElement).value)}
        />
      </div>
      <button
        class="btn primary small"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          saveOwnProfile({ name: name.trim() || undefined, about: about.trim() || undefined, picture: picture.trim() || undefined })
            .then(() => showToast('Profile published'))
            .catch((e) => showToast(String(e)))
            .finally(() => setBusy(false))
        }}
      >
        Save profile
      </button>
    </div>
  )
}

function ListEditor({
  title,
  hint,
  value,
  normalize,
  onSave,
}: {
  title: string
  hint: string
  value: string[]
  normalize: (s: string) => string | null
  onSave: (urls: string[]) => Promise<void>
}) {
  const [text, setText] = useState(value.join('\n'))
  const [busy, setBusy] = useState(false)

  return (
    <div class="panel">
      <h3>{title}</h3>
      <div class="field">
        <textarea rows={4} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      </div>
      <p class="hint">{hint}</p>
      <button
        class="btn small"
        disabled={busy}
        onClick={() => {
          const urls = text
            .split('\n')
            .map((line) => normalize(line))
            .filter((u): u is string => u !== null)
          const deduped = [...new Set(urls)]
          if (deduped.length === 0) {
            showToast('Need at least one valid URL')
            return
          }
          setBusy(true)
          onSave(deduped)
            .then(() => {
              setText(deduped.join('\n'))
              showToast('Saved')
            })
            .catch((e) => showToast(String(e)))
            .finally(() => setBusy(false))
        }}
      >
        Save
      </button>
    </div>
  )
}

function KeyPanel() {
  const me = session.value!
  const [revealed, setRevealed] = useState(false)
  const nsec = me.signer instanceof LocalSigner ? me.signer.nsec() : null

  return (
    <div class="panel">
      <h3>Identity</h3>
      {nsec ? (
        revealed ? (
          <div class="field">
            <label>Secret key — never share it</label>
            <div class="keybox">{nsec}</div>
          </div>
        ) : (
          <button class="btn small" onClick={() => setRevealed(true)}>
            Reveal secret key
          </button>
        )
      ) : (
        <p class="hint">Keys are managed by your NIP-07 browser extension.</p>
      )}
      <p class="hint">
        Logging out removes the key from this browser. Without a backup of the secret key, the
        identity is unrecoverable.
      </p>
      <button
        class="btn small danger"
        onClick={() => {
          if (confirm('Log out and remove the key from this browser?')) logout()
        }}
      >
        Log out
      </button>
    </div>
  )
}

export function Settings() {
  const loggedIn = !!session.value
  return (
    <div class="view">
      <h2 class="viewtitle">Settings</h2>
      {loggedIn ? (
        <ProfilePanel />
      ) : (
        <div class="panel">
          <h3>Identity</h3>
          <p class="hint">
            You're browsing as a guest. Create an identity to post, set a profile, and be followed.
          </p>
          <button class="btn primary small" onClick={() => (window.location.hash = '#/welcome')}>
            Create your identity
          </button>
        </div>
      )}
      <ListEditor
        title="Relays (one per line)"
        hint="Your posts are written to all of these; your feed reads from these plus your friends' relays. Anyone can run one (e.g. strfry on a Raspberry Pi)."
        value={relays.value}
        normalize={normalizeRelayUrl}
        onSave={saveRelays}
      />
      <ListEditor
        title="Blossom media servers (one per line)"
        hint="Photos are uploaded to the first server and addressed by their sha256 hash, so any mirror can serve them verifiably."
        value={blossomServers.value}
        normalize={normalizeServerUrl}
        onSave={saveBlossomServers}
      />
      <div class="panel">
        <h3>Echo</h3>
        <label class="switchrow">
          <input
            type="checkbox"
            checked={autoEcho.value}
            disabled={!loggedIn}
            onChange={(e) => void saveAutoEcho((e.target as HTMLInputElement).checked)}
          />
          <span>
            <b>Auto-echo friends' new posts.</b>
            <br />
            <span class="hint">
              Re-publishes their signed posts to your relays as they arrive, so their content stays
              available even when they are offline. This is how the network keeps each other alive.
            </span>
          </span>
        </label>
      </div>
      <div class="panel">
        <h3>Feed is currently reading from</h3>
        <div class="chips">
          {feedRelays.value.map((r) => (
            <span class="chip" key={r}>
              {r.replace('wss://', '')}
            </span>
          ))}
        </div>
      </div>
      {loggedIn && <KeyPanel />}
    </div>
  )
}

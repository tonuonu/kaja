import { useState } from 'preact/hooks'
import { toNpub } from '../lib/keys'
import { followers, followUser, follows, profiles, session, showToast, unfollowUser } from '../lib/state'
import { Avatar } from './Avatar'
import { CopyIcon } from './Icons'
import { npubShort } from './format'

export function Follows() {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const me = session.value?.pubkey

  return (
    <div class="view">
      <h2 class="viewtitle">People</h2>

      {me && (
        <div class="panel">
          <h3>Your address — give this to friends</h3>
          <div class="addrbox">
            <code>{toNpub(me)}</code>
            <button
              class="iconbtn"
              title="Copy"
              onClick={() => {
                void navigator.clipboard.writeText(toNpub(me))
                showToast('Your npub copied')
              }}
            >
              <CopyIcon />
            </button>
          </div>
          <p class="hint" style={{ marginBottom: 0 }}>
            Friends paste it below in their own Kaja (or any Nostr app) to follow you.
          </p>
        </div>
      )}

      <div class="panel">
        <h3>Follow someone</h3>
        {!me && (
          <p class="hint">
            Guest follows are saved on this device only; they are published automatically when you
            create your identity.
          </p>
        )}
        <form
          class="addrbox"
          onSubmit={(e) => {
            e.preventDefault()
            setBusy(true)
            followUser(input)
              .then(() => {
                setInput('')
                showToast('Following — their posts will appear in your feed')
              })
              .catch((err) => showToast(err instanceof Error ? err.message : String(err)))
              .finally(() => setBusy(false))
          }}
        >
          <input
            placeholder="npub1…"
            value={input}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          />
          <button class="btn small" type="submit" disabled={busy || !input.trim()}>
            Follow
          </button>
        </form>
      </div>

      <div class="panel">
        <h3>Following ({follows.value.length})</h3>
        {follows.value.length === 0 && <p class="hint">Nobody yet. Your feed shows only your own posts.</p>}
        {follows.value.map((pk) => {
          const profile = profiles.value.get(pk)
          return (
            <div class="personrow" key={pk}>
              <Avatar pubkey={pk} profile={profile} />
              <div class="who">
                <span class="name">{profile?.name ?? 'anonym'}</span>
                <span class="addr">{npubShort(pk)}</span>
              </div>
              <button
                class="btn small danger"
                onClick={() => void unfollowUser(pk).catch((e) => showToast(String(e)))}
              >
                Unfollow
              </button>
            </div>
          )
        })}
      </div>

      {me && (
        <div class="panel">
        <h3>Followers ({followers.value.length})</h3>
        {followers.value.length === 0 && (
          <p class="hint">Nobody yet. When someone follows you, it shows up here — and as a notification.</p>
        )}
        {followers.value.map((pk) => {
          const profile = profiles.value.get(pk)
          const followedBack = follows.value.includes(pk)
          return (
            <div class="personrow" key={pk}>
              <Avatar pubkey={pk} profile={profile} />
              <div class="who">
                <span class="name">{profile?.name ?? 'anonym'}</span>
                <span class="addr">{npubShort(pk)}</span>
              </div>
              {followedBack ? (
                <span class="chip">Following</span>
              ) : (
                <button
                  class="btn small"
                  onClick={() =>
                    void followUser(pk)
                      .then(() => showToast('Followed back'))
                      .catch((e) => showToast(String(e)))
                  }
                >
                  Follow back
                </button>
              )}
            </div>
          )
        })}
        </div>
      )}
    </div>
  )
}

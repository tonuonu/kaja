import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { connectedRelayCount, initError, locked, online, outboxPending, pendingBackup, ready, session, toast } from './lib/state'
import { Feed } from './ui/Feed'
import { Follows } from './ui/Follows'
import { BackupGate, Onboarding, Unlock } from './ui/Onboarding'
import { Settings } from './ui/Settings'
import { FeedIcon, GearIcon, LogoRings, PeopleIcon } from './ui/Icons'
import { npubShort } from './ui/format'

const route = signal(window.location.hash.replace(/^#\/?/, ''))
window.addEventListener('hashchange', () => {
  route.value = window.location.hash.replace(/^#\/?/, '')
})

const relayCount = signal(0)

/** Startup failed in a way we can't self-heal — explain instead of half-running. */
function ErrorGate({ message }: { message: string }) {
  return (
    <div class="gate">
      <h1>KAJA</h1>
      <div class="gate-card">
        <p>
          <b>Kaja cannot start safely.</b>
        </p>
        <p class="hint">
          Usual causes: another Kaja tab open with an older version (close all Kaja tabs, then
          reload), private browsing mode, or a browser setting that blocks site data (in Safari:
          "Block all cookies").
        </p>
        <div class="field">
          <label>Detail</label>
          <div class="keybox">{message}</div>
        </div>
        <div class="stack">
          <button class="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBar({ pubkey }: { pubkey: string | null }) {
  return (
    <footer class="statusbar">
      <span>
        <span class={`dot${online.value ? '' : ' off'}`} />
        {online.value ? 'ONLINE' : 'OFFLINE'}
      </span>
      <span>RELAYS {relayCount.value}</span>
      {outboxPending.value > 0 && (
        <span style={{ color: 'var(--amber)' }}>OUTBOX {outboxPending.value}</span>
      )}
      {pubkey ? (
        <span class="me" title="Your address">
          {npubShort(pubkey)}
        </span>
      ) : (
        <a class="me" href="#/welcome" style={{ color: 'var(--amber)' }}>
          GUEST
        </a>
      )}
    </footer>
  )
}

export function App() {
  useEffect(() => {
    const timer = setInterval(() => {
      relayCount.value = connectedRelayCount()
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  // initError outranks the splash: it can be set while init() is still
  // pending (e.g. waiting for an old tab to release the database).
  if (initError.value) return <ErrorGate message={initError.value} />
  if (!ready.value) return <div class="splash">KAJA · TUNING…</div>
  if (locked.value) return <Unlock />
  const s = session.value
  if (pendingBackup.value) return <BackupGate />
  // Guests browse the full app; identity creation lives behind #/welcome
  // and is only required at the first signing action.
  if (!s && route.value === 'welcome') return <Onboarding />

  const r = route.value
  return (
    <>
      <div class="shell">
        <header class="topbar">
          <a href="#/" class="wordmark">
            <LogoRings />
            KAJA
          </a>
          <nav>
            <a class={`navbtn${r === '' ? ' active' : ''}`} href="#/" title="Feed">
              <FeedIcon />
            </a>
            <a class={`navbtn${r === 'people' ? ' active' : ''}`} href="#/people" title="People">
              <PeopleIcon />
            </a>
            <a class={`navbtn${r === 'settings' ? ' active' : ''}`} href="#/settings" title="Settings">
              <GearIcon />
            </a>
          </nav>
        </header>
        {r === 'people' ? <Follows /> : r === 'settings' ? <Settings /> : <Feed />}
      </div>
      <StatusBar pubkey={s?.pubkey ?? null} />
      {toast.value && <div class="toast">{toast.value}</div>}
    </>
  )
}

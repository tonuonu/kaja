import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { hasNip07 } from '../lib/keys'
import { createIdentity, importIdentity, loginWithExtension, pendingBackup, unlock } from '../lib/state'

type Step = 'choose' | 'create' | 'import'

function Gate({ children }: { children: ComponentChildren }) {
  return (
    <div class="gate">
      <div class="gate-logo" aria-hidden>
        <span class="ring" />
        <span class="ring" />
        <span class="ring" />
        <span class="core" />
      </div>
      <h1>KAJA</h1>
      <p class="tagline">
        A social network that lives in browsers.
        <br />
        Your posts echo through relays and friends — and outlive your uptime.
      </p>
      <div class="gate-card">{children}</div>
    </div>
  )
}

/** Shown after identity creation until the user confirms they saved the key. */
export function BackupGate() {
  const nsec = pendingBackup.value
  if (!nsec) return null
  return (
    <Gate>
      <div class="field">
        <label>Your secret key — save it now</label>
        <div class="keybox">{nsec}</div>
      </div>
      <p class="hint">
        This key <b>is</b> your identity. There is no password reset and no support desk — anyone
        who has it is you, and if you lose it, the account is gone forever. Store it in a password
        manager or on paper.
      </p>
      <div class="stack">
        <button
          class="btn"
          onClick={() => {
            const blob = new Blob([nsec], { type: 'text/plain' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'kaja-secret-key.txt'
            a.click()
            URL.revokeObjectURL(a.href)
          }}
        >
          Download backup
        </button>
        <button class="btn primary" onClick={() => (pendingBackup.value = null)}>
          I saved it — enter Kaja
        </button>
      </div>
    </Gate>
  )
}

export function Onboarding() {
  const [step, setStep] = useState<Step>('choose')
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [nsecInput, setNsecInput] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'create' || step === 'import') {
    return (
      <Gate>
        {step === 'import' && (
          <div class="field">
            <label>Secret key (nsec1… or hex)</label>
            <input
              type="password"
              value={nsecInput}
              onInput={(e) => setNsecInput((e.target as HTMLInputElement).value)}
              placeholder="nsec1…"
            />
          </div>
        )}
        <div class="field">
          <label>Passphrase (encrypts the key on this device)</label>
          <input
            type="password"
            value={passphrase}
            onInput={(e) => setPassphrase((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="field">
          <label>Repeat passphrase</label>
          <input
            type="password"
            value={confirm}
            onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
          />
        </div>
        {error && <p class="error">{error}</p>}
        <div class="stack">
          <button
            class="btn primary"
            disabled={busy || passphrase.length < 6 || passphrase !== confirm || (step === 'import' && !nsecInput)}
            onClick={() =>
              run(async () => {
                if (step === 'create') {
                  await createIdentity(passphrase)
                } else {
                  await importIdentity(nsecInput, passphrase)
                }
              })
            }
          >
            {busy ? 'Working…' : step === 'create' ? 'Create identity' : 'Import key'}
          </button>
          <button class="btn" onClick={() => setStep('choose')}>
            Back
          </button>
        </div>
        {passphrase && passphrase.length < 6 && <p class="hint">Passphrase: at least 6 characters.</p>}
      </Gate>
    )
  }

  return (
    <Gate>
      <div class="stack">
        <button class="choice" onClick={() => setStep('create')}>
          <b>Create a new identity</b>
          <span>Generates a keypair in your browser. No e-mail, no phone, no server.</span>
        </button>
        <button class="choice" onClick={() => setStep('import')}>
          <b>Import an existing key</b>
          <span>You already have a Nostr identity (nsec key).</span>
        </button>
        {hasNip07() && (
          <button class="choice" onClick={() => run(() => loginWithExtension())}>
            <b>Use browser extension</b>
            <span>Sign with your NIP-07 extension. Your key never touches Kaja.</span>
          </button>
        )}
      </div>
      {error && <p class="error">{error}</p>}
    </Gate>
  )
}

export function Unlock() {
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Gate>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          unlock(passphrase)
            .catch(() => setError('Wrong passphrase.'))
            .finally(() => setBusy(false))
        }}
      >
        <div class="field">
          <label>Passphrase</label>
          <input
            type="password"
            autofocus
            value={passphrase}
            onInput={(e) => setPassphrase((e.target as HTMLInputElement).value)}
          />
        </div>
        {error && <p class="error">{error}</p>}
        <div class="stack">
          <button class="btn primary" type="submit" disabled={busy || !passphrase}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </Gate>
  )
}

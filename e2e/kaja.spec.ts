import { expect, test, type Page } from '@playwright/test'
import { startRelay } from './relay.mjs'

const RELAY_PORT = 45123
const RELAY_URL = `ws://127.0.0.1:${RELAY_PORT}`
const PASSPHRASE = 'test-passphrase-123'

let relay: ReturnType<typeof startRelay>

test.beforeAll(() => {
  relay = startRelay(RELAY_PORT)
})

test.afterAll(() => {
  relay.close()
})

async function createIdentity(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Create your identity', exact: true }).click()
  await page.getByText('Create a new identity').click()
  const passwords = page.locator('input[type="password"]')
  await passwords.nth(0).fill(PASSPHRASE)
  await passwords.nth(1).fill(PASSPHRASE)
  await page.getByRole('button', { name: 'Create identity', exact: true }).click()
  await page.getByRole('button', { name: 'I saved it — enter Kaja' }).click()
  await expect(page.getByPlaceholder('What echoes today?')).toBeVisible()
}

async function setRelay(page: Page): Promise<void> {
  await page.locator('a[href="#/settings"]').click()
  const relayPanel = page.locator('.panel', { hasText: 'Relays (one per line)' })
  await relayPanel.locator('textarea').fill(RELAY_URL)
  await relayPanel.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.toast', { hasText: 'Saved' })).toBeVisible()
  await page.locator('a.navbtn[href="#/"]').click()
}

/** Walks a fresh browser context from guest landing through onboarding, pointed at the local relay. */
async function onboard(page: Page): Promise<void> {
  await page.goto('/')
  await createIdentity(page)
  await setRelay(page)
}

async function publish(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder('What echoes today?').fill(text)
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.locator('.post', { hasText: text })).toBeVisible()
}

test('two browsers exchange posts through a relay', async ({ page, browser }) => {
  // --- User A: onboard, publish ---------------------------------------
  await onboard(page)
  await publish(page, 'Tere, Kaja! First echo into the night.')

  // The post must reach the relay, not just the local cache.
  await expect.poll(() => relay.eventCount(), { timeout: 15_000 }).toBeGreaterThan(0)

  // Grab A's address from the People view.
  await page.locator('a[href="#/people"]').click()
  const npubA = (await page.locator('.addrbox code').first().textContent())?.trim()
  expect(npubA).toMatch(/^npub1/)

  // --- User B: separate browser profile, follows A ---------------------
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await onboard(pageB)

  await pageB.locator('a[href="#/people"]').click()
  await pageB.getByPlaceholder('npub1…').fill(npubA!)
  await pageB.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(pageB.locator('.personrow')).toHaveCount(1)

  // A is notified live and sees B in the Followers panel (A is on the People view).
  await expect(page.locator('.toast')).toContainText('started following you', { timeout: 15_000 })
  await expect(page.locator('.panel', { hasText: 'Followers (1)' }).locator('.personrow')).toHaveCount(1)
  await page.locator('.panel', { hasText: 'Followers (1)' }).getByRole('button', { name: 'Follow back' }).click()
  await expect(page.locator('.panel', { hasText: 'Followers (1)' }).locator('.chip', { hasText: 'Following' })).toBeVisible()

  // Backfill: A's older post arrives via the relay.
  await pageB.locator('a.navbtn[href="#/"]').click()
  await expect(pageB.locator('.post', { hasText: 'First echo into the night' })).toBeVisible({
    timeout: 15_000,
  })

  // --- Live delivery: A posts while B is watching ----------------------
  await page.locator('a.navbtn[href="#/"]').click()
  await publish(page, 'Second echo — this one arrives live!')
  await expect(pageB.locator('.post', { hasText: 'arrives live' })).toBeVisible({ timeout: 15_000 })

  // --- Offline persistence: B reloads with the relay still up ----------
  await pageB.reload()
  const unlockField = pageB.locator('input[type="password"]')
  await unlockField.fill(PASSPHRASE)
  await pageB.getByRole('button', { name: 'Unlock' }).click()
  await expect(pageB.locator('.post', { hasText: 'First echo into the night' })).toBeVisible({
    timeout: 15_000,
  })

  await contextB.close()

  // --- Guest mode: browse without any identity --------------------------
  const contextC = await browser.newContext()
  const pageC = await contextC.newPage()
  await pageC.goto('/')
  await expect(pageC.getByText('as a guest', { exact: false }).first()).toBeVisible()
  await setRelay(pageC)

  // Guest follows A locally and reads A's posts — no key exists yet.
  await pageC.locator('a[href="#/people"]').click()
  await pageC.getByPlaceholder('npub1…').fill(npubA!)
  await pageC.getByRole('button', { name: 'Follow', exact: true }).click()
  await pageC.locator('a.navbtn[href="#/"]').click()
  await expect(pageC.locator('.post', { hasText: 'First echo into the night' })).toBeVisible({
    timeout: 15_000,
  })

  // Signing actions are gated: liking as guest routes to identity creation.
  await pageC.locator('.post').first().getByTitle('Like').click()
  await expect(pageC.getByText('Create a new identity')).toBeVisible()
  await pageC.getByRole('button', { name: 'Maybe later — keep looking around' }).click()
  await expect(pageC.locator('.post').first()).toBeVisible()

  // Upgrading to a real identity publishes the guest follows.
  await createIdentity(pageC)
  await pageC.locator('a[href="#/people"]').click()
  await expect(pageC.locator('.panel', { hasText: 'Your address' })).toBeVisible()
  await expect(pageC.locator('.panel', { hasText: 'Following (1)' }).locator('.personrow')).toHaveCount(1)

  await contextC.close()
})

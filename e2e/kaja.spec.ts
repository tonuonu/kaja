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

/** Walks a fresh browser context through onboarding and points it at the local relay. */
async function onboard(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByText('Create a new identity').click()
  const passwords = page.locator('input[type="password"]')
  await passwords.nth(0).fill(PASSPHRASE)
  await passwords.nth(1).fill(PASSPHRASE)
  await page.getByRole('button', { name: 'Create identity' }).click()
  await page.getByRole('button', { name: 'I saved it — enter Kaja' }).click()
  await expect(page.getByPlaceholder('What echoes today?')).toBeVisible()

  // Point the client at the hermetic test relay.
  await page.locator('a[href="#/settings"]').click()
  const relayPanel = page.locator('.panel', { hasText: 'Relays (one per line)' })
  await relayPanel.locator('textarea').fill(RELAY_URL)
  await relayPanel.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.chip', { hasText: '127.0.0.1' })).toBeVisible()
  await page.locator('a.navbtn[href="#/"]').click()
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
})

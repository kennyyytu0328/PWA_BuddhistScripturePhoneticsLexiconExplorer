import fs from 'node:fs'
import path from 'node:path'
import { DIST, expect, openControlled, reloadOffline, test } from './helpers'

// REQ-RDR-038 under the service worker (final review finding, 2026-11-18): resuming in 聲 seeks the real
// recording to chars[cursor]. Workbox answers media Range requests with a plain 200, which made the
// element unseekable (seekable = [0, 0]) so playback restarted at 0:00.
test.use({ serviceWorkers: 'allow' })

const timings = JSON.parse(fs.readFileSync(path.join(DIST, 'data/voice-timings.json'), 'utf8')) as {
  duration: number
  chars: number[]
}
const sutra = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/heart-sutra.json'), 'utf8')) as {
  segments: { id: string; tokens: { t: string; punct?: boolean }[] }[]
}

function firstCharOf(id: string): number {
  let index = 0
  for (const segment of sutra.segments) {
    if (segment.id === id) return index
    for (const token of segment.tokens) if (!token.punct) index += [...token.t].length
  }
  throw new Error(`no segment ${id}`)
}

test('[REQ-RDR-038] offline under the service worker, 聲 started on s7 plays the recording from s7', async ({ page }) => {
  await page.addInitScript(() => {
    const played: HTMLMediaElement[] = []
    ;(window as unknown as { __played: HTMLMediaElement[] }).__played = played
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      played.push(this)
      return play.call(this)
    }
    const open = indexedDB.open('sutraflow', 10)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('prefs')) open.result.createObjectStore('prefs', { keyPath: 'key' })
    }
    open.onsuccess = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('prefs')) return db.close()
      const store = db.transaction('prefs', 'readwrite').objectStore('prefs')
      for (const [key, value] of [['peek', 'done'], ['progress', 's7'], ['followPace', 'voice']]) {
        store.put({ key, value })
      }
      db.close()
    }
  })
  await openControlled(page)
  await reloadOffline(page)
  const toggle = page.locator('button[data-testid="follow-toggle"]')
  await expect(page.locator('button[data-testid="follow-pace"]')).toHaveText('聲')
  await expect(async () => {
    if ((await toggle.textContent())?.trim() !== '停') await toggle.click()
    await expect(toggle).toHaveText('停', { timeout: 500 })
  }).toPass({ timeout: 10_000 })

  const start = timings.chars[firstCharOf('s7')]
  await page.waitForTimeout(1500)
  const audio = await page.evaluate(() => {
    const el = (window as unknown as { __played: HTMLMediaElement[] }).__played.at(-1)!
    return { time: el.currentTime, seekableEnd: el.seekable.length ? el.seekable.end(0) : 0 }
  })
  await page.context().setOffline(false)
  expect(audio.seekableEnd).toBeCloseTo(timings.duration, 0)
  expect(audio.time).toBeGreaterThan(start)
  expect(audio.time).toBeLessThan(start + 4)
  await expect(page.locator('[data-testid="sutra-page"][data-segment="s7"] [data-follow="current"]')).toHaveCount(1)
})

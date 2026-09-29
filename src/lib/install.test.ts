import { describe, expect, it } from 'vitest'
import { detectGuide } from './install'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const MAC_SAFARI = IPAD_AS_MAC
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'

describe('detectGuide', () => {
  it('gives the Safari steps on an iPhone', () => {
    expect(detectGuide(IPHONE_SAFARI, 5)).toBe('ios-safari')
  })

  it('gives them on an iPad, which calls itself a Mac', () => {
    expect(detectGuide(IPAD_AS_MAC, 5)).toBe('ios-safari')
  })

  it('does not mistake a real Mac for an iPad', () => {
    expect(detectGuide(MAC_SAFARI, 0)).toBe('generic')
  })

  it('falls back to the generic steps in other browsers, whose share sheet is their own', () => {
    expect(detectGuide(IPHONE_CHROME, 5)).toBe('generic')
    expect(detectGuide(ANDROID_CHROME, 5)).toBe('generic')
  })
})

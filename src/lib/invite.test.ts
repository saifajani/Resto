import { describe, expect, it } from 'vitest'
import { inviteCodeFromPath, inviteLink, normalizeInviteCode } from './invite'

describe('inviteCodeFromPath', () => {
  it('reads the code out of a join link', () => {
    expect(inviteCodeFromPath('/join/ABC234')).toBe('ABC234')
    expect(inviteCodeFromPath('/join/ABC234/')).toBe('ABC234')
  })

  it('tidies up a code that arrives lower case or with punctuation', () => {
    expect(inviteCodeFromPath('/join/abc234')).toBe('ABC234')
    expect(inviteCodeFromPath('/join/abc-234')).toBe('ABC234')
    expect(inviteCodeFromPath('/join/%41BC234')).toBe('ABC234')
  })

  it('is null for anything that is not a whole code', () => {
    expect(inviteCodeFromPath('/')).toBeNull()
    expect(inviteCodeFromPath('/profile')).toBeNull()
    expect(inviteCodeFromPath('/join')).toBeNull()
    expect(inviteCodeFromPath('/join/ABC')).toBeNull()
    expect(inviteCodeFromPath('/join/ABC234/extra')).toBeNull()
    expect(inviteCodeFromPath('/r/123/log')).toBeNull()
  })

  it('keeps only the first six usable characters', () => {
    expect(inviteCodeFromPath('/join/ABC234XYZ')).toBe('ABC234')
  })
})

describe('normalizeInviteCode', () => {
  it('matches what someone types into the code box', () => {
    expect(normalizeInviteCode(' abc 234 ')).toBe('ABC234')
    expect(normalizeInviteCode('')).toBe('')
  })
})

describe('inviteLink', () => {
  it('builds a link from the origin the app is served from', () => {
    expect(inviteLink('https://resto-reminder.vercel.app', 'ABC234')).toBe('https://resto-reminder.vercel.app/join/ABC234')
  })

  it('does not double up the slash', () => {
    expect(inviteLink('http://localhost:8081/', 'ABC234')).toBe('http://localhost:8081/join/ABC234')
  })
})

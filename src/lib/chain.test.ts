import { describe, expect, it } from 'vitest'
import { nameWords, sameChain } from './chain'

describe('nameWords', () => {
  it('cuts the branch off at a dash', () => {
    expect(nameWords('The Keg Steakhouse + Bar - York Street')).toEqual(['keg', 'steakhouse', 'bar'])
  })

  it('cuts it off at a bracket too', () => {
    expect(nameWords('SAKU (sushi & taco)')).toEqual(['saku'])
  })

  it('drops punctuation and a leading "the"', () => {
    expect(nameWords("The Burger's Priest")).toEqual(['burgers', 'priest'])
  })

  it('spells out an ampersand, so "Bar & Grill" and "Bar and Grill" match', () => {
    expect(nameWords('Jack Astor’s Bar & Grill')).toEqual(nameWords("Jack Astor's Bar and Grill"))
  })
})

describe('sameChain', () => {
  const groups = [
    ["Jack Astor's Bar & Grill Front Street", "Jack Astor's Bar & Grill Airport"],
    ['Tim Hortons', 'Tim Hortons'],
    ['The Keg Steakhouse + Bar - York Street', 'The Keg Steakhouse + Bar - Esplanade'],
    ['Monkey Sushi Bloor', 'Monkey Sushi Danforth'],
    ['Starbucks', 'Starbucks Coffee Company'],
  ]
  for (const [a, b] of groups) {
    it(`groups ${a} with ${b}`, () => expect(sameChain(a, b)).toBe(true))
  }

  const apart = [
    ['Pizza Pizza', 'Pizza Nova'],
    ['The Kings Sushi Bar', 'The Keg Steakhouse'],
    ["The Burger's Priest", 'The Burger Bar'],
    ['SAKE SUSHI TORONTO', 'SAKU (sushi & taco)'],
    ['Sushi', 'Sushi Inn'],
    ['Pai Northern Thai', 'Pai Uptown'],
  ]
  for (const [a, b] of apart) {
    it(`keeps ${a} apart from ${b}`, () => expect(sameChain(a, b)).toBe(false))
  }

  it('is not fooled by an empty name', () => {
    expect(sameChain('', 'Tim Hortons')).toBe(false)
  })
})

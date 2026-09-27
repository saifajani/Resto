import { describe, expect, it } from 'vitest'
import { fitWithin, photoPath } from './photo'

describe('fitWithin', () => {
  it('shrinks a landscape photo to the long edge', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('shrinks a portrait photo to the long edge', () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('never enlarges a small photo', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})

describe('photoPath', () => {
  it('puts the photo in its visit folder', () => {
    expect(photoPath('owner', 'visit', 'dish')).toBe('owner/visit/dish.jpg')
  })
})

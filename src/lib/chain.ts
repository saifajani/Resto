/**
 * Working out when two restaurants are branches of the same chain, so that a
 * dish you liked at one Jack Astor's shows up at the next one.
 *
 * Google has no chain or brand field, and branches are named three ways:
 *   - identical everywhere: "Tim Hortons", "Subway", "Pizza Pizza"
 *   - brand, separator, location: "The Keg Steakhouse + Bar - York Street"
 *   - brand then location, no separator: "Jack Astor's Bar & Grill Airport"
 * So the name is all there is to go on. This is deliberately cautious: it is
 * better to miss a chain than to pool two unrelated restaurants' dishes.
 */

/** Too common to tie two places together on their own. */
const GENERIC = new Set([
  'and', 'bakery', 'bar', 'bbq', 'bistro', 'burger', 'burgers', 'cafe', 'chicken', 'chinese', 'co',
  'coffee', 'company', 'deli', 'diner', 'eatery', 'express', 'food', 'grill', 'grille', 'house',
  'indian', 'italian', 'japanese', 'kitchen', 'lounge', 'pizza', 'pizzeria', 'pub', 'restaurant',
  'shop', 'steakhouse', 'sushi', 'taco', 'tacos', 'tavern', 'thai', 'wings',
])

/** Shortest full-name match that counts on its own, as in "Starbucks". */
const MIN_PREFIX_CHARS = 6
/** Two names that only share their opening words have to share this much. */
const MIN_SHARED_WORDS = 2
const MIN_SHARED_CHARS = 10

/**
 * "The Keg Steakhouse + Bar - York Street" -> ["keg", "steakhouse", "bar"].
 * Cuts the branch off at a dash or bracket, since that is where chains put it.
 */
export function nameWords(name: string): string[] {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+[-–—]\s+|\(/)[0]
    .replace(/&/g, ' and ')
    // Apostrophes close up, so "Astor's" is one word and matches "Astors".
    .replace(/['’ʼ`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return words[0] === 'the' ? words.slice(1) : words
}

const distinctive = (words: string[]) => words.some((w) => !GENERIC.has(w))
const chars = (words: string[]) => words.join('').length

/** Whether two restaurant names look like branches of one chain. */
export function sameChain(a: string, b: string): boolean {
  const x = nameWords(a)
  const y = nameWords(b)
  if (!x.length || !y.length) return false

  // Most chains: the same name at every branch.
  if (x.join(' ') === y.join(' ')) return true

  const shared: string[] = []
  for (let i = 0; i < Math.min(x.length, y.length) && x[i] === y[i]; i++) shared.push(x[i])
  if (!shared.length || !distinctive(shared)) return false

  // One name is the whole brand, the other adds its location: "Starbucks" and
  // "Starbucks Coffee Company".
  const whole = shared.length === x.length || shared.length === y.length
  if (whole && chars(shared) >= MIN_PREFIX_CHARS) return true

  // Otherwise both add their own location, so the brand is what they share.
  return shared.length >= MIN_SHARED_WORDS && chars(shared) >= MIN_SHARED_CHARS
}

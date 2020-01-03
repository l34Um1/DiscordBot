
export default main

/**
 * Generates a number based on the seed. `seed` is converted into a positive integer
 */
function main(seed: number | string, min: number, max: number) {
  if (typeof seed === 'string' || seed !== Math.floor(seed)) seed = ~~seed.toString().split('').map(c => c >= '0' && c <= '9' ? ~~c : c.charCodeAt(0) % 10).join('')
  seed %= 2147483647
  if (seed <= 0) seed += 2147483646
  return (seed * 16807 % 2147483647 - 1) / 2147483646 * (max - min) + min
}

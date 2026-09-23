// Passphrase wordlist (Phase 14). Exactly 128 short, common, easy-to-type
// words → each word carries exactly 7 bits of entropy (log2(128)). All ASCII
// lowercase, 3–7 letters, no homoglyph traps. Order is fixed so the list is
// deterministic across devices (index picked with unbiased crypto random).

export const VAULT_WORDLIST: readonly string[] = [
  'acre', 'amber', 'anchor', 'apple', 'arrow', 'atlas', 'audio', 'axe',
  'badge', 'bamboo', 'basil', 'beacon', 'bell', 'birch', 'bloom', 'bolt',
  'brick', 'brook', 'brush', 'cabin', 'cactus', 'canal', 'cargo', 'cedar',
  'chalk', 'charm', 'chess', 'cider', 'citrus', 'cloak', 'cloud', 'cobalt',
  'comet', 'copper', 'coral', 'cosmos', 'crane', 'crisp', 'crown', 'crystal',
  'delta', 'dune', 'echo', 'eagle', 'ember', 'fable', 'falcon', 'fern',
  'fiber', 'flint', 'flora', 'forge', 'fossil', 'fox', 'frost', 'galaxy',
  'garden', 'ginger', 'glacier', 'grain', 'granite', 'gravel', 'grove', 'harbor',
  'hazel', 'heather', 'hedge', 'hollow', 'honey', 'ivory', 'jade', 'jungle',
  'kayak', 'kettle', 'lagoon', 'lantern', 'lichen', 'lily', 'linen', 'lotus',
  'lunar', 'mango', 'maple', 'marble', 'marsh', 'meadow', 'mesa', 'mint',
  'mirror', 'moss', 'nectar', 'nickel', 'noble', 'nomad', 'north', 'nova',
  'oak', 'oasis', 'ocean', 'olive', 'onyx', 'opal', 'orbit', 'orchid',
  'otter', 'palm', 'pearl', 'pebble', 'petal', 'pigeon', 'pillar', 'pine',
  'raven', 'reef', 'ridge', 'ring', 'river', 'rocket', 'ruby', 'rustic',
  'saffron', 'sage', 'salmon', 'satin', 'shell', 'signal', 'silk', 'slate',
]

// Assert the 2^7 invariant at module load — a future edit that breaks the
// count fails loudly instead of silently shrinking passphrase entropy.
if (VAULT_WORDLIST.length !== 128) {
  throw new Error(`VAULT_WORDLIST must have exactly 128 words (has ${VAULT_WORDLIST.length})`)
}

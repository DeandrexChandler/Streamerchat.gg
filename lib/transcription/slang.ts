/**
 * Repairs slang that speech recognisers reliably mishear.
 *
 * Recognisers are trained on formal speech, so they spell out initialisms
 * ("n g l"), split compounds ("low key"), and pick the dictionary word over
 * the slang one. That matters here beyond cosmetics: the classifier matches
 * on words, so "low key insane" scores nothing while "lowkey insane" reads as
 * excitement — a mistranscription silently becomes chat ignoring you.
 *
 * Deliberately conservative. Every entry has to be a phrase that is far more
 * likely to be misheard slang than intended literally, because a wrong
 * substitution puts words in the streamer's mouth. Ambiguous candidates were
 * left out on purpose: "yeet" sounds like "yet", "rizz" like "risk", and
 * "goated" like "goaded" or "coated", but each of those has a common literal
 * reading and the cost of being wrong is higher than the benefit.
 */

const REPAIRS: ReadonlyArray<readonly [RegExp, string]> = [
  // Initialisms the recogniser spells out letter by letter.
  [/\bn\s*[.,]?\s*g\s*[.,]?\s*l\b/gi, "ngl"],
  [/\bg\s*[.,]?\s*g\b/gi, "gg"],
  [/\bi\s*[.,]?\s*r\s*[.,]?\s*l\b/gi, "irl"],

  // Compounds split into two words.
  [/\blow\s+key\b/gi, "lowkey"],
  [/\bhigh\s+key\b/gi, "highkey"],
  [/\bdead\s+ass\b/gi, "deadass"],
  [/\bno\s+diff\b/gi, "nodiff"],

  // The dictionary word chosen over the slang one.
  [/\bbussing\b/gi, "bussin"],
  [/\bpog\s+champ\b/gi, "poggers"],
  [/\bmonka\s+s\b/gi, "monkaS"],
  [/\bkappa\b/gi, "Kappa"],
];

/**
 * Applies the repairs. Returns the text unchanged when nothing matches, which
 * is the overwhelmingly common case.
 */
export function repairSlang(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REPAIRS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

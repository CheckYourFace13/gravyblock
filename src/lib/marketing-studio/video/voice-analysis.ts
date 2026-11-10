/**
 * What a voice actually sounds like, MEASURED from its own preview audio rather than assumed: the typical pitch (autocorrelation over voiced frames) and the speaking pace
 * (words per second of audible speech). The words shown to a customer come only from these two measurements. Kokoro has no emotion controls, so nothing here describes emotion.
 */
export type VoiceMeasure = { pitchHz: number | null; wordsPerSec: number; speechSec: number };

/** Median fundamental frequency over frames that carry a clearly periodic voice. */
export function medianPitch(samples: Float32Array, rate: number): number | null {
  const frame = Math.round(rate * 0.04);
  const hop = Math.round(rate * 0.02);
  const minLag = Math.floor(rate / 400);
  const maxLag = Math.ceil(rate / 70);
  const found: number[] = [];
  for (let s = 0; s + frame + maxLag < samples.length; s += hop) {
    let e0 = 0;
    for (let i = 0; i < frame; i++) e0 += samples[s + i] * samples[s + i];
    if (Math.sqrt(e0 / frame) < 0.02) continue; // silence
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let c = 0;
      let e1 = 0;
      for (let i = 0; i < frame; i++) {
        c += samples[s + i] * samples[s + i + lag];
        e1 += samples[s + i + lag] * samples[s + i + lag];
      }
      const r = c / Math.sqrt(e0 * e1 || 1);
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    if (best > 0.6 && bestLag) found.push(rate / bestLag);
  }
  if (found.length < 5) return null;
  found.sort((a, b) => a - b);
  return Math.round(found[Math.floor(found.length / 2)]);
}

/** Seconds of audible speech: the 20 ms windows above a small level, so pauses do not count. */
export function speechSeconds(samples: Float32Array, rate: number): number {
  const win = Math.round(rate * 0.02);
  let loud = 0;
  for (let s = 0; s + win <= samples.length; s += win) {
    let e = 0;
    for (let i = 0; i < win; i++) e += samples[s + i] * samples[s + i];
    if (Math.sqrt(e / win) > 0.01) loud++;
  }
  return loud * 0.02;
}

export function measureVoice(samples: Float32Array, rate: number, words: number): VoiceMeasure {
  const speechSec = speechSeconds(samples, rate);
  return { pitchHz: medianPitch(samples, rate), wordsPerSec: speechSec > 0 ? +(words / speechSec).toFixed(2) : 0, speechSec: +speechSec.toFixed(2) };
}

/** The customer-facing description, built only from the two measurements. */
export function describeVoice(m: VoiceMeasure): string {
  const pitch = m.pitchHz === null ? "" : m.pitchHz < 130 ? "Deeper" : m.pitchHz < 180 ? "Mid-low" : m.pitchHz < 235 ? "Mid-range" : "Higher";
  const pace = m.wordsPerSec < 2.6 ? "unhurried pace" : m.wordsPerSec < 3.2 ? "even pace" : "brisk pace";
  return pitch ? `${pitch} voice, ${pace}` : `Clear voice, ${pace}`;
}

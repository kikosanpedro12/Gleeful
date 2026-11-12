#!/usr/bin/env node
/**
 * Cost per live minute and plan margins, from config/pricing.json.
 *   node scripts/cost-model.mjs                 → estimate table (unoptimized vs optimized)
 *   node scripts/cost-model.mjs --usage u.json  → also cost real usage. u.json:
 *     { "minutes": 120, "childTalkMinutes": 28, "ttsChars": 41000, "cachedTtsChars": 18000,
 *       "inputTokens": 9e4, "cachedTokens": 4e5, "outputTokens": 2e4, "sonnetShare": 0.1 }
 * Pure arithmetic; makes no network calls.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = JSON.parse(readFileSync(path.join(ROOT, "config/pricing.json"), "utf8"));
const A = P.assumptions;

export function perMinute(optimized) {
  const stt = P.stt.perMinute * (optimized ? A.childTalkShare : 1);
  const ttsPerSpokenMin = (P.tts.creditsPerAudioMinute / 1e6) * P.tts.usdPerMillionCredits;
  const tts = ttsPerSpokenMin * A.teacherTalkShare * (optimized ? 1 - P.optimized.prerecordedShare : 1);
  const pipe = optimized && !P.optimized.useLiveKit ? P.pipe.ownRelayPerMinute : P.pipe.agentPerMinute + P.pipe.webrtcPerMinute;
  const turn = (m) => (A.uncachedInputTokensPerTurn * m.inPerM + A.cachedInputTokensPerTurn * m.cachedPerM + A.outputTokensPerTurn * m.outPerM) / 1e6;
  const brain = A.turnsPerMinute * ((1 - A.sonnetShare) * turn(P.brain.haiku) + A.sonnetShare * turn(P.brain.sonnet));
  return { stt, tts, pipe, brain, total: stt + tts + pipe + brain };
}

export function usageCost(u) {
  const ttsPerChar = P.tts.usdPerMillionCredits / 1e6;
  const s = u.sonnetShare ?? A.sonnetShare;
  const mix = (k) => (1 - s) * P.brain.haiku[k] + s * P.brain.sonnet[k];
  const stt = u.childTalkMinutes * P.stt.perMinute;
  const tts = (u.ttsChars - (u.cachedTtsChars ?? 0)) * ttsPerChar;
  const pipe = u.minutes * (P.optimized.useLiveKit ? P.pipe.agentPerMinute + P.pipe.webrtcPerMinute : P.pipe.ownRelayPerMinute);
  const brain = (u.inputTokens * mix("inPerM") + u.cachedTokens * mix("cachedPerM") + u.outputTokens * mix("outPerM")) / 1e6;
  const total = stt + tts + pipe + brain;
  return { stt, tts, pipe, brain, total, perMinute: total / u.minutes };
}

const $ = (n, d = 4) => "$" + n.toFixed(d);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Prices checked ${P.checked}. ESTIMATES from list prices.\n`);
  for (const opt of [false, true]) {
    const c = perMinute(opt);
    console.log(`${opt ? "Optimized  " : "Unoptimized"}  stt ${$(c.stt)}  tts ${$(c.tts)}  pipe ${$(c.pipe)}  brain ${$(c.brain)}  = ${$(c.total)}/min  (${$(c.total * 60, 2)}/hr)`);
  }
  const hr = perMinute(true).total * 60, hrU = perMinute(false).total * 60;
  console.log("\nPlan            price  cap h  cost@cap  margin@cap  (unoptimized margin)");
  for (const p of P.plans) {
    const net = p.price * (1 - A.paymentFeeShare);
    const m = (net - p.capHours * hr) / p.price, mu = (net - p.capHours * hrU) / p.price;
    console.log(`${p.name.padEnd(14)} ${("$" + p.price).padStart(5)}  ${String(p.capHours).padStart(5)}  ${$(p.capHours * hr, 2).padStart(8)}  ${(m * 100).toFixed(0).padStart(9)}%  (${(mu * 100).toFixed(0)}%)`);
  }
  const i = process.argv.indexOf("--usage");
  if (i > 0) {
    const r = usageCost(JSON.parse(readFileSync(process.argv[i + 1], "utf8")));
    console.log(`\nMeasured usage: stt ${$(r.stt)}  tts ${$(r.tts)}  pipe ${$(r.pipe)}  brain ${$(r.brain)}  total ${$(r.total, 2)}  = ${$(r.perMinute)}/min`);
  }
}

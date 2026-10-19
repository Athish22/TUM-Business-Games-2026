// Runs every case in cases.json through the analysis engine and checks the expectations.
// Usage: node tests/run.mjs [case-id-filter]
import { readFileSync } from 'node:fs';
import { analyze } from '../prototype/analysis.js';

const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const filter = process.argv[2];

// Build a realistic timeline from the speaking rate: each segment lasts words / wpm.
export function buildTimeline(c) {
  let t = 0.5;
  const segments = [];
  const marks = [];
  let lastSlide = null;
  for (const s of c.segments) {
    const n = (s.text.match(/[\p{L}\p{N}]+/gu) || []).length;
    const dur = (n / c.wpm) * 60;
    if (s.slide !== lastSlide) {
      marks.push({ slide: s.slide, t: Math.max(0, t - 0.2) });
      lastSlide = s.slide;
    }
    segments.push({ start: +t.toFixed(2), end: +(t + dur).toFixed(2), text: s.text, truth: s.slide });
    t += dur + 0.4;
  }
  return { segments, marks, duration: segments.length ? t + 0.6 : 10 };
}

const same = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

function check(c) {
  const { segments, marks, duration } = buildTimeline(c);
  const input = segments.map(({ truth, ...g }) => g);
  const r = analyze({ slides: c.slides.map((s) => ({ notes: '', ...s })), segments: input, duration, marks: c.mode === 'marks' ? marks : null, lang: 'auto' });
  const e = c.expect;
  const fails = [];

  if (e.lang && r.lang !== e.lang) fails.push(`lang ${r.lang} ≠ ${e.lang}`);
  if (e.coverage_min != null && r.stats.coverage_pct < e.coverage_min) fails.push(`coverage ${r.stats.coverage_pct}% < ${e.coverage_min}%`);
  if (e.coverage_max != null && r.stats.coverage_pct > e.coverage_max) fails.push(`coverage ${r.stats.coverage_pct}% > ${e.coverage_max}%`);
  if (e.filler_count != null && r.stats.filler_count !== e.filler_count) fails.push(`fillers ${r.stats.filler_count} ≠ ${e.filler_count} ${JSON.stringify(r.stats.fillers)}`);
  if (e.wpm_min != null && r.stats.wpm < e.wpm_min) fails.push(`wpm ${r.stats.wpm} < ${e.wpm_min}`);
  if (e.wpm_max != null && r.stats.wpm > e.wpm_max) fails.push(`wpm ${r.stats.wpm} > ${e.wpm_max}`);
  if (e.no_missed) {
    const m = r.feedback.flatMap((f) => f.missed_points);
    if (m.length) fails.push(`unexpected missed: ${m.join(' | ')}`);
  }
  for (const [n, exp] of Object.entries(e.slides || {})) {
    const f = r.feedback[+n - 1];
    for (const k of ['covered', 'partial', 'missed']) {
      if (exp[k] && !same(exp[k], f[`${k}_points`])) fails.push(`slide ${n} ${k}: got [${f[`${k}_points`].join(' | ')}] want [${exp[k].join(' | ')}]`);
    }
  }
  for (const s of e.fixes_include || []) {
    if (!r.fixes.some((f) => f.includes(s))) fails.push(`no fix mentioning "${s}" (got: ${r.fixes.join(' / ') || 'none'})`);
  }
  if (e.unclear_slides) {
    const got = r.feedback.filter((f) => f.unclear_statements.length).map((f) => f.slide);
    if (!same(e.unclear_slides, got)) fails.push(`unclear slides [${got}] ≠ [${e.unclear_slides}]`);
  }
  if (e.alignment_exact) {
    // Compare by time: the engine may split segments into sentences.
    const truthAt = (t) => (segments.find((g) => t >= g.start - 0.01 && t <= g.end + 0.01) || {}).truth;
    const wrong = r.segments.filter((g) => g.slide !== truthAt((g.start + g.end) / 2));
    if (wrong.length) fails.push(`misaligned: ${wrong.map((g) => `"${g.text}" → slide ${g.slide}`).join('; ')}`);
  }
  return { fails, r };
}

let pass = 0, fail = 0, xfail = 0, xpass = 0;
for (const c of cases) {
  if (filter && !c.id.includes(filter)) continue;
  let res;
  try {
    res = check(c);
  } catch (err) {
    res = { fails: ['CRASH: ' + err.stack] };
  }
  const ok = res.fails.length === 0;
  let tag;
  if (c.xfail) { tag = ok ? 'XPASS' : 'XFAIL'; ok ? xpass++ : xfail++; }
  else { tag = ok ? 'PASS ' : 'FAIL '; ok ? pass++ : fail++; }
  console.log(`${tag} ${c.id.padEnd(22)} ${c.about}`);
  if (!ok) for (const f of res.fails) console.log(`        ↳ ${f}`);
  if (c.xfail && !ok) console.log(`        (known limitation: ${c.xfail})`);
}
console.log(`\n${pass} passed, ${fail} failed, ${xfail} known limitations, ${xpass} unexpectedly passed`);
process.exit(fail ? 1 : 0);

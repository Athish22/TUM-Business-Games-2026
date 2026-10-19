// Deterministic analysis: slide alignment, point coverage, delivery stats, rule-based Q&A.
// No LLM involved — everything here runs instantly and offline.

const STOP_DE = `der die das und oder aber ist sind war waren wir ihr sie es ein eine einen einem einer eines im in am an auf aus bei mit von vom zu zum zur für über unter nach vor auch noch nur sehr so wie was wer wo dass den dem des nicht kein keine dann denn also hier dort heute haben hat hatte hatten wird werden wurde sich uns unser unsere unseren unserer man mal schon jetzt ja nein gibt gut ganz um bis durch gegen ohne sein seine ihre ihren diese dieser dieses dabei geht beim sehen sieht`.split(/\s+/);
const STOP_EN = `the a an and or but is are was were we you they it its of in on at to for from with by as that this these those be been have has had will would can could our your their not no so very also just then than there here about into over under what which who how all any some more most other such only let lets now today`.split(/\s+/);
const STOP = new Set([...STOP_DE, ...STOP_EN]);

const FILLERS = {
  de: ['äh', 'ähm', 'öh', 'öhm', 'hm', 'hmm', 'halt', 'quasi', 'sozusagen', 'eigentlich', 'also'],
  en: ['uh', 'um', 'uhm', 'erm', 'like', 'basically', 'actually', 'literally', 'you know', 'sort of', 'kind of', 'i mean'],
};

const words = (s) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);

function stem(t) {
  return /^\d+$/.test(t) ? t : t.slice(0, 5);
}

export function tokens(s) {
  return words(s || '')
    .filter((t) => (t.length > 2 || /^\d+$/.test(t)) && !STOP.has(t))
    .map(stem);
}

export function detectLang(text) {
  const w = words(text);
  let de = 0, en = 0;
  const deSet = new Set(STOP_DE), enSet = new Set(STOP_EN);
  for (const t of w) { if (deSet.has(t)) de++; if (enSet.has(t)) en++; }
  if (/[äöüß]/i.test(text)) de += 3;
  return de >= en ? 'de' : 'en';
}

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

// Whisper returns ~sentence-to-paragraph sized chunks that can straddle a slide change.
// Split them into sentences and interpolate timestamps by word count.
function splitSegments(segs) {
  const out = [];
  for (const g of segs) {
    const parts = splitSentences(g.text);
    if (parts.length < 2 || g.slide) { out.push(g); continue; }
    const end = g.end ?? g.start;
    const total = parts.reduce((a, p) => a + Math.max(1, words(p).length), 0);
    let t = g.start;
    for (const p of parts) {
      const d = ((end - g.start) * Math.max(1, words(p).length)) / total;
      out.push({ start: +t.toFixed(2), end: +(t + d).toFixed(2), text: p });
      t += d;
    }
  }
  return out;
}

// ---------- Alignment ----------

function alignByMarks(segs, marks) {
  const sorted = [...marks].sort((a, b) => a.t - b.t);
  for (const g of segs) {
    const mid = (g.start + (g.end ?? g.start)) / 2;
    let slide = sorted[0]?.slide ?? 1;
    for (const m of sorted) if (m.t <= mid) slide = m.slide;
    g.slide = slide;
  }
}

// Monotonic (Viterbi) alignment: the talk moves forward through the deck.
function alignByContent(slides, segs) {
  const n = slides.length, m = segs.length;
  if (!m || !n) return;
  const slideTok = slides.map((s) => new Set(tokens([s.title, ...s.points, s.notes || ''].join(' '))));
  const sc = segs.map((g) => {
    const t = tokens(g.text);
    return slideTok.map((S) => (t.length ? t.filter((x) => S.has(x)).length / t.length : 0));
  });
  const NEG = -1e9;
  let best = sc[0].map((v, j) => v - 0.3 * j);
  const back = [];
  for (let i = 1; i < m; i++) {
    const nb = Array(n).fill(NEG), bk = Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      const cands = [[best[j], j]];
      if (j >= 1) cands.push([best[j - 1] - 0.05, j - 1]);
      if (j >= 2) cands.push([best[j - 2] - 0.4, j - 2]);
      const [v, from] = cands.reduce((a, b) => (b[0] > a[0] ? b : a));
      nb[j] = v + sc[i][j];
      bk[j] = from;
    }
    back.push(bk);
    best = nb;
  }
  let j = best.indexOf(Math.max(...best));
  for (let i = m - 1; i >= 0; i--) {
    segs[i].slide = j + 1;
    if (i > 0) j = back[i - 1][j];
  }
}

// ---------- Text templates ----------

const T = {
  de: {
    missed: (p) => `Nenne „${p}“ explizit, bevor du zur nächsten Folie gehst.`,
    partial: (p) => `Erkläre „${p}“ genauer – bisher nur angedeutet.`,
    rushed: (s) => `Diese Folie war mit ${s}s sehr kurz – nimm dir mehr Zeit für die Kernaussage.`,
    long: () => `Teile den langen Satz in zwei kurze Sätze auf.`,
    good: () => `Gut abgedeckt – alle Kernpunkte genannt.`,
    fixMissed: (n, p) => `Folie ${n}: „${p}“ wurde nicht erwähnt.`,
    fixFillers: (c, top) => `Füllwörter reduzieren (${c}×, vor allem „${top}“).`,
    fixFast: (w) => `Etwas langsamer sprechen (${w} Wörter/Min., Ziel 120–160).`,
    fixSlow: (w) => `Etwas zügiger sprechen (${w} Wörter/Min., Ziel 120–160).`,
    fixLong: (n) => `Folie ${n}: sehr langer Satz – schwer zu folgen.`,
    fixPartial: (n, p) => `Folie ${n}: „${p}“ nur angedeutet.`,
    strengthCov: (pct) => `${pct}% der Folieninhalte abgedeckt.`,
    strengthPace: (w) => `Angenehmes Sprechtempo (${w} Wörter/Min.).`,
    strengthFillers: () => `Kaum Füllwörter.`,
    qNum: (p) => `Wie kommt „${p}“ zustande – und wie belastbar ist diese Zahl?`,
    qMissed: (p) => `Auf der Folie steht „${p}“ – können Sie das näher erläutern?`,
    qSustain: (p) => `Wie nachhaltig ist „${p}“ – ist das ein Trend oder ein Einmaleffekt?`,
    whyMissed: 'Stand auf der Folie, wurde aber nicht erklärt.',
    whyPartial: 'Wurde nur angedeutet, nicht erklärt.',
    whyNum: 'Kennzahlen werden vom Publikum häufig hinterfragt.',
  },
  en: {
    missed: (p) => `Mention "${p}" explicitly before moving to the next slide.`,
    partial: (p) => `Explain "${p}" in more detail – it was only hinted at.`,
    rushed: (s) => `Only ${s}s on this slide – slow down for the key message.`,
    long: () => `Split the long sentence into two shorter ones.`,
    good: () => `Well covered – all key points mentioned.`,
    fixMissed: (n, p) => `Slide ${n}: you skipped "${p}".`,
    fixFillers: (c, top) => `Cut filler words (${c}×, mostly "${top}").`,
    fixFast: (w) => `Slow down a little (${w} wpm, aim for 120–160).`,
    fixSlow: (w) => `Pick up the pace a little (${w} wpm, aim for 120–160).`,
    fixLong: (n) => `Slide ${n}: a very long sentence – hard to follow.`,
    fixPartial: (n, p) => `Slide ${n}: "${p}" was only hinted at.`,
    strengthCov: (pct) => `${pct}% of the slide content covered.`,
    strengthPace: (w) => `Comfortable pace (${w} wpm).`,
    strengthFillers: () => `Very few filler words.`,
    qNum: (p) => `Where does "${p}" come from, and how reliable is that figure?`,
    qMissed: (p) => `Your slide says "${p}" – could you explain that?`,
    qSustain: (p) => `How sustainable is "${p}" – a trend or a one-off?`,
    whyMissed: 'It was on the slide but not explained.',
    whyPartial: 'It was only hinted at, not explained.',
    whyNum: 'Audiences often probe key figures.',
  },
};

// ---------- Main analysis ----------

export function analyze({ slides, segments, duration, marks, lang }) {
  const segs = splitSegments(segments.map((g) => ({ ...g })));
  if (marks && marks.length) alignByMarks(segs, marks);
  else if (!segs.every((g) => g.slide)) alignByContent(slides, segs);

  const fullText = segs.map((g) => g.text).join(' ');
  if (!lang || lang === 'auto') lang = detectLang(fullText + ' ' + slides.map((s) => s.title + ' ' + s.points.join(' ')).join(' '));
  const L = T[lang];

  const end = duration || Math.max(0, ...segs.map((g) => g.end ?? g.start));

  // Delivery stats (deterministic, never from the LLM)
  const allWords = words(fullText);
  const wpm = end > 0 ? Math.round(allWords.length / (end / 60)) : 0;
  const lower = ' ' + allWords.join(' ') + ' ';
  const fillers = {};
  for (const f of FILLERS[lang]) {
    const c = lower.split(` ${f} `).length - 1;
    if (c) fillers[f] = c;
  }
  const fillerCount = Object.values(fillers).reduce((a, b) => a + b, 0);
  let longPauses = 0;
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].start - (segs[i - 1].end ?? segs[i - 1].start) > 2.0) longPauses++;
  }

  // Per-slide feedback
  const sortedMarks = marks && marks.length ? [...marks].sort((a, b) => a.t - b.t) : null;
  const feedback = slides.map((s, i) => {
    const idx = i + 1;
    const mine = segs.filter((g) => g.slide === idx);
    const text = mine.map((g) => g.text).join(' ');
    const said = new Set(tokens(text));
    const saidWords = words(text);
    // Exact stem match, or the stem appears inside a longer spoken word
    // (German compounds like "Neukundengeschäft", or Whisper merging words like "appguided").
    const heard = (x) => said.has(x) || (x.length >= 3 && !/^\d+$/.test(x) && saidWords.some((w) => w.length > x.length && w.includes(x)));

    let dur = 0;
    if (sortedMarks) {
      sortedMarks.forEach((m, k) => {
        if (m.slide === idx) dur += (sortedMarks[k + 1]?.t ?? end) - m.t;
      });
    } else if (mine.length) {
      dur = (mine[mine.length - 1].end ?? mine[mine.length - 1].start) - mine[0].start;
    }

    const covered = [], partial = [], missed = [];
    for (const p of s.points) {
      const P = [...new Set(tokens(p))];
      if (!P.length) continue;
      const hit = P.filter(heard).length / P.length;
      (hit >= 0.6 ? covered : hit >= 0.3 ? partial : missed).push(p);
    }
    const unclear = splitSentences(text).filter((x) => words(x).length > 30);

    let suggestion;
    if (missed.length) suggestion = L.missed(missed[0]);
    else if (partial.length) suggestion = L.partial(partial[0]);
    else if (unclear.length) suggestion = L.long();
    else if (dur > 0 && dur < 15 && s.points.length >= 3) suggestion = L.rushed(Math.round(dur));
    else suggestion = L.good();

    return {
      slide: idx,
      title: s.title,
      covered_points: covered,
      partial_points: partial,
      missed_points: missed,
      unclear_statements: unclear,
      suggestion,
      duration_s: Math.round(dur),
      transcript: text,
      confidence: 0.6,
    };
  });

  const total = feedback.reduce((a, f) => a + f.covered_points.length + f.partial_points.length + f.missed_points.length, 0);
  const coveredScore = feedback.reduce((a, f) => a + f.covered_points.length + 0.5 * f.partial_points.length, 0);
  const coveragePct = total ? Math.round((100 * coveredScore) / total) : 0;

  // Top 3 fixes
  const fixes = [];
  for (const f of feedback) for (const p of f.missed_points) fixes.push(L.fixMissed(f.slide, p));
  const perMin = end > 0 ? fillerCount / (end / 60) : 0;
  const topFiller = Object.entries(fillers).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (perMin > 3 && topFiller) fixes.splice(1, 0, L.fixFillers(fillerCount, topFiller));
  if (wpm > 165) fixes.push(L.fixFast(wpm));
  if (wpm && wpm < 110) fixes.push(L.fixSlow(wpm));
  for (const f of feedback) if (f.unclear_statements.length) fixes.push(L.fixLong(f.slide));
  for (const f of feedback) for (const p of f.partial_points) fixes.push(L.fixPartial(f.slide, p));

  const strengths = [];
  if (coveragePct >= 60) strengths.push(L.strengthCov(coveragePct));
  if (wpm >= 110 && wpm <= 165) strengths.push(L.strengthPace(wpm));
  if (perMin <= 3) strengths.push(L.strengthFillers());

  // Rule-based audience questions (the LLM tier will replace these)
  const questions = [];
  const hasNum = (p) => /\d/.test(p);
  for (const f of feedback) {
    for (const p of f.missed_points) questions.push({ question: hasNum(p) ? L.qNum(p) : L.qMissed(p), related_slides: [f.slide], type: 'critical', why_likely: L.whyMissed });
    for (const p of f.partial_points) questions.push({ question: L.qMissed(p), related_slides: [f.slide], type: 'clarifying', why_likely: L.whyPartial });
  }
  for (const f of feedback) {
    for (const p of f.covered_points.filter(hasNum).slice(0, 1)) questions.push({ question: L.qSustain(p), related_slides: [f.slide], type: 'critical', why_likely: L.whyNum });
  }

  return {
    lang,
    stats: { duration_s: Math.round(end), words: allWords.length, wpm, filler_count: fillerCount, fillers, long_pauses: longPauses, coverage_pct: coveragePct },
    feedback,
    fixes: fixes.slice(0, 3),
    strengths,
    questions: questions.slice(0, 5),
    segments: segs,
  };
}

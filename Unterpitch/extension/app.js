import { analyze } from './analysis.js';
import { SAMPLE_SLIDES, SAMPLE_DECK_TITLE, SAMPLE_SEGMENTS, SAMPLE_MARKS, SAMPLE_DURATION } from './sample.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let deck = null; // { title, slides: [{title, points, notes}] }
let lastResult = null;

// ---------- Deck loading ----------

async function parsePptx(file) {
  const zip = await JSZip.loadAsync(file);
  const xml = async (p) => {
    const f = zip.file(p);
    return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null;
  };
  const num = (s) => parseInt(s.match(/(\d+)\.xml$/)[1], 10);

  let order = [];
  const pres = await xml('ppt/presentation.xml');
  const rels = await xml('ppt/_rels/presentation.xml.rels');
  if (pres && rels) {
    const map = {};
    for (const r of rels.getElementsByTagName('Relationship')) map[r.getAttribute('Id')] = r.getAttribute('Target');
    for (const s of pres.getElementsByTagName('p:sldId')) {
      const t = map[s.getAttribute('r:id')];
      if (t) order.push('ppt/' + t.replace(/^\/?ppt\//, '').replace(/^\.\//, ''));
    }
  }
  if (!order.length) order = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));

  const paras = (el) => [...el.getElementsByTagName('a:p')]
    .map((p) => [...p.getElementsByTagName('a:t')].map((t) => t.textContent).join('').trim())
    .filter(Boolean);

  const slides = [];
  for (const path of order) {
    const doc = await xml(path);
    if (!doc) continue;
    const title = [], body = [];
    for (const sp of doc.getElementsByTagName('p:sp')) {
      const ph = sp.getElementsByTagName('p:ph')[0];
      const type = ph ? ph.getAttribute('type') || 'body' : 'other';
      if (['sldNum', 'dt', 'ftr', 'hdr', 'sldImg'].includes(type)) continue;
      (type === 'title' || type === 'ctrTitle' ? title : body).push(...paras(sp));
    }
    for (const gf of doc.getElementsByTagName('p:graphicFrame')) body.push(...paras(gf));

    // Speaker notes
    let notes = '';
    const relPath = path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels');
    const srels = await xml(relPath);
    if (srels) {
      const nr = [...srels.getElementsByTagName('Relationship')].find((r) => /notesSlide$/.test(r.getAttribute('Type')));
      if (nr) {
        const ndoc = await xml('ppt/' + nr.getAttribute('Target').replace(/^\.\.\//, ''));
        if (ndoc) {
          for (const sp of ndoc.getElementsByTagName('p:sp')) {
            const ph = sp.getElementsByTagName('p:ph')[0];
            if (ph && ph.getAttribute('type') === 'body') notes += paras(sp).join(' ');
          }
        }
      }
    }

    let t = title.join(' ');
    let points = body.flatMap((p) => p.split(/\s*[;•]\s*/)).filter((p) => p.length > 1);
    if (!t && points.length) t = points.shift();
    slides.push({ title: t || `Slide ${slides.length + 1}`, points, notes });
  }
  return { title: file.name.replace(/\.pptx$/i, ''), slides };
}

function setDeck(d) {
  deck = d;
  $('deckInfo').textContent = `${d.title} · ${d.slides.length} slides`;
  $('deckView').innerHTML = d.slides.map((s, i) => `
    <div class="thumb"><b>${i + 1}. ${esc(s.title)}</b>
      <ul>${s.points.slice(0, 4).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      ${s.notes ? '<div class="muted">📝 has speaker notes</div>' : ''}
    </div>`).join('');
  $('recStart').disabled = false;
  $('analyseUpload').disabled = !$('audioFile').files.length;
}

$('deckFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.name.endsWith('.json')) {
      const j = JSON.parse(await f.text());
      setDeck({ title: j.deck_title || f.name, slides: j.slides.map((s) => ({ title: s.title, points: (s.text || '').split(/\s*[;\n•]\s*/).filter(Boolean), notes: s.notes || '' })) });
    } else {
      setDeck(await parsePptx(f));
    }
  } catch (err) {
    showStatus('Could not read this file: ' + err.message, true);
  }
});

$('demoDeck').addEventListener('click', () => setDeck({ title: SAMPLE_DECK_TITLE, slides: SAMPLE_SLIDES }));

// ---------- Google Slides import (extension only) ----------

const GSLIDES = /^https:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/;

async function listSlidesTabs() {
  const tabs = await chrome.tabs.query({ url: 'https://docs.google.com/presentation/*' });
  const sel = $('gsTabs');
  sel.innerHTML = `<option value="">${tabs.length ? 'Choose an open Google Slides deck…' : 'No Google Slides tabs open'}</option>` +
    tabs.map((t) => {
      const m = t.url.match(GSLIDES);
      return m ? `<option value="${m[1]}">${esc(t.title.replace(/ - Google (Slides|Präsentationen)$/, ''))}</option>` : '';
    }).join('');
  $('gsImport').disabled = true;
}

async function importGoogleSlides(id, title) {
  showStatus('Importing deck from Google Slides…');
  const res = await chrome.runtime.sendMessage({ type: 'fetchGoogleSlides', id });
  if (!res || !res.ok) return showStatus('Import failed: ' + (res ? res.error : 'no response'), true);
  const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
  const d = await parsePptx(new File([bytes], (title || 'Google Slides deck') + '.pptx'));
  setDeck(d);
  hideStatus();
}

$('gsTabs').addEventListener('change', () => ($('gsImport').disabled = !$('gsTabs').value));
$('gsRefresh').addEventListener('click', listSlidesTabs);
$('gsImport').addEventListener('click', () => {
  const sel = $('gsTabs');
  importGoogleSlides(sel.value, sel.options[sel.selectedIndex].text).catch((e) => showStatus('Import failed: ' + e.message, true));
});
listSlidesTabs();

const autoId = new URLSearchParams(location.search).get('gslides');
if (autoId) importGoogleSlides(autoId).catch((e) => showStatus('Import failed: ' + e.message, true));

// ---------- Tabs ----------

document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('[data-pane]').forEach((p) => (p.style.display = p.dataset.pane === b.dataset.tab ? '' : 'none'));
  $('settings').style.display = b.dataset.tab === 'demo' ? 'none' : '';
}));

// ---------- Status ----------

function showStatus(msg, isErr = false, pct = null) {
  $('status').classList.add('on');
  $('status').classList.toggle('err', isErr);
  $('statusMsg').textContent = msg;
  $('bar').parentElement.style.display = pct === null ? 'none' : '';
  if (pct !== null) $('bar').style.width = pct + '%';
}
const hideStatus = () => $('status').classList.remove('on');

// ---------- Live recording ----------

let recorder, recChunks, recStartT, recTimer, curSlide, marks, stream;

function renderStage() {
  const s = deck.slides[curSlide];
  $('stageSlide').innerHTML = `<h3>${esc(s.title)}</h3><ul>${s.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
  $('slideNo').textContent = `Slide ${curSlide + 1} / ${deck.slides.length}`;
}

function goSlide(delta) {
  const n = Math.min(deck.slides.length - 1, Math.max(0, curSlide + delta));
  if (n === curSlide) return;
  curSlide = n;
  marks.push({ slide: n + 1, t: (performance.now() - recStartT) / 1000 });
  renderStage();
}

function onKey(e) {
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); goSlide(1); }
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goSlide(-1); }
}

$('recStart').addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    showStatus('Microphone not available: ' + err.message, true);
    return;
  }
  recChunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && recChunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(recChunks, { type: recorder.mimeType });
    await transcribeAndAnalyse(blob, marks);
  };
  curSlide = 0;
  marks = [{ slide: 1, t: 0 }];
  recStartT = performance.now();
  recorder.start(1000);
  recTimer = setInterval(() => ($('timer').textContent = fmt((performance.now() - recStartT) / 1000)), 250);
  $('stage').classList.add('on');
  $('recStart').disabled = true;
  renderStage();
  document.addEventListener('keydown', onKey);
  hideStatus();
});

$('prev').addEventListener('click', () => goSlide(-1));
$('next').addEventListener('click', () => goSlide(1));
$('recStop').addEventListener('click', () => {
  clearInterval(recTimer);
  document.removeEventListener('keydown', onKey);
  $('stage').classList.remove('on');
  $('recStart').disabled = false;
  recorder.stop();
});

// ---------- Upload ----------

$('audioFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  $('audioInfo').textContent = f ? f.name : '';
  $('analyseUpload').disabled = !f || !deck;
});
$('analyseUpload').addEventListener('click', () => transcribeAndAnalyse($('audioFile').files[0], null));

// ---------- Demo ----------

$('runDemo').addEventListener('click', () => {
  setDeck({ title: SAMPLE_DECK_TITLE, slides: SAMPLE_SLIDES });
  hideStatus();
  render(analyze({ slides: SAMPLE_SLIDES, segments: SAMPLE_SEGMENTS, duration: SAMPLE_DURATION, marks: SAMPLE_MARKS, lang: 'auto' }));
});

// ---------- Speech-to-text ----------

async function decodeAudio(blob) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  const ab = await ctx.decodeAudioData(await blob.arrayBuffer());
  let data;
  if (ab.numberOfChannels > 1) {
    const a = ab.getChannelData(0), b = ab.getChannelData(1);
    data = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) data[i] = (a[i] + b[i]) / 2;
  } else {
    data = new Float32Array(ab.getChannelData(0));
  }
  ctx.close();
  return { data, duration: ab.duration };
}

let worker = null;
const fileProgress = {};

function transcribe(audio) {
  if (!worker) worker = new Worker('./worker.js', { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'status') showStatus(m.msg, false, m.msg.startsWith('Loading') ? 0 : null);
      if (m.type === 'progress' && m.p.status === 'progress' && m.p.total) {
        fileProgress[m.p.file] = [m.p.loaded, m.p.total];
        const [l, t] = Object.values(fileProgress).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
        showStatus(`Downloading speech model once… ${(l / 1e6).toFixed(0)} / ${(t / 1e6).toFixed(0)} MB (cached afterwards)`, false, Math.round((100 * l) / t));
      }
      if (m.type === 'done') resolve(m.out);
      if (m.type === 'error') reject(new Error(m.msg));
    };
    worker.postMessage({ model: $('model').value, device: $('webgpu').checked ? 'webgpu' : 'wasm', audio, language: $('lang').value || null }, [audio.buffer]);
  });
}

async function transcribeAndAnalyse(blob, recMarks) {
  if (!deck) return showStatus('Load a deck first.', true);
  try {
    showStatus('Decoding audio…');
    const { data, duration } = await decodeAudio(blob);
    const t0 = performance.now();
    const out = await transcribe(data);
    const secs = ((performance.now() - t0) / 1000).toFixed(0);
    const segments = (out.chunks || [{ timestamp: [0, duration], text: out.text }])
      .map((c) => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? duration, text: c.text.trim() }))
      .filter((s) => s.text);
    const langSel = $('lang').value;
    const result = analyze({ slides: deck.slides, segments, duration, marks: recMarks, lang: langSel === 'german' ? 'de' : langSel === 'english' ? 'en' : 'auto' });
    showStatus(`Done · ${fmt(duration)} of audio transcribed on this device in ${secs}s.`);
    render(result);
  } catch (err) {
    showStatus('Transcription failed: ' + err.message + ' — tip: try the Tiny model, or the Demo rehearsal tab.', true);
  }
}

// ---------- Report ----------

function render(r) {
  lastResult = r;
  const de = r.lang === 'de';
  const s = r.stats;
  const tiles = [
    [s.coverage_pct + '%', de ? 'Inhalt abgedeckt' : 'Content covered'],
    [fmt(s.duration_s), de ? 'Dauer' : 'Duration'],
    [s.wpm, de ? 'Wörter / Min.' : 'Words / min'],
    [s.filler_count, de ? 'Füllwörter' : 'Filler words'],
    [s.long_pauses, de ? 'Lange Pausen (>2s)' : 'Long pauses (>2s)'],
  ];
  $('tiles').innerHTML = tiles.map(([v, k]) => `<div class="tile"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`).join('');
  $('hFixes').textContent = de ? 'Die 3 wichtigsten Verbesserungen' : 'Top 3 fixes';
  $('hStrengths').textContent = de ? 'Stärken' : 'Strengths';
  $('hQ').textContent = de ? 'Wahrscheinliche Fragen aus dem Publikum' : 'Likely audience questions';
  $('fixes').innerHTML = r.fixes.map((f) => `<li>${esc(f)}</li>`).join('') || `<li>${de ? 'Keine größeren Probleme.' : 'No major issues.'}</li>`;
  $('strengths').innerHTML = r.strengths.map((f) => `<li>${esc(f)}</li>`).join('') || '<li>—</li>';

  $('slideFb').innerHTML = r.feedback.map((f) => `
    <div class="sf">
      <div class="head"><b>${f.slide}. ${esc(f.title)}</b><span class="muted">${f.duration_s ? fmt(f.duration_s) : ''}</span></div>
      <div class="chips">
        ${f.covered_points.map((p) => `<span class="chip ok">✓ ${esc(p)}</span>`).join('')}
        ${f.partial_points.map((p) => `<span class="chip partial">~ ${esc(p)}</span>`).join('')}
        ${f.missed_points.map((p) => `<span class="chip miss">✗ ${esc(p)}</span>`).join('')}
      </div>
      <div class="sugg">${esc(f.suggestion)}</div>
      ${f.unclear_statements.map((u) => `<div class="quote">„${esc(u.length > 180 ? u.slice(0, 180) + '…' : u)}“</div>`).join('')}
    </div>`).join('');

  $('questions').innerHTML = r.questions.map((q) => `
    <div class="q">${esc(q.question)}<span class="tag">${q.type}</span>
      <div class="muted">${de ? 'Folie' : 'Slide'} ${q.related_slides.join(', ')} · ${esc(q.why_likely)}</div></div>`).join('') || '<div class="muted">—</div>';

  $('transcript').innerHTML = r.segments.map((g) => `<div class="seg"><span>${fmt(g.start)} · ${de ? 'Folie' : 'Slide'} ${g.slide}</span>${esc(g.text)}</div>`).join('');

  $('report').classList.add('on');
  $('report').scrollIntoView({ behavior: 'smooth' });
}

$('export').addEventListener('click', () => {
  if (!lastResult) return;
  const { feedback, questions, stats } = lastResult;
  const blob = new Blob([JSON.stringify({ feedback: feedback.map(({ transcript, ...f }) => f), questions, delivery: stats }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rehearsal-report.json';
  a.click();
});

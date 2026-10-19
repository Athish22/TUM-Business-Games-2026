<div align="center">

# 🎤 UnterPitch

### Pitch. Practise. Grow.

**A private, offline pitch-training coach for students. It gives slide-aware feedback in German and English.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-fluent--pitcher.lovable.app-ff4f8b?style=for-the-badge)](https://fluent-pitcher.lovable.app)

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-supported-0078D7?logo=microsoftedge&logoColor=white)
![Brave](https://img.shields.io/badge/Brave-supported-FB542B?logo=brave&logoColor=white)
![Offline](https://img.shields.io/badge/runs-100%25%20offline-2ea44f)
![Languages](https://img.shields.io/badge/languages-DE%20%7C%20EN-blue)
![Status](https://img.shields.io/badge/status-prototype-orange)

*Built as one of the cases at the **TUM Business Games, Heilbronn**.*

[Live Demo](https://fluent-pitcher.lovable.app) · [Features](#-features) · [Installation](#-installation) · [Usage](#-usage) · [Testing](#-testing)

</div>

---

## 📖 Table of Contents
- [About](#-about)
- [Features](#-features)
- [How It Works](#-how-it-works)
- [Tech Stack](#-tech-stack)
- [Installation](#-installation)
- [Usage](#-usage)
- [Offline & Privacy](#-offline--privacy)
- [Project Structure](#-project-structure)
- [Testing](#-testing)
- [Known Limitations](#-known-limitations)
- [Acknowledgements](#-acknowledgements)

---

## 💡 About

For most students, their first real pitch is in front of a professor, a jury or an investor. They rarely get a **safe place to practise** first and get honest, useful feedback.

**UnterPitch** is a pitch training space for students. We built it at the **TUM Business Games in Heilbronn**.

- 🌐 **Web app:** [fluent-pitcher.lovable.app](https://fluent-pitcher.lovable.app): the student-facing front end, built with Lovable
- 🧩 **Chrome extension** (this folder): the slide-aware rehearsal coach that runs **entirely on your device**

> **Our philosophy:** No grades. No scores. Just better pitches.

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 🧠 | **Content and delivery coaching** | Checks that you cover the problem, solution, market and ask. Looks at pace, pauses and filler words. |
| 🎯 | **Evidence-based tips** | Each tip links back to the moment in your recording it refers to, so you hear exactly what to fix. |
| ❓ | **Expert Q&A simulation** | Rehearse the kinds of questions experts and investors tend to ask. |
| 🇩🇪🇬🇧 | **German and English** | Handles German fillers like *"ähm"*, *"also"* and *"halt"*, and knows that *"um 12 Prozent"* isn't a filler. |
| 📊 | **Slide-aware analysis** | Key-point coverage per slide, transcript-to-slide alignment and delivery stats. |
| 📥 | **Deck import** | Imports Google Slides with one click, or upload a `.pptx`. |
| 🔒 | **Private by design** | Speech-to-text runs in the browser. Your audio never leaves your device. No login needed. |

---

## ⚙️ How It Works

```
 🎙️ Mic / audio file ──► Whisper (in-browser, WASM/WebGPU) ──► transcript ─┐
                                                                          ├──► Analysis ──► 📋 Feedback report
 📑 Google Slides / PPTX ──► Slide parser (JSZip) ──────────► slides ──────┘     • coverage per slide
                                                                                 • delivery stats
                                                                                 • audience questions
```

1. **Load your deck:** from an open Google Slides tab, or by uploading a PPTX.
2. **Rehearse:** live with your mic (← → to change slides), or upload a recording.
3. **Transcribe locally:** Whisper runs in a Web Worker on your machine.
4. **Get feedback:** see which points you covered or missed, your pace, fillers, long sentences and likely questions.

---

## 🛠 Tech Stack

- **Extension:** Chrome Manifest V3, cross-origin isolated for multi-threaded WASM
- **Speech-to-text:** [transformers.js](https://github.com/huggingface/transformers.js) (Whisper) on ONNX Runtime Web (WASM, with optional WebGPU)
- **Deck parsing:** [JSZip](https://stuk.github.io/jszip/) for PPTX
- **Analysis:** plain JavaScript (`analysis.js`), shared with the web prototype
- **LLM module (optional):** local models through Ollama / llama.cpp for feedback, Q&A and a rehearsal summary
- **Web front end:** [Lovable](https://fluent-pitcher.lovable.app)

---

## 🚀 Installation

> Works in **Chrome**, **Edge** and **Brave**.

1. Clone or download this repository.
2. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `extension` folder.
5. Pin **Rehearsal Coach** from the puzzle-piece menu.

---

## 🎯 Usage

| Where you are | What to do |
|---|---|
| **Google Slides tab** | Click the extension icon. The deck is imported automatically, using your Google session to export a PPTX. |
| **PowerPoint Online** | Use *File → Download a copy*, then upload the `.pptx`. |
| **Anywhere else** | Click the icon to open the coach in its own tab and upload a deck. |

Then pick a mode:
- 🎙️ **Record live:** speak and use ← → to move between slides
- 📁 **Upload audio:** analyse an existing recording
- ▶️ **Demo:** try it with the built-in sample rehearsal

> 💡 If transcription is slow or fails, switch to the **Tiny** speech model.

---

## 🔒 Offline & Privacy

- All code (transformers.js, ONNX Runtime WASM, JSZip) is **bundled** in `vendor/`. Nothing is loaded from a CDN.
- The speech model (~40–250 MB) downloads from Hugging Face **once** on first use and is then cached.
- After that, **everything works offline**.
- Google Slides import needs a connection. PPTX upload does not.
- **No accounts, no tracking, no audio uploads.**

---

## 📁 Project Structure

```
extension/
├── manifest.json     # MV3 manifest: cross-origin isolation, wasm-unsafe-eval CSP
├── background.js     # Opens the app tab, exports Google Slides decks
├── app.html          # UI
├── app.js            # UI logic, PPTX parsing, recording
├── analysis.js       # Coverage, alignment, delivery stats, questions (shared with ../prototype)
├── worker.js         # Local Whisper transcription (Web Worker)
├── sample.js         # Built-in demo rehearsal
├── icons/            # Extension icons (16 / 48 / 128)
└── vendor/           # Bundled transformers.js, ONNX Runtime WASM, JSZip
```

Related folders in the repository:
- [`../prototype`](../prototype): a standalone web version. Run `start.bat` or `python serve.py`, then open `http://127.0.0.1:8765`.
- [`../tests`](../tests): test cases and runner
- [`../README (1).md`](<../README (1).md>): the local LLM module (feedback, Q&A, summary)

---

## 🧪 Testing

There are **18 scenarios**: 10 German, 6 English and 2 edge cases. They cover skipped points, fast and slow speech, filler words, going back a slide, overly long sentences, Denglisch and silence.

```bash
node tests/run.mjs        # run all cases
node tests/run.mjs de-    # only German cases
```

`PASS` = as expected · `XFAIL` = known limitation · `FAIL` = regression

Each case also comes with a deck (`tests/decks/`), a script to read aloud (`tests/scripts/`) and, for English, a sample audio file (`tests/audio/`) for manual testing. See [`tests/README.md`](../tests/README.md) for details.

---

## ⚠️ Known Limitations

- **Synonyms and paraphrases** (e.g. *"neue Kunden"* vs *"Neukunden"*) may show as missed.
- **Number words** (*"zwölf"* vs *"12 %"*) may not match. Whisper usually writes digits, so this is often fine with live speech.
- This is a **prototype**, not a production release.

---

## 🙏 Acknowledgements

Thanks to the organisers of the **TUM Business Games Heilbronn** and to everyone who challenged our ideas along the way. 🙌

<div align="center">

**[🌐 Try UnterPitch →](https://fluent-pitcher.lovable.app)**

`#TUM` `#TUMHeilbronn` `#BusinessGames` `#EdTech` `#PitchTraining` `#PrivacyByDesign` `#Hackathon`

</div>

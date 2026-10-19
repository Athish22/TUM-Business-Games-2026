# Offline Rehearsal Coach — LLM Module

The LLM module of an offline, multilingual presentation rehearsal coach. It takes the **slide content** of a deck and the **timestamped transcript** of a rehearsal, and produces:

1. **Content feedback**: which key points of each slide were covered, missed or unclear, plus concrete suggestions.
2. **Audience Q&A simulation**: realistic questions an audience might ask, based on the deck and on what was actually said.
3. **A rehearsal summary**: a short, human-readable report in the language of the presentation (German, English, or mixed).

Everything runs **locally**. Model checkpoints are downloaded once during setup; after that, no data leaves the machine.

---

## Where this module fits

```
 Mic / video ──► Speech-to-text (Whisper) ──► transcript.json ─┐
                                                               │
 Deck (PPTX/PDF) ──► Slide parser ──────────► slides.json ─────┼──► LLM MODULE ──► feedback.json
                                                               │                   questions.json
 Delivery analysis (pace, fillers, pauses) ─► delivery.json ───┘                   report.md
```

This module does **not** do transcription or acoustic analysis. It consumes their outputs.

---

## Requirements

| Item | Minimum | Recommended |
|---|---|---|
| Python | 3.10 | 3.11+ |
| RAM | 16 GB | 32 GB |
| GPU | None (CPU works, slowly) | Apple Silicon (M-series) or NVIDIA GPU with 8 GB+ VRAM |
| Disk | ~6 GB per model | ~20 GB if you keep several models |

### Runtime backend (choose one)

- **Ollama** (default): simplest setup; runs a local server on `http://localhost:11434`.
- **llama.cpp** via `llama-cpp-python`: no server, loads a `.gguf` checkpoint directly in-process. Better for packaging into a single desktop app.

### Model choice

Use a quantized instruction-tuned model in the **3–9B parameter** range (Q4/Q5 quantization). Model families with good German and English output include **Qwen**, **Llama**, **Mistral** and **Gemma**. Check for their latest versions before you choose, because model releases change quickly.

> **Test German quality yourself.** Models differ a lot in how natural their German feedback sounds. Run the evaluation set in `eval/` before committing to one.

> **Licenses:** Check each model's license before any commercial use. Some restrict commercial use or require attribution.

---

## Installation

```bash
git clone <your-repo-url> rehearsal-coach
cd rehearsal-coach/llm
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt`:

```
pydantic>=2.0          # schema validation of LLM output
httpx>=0.27            # talks to the local Ollama server
llama-cpp-python>=0.3  # optional: in-process backend
jinja2>=3.1            # prompt templates
rich>=13.0             # CLI output
```

### Download the model (the only online step)

**Ollama:**
```bash
ollama pull <model-name>        # e.g. a ~7B Qwen or Llama instruct model
```

**llama.cpp:** download a `.gguf` file once and place it in `models/`:
```
models/
└── coach-model.Q4_K_M.gguf
```

After this step, disconnect from the internet. Everything below works offline.

---

## Configuration

`config.yaml`:

```yaml
backend: ollama                 # ollama | llamacpp
ollama:
  host: http://127.0.0.1:11434  # must be local
  model: <model-name>
llamacpp:
  model_path: models/coach-model.Q4_K_M.gguf
  n_ctx: 8192
  n_gpu_layers: -1              # -1 = offload all layers to GPU if available

generation:
  temperature: 0.3              # low = consistent, factual feedback
  max_tokens: 2048
  seed: 42                      # reproducible results between runs

language: auto                  # auto | de | en — language of the feedback
qa:
  num_questions: 5
  difficulty: mixed             # easy | mixed | critical
```

The client **refuses to start** if `ollama.host` points to anything other than `localhost` or `127.0.0.1`. This guards against data accidentally leaving the machine.

---

## Input formats

### `slides.json` (from the slide parser)
```json
{
  "deck_title": "Q3 Ergebnisse",
  "slides": [
    {
      "index": 1,
      "title": "Umsatzentwicklung",
      "text": "Umsatz +12% ggü. Vorjahr; Treiber: Neukunden DACH",
      "notes": "Speaker notes, if any"
    }
  ]
}
```

### `transcript.json` (from Whisper)
```json
{
  "language": "de",
  "segments": [
    { "start": 0.0, "end": 4.2, "text": "Guten Morgen, heute geht es um unsere Q3-Zahlen.", "slide": 1 }
  ]
}
```
`slide` comes from slide-change timestamps recorded during the rehearsal. If it is missing, the module aligns segments to slides by content similarity.

### `delivery.json` (optional, from the delivery analyser)
```json
{ "wpm": 148, "filler_count": 23, "fillers": {"äh": 14, "also": 9}, "long_pauses": 3,
  "slide_durations": {"1": 62.5, "2": 140.0} }
```
When provided, the LLM uses it only to word the summary. All numbers are computed outside the LLM.

---

## Usage

### Command line
```bash
# Full analysis: feedback + questions + report
python -m coach_llm analyze \
  --slides data/slides.json \
  --transcript data/transcript.json \
  --delivery data/delivery.json \
  --out results/

# Q&A simulation only
python -m coach_llm questions --slides data/slides.json --transcript data/transcript.json -n 8

# Check that the backend is local and the model loads
python -m coach_llm doctor
```

### Python
```python
from coach_llm import Coach, load_inputs

coach = Coach.from_config("config.yaml")
slides, transcript, delivery = load_inputs("data/")

feedback = coach.slide_feedback(slides, transcript)      # list[SlideFeedback]
questions = coach.audience_questions(slides, transcript)  # list[Question]
report = coach.summary(feedback, delivery)                # str (Markdown)
```

---

## Output formats

### `feedback.json`
```json
[
  {
    "slide": 1,
    "covered_points": ["Umsatzwachstum 12%"],
    "missed_points": ["Treiber: Neukunden DACH"],
    "unclear_statements": [],
    "suggestion": "Nenne den Haupttreiber des Wachstums explizit, bevor du zur nächsten Folie gehst.",
    "confidence": 0.82
  }
]
```

### `questions.json`
```json
[
  {
    "question": "Wie nachhaltig ist das Wachstum, wenn es vor allem aus Neukunden kommt?",
    "related_slides": [1],
    "type": "critical",
    "why_likely": "The growth driver was on the slide but not explained."
  }
]
```

### `report.md`
A short report written for the presenter: strengths, the three most important fixes, and a per-slide table.

---

## How it works

### 1. Chunking
Each slide is processed **separately**, with its slide text plus only the transcript segments aligned to it. This keeps prompts small enough for 8k-context models and makes feedback specific.

### 2. Structured output
Every LLM call must return JSON matching a **Pydantic schema** (`coach_llm/schemas.py`):
- With Ollama, the JSON schema is passed in the request's `format` field.
- With llama.cpp, a grammar generated from the same schema constrains the output.

Invalid output is retried once with the validation error included in the prompt. If it fails again, the slide is marked `"status": "analysis_failed"` rather than crashing the run.

### 3. Prompt templates
Templates live in `prompts/` as Jinja2 files, one per task and language:
```
prompts/
├── slide_feedback.de.j2
├── slide_feedback.en.j2
├── questions.de.j2
├── questions.en.j2
└── summary.{de,en}.j2
```
Rules built into every template:
- Judge only against the slide content and transcript; **never invent facts** about the topic.
- Quote the presenter's own words when pointing out an unclear statement.
- Treat mixed German/English terms (e.g. "Forecast", "Stakeholder") as normal, not as errors.
- Keep suggestions concrete and actionable, one per slide.

### 4. Language handling
`language: auto` uses the transcript's detected language. For mixed speech, the feedback language follows the dominant language. You can override it per run with `--lang de|en`.

### 5. Division of labour
The LLM handles **meaning**: coverage, clarity, and likely questions. Countable metrics such as pace, filler counts and timings come from deterministic code. The LLM never computes them, because small models are unreliable at counting.

---

## Project structure

```
llm/
├── coach_llm/
│   ├── __init__.py
│   ├── __main__.py        # CLI entry point
│   ├── backends/
│   │   ├── base.py        # common interface: generate(prompt, schema) -> dict
│   │   ├── ollama.py      # local HTTP client, localhost-only check
│   │   └── llamacpp.py    # in-process GGUF backend
│   ├── align.py           # transcript-to-slide alignment fallback
│   ├── schemas.py         # Pydantic models for all outputs
│   ├── coach.py           # slide_feedback / audience_questions / summary
│   └── report.py          # Markdown report rendering
├── prompts/               # Jinja2 templates per task and language
├── models/                # local .gguf checkpoints (git-ignored)
├── eval/                  # sample decks + transcripts + expected findings
├── tests/
├── config.yaml
└── requirements.txt
```

---

## Keeping it offline

- **Backend check:** the client only accepts `localhost` / `127.0.0.1` endpoints.
- **No telemetry:** this module contains no analytics or update checks.
- **Other libraries:** if you add Hugging Face tooling elsewhere in the project, set `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`.
- **Verify:** run a full analysis with networking disabled (airplane mode or a firewall rule). `python -m coach_llm doctor --offline-test` blocks outbound sockets during a test run and fails if anything tries to connect.
- **Storage:** results are written only to the `--out` folder. Delete the folder to remove all traces of a rehearsal.

---

## Evaluation

`eval/` holds a few sample rehearsals in German, English and mixed language, each with a list of points the presenter deliberately skipped.

```bash
python -m coach_llm eval --model <model-name>
```

This reports:
- **Missed-point recall:** did the model catch the skipped points?
- **False alarms:** did it flag points that were actually covered?
- **Schema failures:** how often the output had to be retried.
- **Runtime per slide.**

Use this to compare models and quantization levels on your own hardware.

---

## Performance tips

- Prefer Q4_K_M quantization as the default speed/quality trade-off; try Q5 if feedback quality is weak.
- Process slides in sequence and stream results to the UI so the user sees progress.
- Cache results per (slide text, transcript segment) hash, so re-running after one changed slide is fast.
- On CPU-only machines, use a smaller model for questions and a larger one for feedback only.

---

## Roadmap

- [ ] Compare rehearsal runs ("run 1 vs run 5") per slide
- [ ] Spoken Q&A: read questions aloud with a local TTS (e.g. Piper) and evaluate the spoken answers
- [ ] Non-native speaker mode with clarity-focused feedback
- [ ] Additional languages beyond German and English
- [ ] Optional fine-tuning (LoRA) on collected, consented rehearsal feedback

---

## License

Code: choose a license (e.g. MIT) for your repository.
Models: governed by their own licenses. See each model's model card.

// Speech-to-text in a Web Worker so the UI stays responsive.
// Whisper runs locally in the browser (WASM, optionally WebGPU). Audio never leaves the device;
// only the model files are downloaded once and then cached by the browser.
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';

let asr = null;
let loadedKey = null;

self.onmessage = async (e) => {
  const { model, device, audio, language } = e.data;
  try {
    const key = model + '|' + device;
    if (!asr || loadedKey !== key) {
      self.postMessage({ type: 'status', msg: 'Loading speech model (first time only)…' });
      const opts = { device, progress_callback: (p) => self.postMessage({ type: 'progress', p }) };
      if (device === 'webgpu') opts.dtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' };
      asr = await pipeline('automatic-speech-recognition', model, opts);
      loadedKey = key;
    }
    self.postMessage({ type: 'status', msg: 'Transcribing locally…' });
    const genOpts = { task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: true };
    if (language) genOpts.language = language;
    const out = await asr(audio, genOpts);
    self.postMessage({ type: 'done', out });
  } catch (err) {
    self.postMessage({ type: 'error', msg: String((err && err.message) || err) });
  }
};

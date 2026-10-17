// 知跃 · Developed by gulinyue. Pure audio segmentation and cancellable ASR queue.
export function encodePcm16(samples) {
  const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) { const value = Math.max(-1, Math.min(1, samples[i])); view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true); }
  return bytes;
}
export class VoiceSegmenter {
  constructor({ onSegment, onLevel = () => {}, silenceMs = 1100, threshold = .008, sampleRate = 16000, maxSegmentMs = 20000 }) {
    Object.assign(this, { onSegment, onLevel, silenceMs, threshold, sampleRate, maxSamples: sampleRate * maxSegmentMs / 1000 }); this.reset();
  }
  reset() { this.active = false; this.frames = []; this.preRoll = []; this.samples = 0; this.voiced = 0; this.segmentVoiced = 0; this.silence = 0; }
  push(raw) {
    if (!(raw instanceof Float32Array) || !raw.length) return;
    const frame = raw.slice();
    let power = 0; for (const value of frame) power += value * value;
    const rms = Math.sqrt(power / frame.length); this.onLevel(rms);
    const voiced = rms >= this.threshold;
    if (!this.active && !voiced) { this.preRoll.push(frame); while (this.preRoll.length > 3) this.preRoll.shift(); return; }
    if (!this.active) { this.active = true; this.frames = this.preRoll; this.samples = this.frames.reduce((n, item) => n + item.length, 0); this.preRoll = []; }
    this.frames.push(frame); this.samples += frame.length;
    if (voiced) { this.voiced += frame.length; this.segmentVoiced += frame.length; this.silence = 0; } else this.silence += frame.length;
    if (this.silence >= this.sampleRate * this.silenceMs / 1000) { if (this.voiced >= this.sampleRate * .25) this.emit(true); this.reset(); }
    else if (this.samples >= this.maxSamples) { if (this.voiced >= this.sampleRate * .25) this.emit(false); else this.reset(); }
  }
  emit(final) {
    // Retain 150 ms of trailing silence, without making the remote ASR process
    // the whole local pause used to decide that a question has ended.
    const trim = final ? Math.max(0, this.silence - Math.round(this.sampleRate * .15)) : 0;
    const samples = new Float32Array(Math.max(0, this.samples - trim)); let position = 0;
    for (const frame of this.frames) { const part = frame.subarray(0, Math.max(0, samples.length - position)); samples.set(part, position); position += part.length; }
    const audio = this.segmentVoiced ? encodePcm16(samples) : new Uint8Array();
    this.frames = []; this.samples = 0; this.segmentVoiced = 0;
    this.onSegment({ audio, final });
  }
}
export class TranscriptionQueue {
  constructor({ transcribe, onText, onError, onPending = () => {} }) { Object.assign(this, { transcribe, onText, onError, onPending }); this.active = true; this.pending = 0; this.text = ''; this.tail = Promise.resolve(); }
  push(segment) {
    if (!this.active) return;
    if (this.pending >= 4) { this.stop(); this.onError(new Error('语音转写跟不上收音速度，请切换更快的服务后重新开始。')); return; }
    this.pending++; this.onPending(this.pending);
    this.tail = this.tail.then(async () => {
      if (!this.active) return;
      const result = segment.audio.byteLength >= 3200 ? await this.transcribe(segment.audio) : '';
      if (!this.active) return;
      this.text = (this.text + (this.text && result ? ' ' : '') + result).slice(0, 12000);
      this.onText(this.text, segment.final);
      if (segment.final) this.text = '';
    }).catch((error) => { if (this.active) { this.stop(); this.onError(error); } }).finally(() => { if (this.active) { this.pending--; this.onPending(this.pending); } });
  }
  stop() { this.active = false; this.text = ''; this.pending = 0; this.onPending(0); }
}

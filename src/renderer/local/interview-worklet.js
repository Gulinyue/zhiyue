// 知跃 · Developed by gulinyue. 100 ms mono frames; no audio playback.
class InterviewAudioProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.frame = new Float32Array(1600); this.offset = 0; }
  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) for (let i = 0; i < channels[0].length; i++) {
      let value = 0; for (const channel of channels) value += channel[i] || 0;
      this.frame[this.offset++] = value / channels.length;
      if (this.offset === this.frame.length) { this.port.postMessage(this.frame, [this.frame.buffer]); this.frame = new Float32Array(1600); this.offset = 0; }
    }
    return true;
  }
}
registerProcessor('zhiyue-interview-audio', InterviewAudioProcessor);

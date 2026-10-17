// 知跃 · Developed by gulinyue. Only system audio is consumed; video tracks stop immediately.
import { VoiceSegmenter } from '../../shared/interview-audio.mjs';
export class SystemAudioCapture {
  constructor(options) { this.options = options; this.stopped = false; this.stream = null; this.context = null; }
  async start() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (this.stopped) { stream.getTracks().forEach((track) => track.stop()); return false; }
    this.stream = stream; stream.getVideoTracks().forEach((track) => track.stop());
    const tracks = stream.getAudioTracks();
    if (!tracks.length) throw new Error('未获取到系统声音，请检查系统音频设备后重试。');
    for (const track of tracks) track.addEventListener('ended', () => { if (!this.stopped) this.options.onError(new Error('系统收音已中断，请重新开始面试。')); }, { once: true });
    const context = this.context = new AudioContext({ sampleRate: 16000 });
    if (context.sampleRate !== 16000) throw new Error('当前音频设备不支持 16 kHz 收音。');
    await context.audioWorklet.addModule(new URL('./assets/interview-worklet.js', window.location.href));
    if (this.stopped) return false;
    const segmenter = this.segmenter = new VoiceSegmenter({ ...this.options, maxSegmentMs: this.options.speedMode === 'fast' ? 6000 : 20000 });
    const source = this.source = context.createMediaStreamSource(new MediaStream(tracks));
    const worklet = this.worklet = new AudioWorkletNode(context, 'zhiyue-interview-audio');
    worklet.port.onmessage = ({ data }) => { if (!this.stopped) segmenter.push(data); };
    const silent = this.silent = context.createGain(); silent.gain.value = 0;
    source.connect(worklet); worklet.connect(silent); silent.connect(context.destination);
    await context.resume();
    return !this.stopped;
  }
  stop() {
    this.stopped = true; this.segmenter?.reset();
    if (this.worklet) this.worklet.port.onmessage = null;
    this.source?.disconnect(); this.worklet?.disconnect(); this.silent?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== 'closed') void this.context.close();
  }
}

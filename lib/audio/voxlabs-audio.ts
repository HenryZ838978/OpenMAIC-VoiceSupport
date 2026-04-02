/**
 * VoxLabs Browser Audio Engine
 *
 * PTT-mode: capture mic as PCM int16 @ 16kHz only while recording,
 * play TTS PCM int16 @ 44.1kHz from server when idle.
 * No AEC needed — never records and plays simultaneously.
 */

const MIC_SAMPLE_RATE = 16_000;
const SPK_SAMPLE_RATE = 44_100;

export class VoxLabsAudio {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private nextPlayTime = 0;

  onMicData?: (pcm: ArrayBuffer) => void;

  async prepare(): Promise<void> {
    if (this.audioCtx) return;
    this.audioCtx = new AudioContext({ sampleRate: SPK_SAMPLE_RATE });
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }

  async startMic(): Promise<void> {
    await this.prepare();
    if (this.micStream) return;

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: MIC_SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const micCtx = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
    this.micSource = micCtx.createMediaStreamSource(this.micStream);

    // ScriptProcessorNode for raw PCM access (AudioWorklet would be cleaner but
    // requires a separate file; this is simpler for the integration)
    this.micProcessor = micCtx.createScriptProcessor(2048, 1, 1);
    this.micProcessor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.onMicData?.(int16.buffer);
    };

    this.micSource.connect(this.micProcessor);
    this.micProcessor.connect(micCtx.destination);
  }

  stopMic(): void {
    if (this.micProcessor) {
      this.micProcessor.disconnect();
      this.micProcessor = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  /**
   * Enqueue PCM int16 mono @ 44.1kHz for gapless playback.
   */
  playAudio(pcmBuffer: ArrayBuffer): void {
    if (!this.audioCtx || pcmBuffer.byteLength < 2) return;

    const int16 = new Int16Array(pcmBuffer);
    const sampleCount = int16.length;
    const audioBuffer = this.audioCtx.createBuffer(1, sampleCount, SPK_SAMPLE_RATE);
    const channel = audioBuffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i++) {
      channel[i] = int16[i] / 32768;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioCtx.destination);

    const now = this.audioCtx.currentTime;
    const startTime = Math.max(now, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + audioBuffer.duration;
  }

  /**
   * Stop all queued audio immediately (barge-in).
   */
  clearPlayback(): void {
    this.nextPlayTime = 0;
    // Recreate AudioContext to flush all scheduled sources
    if (this.audioCtx) {
      const oldCtx = this.audioCtx;
      this.audioCtx = new AudioContext({ sampleRate: SPK_SAMPLE_RATE });
      oldCtx.close().catch(() => {});
    }
  }

  stop(): void {
    this.stopMic();
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.nextPlayTime = 0;
  }
}

/**
 * VoxLabs Voice WebSocket Client
 *
 * Mirrors the Swift WebSocketManager protocol from VoxLabsAgent:
 *   - Binary messages = PCM audio (16kHz int16 mono upload, 44.1kHz int16 mono download)
 *   - JSON text messages = control signalling
 *
 * Client → Server:
 *   { type: "ptt_start" }     — User pressed Hold-to-Talk
 *   { type: "ptt_end" }       — User released Hold-to-Talk
 *   { type: "text_input", text }  — Text fallback input
 *   { type: "reset" }         — Reset conversation
 *   { type: "session_config", system_prompt, context, max_tokens }
 *   { type: "update_context", context }
 *
 * Server → Client:
 *   { type: "ready", version }
 *   { type: "state", state: "idle"|"listening"|"thinking"|"speaking" }
 *   { type: "asr", text, latency_ms, turn }
 *   { type: "llm_sentence", text, sentence_idx, latency_ms }
 *   { type: "llm", text }
 *   { type: "metrics", asr_ms, rag_ms, llm_ms, tts_ttfa_ms, first_response_ms }
 *   { type: "barge_in" }
 *   { type: "system_message", text }
 *   { type: "error", message }
 *   { type: "reset_ack" }
 *   { type: "session_end", reason }
 *   { type: "session_config_ack", success }
 *   { type: "update_context_ack", success }
 */

export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';

export interface VoxLabsMetrics {
  asr_ms: number;
  rag_ms: number;
  llm_ms: number;
  tts_ttfa_ms: number;
  first_response_ms: number;
}

export interface VoxLabsCallbacks {
  onConnected?: (version: string) => void;
  onDisconnected?: (reason: string) => void;
  onStateChange?: (state: AgentState) => void;
  onASR?: (text: string, latencyMs?: number, turn?: number) => void;
  onLLMSentence?: (text: string, sentenceIdx: number, latencyMs?: number) => void;
  onLLMComplete?: (text: string) => void;
  onMetrics?: (metrics: VoxLabsMetrics) => void;
  onAudio?: (pcmData: ArrayBuffer) => void;
  onBargeIn?: () => void;
  onError?: (message: string) => void;
  onSystemMessage?: (text: string) => void;
  onResetAck?: () => void;
  onSessionEnd?: (reason: string) => void;
  onSessionConfigAck?: (success: boolean) => void;
  onUpdateContextAck?: (success: boolean) => void;
}

export class VoxLabsClient {
  private ws: WebSocket | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private callbacks: VoxLabsCallbacks = {};
  private _url: string = '';

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get url(): string {
    return this._url;
  }

  connect(url: string, callbacks: VoxLabsCallbacks): void {
    this.disconnect();
    this._url = url;
    this.callbacks = callbacks;

    try {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.startPing();
      };

      this.ws.onclose = (e) => {
        this.stopPing();
        this.callbacks.onDisconnected?.(e.reason || 'Connection closed');
      };

      this.ws.onerror = () => {
        this.callbacks.onDisconnected?.('WebSocket error');
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.callbacks.onAudio?.(event.data);
        } else if (typeof event.data === 'string') {
          this.handleJSON(event.data);
        }
      };
    } catch {
      this.callbacks.onDisconnected?.('Failed to create WebSocket');
    }
  }

  disconnect(): void {
    this.stopPing();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }

  sendPTTStart(): void {
    this.sendJSON({ type: 'ptt_start' });
  }

  sendPTTEnd(): void {
    this.sendJSON({ type: 'ptt_end' });
  }

  sendAudio(data: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  sendTextInput(text: string): void {
    this.sendJSON({ type: 'text_input', text });
  }

  sendReset(): void {
    this.sendJSON({ type: 'reset' });
  }

  sendSessionConfig(config: {
    system_prompt?: string;
    context?: string;
    max_tokens?: number;
  }): void {
    this.sendJSON({
      type: 'session_config',
      ...config,
    });
  }

  sendUpdateContext(context: string): void {
    this.sendJSON({ type: 'update_context', context });
  }

  private sendJSON(obj: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private handleJSON(raw: string): void {
    try {
      const json = JSON.parse(raw);
      const type = json.type as string;

      switch (type) {
        case 'ready':
          this.callbacks.onConnected?.(json.version ?? '');
          break;
        case 'state':
          this.callbacks.onStateChange?.(json.state ?? 'idle');
          break;
        case 'asr':
          if (json.text) {
            this.callbacks.onASR?.(json.text, json.latency_ms, json.turn);
          }
          break;
        case 'llm_sentence':
          this.callbacks.onLLMSentence?.(json.text ?? '', json.sentence_idx ?? 0, json.latency_ms);
          break;
        case 'llm':
          this.callbacks.onLLMComplete?.(json.text ?? '');
          break;
        case 'metrics':
          this.callbacks.onMetrics?.({
            asr_ms: json.asr_ms ?? 0,
            rag_ms: json.rag_ms ?? 0,
            llm_ms: json.llm_ms ?? 0,
            tts_ttfa_ms: json.tts_ttfa_ms ?? 0,
            first_response_ms: json.first_response_ms ?? 0,
          });
          break;
        case 'barge_in':
          this.callbacks.onBargeIn?.();
          break;
        case 'system_message':
          this.callbacks.onSystemMessage?.(json.text ?? '');
          break;
        case 'error':
          this.callbacks.onError?.(json.message ?? 'Unknown error');
          break;
        case 'reset_ack':
          this.callbacks.onResetAck?.();
          break;
        case 'session_end':
          this.callbacks.onSessionEnd?.(json.reason ?? '');
          break;
        case 'session_config_ack':
          this.callbacks.onSessionConfigAck?.(Boolean(json.success));
          break;
        case 'update_context_ack':
          this.callbacks.onUpdateContextAck?.(Boolean(json.success));
          break;
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendJSON({ type: 'ping' });
      }
    }, 15_000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

/** Singleton instance for the app */
export const voxlabsClient = new VoxLabsClient();

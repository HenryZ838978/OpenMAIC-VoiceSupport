'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { VoxLabsClient, type AgentState, type VoxLabsMetrics } from '@/lib/audio/voxlabs-client';
import { VoxLabsAudio } from '@/lib/audio/voxlabs-audio';

const DEFAULT_WS_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_VOXLABS_WS_URL ?? 'ws://localhost:3000/ws/voice')
    : '';

export interface UseVoxLabsVoiceOptions {
  /** Override the WebSocket URL (defaults to NEXT_PUBLIC_VOXLABS_WS_URL) */
  wsUrl?: string;
  /** Optional session-level system prompt sent after connect */
  systemPrompt?: string;
  /** Optional dynamic course context sent after connect and on updates */
  context?: string;
  /** Optional max token limit for realtime assistant replies */
  maxTokens?: number;
  /** Called when ASR produces transcription text */
  onTranscription?: (text: string) => void;
  /** Called with full LLM response text when complete */
  onResponse?: (text: string) => void;
  /** Called with streaming LLM sentence fragments */
  onResponseStream?: (text: string, sentenceIdx: number) => void;
  /** Called on any error */
  onError?: (message: string) => void;
}

export interface VoxLabsSessionTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
}

export interface VoxLabsSessionSnapshot {
  turns: VoxLabsSessionTurn[];
  pendingResponseText: string;
}

export interface UseVoxLabsVoiceReturn {
  /** Whether currently connected to the voice server */
  isConnected: boolean;
  /** Agent pipeline state */
  agentState: AgentState;
  /** Whether PTT is currently recording */
  isRecording: boolean;
  /** Latest latency metrics */
  metrics: VoxLabsMetrics | null;
  /** Server version string */
  serverVersion: string;
  /** Accumulated LLM response text (streaming) */
  currentResponseText: string;
  /** Side-session transcript for the current hand-raise conversation */
  sessionTurns: VoxLabsSessionTurn[];
  /** Connect to voice server */
  connect: () => void;
  /** Disconnect from voice server */
  disconnect: () => void;
  /** Begin PTT recording */
  pttPress: () => void;
  /** End PTT recording */
  pttRelease: () => void;
  /** Send text input directly */
  sendText: (text: string) => void;
  /** Reset conversation */
  resetSession: () => void;
  /** Current transcript + pending stream preview for handoff */
  getSessionSnapshot: () => VoxLabsSessionSnapshot;
  /** Clear the side-session transcript after handoff */
  clearSession: () => void;
}

export function useVoxLabsVoice(options: UseVoxLabsVoiceOptions = {}): UseVoxLabsVoiceReturn {
  const { wsUrl, systemPrompt, context, maxTokens, onTranscription, onResponse, onResponseStream, onError } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [metrics, setMetrics] = useState<VoxLabsMetrics | null>(null);
  const [serverVersion, setServerVersion] = useState('');
  const [currentResponseText, setCurrentResponseText] = useState('');
  const [sessionTurns, setSessionTurns] = useState<VoxLabsSessionTurn[]>([]);

  const clientRef = useRef<VoxLabsClient | null>(null);
  const audioRef = useRef<VoxLabsAudio | null>(null);
  const turnCounterRef = useRef(0);
  const sessionTurnsRef = useRef<VoxLabsSessionTurn[]>([]);
  const currentResponseTextRef = useRef('');
  const latestSessionConfigRef = useRef({
    systemPrompt: systemPrompt?.trim() || '',
    context: context?.trim() || '',
    maxTokens,
  });
  const lastSentStaticConfigRef = useRef<string>('');
  const lastSentContextRef = useRef<string>('');

  // Keep callback refs fresh
  const onTranscriptionRef = useRef(onTranscription);
  const onResponseRef = useRef(onResponse);
  const onResponseStreamRef = useRef(onResponseStream);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTranscriptionRef.current = onTranscription;
    onResponseRef.current = onResponse;
    onResponseStreamRef.current = onResponseStream;
    onErrorRef.current = onError;
  }, [onTranscription, onResponse, onResponseStream, onError]);

  useEffect(() => {
    currentResponseTextRef.current = currentResponseText;
  }, [currentResponseText]);

  useEffect(() => {
    latestSessionConfigRef.current = {
      systemPrompt: systemPrompt?.trim() || '',
      context: context?.trim() || '',
      maxTokens,
    };
  }, [context, maxTokens, systemPrompt]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      audioRef.current?.stop();
    };
  }, []);

  const appendSessionTurn = useCallback((role: VoxLabsSessionTurn['role'], text: string) => {
    const normalized = text.trim();
    if (!normalized) return;

    const nextTurn: VoxLabsSessionTurn = {
      id: `${role}-${Date.now()}-${turnCounterRef.current++}`,
      role,
      text: normalized,
      createdAt: Date.now(),
    };
    sessionTurnsRef.current = [...sessionTurnsRef.current, nextTurn];
    setSessionTurns(sessionTurnsRef.current);
  }, []);

  const clearSession = useCallback(() => {
    sessionTurnsRef.current = [];
    currentResponseTextRef.current = '';
    turnCounterRef.current = 0;
    setSessionTurns([]);
    setCurrentResponseText('');
    setMetrics(null);
  }, []);

  const getSessionSnapshot = useCallback(
    (): VoxLabsSessionSnapshot => ({
      turns: [...sessionTurnsRef.current],
      pendingResponseText: currentResponseTextRef.current.trim(),
    }),
    [],
  );

  const connect = useCallback(() => {
    const url = wsUrl ?? DEFAULT_WS_URL;
    if (!url) {
      onErrorRef.current?.('No VoxLabs server URL configured');
      return;
    }

    if (!clientRef.current) clientRef.current = new VoxLabsClient();
    if (!audioRef.current) audioRef.current = new VoxLabsAudio();

    const audio = audioRef.current;
    const client = clientRef.current;

    // Wire mic data to WS
    audio.onMicData = (pcm) => client.sendAudio(pcm);

    client.connect(url, {
      onConnected: (version) => {
        setIsConnected(true);
        setServerVersion(version);
        setAgentState('idle');
        audio.prepare().catch(() => {});
        const initialConfig = latestSessionConfigRef.current;
        const hasSessionConfig =
          Boolean(initialConfig.systemPrompt) ||
          Boolean(initialConfig.context) ||
          typeof initialConfig.maxTokens === 'number';
        if (hasSessionConfig) {
          client.sendSessionConfig({
            system_prompt: initialConfig.systemPrompt || undefined,
            context: initialConfig.context || undefined,
            max_tokens: initialConfig.maxTokens,
          });
          lastSentStaticConfigRef.current = JSON.stringify({
            systemPrompt: initialConfig.systemPrompt,
            maxTokens: initialConfig.maxTokens,
          });
          lastSentContextRef.current = initialConfig.context;
        }
      },
      onDisconnected: (reason) => {
        setIsConnected(false);
        setAgentState('idle');
        setIsRecording(false);
        audio.stop();
        lastSentStaticConfigRef.current = '';
        lastSentContextRef.current = '';
        if (reason !== 'Connection closed') {
          onErrorRef.current?.(`Disconnected: ${reason}`);
        }
      },
      onStateChange: (state) => {
        setAgentState(state);
        if (state === 'idle') {
          setCurrentResponseText('');
        }
      },
      onASR: (text, _latencyMs, _turn) => {
        appendSessionTurn('user', text);
        onTranscriptionRef.current?.(text);
      },
      onLLMSentence: (text, sentenceIdx) => {
        setCurrentResponseText((prev) => (sentenceIdx === 0 ? text : prev + text));
        onResponseStreamRef.current?.(text, sentenceIdx);
      },
      onLLMComplete: (text) => {
        appendSessionTurn('assistant', text);
        setCurrentResponseText('');
        onResponseRef.current?.(text);
      },
      onMetrics: (m) => setMetrics(m),
      onAudio: (pcm) => audio.playAudio(pcm),
      onBargeIn: () => audio.clearPlayback(),
      onError: (msg) => onErrorRef.current?.(msg),
      onSystemMessage: () => {},
      onResetAck: () => {
        setCurrentResponseText('');
        setMetrics(null);
      },
      onSessionEnd: () => {
        setAgentState('idle');
      },
    });
  }, [appendSessionTurn, wsUrl]);

  useEffect(() => {
    if (!isConnected || !clientRef.current) return;
    const nextConfig = latestSessionConfigRef.current;
    const staticSerialized = JSON.stringify({
      systemPrompt: nextConfig.systemPrompt,
      maxTokens: nextConfig.maxTokens,
    });
    if (staticSerialized !== lastSentStaticConfigRef.current) {
      clientRef.current.sendSessionConfig({
        system_prompt: nextConfig.systemPrompt || undefined,
        context: nextConfig.context || undefined,
        max_tokens: nextConfig.maxTokens,
      });
      lastSentStaticConfigRef.current = staticSerialized;
      lastSentContextRef.current = nextConfig.context;
      return;
    }

    if (nextConfig.context && nextConfig.context !== lastSentContextRef.current) {
      clientRef.current.sendUpdateContext(nextConfig.context);
      lastSentContextRef.current = nextConfig.context;
    }
  }, [context, isConnected, maxTokens, systemPrompt]);

  const disconnect = useCallback(() => {
    if (isRecording) {
      audioRef.current?.stopMic();
      setIsRecording(false);
      clientRef.current?.sendPTTEnd();
    }
    clientRef.current?.disconnect();
    audioRef.current?.stop();
    setIsConnected(false);
    setAgentState('idle');
  }, [isRecording]);

  const pttPress = useCallback(() => {
    if (!isConnected || isRecording) return;

    // Stop any playing TTS
    audioRef.current?.clearPlayback();

    setIsRecording(true);
    clientRef.current?.sendPTTStart();
    audioRef.current?.startMic().catch((err) => {
      onErrorRef.current?.(`Mic error: ${err}`);
      setIsRecording(false);
    });
  }, [isConnected, isRecording]);

  const pttRelease = useCallback(() => {
    if (!isRecording) return;
    audioRef.current?.stopMic();
    setIsRecording(false);
    clientRef.current?.sendPTTEnd();
  }, [isRecording]);

  const sendText = useCallback(
    (text: string) => {
      if (!isConnected) return;
      clientRef.current?.sendTextInput(text);
    },
    [isConnected],
  );

  const resetSession = useCallback(() => {
    clientRef.current?.sendReset();
    clearSession();
  }, [clearSession]);

  return {
    isConnected,
    agentState,
    isRecording,
    metrics,
    serverVersion,
    currentResponseText,
    sessionTurns,
    connect,
    disconnect,
    pttPress,
    pttRelease,
    sendText,
    resetSession,
    getSessionSnapshot,
    clearSession,
  };
}

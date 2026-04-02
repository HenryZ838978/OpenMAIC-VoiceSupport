'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useVoxLabsVoice,
  type VoxLabsSessionSnapshot,
  type VoxLabsSessionTurn,
} from '@/lib/hooks/use-voxlabs-voice';
import { VoxLabsPTTButton } from './voxlabs-ptt-button';
import { toast } from 'sonner';
import Image from 'next/image';
import { useSettingsStore } from '@/lib/store/settings';
import { REALTIME_ASSISTANT_PROVIDERS } from '@/lib/realtime-assistant/constants';
import { resolveRealtimeAssistantConnection } from '@/lib/realtime-assistant/connection';

interface VoxLabsVoicePanelProps {
  /** Called when a side-session begins occupying the voice floor */
  onSessionStart?: () => void;
  /** Called when the side-session ends and is ready for handoff */
  onSessionEnd?: (snapshot: VoxLabsSessionSnapshot) => void | Promise<void>;
  /** Optional observer for the session transcript */
  onTranscriptChange?: (turns: VoxLabsSessionTurn[]) => void;
  assistantSystemPrompt?: string;
  assistantContext?: string;
  assistantMaxTokens?: number;
  className?: string;
  disabled?: boolean;
  sessionState?: 'idle' | 'handRaiseActive' | 'briefing' | 'handoff';
}

/**
 * Self-contained VoxLabs Voice Interaction Panel.
 *
 * Manages its own WebSocket connection to the VoxLabs voice server,
 * exposes PTT (Hold-to-Talk) recording, streams audio to the backend,
 * and plays back TTS audio responses.
 *
 * Usage: mount anywhere in the UI. The onTranscription callback receives
 * the user's speech text, which the parent can inject into the existing
 * OpenMAIC chat/discussion pipeline via chatAreaRef.sendMessage().
 */
export function VoxLabsVoicePanel({
  onSessionStart,
  onSessionEnd,
  onTranscriptChange,
  assistantSystemPrompt,
  assistantContext,
  assistantMaxTokens,
  className,
  disabled,
  sessionState = 'idle',
}: VoxLabsVoicePanelProps) {
  const onSessionStartRef = useRef(onSessionStart);
  const onSessionEndRef = useRef(onSessionEnd);
  const onTranscriptChangeRef = useRef(onTranscriptChange);
  const wasConnectedRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  useEffect(() => {
    onSessionStartRef.current = onSessionStart;
    onSessionEndRef.current = onSessionEnd;
    onTranscriptChangeRef.current = onTranscriptChange;
  }, [onSessionEnd, onSessionStart, onTranscriptChange]);

  const handleError = useCallback((msg: string) => {
    toast.error(`助教连接异常: ${msg}`);
  }, []);

  const realtimeAssistantProviderId = useSettingsStore((state) => state.realtimeAssistantProviderId);
  const realtimeAssistantProvidersConfig = useSettingsStore(
    (state) => state.realtimeAssistantProvidersConfig,
  );
  const assistantProvider = REALTIME_ASSISTANT_PROVIDERS[realtimeAssistantProviderId];
  const resolvedConnection = resolveRealtimeAssistantConnection(
    realtimeAssistantProviderId,
    realtimeAssistantProvidersConfig[realtimeAssistantProviderId],
    process.env.NEXT_PUBLIC_VOXLABS_WS_URL,
  );
  const voice = useVoxLabsVoice({
    wsUrl: resolvedConnection?.wsUrl,
    systemPrompt: assistantSystemPrompt,
    context: assistantContext,
    maxTokens: assistantMaxTokens,
    onError: handleError,
  });
  const isConnected = voice.isConnected;
  const getSessionSnapshot = voice.getSessionSnapshot;

  useEffect(() => {
    onTranscriptChangeRef.current?.(voice.sessionTurns);
  }, [voice.sessionTurns]);

  const handleConnect = useCallback(() => {
    if (!resolvedConnection) {
      toast.error('请先在设置里配置实时助教连接地址');
      return;
    }
    voice.clearSession();
    voice.connect();
  }, [resolvedConnection, voice]);

  const handleBeginAssistantMode = useCallback(async () => {
    if (!isConnected) {
      toast.error('请先连接助教');
      return;
    }
    await onSessionStartRef.current?.();
  }, [isConnected]);

  const handleDisconnect = useCallback(async () => {
    manualDisconnectRef.current = true;
    const snapshot = voice.getSessionSnapshot();
    voice.disconnect();
    try {
      await onSessionEndRef.current?.(snapshot);
    } finally {
      manualDisconnectRef.current = false;
    }
  }, [voice]);

  const statusLabel =
    sessionState === 'briefing'
      ? '助教整理中'
      : sessionState === 'handoff'
        ? '转给老师中'
        : sessionState === 'handRaiseActive'
          ? '请教助教中'
          : '可请教助教';
  const isAssistantModeActive =
    sessionState === 'handRaiseActive' || sessionState === 'briefing' || sessionState === 'handoff';
  const panelHint = useMemo(() => {
    if (!isConnected) {
      return '先连接助教。此时课程会继续，不会打断课堂。';
    }
    if (sessionState === 'handRaiseActive') {
      return '课堂已暂停。结束请教并回到课堂，请点下方“结束请教，回到课堂”。';
    }
    if (sessionState === 'briefing' || sessionState === 'handoff') {
      return '助教正在整理并把问题转给课堂，请稍候。';
    }
    return '助教已待命，课程仍在继续。点“开始请教助教”后，课堂才会暂停。';
  }, [isConnected, sessionState]);

  useEffect(() => {
    if (wasConnectedRef.current && !isConnected && isAssistantModeActive && !manualDisconnectRef.current) {
      const snapshot = getSessionSnapshot();
      void onSessionEndRef.current?.(snapshot);
    }
    wasConnectedRef.current = isConnected;
  }, [getSessionSnapshot, isAssistantModeActive, isConnected]);

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl border border-purple-200/60 bg-purple-50/60 px-3 py-2 text-[11px] text-purple-700 dark:border-purple-500/30 dark:bg-purple-950/30 dark:text-purple-200">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-purple-200/80 bg-white/80 dark:border-purple-500/30 dark:bg-purple-900/50">
            <Image
              src="/avatars/creative.svg"
              alt="助教形象"
              fill
              className="object-cover p-1"
            />
          </div>
          <div className="min-w-0">
            <div className="font-semibold">请教助教（实时语音）</div>
            <div className="mt-1 truncate text-purple-600/80 dark:text-purple-200/80">
              {assistantProvider.name} · {statusLabel}
            </div>
          </div>
        </div>
        <div
          className={`mt-3 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
            isAssistantModeActive
              ? 'bg-amber-100/80 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
              : 'bg-white/70 text-purple-700/90 dark:bg-purple-900/30 dark:text-purple-100/90'
          }`}
        >
          {panelHint}
        </div>
      </div>

      {voice.sessionTurns.length > 0 && (
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-gray-200/70 bg-gray-50/80 p-2 dark:border-gray-700/70 dark:bg-gray-950/40">
          {voice.sessionTurns.slice(-4).map((turn) => (
            <div key={turn.id} className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {turn.role === 'user' ? '学生' : '助教'}
              </div>
              <div className="text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                {turn.text}
              </div>
            </div>
          ))}
        </div>
      )}

      <VoxLabsPTTButton
        isConnected={isConnected}
        isRecording={voice.isRecording}
        agentState={voice.agentState}
        metrics={voice.metrics}
        currentResponseText={voice.currentResponseText}
        onConnect={handleConnect}
        onDisconnect={() => {
          void handleDisconnect();
        }}
        onEnterAssistantMode={() => {
          void handleBeginAssistantMode();
        }}
        onExitAssistantMode={() => {
          void handleDisconnect();
        }}
        isAssistantModeActive={isAssistantModeActive}
        onPTTPress={voice.pttPress}
        onPTTRelease={voice.pttRelease}
        className={className}
        disabled={disabled || sessionState === 'briefing' || sessionState === 'handoff'}
      />
    </div>
  );
}

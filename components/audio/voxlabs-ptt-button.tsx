'use client';

import { useCallback, useRef, useState } from 'react';
import { Mic, MicOff, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AgentState, VoxLabsMetrics } from '@/lib/audio/voxlabs-client';

interface VoxLabsPTTButtonProps {
  isConnected: boolean;
  isRecording: boolean;
  agentState: AgentState;
  metrics: VoxLabsMetrics | null;
  currentResponseText: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onEnterAssistantMode: () => void;
  onExitAssistantMode: () => void;
  isAssistantModeActive: boolean;
  onPTTPress: () => void;
  onPTTRelease: () => void;
  className?: string;
  disabled?: boolean;
}

export function VoxLabsPTTButton({
  isConnected,
  isRecording,
  agentState,
  metrics: _metrics,
  currentResponseText,
  onConnect,
  onDisconnect,
  onEnterAssistantMode,
  onExitAssistantMode,
  isAssistantModeActive,
  onPTTPress,
  onPTTRelease,
  className,
  disabled,
}: VoxLabsPTTButtonProps) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isHolding, setIsHolding] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !isConnected || !isAssistantModeActive) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsHolding(true);
      onPTTPress();
    },
    [disabled, isAssistantModeActive, isConnected, onPTTPress],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isHolding) return;
      e.preventDefault();
      setIsHolding(false);
      onPTTRelease();
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    },
    [isHolding, onPTTRelease],
  );

  const stateColor =
    agentState === 'listening'
      ? 'text-green-500'
      : agentState === 'thinking'
        ? 'text-purple-400'
        : agentState === 'speaking'
          ? 'text-blue-400'
          : 'text-gray-400';

  const stateLabel =
    agentState === 'listening'
      ? '聆听中'
      : agentState === 'thinking'
        ? '思考中'
        : agentState === 'speaking'
          ? '回复中'
          : '就绪';

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      {/* Connection toggle */}
      <button
        type="button"
        onClick={isConnected ? onDisconnect : onConnect}
        disabled={disabled || (isAssistantModeActive && isConnected)}
        className={cn(
          'flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
          isConnected
            ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 ring-1 ring-green-200/50 dark:ring-green-800/50'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-1 ring-gray-200/50 dark:ring-gray-700/50 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600',
          (disabled || (isAssistantModeActive && isConnected)) && 'opacity-60 cursor-not-allowed',
        )}
      >
        {isConnected ? (
          <>
            <Wifi className="w-4 h-4" />
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            {isAssistantModeActive ? '助教连接中' : '断开助教连接'}
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4" />
            连接助教
          </>
        )}
      </button>

      {isConnected && (
        <button
          type="button"
          onClick={isAssistantModeActive ? onExitAssistantMode : onEnterAssistantMode}
          disabled={disabled}
          className={cn(
            'flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200',
            isAssistantModeActive
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-300/30 hover:bg-amber-600'
              : 'bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-md shadow-purple-300/30 hover:shadow-lg',
            disabled && 'opacity-40 pointer-events-none',
          )}
        >
          {isAssistantModeActive ? '结束请教，回到课堂' : '开始请教助教'}
        </button>
      )}

      {/* Agent state + metrics */}
      {isConnected && (
        <div className="flex items-center gap-2 text-[9px] font-mono">
          <span className={cn('flex items-center gap-1', stateColor)}>
            <span className="relative flex h-1.5 w-1.5">
              <span
                className={cn(
                  'absolute inline-flex h-full w-full rounded-full opacity-75',
                  agentState !== 'idle' && 'animate-ping',
                  agentState === 'listening' && 'bg-green-400',
                  agentState === 'thinking' && 'bg-purple-400',
                  agentState === 'speaking' && 'bg-blue-400',
                  agentState === 'idle' && 'bg-gray-400',
                )}
              />
              <span
                className={cn(
                  'relative inline-flex rounded-full h-1.5 w-1.5',
                  agentState === 'listening' && 'bg-green-500',
                  agentState === 'thinking' && 'bg-purple-500',
                  agentState === 'speaking' && 'bg-blue-500',
                  agentState === 'idle' && 'bg-gray-400',
                )}
              />
            </span>
            {stateLabel}
          </span>
        </div>
      )}

      {/* Streaming response preview */}
      {isAssistantModeActive && currentResponseText && (
        <div className="max-w-[280px] px-2 py-1 bg-purple-50/80 dark:bg-purple-900/20 rounded-lg text-[10px] text-purple-700 dark:text-purple-300 leading-relaxed truncate">
          {currentResponseText.slice(-80)}
          <span className="inline-block w-1 h-1 rounded-full bg-purple-400 animate-pulse ml-0.5 align-middle" />
        </div>
      )}

      {/* PTT Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled || !isConnected || !isAssistantModeActive}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
              'relative flex items-center justify-center gap-2 w-full rounded-xl transition-all duration-200 select-none touch-none cursor-pointer',
              'h-12 px-4',
              isRecording
                ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg shadow-red-300/40 dark:shadow-red-900/50 scale-[1.02]'
                : isConnected
                  ? 'bg-gradient-to-r from-purple-600 to-purple-500 dark:from-purple-500 dark:to-purple-400 text-white shadow-md shadow-purple-300/30 dark:shadow-purple-900/40 hover:shadow-lg active:scale-[0.98]'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed',
              disabled && 'opacity-40 pointer-events-none',
            )}
          >
            {/* Breathing ring when recording */}
            {isRecording && (
              <span
                className="absolute inset-[-3px] rounded-[14px] border-2 border-red-400/40"
                style={{ animation: 'ptt-ring 1.5s ease-in-out infinite' }}
              />
            )}

            {agentState === 'thinking' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isRecording ? (
              <Mic className="w-5 h-5 animate-pulse" />
            ) : isConnected ? (
              <Mic className="w-5 h-5" />
            ) : (
              <MicOff className="w-5 h-5" />
            )}

            <span className="text-sm font-bold">
              {isRecording
                ? '松开发送'
                : !isConnected
                  ? '未连接'
                  : isAssistantModeActive
                    ? '按住请教助教'
                    : '先开始请教'}
            </span>

            <style jsx>{`
              @keyframes ptt-ring {
                0%,
                100% {
                  opacity: 0.3;
                  transform: scale(1);
                }
                50% {
                  opacity: 0.7;
                  transform: scale(1.03);
                }
              }
            `}</style>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {isRecording
            ? '松开按钮发送语音'
            : isConnected && isAssistantModeActive
              ? '按住按钮开始实时请教助教'
              : isConnected
                ? '先点击“开始请教助教”，课堂才会暂停'
                : '请先连接助教'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

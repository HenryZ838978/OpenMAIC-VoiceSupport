import { REALTIME_ASSISTANT_PROVIDERS } from './constants';
import type {
  RealtimeAssistantConnectionConfig,
  RealtimeAssistantProviderId,
  RealtimeAssistantSettingsConfig,
} from './types';

function normalizeRealtimeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed;
  }

  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}`;
  }

  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}`;
  }

  return trimmed;
}

function appendAssistantQuery(
  wsUrl: string,
  providerId: RealtimeAssistantProviderId,
  modelId?: string,
): string {
  try {
    const url = new URL(wsUrl);
    if (!url.searchParams.has('provider')) {
      url.searchParams.set('provider', providerId);
    }
    if (modelId && !url.searchParams.has('model')) {
      url.searchParams.set('model', modelId);
    }
    return url.toString();
  } catch {
    const separator = wsUrl.includes('?') ? '&' : '?';
    const params = [`provider=${encodeURIComponent(providerId)}`];
    if (modelId) params.push(`model=${encodeURIComponent(modelId)}`);
    return `${wsUrl}${separator}${params.join('&')}`;
  }
}

export function resolveRealtimeAssistantConnection(
  providerId: RealtimeAssistantProviderId,
  config: RealtimeAssistantSettingsConfig | undefined,
  fallbackWsUrl?: string,
): RealtimeAssistantConnectionConfig | null {
  const provider = REALTIME_ASSISTANT_PROVIDERS[providerId];
  const rawUrl =
    config?.baseUrl || config?.serverBaseUrl || provider.defaultBaseUrl || fallbackWsUrl || '';
  const wsUrl = normalizeRealtimeUrl(rawUrl);
  if (!wsUrl) return null;

  return {
    providerId,
    label: provider.name,
    wsUrl: appendAssistantQuery(wsUrl, providerId, config?.modelId || provider.defaultModelId),
    modelId: config?.modelId || provider.defaultModelId || undefined,
  };
}

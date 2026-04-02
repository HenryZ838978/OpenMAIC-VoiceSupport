export type RealtimeAssistantProviderId =
  | 'voxlabs'
  | 'doubao-realtime'
  | 'openai-realtime'
  | 'gemini-live';

export type RealtimeAssistantTransportKind = 'direct-websocket' | 'relay-websocket';

export interface RealtimeAssistantModelInfo {
  id: string;
  name: string;
}

export interface RealtimeAssistantProviderConfig {
  id: RealtimeAssistantProviderId;
  name: string;
  icon?: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  models: RealtimeAssistantModelInfo[];
  defaultModelId: string;
  transportKind: RealtimeAssistantTransportKind;
  description: string;
  endpointLabel: string;
  endpointPlaceholder?: string;
}

export interface RealtimeAssistantSettingsConfig {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  modelId?: string;
  providerOptions?: Record<string, unknown>;
  isServerConfigured?: boolean;
  serverBaseUrl?: string;
}

export interface RealtimeAssistantConnectionConfig {
  providerId: RealtimeAssistantProviderId;
  label: string;
  wsUrl: string;
  modelId?: string;
}

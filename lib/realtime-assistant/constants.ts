import type {
  RealtimeAssistantProviderConfig,
  RealtimeAssistantProviderId,
} from './types';

export const REALTIME_ASSISTANT_PROVIDERS: Record<
  RealtimeAssistantProviderId,
  RealtimeAssistantProviderConfig
> = {
  voxlabs: {
    id: 'voxlabs',
    name: 'VoxLabs',
    icon: '/avatars/assistant.svg',
    requiresApiKey: false,
    defaultBaseUrl: 'ws://localhost:3000/ws/voice',
    models: [],
    defaultModelId: '',
    transportKind: 'direct-websocket',
    description: '低延迟 WebSocket 助教协议，可直接连接到兼容语音网关。',
    endpointLabel: 'WebSocket URL',
    endpointPlaceholder: 'ws://localhost:3000/ws/voice',
  },
  'doubao-realtime': {
    id: 'doubao-realtime',
    name: '豆包 Realtime',
    icon: '/logos/doubao.svg',
    requiresApiKey: true,
    models: [
      { id: 'doubao-realtime', name: 'Doubao Realtime' },
      { id: 'doubao-voice-realtime', name: 'Doubao Voice Realtime' },
    ],
    defaultModelId: 'doubao-realtime',
    transportKind: 'relay-websocket',
    description: '建议通过你的服务端 relay / gateway 接入豆包实时语音能力。',
    endpointLabel: 'Relay WebSocket URL',
    endpointPlaceholder: 'wss://your-gateway.example.com/ws/assistant',
  },
  'openai-realtime': {
    id: 'openai-realtime',
    name: 'OpenAI Realtime',
    icon: '/logos/openai.svg',
    requiresApiKey: true,
    models: [
      { id: 'gpt-4o-realtime-preview', name: 'gpt-4o-realtime-preview' },
      { id: 'gpt-4o-mini-realtime-preview', name: 'gpt-4o-mini-realtime-preview' },
    ],
    defaultModelId: 'gpt-4o-realtime-preview',
    transportKind: 'relay-websocket',
    description: '推荐通过统一 relay 层接入 OpenAI Realtime，避免把厂商协议暴露到前端。',
    endpointLabel: 'Relay WebSocket URL',
    endpointPlaceholder: 'wss://your-gateway.example.com/ws/assistant',
  },
  'gemini-live': {
    id: 'gemini-live',
    name: 'Gemini Live',
    icon: '/logos/gemini.svg',
    requiresApiKey: true,
    models: [
      { id: 'gemini-live-2.5-flash-preview', name: 'gemini-live-2.5-flash-preview' },
      { id: 'gemini-2.5-flash-preview-native-audio-dialog', name: 'gemini native audio dialog' },
    ],
    defaultModelId: 'gemini-live-2.5-flash-preview',
    transportKind: 'relay-websocket',
    description: '推荐通过统一 relay 层接入 Gemini Live，会话、鉴权和配额控制更稳定。',
    endpointLabel: 'Relay WebSocket URL',
    endpointPlaceholder: 'wss://your-gateway.example.com/ws/assistant',
  },
};

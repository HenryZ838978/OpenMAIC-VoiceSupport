'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { REALTIME_ASSISTANT_PROVIDERS } from '@/lib/realtime-assistant/constants';
import type { RealtimeAssistantProviderId } from '@/lib/realtime-assistant/types';
import { Eye, EyeOff } from 'lucide-react';

interface RealtimeAssistantSettingsProps {
  selectedProviderId: RealtimeAssistantProviderId;
}

export function RealtimeAssistantSettings({
  selectedProviderId,
}: RealtimeAssistantSettingsProps) {
  const { t } = useI18n();
  const realtimeAssistantProviderId = useSettingsStore((state) => state.realtimeAssistantProviderId);
  const realtimeAssistantProvidersConfig = useSettingsStore(
    (state) => state.realtimeAssistantProvidersConfig,
  );
  const setRealtimeAssistantProviderConfig = useSettingsStore(
    (state) => state.setRealtimeAssistantProviderConfig,
  );

  const provider =
    REALTIME_ASSISTANT_PROVIDERS[selectedProviderId] ?? REALTIME_ASSISTANT_PROVIDERS.voxlabs;
  const selectedConfig = realtimeAssistantProvidersConfig[selectedProviderId];
  const isServerConfigured = !!selectedConfig?.isServerConfigured;
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-xl border border-purple-200/60 bg-purple-50/70 p-4 text-sm text-purple-900 dark:border-purple-700/40 dark:bg-purple-950/30 dark:text-purple-100">
        <div className="font-semibold">{t('settings.realtimeAssistantModeTitle')}</div>
        <p className="mt-2 text-purple-800/80 dark:text-purple-100/80">
          {provider.description}
        </p>
        <p className="mt-2 text-xs text-purple-700/80 dark:text-purple-200/80">
          {provider.transportKind === 'relay-websocket'
            ? t('settings.realtimeAssistantRelayHint')
            : t('settings.realtimeAssistantDirectHint')}
        </p>
      </div>

      {isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          {t('settings.serverConfiguredNotice')}
        </div>
      )}

      {provider.models.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm">{t('settings.realtimeAssistantModel')}</Label>
          <Select
            value={selectedConfig?.modelId || provider.defaultModelId}
            onValueChange={(value) =>
              setRealtimeAssistantProviderConfig(selectedProviderId, { modelId: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {provider.models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(provider.requiresApiKey || isServerConfigured) && (
        <div className="space-y-2">
          <Label className="text-sm">{t('settings.realtimeAssistantApiKey')}</Label>
          <div className="relative">
            <Input
              type={showApiKey ? 'text' : 'password'}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={
                isServerConfigured ? t('settings.optionalOverride') : t('settings.enterApiKey')
              }
              value={selectedConfig?.apiKey || ''}
              onChange={(e) =>
                setRealtimeAssistantProviderConfig(selectedProviderId, { apiKey: e.target.value })
              }
              className="font-mono text-sm pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm">{provider.endpointLabel}</Label>
        <Input
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={provider.endpointPlaceholder || provider.defaultBaseUrl || ''}
          value={selectedConfig?.baseUrl || ''}
          onChange={(e) =>
            setRealtimeAssistantProviderConfig(selectedProviderId, { baseUrl: e.target.value })
          }
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {provider.transportKind === 'relay-websocket'
            ? t('settings.realtimeAssistantEndpointHintRelay')
            : t('settings.realtimeAssistantEndpointHintDirect')}
        </p>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
        <div className="font-medium text-foreground">{t('settings.realtimeAssistantRouting')}</div>
        <p>
          {realtimeAssistantProviderId === selectedProviderId
            ? t('settings.realtimeAssistantActiveProvider')
            : t('settings.realtimeAssistantInactiveProvider')}
        </p>
        <p>{t('settings.realtimeAssistantRoutingDesc')}</p>
      </div>
    </div>
  );
}

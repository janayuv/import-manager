import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useHasPermission, useUser } from '@/lib/user-context';
import {
  getSystemAgentObservabilitySummary,
  getSystemAgentSettings,
  setSystemAgentSettings,
  systemAgentTurn,
  type ExplainGraph,
  type SystemAgentObservabilitySummary,
  type SystemAgentMessage,
} from '@/lib/system-agent';

type ChatRow = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export default function SystemAgentAdminPage() {
  const { user } = useUser();
  const viewOk = useHasPermission('automation.system_agent');
  const role = user?.role ?? '';
  const userId = user?.id ?? 'unknown';
  const sessionId = useMemo(
    () =>
      `system-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    []
  );

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState('deepseek-v4-flash');
  const [baseUrl, setBaseUrl] = useState(
    'https://api.deepseek.com/chat/completions'
  );
  const [threshold, setThreshold] = useState('0.75');
  const [apiKey, setApiKey] = useState('');
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [chat, setChat] = useState<ChatRow[]>([]);
  const [explainGraph, setExplainGraph] = useState<ExplainGraph | null>(null);
  const [busy, setBusy] = useState(false);
  const [groundingWarning, setGroundingWarning] = useState<string | null>(null);
  const [obs, setObs] = useState<SystemAgentObservabilitySummary | null>(null);

  useEffect(() => {
    void loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!viewOk) {
    return <Navigate to="/" replace />;
  }

  async function loadSettings() {
    try {
      const s = await getSystemAgentSettings(role);
      const o = await getSystemAgentObservabilitySummary(role);
      setEnabled(s.enabled);
      setModel(s.model);
      setBaseUrl(s.baseUrl);
      setThreshold(String(s.confidenceThresholdMutate));
      setHasSavedApiKey(s.hasApiKey);
      setObs(o);
      setSettingsLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function normalizeDeepSeekBaseUrl(url: string): string {
    const trimmed = url.trim();
    if (
      trimmed === 'https://api.deepseek.com/beta' ||
      trimmed === 'https://api.deepseek.com/beta/'
    ) {
      return 'https://api.deepseek.com/chat/completions';
    }
    return trimmed;
  }

  function normalizeDeepSeekModel(value: string): string {
    const trimmed = value.trim();
    const normalized = trimmed.toLowerCase();
    if (!normalized) return 'deepseek-v4-flash';
    if (
      normalized === 'deepseek-chat' ||
      normalized === 'deepseek-v3.2' ||
      normalized === 'deepseek-v3-2'
    ) {
      return 'deepseek-v4-flash';
    }
    return trimmed;
  }

  async function saveSettings() {
    setBusy(true);
    try {
      const trimmedApiKey = apiKey.trim();
      const s = await setSystemAgentSettings(role, {
        enabled,
        model: normalizeDeepSeekModel(model),
        baseUrl: normalizeDeepSeekBaseUrl(baseUrl),
        confidenceThresholdMutate: Number(threshold) || 0.75,
        deepseekApiKey: trimmedApiKey || undefined,
      });
      setEnabled(s.enabled);
      setModel(s.model);
      setBaseUrl(s.baseUrl);
      setThreshold(String(s.confidenceThresholdMutate));
      setApiKey('');
      setHasSavedApiKey(s.hasApiKey);
      if (trimmedApiKey) {
        toast.success('System agent settings saved. API key updated.');
      } else if (s.hasApiKey) {
        toast.success(
          'System agent settings saved. Existing API key remains configured.'
        );
      } else {
        toast.success(
          'System agent settings saved. No API key configured yet.'
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendPrompt() {
    if (!prompt.trim()) return;
    const next: ChatRow[] = [...chat, { role: 'user', content: prompt.trim() }];
    setChat(next);
    setBusy(true);
    setGroundingWarning(null);
    try {
      const messages: SystemAgentMessage[] = next.map(x => ({
        role: x.role,
        content: x.content,
      }));
      const out = await systemAgentTurn({
        sessionId,
        callerUserId: userId,
        callerRole: role,
        messages,
      });
      setChat(prev => [...prev, { role: 'assistant', content: out.content }]);
      setExplainGraph(out.explainGraph ?? null);
      if (out.groundingOk === false) {
        setGroundingWarning(
          'Explanation could not be verified against system logs.'
        );
      }
      setPrompt('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System agent</h1>
        <p className="text-muted-foreground text-sm">
          Deterministic automation control interface with optional DeepSeek
          narration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label>Enable system agent</Label>
              <p className="text-muted-foreground text-xs">
                LLM calls happen only when intent route requires it.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="grid gap-2">
            <Label>Model</Label>
            <Input value={model} onChange={e => setModel(e.target.value)} />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>DeepSeek base URL</Label>
            <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Confidence threshold (mutate)</Label>
            <Input
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="grid gap-2">
            <Label>DeepSeek API key (optional update)</Label>
            <Input
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              type="password"
            />
            <p className="text-muted-foreground text-xs">
              {hasSavedApiKey
                ? 'A DeepSeek API key is already saved. Leave blank to keep it unchanged.'
                : 'No DeepSeek API key saved yet. Paste one and click Save settings.'}
            </p>
          </div>
          <div className="flex gap-2 md:col-span-2">
            <Button variant="outline" onClick={loadSettings} disabled={busy}>
              {settingsLoaded ? 'Reload settings' : 'Load settings'}
            </Button>
            <Button onClick={saveSettings} disabled={busy}>
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rate limit observability (7d)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Total turns</p>
            <p className="font-medium">{obs?.totalTurns7d ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">LLM-used turns</p>
            <p className="font-medium">{obs?.llmUsedTurns7d ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Blocked turns</p>
            <p className="font-medium">{obs?.blockedTurns7d ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Blocked %</p>
            <p className="font-medium">
              {obs ? `${obs.blockedPercent7d.toFixed(2)}%` : '—'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Chat</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ScrollArea className="h-80 rounded border p-3">
              <div className="space-y-3">
                {chat.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Ask about automation health, failed jobs, or request
                    deterministic failure trace.
                  </p>
                ) : (
                  chat.map((row, idx) => (
                    <div key={idx} className="rounded border p-2 text-sm">
                      <div className="text-muted-foreground mb-1 text-xs uppercase">
                        {row.role}
                      </div>
                      <pre className="wrap-break-word whitespace-pre-wrap">
                        {row.content}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Input
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe automation issue or ask for health summary"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    void sendPrompt();
                  }
                }}
              />
              <Button onClick={sendPrompt} disabled={busy || !prompt.trim()}>
                Send
              </Button>
            </div>
            {groundingWarning ? (
              <p className="text-sm text-amber-700">{groundingWarning}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Explain graph</CardTitle>
          </CardHeader>
          <CardContent>
            {explainGraph ? (
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Schema: </span>
                  {explainGraph.schemaVersion}
                </div>
                <div>
                  <span className="text-muted-foreground">Trace SHA256: </span>
                  <code className="text-xs">{explainGraph.traceSha256}</code>
                </div>
                <ScrollArea className="h-60 rounded border p-2">
                  <pre className="wrap-break-word whitespace-pre-wrap text-xs">
                    {JSON.stringify(explainGraph.events, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Failure trace appears here for TRACE_ONLY failure analysis
                routes.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

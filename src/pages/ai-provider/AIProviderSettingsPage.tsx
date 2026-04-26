import { invoke } from '@tauri-apps/api/core';
import { Info } from 'lucide-react';

import * as React from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  AiDefaultProviderValue,
  AiProviderSettings as AiProviderSettingsPayload,
} from '@/types/ai-provider-settings';

const DEFAULTS: AiDefaultProviderValue[] = ['mock', 'deepseek', 'local'];

function toUiValue(s: string | undefined | null): AiDefaultProviderValue {
  const t = (s ?? '').trim().toLowerCase();
  if (t === 'ollama') return 'local';
  if (t === 'deepseek' || t === 'local' || t === 'mock') {
    return t;
  }
  return 'mock';
}

export default function AIProviderSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [form, setForm] = React.useState<AiProviderSettingsPayload>({
    aiProvider: 'mock',
    deepseekApiKey: '',
    ollamaEndpoint: 'http://localhost:11434/api/chat',
    ollamaModel: 'llama3',
  });

  const load = React.useCallback(async () => {
    setError(null);
    setDone(false);
    setLoading(true);
    try {
      const s = await invoke<AiProviderSettingsPayload>(
        'get_ai_provider_settings'
      );
      setForm({
        ...s,
        aiProvider: toUiValue(s.aiProvider) as string,
        ollamaEndpoint: s.ollamaEndpoint || 'http://localhost:11434/api/chat',
        ollamaModel: s.ollamaModel || 'llama3',
      });
    } catch (e) {
      setError(
        typeof e === 'string'
          ? e
          : e && typeof e === 'object' && 'message' in e
            ? String((e as { message?: string }).message)
            : 'Failed to load settings.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    const p = (form.aiProvider as string).trim().toLowerCase();
    if (p === 'deepseek' && !form.deepseekApiKey.trim()) {
      setError('Enter a DeepSeek API key, or set provider to Mock / Local.');
      return;
    }
    if (p === 'local' && !form.ollamaEndpoint.trim()) {
      setError(
        'Local (Ollama) requires an endpoint URL (e.g. http://localhost:11434/api/chat).'
      );
      return;
    }
    setSaving(true);
    try {
      const v = toUiValue(form.aiProvider);
      const payload: AiProviderSettingsPayload = {
        ...form,
        aiProvider: v,
        deepseekApiKey: form.deepseekApiKey,
        ollamaEndpoint: form.ollamaEndpoint,
        ollamaModel: form.ollamaModel,
      };
      await invoke('set_ai_provider_settings', { settings: payload });
      setDone(true);
    } catch (err) {
      setError(
        typeof err === 'string' ? err : 'Could not save AI provider settings.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl space-y-8 py-8">
      <div>
        <h1 className="text-xl font-semibold text-blue-600">
          AI provider settings
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Defaults are stored in the database. When a value is not set,
          extraction still falls back to the host environment (V0.2.3). Keys are
          not kept in the browser after you leave this page; reload to edit
          again.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Security</AlertTitle>
        <AlertDescription>
          The DeepSeek API key is stored only in your local app database, not in
          web storage. Avoid leaving the key on shared machines without disk
          encryption.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not save or load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {done && !error && (
        <Alert>
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>
            AI provider settings were written to the database.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <form onSubmit={onSave} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Default provider</CardTitle>
              <CardDescription>
                Used as the app default; invoice extraction can still choose
                another in the run dialog.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Label className="mb-2 block" htmlFor="def-provider">
                Default provider
              </Label>
              <Select
                value={toUiValue(form.aiProvider)}
                onValueChange={v => setForm(f => ({ ...f, aiProvider: v }))}
              >
                <SelectTrigger id="def-provider" className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULTS.map(x => (
                    <SelectItem key={x} value={x}>
                      {x === 'local'
                        ? 'Local (Ollama)'
                        : x === 'deepseek'
                          ? 'DeepSeek'
                          : 'Mock'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>DeepSeek (cloud)</CardTitle>
              <CardDescription>
                If you use the default provider or invoice run with DeepSeek, an
                API key is required here unless it is set only in the host
                environment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="ds-key">DeepSeek API key</Label>
              <Input
                id="ds-key"
                name="deepseekApiKey"
                type="password"
                autoComplete="off"
                value={form.deepseekApiKey}
                onChange={e =>
                  setForm(f => ({ ...f, deepseekApiKey: e.target.value }))
                }
                placeholder="sk-…"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Local Ollama</CardTitle>
              <CardDescription>
                Chat API URL (e.g. <code>http://127.0.0.1:11434/api/chat</code>)
                and model name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ollam-e">Ollama endpoint</Label>
                <Input
                  id="ollam-e"
                  value={form.ollamaEndpoint}
                  onChange={e =>
                    setForm(f => ({ ...f, ollamaEndpoint: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="ollam-m">Ollama model</Label>
                <Input
                  id="ollam-m"
                  value={form.ollamaModel}
                  onChange={e =>
                    setForm(f => ({ ...f, ollamaModel: e.target.value }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              useAccentColor
              data-testid="ai-provider-settings-save"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

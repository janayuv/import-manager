import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

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
import { AppBar, ImToggle } from '@/components/shared/im';

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
    <div className="im-page">
      <AppBar crumbs={['Import Manager', 'Administration', 'System Agent']} />
      <div
        className="im-dashboard-body"
        style={{
          maxWidth: 1152,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div
          style={{
            padding: '14px 24px 12px',
            borderBottom: '1px solid var(--color-im-rule)',
            flexShrink: 0,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--color-im-text)',
              fontFamily: 'var(--font-im-sans)',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            System Agent
          </h1>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: 11.5,
              color: 'var(--color-im-faint)',
            }}
          >
            Deterministic automation control interface with optional DeepSeek
            narration.
          </p>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">// Settings</span>
          </div>
          <div
            className="im-section__body"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                border: '1px solid var(--color-im-rule)',
                borderRadius: 2,
              }}
            >
              <div>
                <label className="im-field-label" style={{ marginBottom: 2 }}>
                  Enable system agent
                </label>
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: 'var(--color-im-faint)',
                  }}
                >
                  LLM calls happen only when intent route requires it.
                </p>
              </div>
              <ImToggle checked={enabled} onChange={setEnabled} />
            </div>
            <div>
              <label className="im-field-label">Model</label>
              <input
                className="im-input"
                value={model}
                onChange={e => setModel(e.target.value)}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="im-field-label">DeepSeek base URL</label>
              <input
                className="im-input"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="im-field-label">
                Confidence threshold (mutate)
              </label>
              <input
                className="im-input"
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="im-field-label">
                DeepSeek API key (optional update)
              </label>
              <input
                className="im-input"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                type="password"
              />
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 11,
                  color: 'var(--color-im-faint)',
                }}
              >
                {hasSavedApiKey
                  ? 'A DeepSeek API key is already saved. Leave blank to keep it unchanged.'
                  : 'No DeepSeek API key saved yet. Paste one and click Save settings.'}
              </p>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button
                className="im-btn"
                onClick={() => void loadSettings()}
                disabled={busy}
              >
                {settingsLoaded ? 'Reload settings' : 'Load settings'}
              </button>
              <button
                className="im-btn im-btn--primary"
                onClick={() => void saveSettings()}
                disabled={busy}
              >
                Save settings
              </button>
            </div>
          </div>
        </div>

        <div className="im-section">
          <div className="im-section__header">
            <span className="im-section__label">
              // Rate limit observability (7d)
            </span>
          </div>
          <div
            className="im-section__body"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              fontSize: 12.5,
            }}
          >
            <div>
              <p style={{ margin: '0 0 4px', color: 'var(--color-im-muted)' }}>
                Total turns
              </p>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {obs?.totalTurns7d ?? '—'}
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 4px', color: 'var(--color-im-muted)' }}>
                LLM-used turns
              </p>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {obs?.llmUsedTurns7d ?? '—'}
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 4px', color: 'var(--color-im-muted)' }}>
                Blocked turns
              </p>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {obs?.blockedTurns7d ?? '—'}
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 4px', color: 'var(--color-im-muted)' }}>
                Blocked %
              </p>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {obs ? `${obs.blockedPercent7d.toFixed(2)}%` : '—'}
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
          }}
        >
          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">// Chat</span>
            </div>
            <div
              className="im-section__body"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div
                style={{
                  height: 320,
                  overflowY: 'auto',
                  padding: 12,
                  border: '1px solid var(--color-im-rule)',
                  borderRadius: 2,
                }}
              >
                {chat.length === 0 ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12.5,
                      color: 'var(--color-im-muted)',
                    }}
                  >
                    Ask about automation health, failed jobs, or request
                    deterministic failure trace.
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {chat.map((row, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: 8,
                          border: '1px solid var(--color-im-rule)',
                          borderRadius: 2,
                          fontSize: 12.5,
                        }}
                      >
                        <div
                          style={{
                            marginBottom: 4,
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            color: 'var(--color-im-muted)',
                          }}
                        >
                          {row.role}
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {row.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="im-input"
                  style={{ flex: 1 }}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Describe automation issue or ask for health summary"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      void sendPrompt();
                    }
                  }}
                />
                <button
                  className="im-btn im-btn--primary"
                  onClick={() => void sendPrompt()}
                  disabled={busy || !prompt.trim()}
                >
                  Send
                </button>
              </div>
              {groundingWarning ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    color: 'var(--color-im-accent)',
                  }}
                >
                  {groundingWarning}
                </p>
              ) : null}
            </div>
          </div>

          <div className="im-section">
            <div className="im-section__header">
              <span className="im-section__label">// Explain graph</span>
            </div>
            <div className="im-section__body">
              {explainGraph ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    fontSize: 12.5,
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--color-im-muted)' }}>
                      Schema:{' '}
                    </span>
                    {explainGraph.schemaVersion}
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-im-muted)' }}>
                      Trace SHA256:{' '}
                    </span>
                    <code style={{ fontSize: 11.5, fontFamily: 'monospace' }}>
                      {explainGraph.traceSha256}
                    </code>
                  </div>
                  <div
                    style={{
                      height: 240,
                      overflowY: 'auto',
                      padding: 8,
                      border: '1px solid var(--color-im-rule)',
                      borderRadius: 2,
                    }}
                  >
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: 11,
                      }}
                    >
                      {JSON.stringify(explainGraph.events, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    color: 'var(--color-im-muted)',
                  }}
                >
                  Failure trace appears here for TRACE_ONLY failure analysis
                  routes.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

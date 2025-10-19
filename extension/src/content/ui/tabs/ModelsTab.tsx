import * as React from 'react';
const { useCallback, useEffect, useMemo, useState } = React;
import { getStorageAdapter } from '../../../shared/storageAdapter.js';
import type { ModelConfig, ModelProvider } from '../../../shared/types.js';
import { STORAGE_KEYS, storageRemove } from '../../../shared/storage.js';
import { DEFAULT_OPENAI_BASE_URL } from '../../../shared/config.js';
import type { ToastHandler } from '../SettingsModal.js';
import {
  deleteModelConfig as deleteModelConfigApi,
  fetchModelConfigs,
  saveModelConfig as saveModelConfigApi,
  setDefaultModel as setDefaultModelApi
} from '../../../shared/api/models.js';

interface ModelsTabProps {
  onNotify: ToastHandler;
}

interface ModelFormState {
  id: string;
  provider: ModelProvider;
  baseUrl?: string;
  model: string;
  apiKey?: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  formality: 'formal' | 'informal';
  literalness: number;
  glossaryEnabled: boolean;
  isDefault: boolean;
}

type TestStatus =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'success'; latencyMs: number; status: number }
  | { state: 'error'; reason: string };

const PROVIDER_OPTIONS: Array<{ label: string; value: ModelProvider }> = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Azure OpenAI', value: 'azure-openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google Gemini', value: 'google-gemini' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'Self-hosted (OpenAI-compatible)', value: 'self-hosted' }
];

const INITIAL_FORM: ModelFormState = {
  id: '',
  provider: 'openai',
  baseUrl: DEFAULT_OPENAI_BASE_URL,
  model: 'gpt-4o-mini',
  apiKey: '',
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
  formality: 'formal',
  literalness: 0.5,
  glossaryEnabled: false,
  isDefault: false
};

export const ModelsTab: React.FC<ModelsTabProps> = ({ onNotify }) => {
  const adapter = useMemo(() => getStorageAdapter(), []);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [form, setForm] = useState<ModelFormState>({ ...INITIAL_FORM, id: crypto.randomUUID() });
  const [testStatus, setTestStatus] = useState<TestStatus>({ state: 'idle' });
  const [saving, setSaving] = useState(false);

  const refreshModels = useCallback(async () => {
    try {
      const list = await fetchModelConfigs();
      setModels(list);
      if (list.length && !list.find((model) => model.id === form.id)) {
        const defaultModel = list.find((model) => model.isDefault) ?? list[0];
        setForm(buildFormState(defaultModel));
      }
    } catch (error) {
      console.error('[LinguaLens] Failed to fetch model configs', error);
      onNotify('error', 'Failed to load model configurations');
    }
  }, [form.id, onNotify]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  const resetForm = useCallback(() => {
    setForm({ ...INITIAL_FORM, id: crypto.randomUUID() });
    setTestStatus({ state: 'idle' });
  }, []);

  const handleChange = <K extends keyof ModelFormState>(key: K, value: ModelFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key !== 'isDefault') {
      setTestStatus({ state: 'idle' });
    }
  };

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setSaving(true);
      try {
        const existing = models.find((model) => model.id === form.id);
        const payload: ModelConfig = {
          ...form,
          createdAt: existing?.createdAt ?? Date.now(),
          updatedAt: Date.now()
        };
        const saved = await saveModelConfigApi(payload);
        setForm(buildFormState(saved));
        await refreshModels();
        onNotify('success', 'Model configuration saved');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        onNotify('error', `Failed to save model: ${message}`);
      } finally {
        setSaving(false);
      }
    },
    [form, models, onNotify, refreshModels]
  );

  const handleEdit = useCallback((id: string) => {
    const target = models.find((model) => model.id === id);
    if (target) {
      setForm(buildFormState(target));
      setTestStatus({ state: 'idle' });
    }
  }, [models]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteModelConfigApi(id);
      if (form.id === id) {
        resetForm();
      }
      await refreshModels();
      onNotify('success', 'Model configuration deleted');
    },
    [form.id, onNotify, refreshModels, resetForm]
  );

  const handleSetDefault = useCallback(
    async (id: string) => {
      await setDefaultModelApi(id);
      await refreshModels();
      setForm((prev) => (prev.id === id ? { ...prev, isDefault: true } : prev));
      onNotify('success', 'Default model updated');
    },
    [onNotify, refreshModels]
  );

  const handleTestConnection = useCallback(async () => {
    setTestStatus({ state: 'pending' });
    try {
      const { url, init } = buildTestRequest(form);
      const start = performance.now();
      const response = await fetch(url, init);
      const latency = performance.now() - start;
      setTestStatus({ state: 'success', latencyMs: latency, status: response.status });
      if (response.ok) {
        onNotify('success', `Test succeeded (${Math.round(latency)} ms)`);
      } else {
        const body = await response.text();
        onNotify('error', `Test failed (${response.status}): ${body.slice(0, 120)}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setTestStatus({ state: 'error', reason: message });
      onNotify('error', `Test request failed: ${message}`);
    }
  }, [form, onNotify]);

  const handleResetAll = useCallback(async () => {
    if (!window.confirm('This will erase profiles, history, and model configs. Continue?')) {
      return;
    }
    try {
      const remoteModels = await fetchModelConfigs();
      if (remoteModels.length) {
        await Promise.all(remoteModels.map((model) => deleteModelConfigApi(model.id)));
      }
    } catch (error) {
      console.warn('[LinguaLens] Failed to clear remote model configs during reset', error);
    }
    await adapter.resetAll();
    await storageRemove([STORAGE_KEYS.activeProfile, STORAGE_KEYS.apiKeys]);
    resetForm();
    setModels([]);
    await refreshModels();
    onNotify('success', 'All settings cleared');
  }, [adapter, onNotify, refreshModels, resetForm]);

  return (
    <div className="settings-tab models-tab">
      <div className="models-layout">
        <aside>
          <div className="models-header">
            <h4>Saved Models ({models.length})</h4>
            <button type="button" className="primary outline" onClick={resetForm}>
              + Add Model
            </button>
          </div>
          <ul className="model-list">
            {models.map((model) => (
              <li key={model.id} className={model.id === form.id ? 'active' : ''}>
                <button type="button" onClick={() => handleEdit(model.id)}>
                  <span className="name">{model.model}</span>
                  <span className="provider">{providerLabel(model.provider)}</span>
                  {model.isDefault && <span className="badge">Default</span>}
                </button>
                <div className="item-actions">
                  {!model.isDefault && (
                    <button type="button" className="ghost" onClick={() => handleSetDefault(model.id)}>
                      Set default
                    </button>
                  )}
                  <button type="button" className="ghost danger" onClick={() => handleDelete(model.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {models.length === 0 && <li className="empty">No saved models yet.</li>}
          </ul>
          <button type="button" className="danger block" onClick={handleResetAll}>
            Reset all settings
          </button>
        </aside>
        <form className="model-form" onSubmit={handleSubmit}>
          <h4>{models.find((model) => model.id === form.id) ? 'Edit Model' : 'Create Model'}</h4>
          <label>
            Provider
            <select
              value={form.provider}
              onChange={(event) => handleChange('provider', event.target.value as ModelProvider)}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Base URL
            <input
              value={form.baseUrl ?? ''}
              placeholder="https://api.openai.com"
              onChange={(event) => handleChange('baseUrl', event.target.value)}
            />
          </label>
          <label>
            Model name
            <input
              value={form.model}
              onChange={(event) => handleChange('model', event.target.value)}
              placeholder="gpt-4o-mini"
              required
            />
          </label>
          <label>
            API key
            <input
              type="password"
              value={form.apiKey ?? ''}
              onChange={(event) => handleChange('apiKey', event.target.value)}
              placeholder="sk-..."
            />
          </label>
          <div className="field-row">
            <label>
              Temperature
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={form.temperature}
                onChange={(event) => handleChange('temperature', Number(event.target.value))}
              />
            </label>
            <label>
              Top P
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={form.topP}
                onChange={(event) => handleChange('topP', Number(event.target.value))}
              />
            </label>
            <label>
              Max tokens
              <input
                type="number"
                min="1"
                value={form.maxTokens}
                onChange={(event) => handleChange('maxTokens', Number(event.target.value))}
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              Formality
              <select
                value={form.formality}
                onChange={(event) => handleChange('formality', event.target.value as ModelFormState['formality'])}
              >
                <option value="formal">Formal</option>
                <option value="informal">Informal</option>
              </select>
            </label>
            <label className="literalness">
              Literalness
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={form.literalness}
                onChange={(event) => handleChange('literalness', Number(event.target.value))}
              />
              <span>{Math.round(form.literalness * 100)}%</span>
            </label>
            <label className="glossary-toggle">
              <input
                type="checkbox"
                checked={form.glossaryEnabled}
                onChange={(event) => handleChange('glossaryEnabled', event.target.checked)}
              />
              Glossary
            </label>
          </div>
          <label className="default-toggle">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => handleChange('isDefault', event.target.checked)}
            />
            Set as default translation model
          </label>
          <div className="form-actions">
            <button type="button" className="primary outline" onClick={handleTestConnection} disabled={testStatus.state === 'pending'}>
              {testStatus.state === 'pending' ? 'Testing…' : 'Test Connection'}
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Model'}
            </button>
          </div>
          <TestStatusBanner status={testStatus} />
        </form>
      </div>
    </div>
  );
};

function buildFormState(source: ModelConfig): ModelFormState {
  return {
    id: source.id,
    provider: source.provider,
    baseUrl: source.baseUrl,
    model: source.model,
    apiKey: source.apiKey,
    temperature: source.temperature ?? 0.7,
    topP: source.topP ?? 0.9,
    maxTokens: source.maxTokens ?? 1024,
    formality: source.formality ?? 'formal',
    literalness: source.literalness ?? 0.5,
    glossaryEnabled: Boolean(source.glossaryEnabled),
    isDefault: Boolean(source.isDefault)
  };
}

function providerLabel(provider: ModelProvider): string {
  const entry = PROVIDER_OPTIONS.find((option) => option.value === provider);
  return entry?.label ?? provider;
}

function buildTestRequest(config: ModelFormState): { url: string; init: RequestInit } {
  const headers: Record<string, string> = {};
  const body: Record<string, unknown> = {};
  let url = config.baseUrl ?? '';

  switch (config.provider) {
    case 'openai':
    case 'self-hosted':
    case 'deepseek': {
      url = `${trimTrailingSlash(config.baseUrl ?? DEFAULT_OPENAI_BASE_URL)}/v1/chat/completions`;
      headers.Authorization = `Bearer ${config.apiKey ?? ''}`;
      headers['Content-Type'] = 'application/json';
      body.model = config.model;
      body.messages = [
        { role: 'system', content: 'You are LinguaLens test assistant.' },
        { role: 'user', content: 'Translate "hello world" to Spanish.' }
      ];
      body.max_tokens = 12;
      body.temperature = 0;
      break;
    }
    case 'azure-openai': {
      url = `${trimTrailingSlash(config.baseUrl ?? '')}/chat/completions?api-version=2024-02-15-preview`;
      headers['api-key'] = config.apiKey ?? '';
      headers['Content-Type'] = 'application/json';
      body.messages = [
        { role: 'system', content: 'You are LinguaLens test assistant.' },
        { role: 'user', content: 'Translate "hello world" to Spanish.' }
      ];
      body.max_tokens = 12;
      body.temperature = 0;
      break;
    }
    case 'anthropic': {
      url = `${trimTrailingSlash(config.baseUrl ?? 'https://api.anthropic.com')}/v1/messages`;
      headers.Authorization = `Bearer ${config.apiKey ?? ''}`;
      headers['x-api-key'] = config.apiKey ?? '';
      headers['anthropic-version'] = '2023-06-01';
      headers['Content-Type'] = 'application/json';
      body.model = config.model;
      body.max_tokens = 60;
      body.messages = [
        {
          role: 'user',
          content: 'Translate "hello world" to Spanish.'
        }
      ];
      break;
    }
    case 'google-gemini': {
      const base = trimTrailingSlash(config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta');
      url = `${base}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey ?? '')}`;
      headers['Content-Type'] = 'application/json';
      body.contents = [
        {
          parts: [{ text: 'Translate "hello world" to Spanish.' }]
        }
      ];
      break;
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }

  return {
    url,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }
  };
}

const TestStatusBanner: React.FC<{ status: TestStatus }> = ({ status }) => {
  switch (status.state) {
    case 'idle':
      return null;
    case 'pending':
      return <p className="status">Running sample request…</p>;
    case 'success':
      return (
        <p className="status success">
          Test OK · {status.status} · {Math.round(status.latencyMs)} ms
        </p>
      );
    case 'error':
      return <p className="status error">Test failed: {status.reason}</p>;
    default:
      return null;
  }
};

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

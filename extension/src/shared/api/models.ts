import type { ModelConfig } from '../types.js';
import { resolveServerUrl } from '../server.js';

function normalizeModel(model: ModelConfig): ModelConfig {
  return {
    ...model,
    temperature: typeof model.temperature === 'number' ? model.temperature : 0.7,
    topP: typeof model.topP === 'number' ? model.topP : 0.9,
    maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : 1024,
    formality: model.formality === 'informal' ? 'informal' : 'formal',
    literalness: typeof model.literalness === 'number' ? model.literalness : 0.5,
    glossaryEnabled: Boolean(model.glossaryEnabled),
    isDefault: Boolean(model.isDefault),
    createdAt: Number(model.createdAt),
    updatedAt: Number(model.updatedAt)
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Server request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function fetchModelConfigs(): Promise<ModelConfig[]> {
  const response = await fetch(resolveServerUrl('/models'));
  const payload = await handleResponse<{ models: ModelConfig[] }>(response);
  const models = Array.isArray(payload?.models) ? payload.models : [];
  return models.map((model) => normalizeModel(model));
}

export async function saveModelConfig(config: ModelConfig): Promise<ModelConfig> {
  const response = await fetch(resolveServerUrl('/models'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  });
  const saved = await handleResponse<ModelConfig>(response);
  return normalizeModel(saved);
}

export async function deleteModelConfig(id: string): Promise<void> {
  const response = await fetch(resolveServerUrl(`/models/${encodeURIComponent(id)}`), {
    method: 'DELETE'
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Failed to delete model (${response.status})`);
  }
}

export async function setDefaultModel(id: string | null): Promise<ModelConfig | null> {
  const response = await fetch(resolveServerUrl('/models/default'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ modelId: id })
  });
  if (response.status === 204 || response.status === 200 && !response.headers.get('content-type')) {
    return null;
  }
  const result = await handleResponse<ModelConfig | null>(response);
  return result ? normalizeModel(result) : null;
}

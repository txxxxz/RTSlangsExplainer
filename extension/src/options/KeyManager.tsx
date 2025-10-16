import React, { useEffect, useState } from 'react';

interface KeyManagerProps {
  value: {
    openaiKey: string;
    langGraphKey?: string;
    openaiBaseUrl?: string;
  };
  onSave(value: {
    openaiKey: string;
    langGraphKey?: string;
    openaiBaseUrl?: string;
  }): Promise<void> | void;
}

export const KeyManager: React.FC<KeyManagerProps> = ({ value, onSave }) => {
  const [openaiKey, setOpenaiKey] = useState(value.openaiKey);
  const [langGraphKey, setLangGraphKey] = useState(value.langGraphKey ?? '');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(
    value.openaiBaseUrl ?? 'https://api.openai.com/v1'
  );

  useEffect(() => {
    setOpenaiKey(value.openaiKey);
    setLangGraphKey(value.langGraphKey ?? '');
    setOpenaiBaseUrl(value.openaiBaseUrl ?? 'https://api.openai.com/v1');
  }, [value]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSave({ openaiKey, langGraphKey, openaiBaseUrl });
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="openaiKey">OpenAI API Key</label>
      <input
        id="openaiKey"
        type="password"
        value={openaiKey}
        onChange={(event) => setOpenaiKey(event.target.value)}
        placeholder="sk-..."
        required
      />

      <label htmlFor="langGraphKey">LangGraph API Key (optional)</label>
      <input
        id="langGraphKey"
        type="password"
        value={langGraphKey}
        onChange={(event) => setLangGraphKey(event.target.value)}
        placeholder="lg-..."
      />

      <label htmlFor="openaiBaseUrl">OpenAI Base URL</label>
      <input
        id="openaiBaseUrl"
        value={openaiBaseUrl}
        onChange={(event) => setOpenaiBaseUrl(event.target.value)}
        placeholder="https://api.openai.com/v1"
        required
      />

      <button className="primary" type="submit">
        Save Keys
      </button>
    </form>
  );
};

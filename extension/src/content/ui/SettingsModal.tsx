import * as React from 'react';
const { useCallback, useEffect, useMemo, useState } = React;
import { HistoryTab } from './tabs/HistoryTab.js';
import { ModelsTab } from './tabs/ModelsTab.js';
import { ProfilesTab } from './tabs/ProfilesTab.js';

export type SettingsTabKey = 'history' | 'profiles' | 'models';
type ToastKind = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
}

interface SettingsModalProps {
  onClose(): void;
  initialTab?: SettingsTabKey;
}

export type ToastHandler = (kind: ToastKind, message: string) => void;

const TAB_LABELS: Record<SettingsTabKey, string> = {
  history: 'History',
  profiles: 'Profiles',
  models: 'Models'
};

const TABS: SettingsTabKey[] = ['history', 'profiles', 'models'];

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, initialTab = 'history' }) => {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(initialTab);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const notify = useCallback<ToastHandler>((kind, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2600);
  }, []);

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'history':
        return <HistoryTab onNotify={notify} />;
      case 'profiles':
        return <ProfilesTab onNotify={notify} />;
      case 'models':
        return <ModelsTab onNotify={notify} />;
      default:
        return null;
    }
  }, [activeTab, notify]);

  return (
    <div className="lingualens-settings-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lingualens-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="LinguaLens settings"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h3>LinguaLens Settings</h3>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>
        <nav className="settings-tab-switcher">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
        <section>{tabContent}</section>
      </div>
      <aside className="lingualens-toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            {toast.message}
          </div>
        ))}
      </aside>
    </div>
  );
};

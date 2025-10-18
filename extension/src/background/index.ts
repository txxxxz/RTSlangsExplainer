import type { BackgroundMessage } from '../shared/messages.js';
import { handleBackgroundMessage } from './router.js';

chrome.runtime.onMessage.addListener(
  (message: BackgroundMessage, sender, sendResponse) => {
    handleBackgroundMessage(message, sender)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('[LinguaLens]', error);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }
);

chrome.runtime.onInstalled.addListener(() => {
  console.log('LinguaLens background worker ready');
});

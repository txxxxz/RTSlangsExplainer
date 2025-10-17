export function isExtensionContextValid(): boolean {
  try {
    // 尝试访问 chrome.runtime API，如果扩展上下文无效，这将抛出异常
    return !!chrome.runtime.id;
  } catch {
    return false;
  }
}

export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  fallback: T,
  onError?: (error: Error) => void
): Promise<T> {
  try {
    if (!isExtensionContextValid()) {
      throw new Error('Extension context is invalid');
    }
    return await operation();
  } catch (error) {
    if (onError && error instanceof Error) {
      onError(error);
    }
    return fallback;
  }
}
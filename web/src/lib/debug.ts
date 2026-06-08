const PREFIX = '[TimeVoucher]';

function hasDebugQuery(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}

export function isDebugEnabled(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }
  try {
    return localStorage.getItem('timeVoucherDebug') === '1' || hasDebugQuery();
  } catch {
    return hasDebugQuery();
  }
}

export function debugLog(step: string, detail?: Record<string, unknown>): void {
  if (!isDebugEnabled()) {
    return;
  }
  if (detail) {
    console.log(PREFIX, step, detail);
  } else {
    console.log(PREFIX, step);
  }
}

export function debugWarn(step: string, detail?: Record<string, unknown>): void {
  console.warn(PREFIX, step, detail ?? {});
}

export function debugError(step: string, error: unknown, detail?: Record<string, unknown>): void {
  console.error(PREFIX, step, {
    ...detail,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
  });
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    debugError('uncaught', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    debugError('unhandledrejection', event.reason);
  });
}

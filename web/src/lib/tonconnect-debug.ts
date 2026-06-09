import { debugError, debugLog, debugWarn, isDebugEnabled } from '@/lib/debug';
import { classifyTonConnectError } from '@/lib/tonconnect-errors';
import {
  fetchManifestHealth,
  manifestUrlForOrigin,
  summarizeManifestChecks,
  type ManifestFetchResult,
} from '@/lib/tonconnect-manifest';

export interface TonConnectDiagnosticStep {
  step: string;
  status: 'ok' | 'warn' | 'fail' | 'info';
  detail?: string;
}

export interface TonConnectDiagnosticReport {
  pageOrigin: string;
  manifestUrl: string;
  steps: TonConnectDiagnosticStep[];
  manifest: ManifestFetchResult | null;
  passed: boolean;
}

export function buildTonConnectDiagnosticSteps(
  pageOrigin: string,
  manifest: ManifestFetchResult | null,
): TonConnectDiagnosticStep[] {
  const steps: TonConnectDiagnosticStep[] = [
    {
      step: '1.page-origin',
      status: 'info',
      detail: pageOrigin,
    },
    {
      step: '2.manifest-url',
      status: 'info',
      detail: manifestUrlForOrigin(pageOrigin),
    },
  ];

  if (!manifest) {
    steps.push({
      step: '3.manifest-fetch',
      status: 'fail',
      detail: 'Manifest health check did not run',
    });
    return steps;
  }

  steps.push({
    step: '3.manifest-fetch',
    status: manifest.ok ? 'ok' : 'fail',
    detail: summarizeManifestChecks(manifest.checks),
  });

  for (const check of manifest.checks) {
    steps.push({
      step: `check.${check.id}`,
      status: check.status === 'ok' ? 'ok' : check.status === 'warn' ? 'warn' : 'fail',
      detail: check.message,
    });
  }

  if (manifest.manifest?.url && manifest.manifest.url !== pageOrigin) {
    steps.push({
      step: '4.origin-match',
      status: 'fail',
      detail: `Page is ${pageOrigin} but manifest.url is ${manifest.manifest.url}`,
    });
  } else {
    steps.push({
      step: '4.origin-match',
      status: 'ok',
      detail: 'manifest.url matches page origin',
    });
  }

  steps.push({
    step: '5.wallet-hint',
    status: pageOrigin.startsWith('http://') ? 'warn' : 'info',
    detail: pageOrigin.startsWith('http://')
      ? 'Browser checks passed, but MyTonWallet fetches manifest from the wallet app — localhost often fails there. Use https://time-voucher-ton-production.up.railway.app or Tonkeeper extension.'
      : 'HTTPS origin — wallets should fetch manifest and icon',
  });

  return steps;
}

export async function runTonConnectDiagnostics(
  pageOrigin: string = typeof window !== 'undefined' ? window.location.origin : '',
): Promise<TonConnectDiagnosticReport> {
  const manifestUrl = manifestUrlForOrigin(pageOrigin);
  debugLog('tonconnect.diagnostics.start', { pageOrigin, manifestUrl });

  let manifest: ManifestFetchResult | null = null;
  try {
    manifest = await fetchManifestHealth(manifestUrl, pageOrigin);
  } catch (error) {
    debugError('tonconnect.diagnostics.manifest.fail', error);
  }

  const steps = buildTonConnectDiagnosticSteps(pageOrigin, manifest);
  const passed = steps.every((s) => s.status !== 'fail');

  for (const step of steps) {
    const payload = { step: step.step, detail: step.detail };
    if (step.status === 'fail') {
      debugWarn('tonconnect.diagnostics', payload);
    } else if (isDebugEnabled()) {
      debugLog('tonconnect.diagnostics', payload);
    }
  }

  debugLog('tonconnect.diagnostics.done', { passed, failedSteps: steps.filter((s) => s.status === 'fail').length });

  return { pageOrigin, manifestUrl, steps, manifest, passed };
}

export function logTonConnectError(context: string, error: unknown): TonConnectDiagnosticReport['steps'] {
  const info = classifyTonConnectError(error);
  debugError(`tonconnect.${context}`, error, { kind: info.kind, code: info.code });
  for (const [index, step] of info.debugSteps.entries()) {
    debugWarn(`tonconnect.${context}.hint.${index + 1}`, { step });
  }
  return info.debugSteps.map((detail, index) => ({
    step: `error.hint.${index + 1}`,
    status: 'info' as const,
    detail,
  }));
}

/** Prevent TonConnect manifest rejections from surfacing as uncaught promise rejections. */
export function installTonConnectRejectionHandler(onManifestError?: (message: string) => void): () => void {
  const handler = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const text = reason instanceof Error ? reason.message : String(reason);
    if (!text.toLowerCase().includes('manifest') && !text.toLowerCase().includes('ton_connect')) {
      return;
    }

    event.preventDefault();
    const info = classifyTonConnectError(reason);
    logTonConnectError('unhandled', reason);
    onManifestError?.(info.userMessage);
  };

  window.addEventListener('unhandledrejection', handler);
  return () => window.removeEventListener('unhandledrejection', handler);
}

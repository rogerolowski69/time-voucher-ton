import type { TonConnectUI } from '@tonconnect/ui';
import { TonConnectUI as TonConnectUIClass } from '@tonconnect/ui';

import { debugError, debugLog } from '@/lib/debug';
import { logTonConnectError, runTonConnectDiagnostics } from '@/lib/tonconnect-debug';
import { tonConnectUserMessage } from '@/lib/tonconnect-errors';
import { manifestUrlForOrigin } from '@/lib/tonconnect-manifest';

export interface CreateTonConnectOptions {
  onManifestError?: (message: string) => void;
  onDiagnostics?: (passed: boolean) => void;
}

export interface TonConnectHandle {
  ui: TonConnectUI;
  manifestUrl: string;
  openConnectModal: () => Promise<void>;
  dispose: () => void;
}

export function createTonConnect(options: CreateTonConnectOptions = {}): TonConnectHandle {
  const origin = window.location.origin;
  const manifestUrl = manifestUrlForOrigin(origin);

  debugLog('tonconnect.init.start', { origin, manifestUrl });

  const ui = new TonConnectUIClass({ manifestUrl });

  debugLog('tonconnect.init.ok', { manifestUrl });

  void runTonConnectDiagnostics(origin).then((report) => {
    options.onDiagnostics?.(report.passed);
    if (!report.passed) {
      debugLog('tonconnect.init.manifest-issues', {
        summary: report.steps.filter((s) => s.status === 'fail').map((s) => s.detail),
      });
      options.onManifestError?.(
        'TonConnect manifest has issues — expand Technical details → TonConnect diagnostics.',
      );
    }
  });

  const openConnectModal = async (): Promise<void> => {
    debugLog('tonconnect.modal.open');
    try {
      await ui.openModal();
      debugLog('tonconnect.modal.closed');
    } catch (error) {
      logTonConnectError('modal.open', error);
      throw new Error(tonConnectUserMessage(error));
    }
  };

  const dispose = (): void => {
    debugLog('tonconnect.dispose');
  };

  return { ui, manifestUrl, openConnectModal, dispose };
}

export async function sendTonConnectTransaction(
  ui: TonConnectUI,
  context: string,
  request: Parameters<TonConnectUI['sendTransaction']>[0],
): Promise<Awaited<ReturnType<TonConnectUI['sendTransaction']>>> {
  debugLog(`tonconnect.tx.${context}.start`, {
    messageCount: request.messages.length,
    network: request.network,
  });
  try {
    const result = await ui.sendTransaction(request);
    debugLog(`tonconnect.tx.${context}.ok`, { bocLength: result.boc.length });
    return result;
  } catch (error) {
    logTonConnectError(`tx.${context}`, error);
    throw new Error(tonConnectUserMessage(error));
  }
}

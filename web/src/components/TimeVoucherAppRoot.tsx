import '@/lib/polyfills';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { TimeVoucherApp } from '@/components/TimeVoucherApp';
import { debugLog, installGlobalErrorHandlers } from '@/lib/debug';
import { installTonConnectRejectionHandler } from '@/lib/tonconnect-debug';

installGlobalErrorHandlers();
installTonConnectRejectionHandler();
debugLog('root.loaded');

export function TimeVoucherAppRoot(): preact.JSX.Element {
  return (
    <AppErrorBoundary>
      <TimeVoucherApp />
    </AppErrorBoundary>
  );
}

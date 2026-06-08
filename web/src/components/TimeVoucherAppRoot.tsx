import '@/lib/polyfills';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { TimeVoucherApp } from '@/components/TimeVoucherApp';
import { debugLog, installGlobalErrorHandlers } from '@/lib/debug';

installGlobalErrorHandlers();
debugLog('root.loaded');

export function TimeVoucherAppRoot(): preact.JSX.Element {
  return (
    <AppErrorBoundary>
      <TimeVoucherApp />
    </AppErrorBoundary>
  );
}

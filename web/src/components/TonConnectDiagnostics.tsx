import { useCallback, useEffect, useState } from 'preact/hooks';

import { Button } from '@/components/ui/button';
import { isDebugEnabled } from '@/lib/debug';
import {
  runTonConnectDiagnostics,
  type TonConnectDiagnosticReport,
  type TonConnectDiagnosticStep,
} from '@/lib/tonconnect-debug';

function statusClass(status: TonConnectDiagnosticStep['status']): string {
  switch (status) {
    case 'ok':
      return 'text-green-400';
    case 'warn':
      return 'text-yellow-400';
    case 'fail':
      return 'text-red-400';
    default:
      return 'text-muted-foreground';
  }
}

export function TonConnectDiagnostics(): preact.JSX.Element {
  const [report, setReport] = useState<TonConnectDiagnosticReport | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async (): Promise<void> => {
    setRunning(true);
    try {
      const next = await runTonConnectDiagnostics();
      setReport(next);
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (isDebugEnabled()) {
      void run();
    }
  }, [run]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={running} onClick={() => void run()}>
          {running ? 'Running…' : 'Run TonConnect diagnostics'}
        </Button>
        {report ? (
          <span className={report.passed ? 'text-green-400 text-xs' : 'text-red-400 text-xs'}>
            {report.passed ? 'All checks passed' : 'Issues found — see console [TimeVoucher]'}
          </span>
        ) : null}
      </div>

      {report ? (
        <ul className="space-y-1 font-mono text-xs">
          {report.steps.map((step) => (
            <li key={step.step} className={statusClass(step.status)}>
              {step.step}: {step.detail ?? step.status}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Checks manifest URL, JSON fields, icon-180.png, and origin match. Filter console for{' '}
          <code className="font-mono">tonconnect.diagnostics</code>.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Debug tips: add <code className="font-mono">?debug=1</code> · same host in URL bar (localhost
        vs 127.0.0.1) · PNG icon only · HTTPS on production.
      </p>
    </div>
  );
}

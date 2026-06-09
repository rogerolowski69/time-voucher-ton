/** TonConnect connect_error codes (wallet → dApp). */
export const TON_CONNECT_ERROR_CODES = {
  UNKNOWN: 0,
  BAD_REQUEST: 1,
  MANIFEST_NOT_FOUND: 2,
  MANIFEST_CONTENT: 3,
  UNKNOWN_APP: 100,
  USER_REJECTS: 300,
} as const;

export type TonConnectErrorKind =
  | 'manifest_not_found'
  | 'manifest_content'
  | 'user_rejected'
  | 'wrong_network'
  | 'wallet_missing'
  | 'transaction_rejected'
  | 'analytics_blocked'
  | 'unknown';

export interface TonConnectErrorInfo {
  kind: TonConnectErrorKind;
  code: number | null;
  message: string;
  userMessage: string;
  debugSteps: string[];
  raw: string;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function extractCode(text: string): number | null {
  const match = text.match(/\bcode[:\s]*(\d+)\b/i) ?? text.match(/\(code (\d+)\)/i);
  if (!match) {
    return null;
  }
  const code = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(code) ? code : null;
}

export function classifyTonConnectError(error: unknown): TonConnectErrorInfo {
  const raw = errorText(error);
  const lower = raw.toLowerCase();
  const code = extractCode(raw);

  if (code === TON_CONNECT_ERROR_CODES.MANIFEST_NOT_FOUND || lower.includes('manifest not found')) {
    return {
      kind: 'manifest_not_found',
      code,
      message: raw,
      userMessage: 'Wallet could not load tonconnect-manifest.json from this site.',
      debugSteps: [
        'Open /tonconnect-manifest.json in the browser — expect HTTP 200 and application/json.',
        'If using local dev, visit the same host as the app (localhost:4321 vs 127.0.0.1:4321).',
        'On Railway, set PUBLIC_URL to your https://…up.railway.app domain and redeploy.',
        'Check DevTools → Network for 404/CORS on the manifest request.',
      ],
      raw,
    };
  }

  if (
    code === TON_CONNECT_ERROR_CODES.MANIFEST_CONTENT ||
    lower.includes('manifest content') ||
    lower.includes('manifestcontent')
  ) {
    return {
      kind: 'manifest_content',
      code,
      message: raw,
      userMessage: 'TonConnect manifest rejected by wallet (invalid fields or unreachable icon).',
      debugSteps: [
        'Manifest must include url, name, iconUrl — iconUrl must be PNG (not SVG), ideally 180×180.',
        'manifest.url must match window.location.origin (no localhost vs 127.0.0.1 mismatch).',
        'Open icon-180.png — must return HTTP 200.',
        'Wallets on desktop may reject plain http://localhost; try production HTTPS URL.',
        'Filter console for [TimeVoucher] tonconnect.diagnostics',
      ],
      raw,
    };
  }

  if (
    lower.includes('transaction') &&
    (lower.includes('reject') || lower.includes('cancel') || lower.includes('declin'))
  ) {
    return {
      kind: 'transaction_rejected',
      code,
      message: raw,
      userMessage: 'Transaction cancelled in wallet.',
      debugSteps: ['Confirm the transaction in MyTonWallet/Tonkeeper when prompted.'],
      raw,
    };
  }

  if (
    code === TON_CONNECT_ERROR_CODES.USER_REJECTS ||
    lower.includes('user rejects') ||
    lower.includes('connection declined') ||
    lower.includes('user declined')
  ) {
    return {
      kind: 'user_rejected',
      code,
      message: raw,
      userMessage: 'Wallet connection was declined. Approve in MyTonWallet/Tonkeeper and retry.',
      debugSteps: [
        'In MyTonWallet bridge, click Open MyTonWallet and approve the connection.',
        'Ensure the wallet is on testnet if PUBLIC_NETWORK=testnet.',
        'Disable ad-blocker for analytics.ton.org (optional; should not block connect).',
      ],
      raw,
    };
  }

  if (lower.includes('wrong network') || lower.includes('chain')) {
    return {
      kind: 'wrong_network',
      code,
      message: raw,
      userMessage: 'Wallet network does not match the app. Switch to testnet/mainnet in your wallet.',
      debugSteps: [
        'Check PUBLIC_NETWORK in .env matches wallet network.',
        'Tonkeeper: Settings → Dev mode → Testnet.',
      ],
      raw,
    };
  }

  if (lower.includes('analytics') && lower.includes('failed to fetch')) {
    return {
      kind: 'analytics_blocked',
      code,
      message: raw,
      userMessage: 'TonConnect analytics blocked (ad-blocker). Connection may still work — retry connect.',
      debugSteps: [
        'ERR_BLOCKED_BY_CLIENT on analytics.ton.org is harmless.',
        'If connect still fails, focus on manifest diagnostics instead.',
      ],
      raw,
    };
  }

  if (lower.includes('wallet not connected') || lower.includes('no wallet')) {
    return {
      kind: 'wallet_missing',
      code,
      message: raw,
      userMessage: 'Connect your TON wallet first, then retry.',
      debugSteps: ['Click Connect wallet and complete approval in the wallet app.'],
      raw,
    };
  }

  return {
    kind: 'unknown',
    code,
    message: raw,
    userMessage: 'TonConnect error — open DevTools, filter [TimeVoucher], add ?debug=1 to the URL.',
    debugSteps: [
      'Add ?debug=1 to URL for step-by-step logs.',
      'Run diagnostics from Technical details → TonConnect diagnostics.',
      'Check Network tab for tonconnect-manifest.json and icon-180.png.',
    ],
    raw,
  };
}

export function tonConnectUserMessage(error: unknown): string {
  return classifyTonConnectError(error).userMessage;
}

export function tonConnectDebugSteps(error: unknown): string[] {
  return classifyTonConnectError(error).debugSteps;
}

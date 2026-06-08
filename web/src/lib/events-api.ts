import WebApp from '@twa-dev/sdk';

import { debugError, debugLog } from '@/lib/debug';

export interface LoggedEventResponse {
  ok: boolean;
  event?: {
    id: number;
    eventType: string;
    txHash: string | null;
    createdAt: string;
  };
}

export interface PurchaseLogInput {
  walletAddress: string;
  boc: string;
  minterAddress: string;
  mintPrice: string;
  jettonAmount: string;
  tonAmount: string;
  network: string;
}

export interface RedeemLogInput {
  walletAddress: string;
  boc: string;
  minterAddress?: string;
  redeemAddress?: string;
  nftItemAddress?: string;
  jettonAmount?: string;
  network: string;
  note?: string;
}

async function postEvent(path: string, body: object): Promise<LoggedEventResponse> {
  const initData = WebApp.initData || undefined;
  debugLog('api.postEvent.start', { path, hasInitData: Boolean(initData) });

  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, initData }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (LoggedEventResponse & { error?: string; detail?: string })
    | null;

  if (!response.ok || !payload?.ok) {
    const message = payload?.error ?? payload?.detail ?? `Event logging failed (${response.status})`;
    debugError('api.postEvent.fail', new Error(message), { path, status: response.status });
    throw new Error(message);
  }

  debugLog('api.postEvent.ok', { path, eventId: payload.event?.id });
  return payload;
}

export async function logPurchaseEvent(input: PurchaseLogInput): Promise<LoggedEventResponse> {
  return postEvent('/api/events/purchase', input);
}

export async function logRedeemEvent(input: RedeemLogInput): Promise<LoggedEventResponse> {
  return postEvent('/api/events/redeem', {
    ...input,
    note: input.note ?? 'time voucher redeem',
  });
}

export function tonscanTxUrl(network: string, txHash: string | null): string | null {
  if (!txHash) {
    return null;
  }
  const base = network === 'mainnet' ? 'https://tonscan.org' : 'https://testnet.tonscan.org';
  return `${base}/tx/${txHash}`;
}

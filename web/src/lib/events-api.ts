import WebApp from '@twa-dev/sdk';

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
  minterAddress: string;
  redeemAddress: string;
  jettonAmount: string;
  network: string;
  note?: string;
}

async function postEvent(path: string, body: object): Promise<LoggedEventResponse> {
  const initData = WebApp.initData || undefined;
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, initData }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (LoggedEventResponse & { error?: string; detail?: string })
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? payload?.detail ?? `Event logging failed (${response.status})`);
  }

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

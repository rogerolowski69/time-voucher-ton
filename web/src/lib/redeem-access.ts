import { Address, beginCell } from '@ton/core';
import type { TonClient } from '@ton/ton';

import { debugError, debugLog } from '@/lib/debug';

export const OP_REDEEM = 0x1a2b3c4d;

export interface RedeemData {
  ownerAddress: string;
  redeemed: boolean;
}

export function normalizeTonAddress(address: string, testOnly = false): string {
  try {
    return Address.parse(address).toString({ bounceable: false, testOnly });
  } catch {
    return address.trim();
  }
}

export async function getRedeemData(
  client: TonClient,
  nftItemAddress: string,
  testOnly = false,
): Promise<RedeemData> {
  debugLog('nft.getRedeemData.start', { nftItemAddress });
  try {
    const item = Address.parse(nftItemAddress);
    const result = await client.runMethod(item, 'get_redeem_data');
    const owner = result.stack.readAddress();
    const redeemed = result.stack.readBoolean();
    const data: RedeemData = {
      ownerAddress: owner.toString({ bounceable: false, testOnly }),
      redeemed,
    };
    debugLog('nft.getRedeemData.ok', data);
    return data;
  } catch (error) {
    debugError('nft.getRedeemData.fail', error, { nftItemAddress });
    throw error;
  }
}

/** Version A — booking link only after on-chain redemption */
export async function canAccessBookingLink(
  client: TonClient,
  nftItemAddress: string,
  connectedWallet: string,
  testOnly = false,
): Promise<boolean> {
  const data = await getRedeemData(client, nftItemAddress, testOnly);
  const isOwner =
    normalizeTonAddress(data.ownerAddress, testOnly) ===
    normalizeTonAddress(connectedWallet, testOnly);

  debugLog('access.booking.check', { isOwner, redeemed: data.redeemed, version: 'A' });

  if (!isOwner) {
    return false;
  }

  return data.redeemed === true;
}

/** Version B — redeem page only before redemption */
export async function canOpenRedeemPage(
  client: TonClient,
  nftItemAddress: string,
  connectedWallet: string,
  testOnly = false,
): Promise<boolean> {
  const data = await getRedeemData(client, nftItemAddress, testOnly);
  const isOwner =
    normalizeTonAddress(data.ownerAddress, testOnly) ===
    normalizeTonAddress(connectedWallet, testOnly);

  debugLog('access.redeemPage.check', { isOwner, redeemed: data.redeemed, version: 'B' });

  if (!isOwner) {
    return false;
  }

  return data.redeemed === false;
}

export function buildRedeemPayload(queryId = 0n): string {
  const body = beginCell().storeUint(OP_REDEEM, 32).storeUint(queryId, 64).endCell();
  return body.toBoc().toString('base64');
}

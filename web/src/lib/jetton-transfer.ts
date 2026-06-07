import { Address, beginCell, toNano } from '@ton/core';
import { TonClient } from '@ton/ton';

export const ASK_TO_TRANSFER_OPCODE = 0x0f8a7ea5;
export const DEFAULT_TRANSFER_GAS_TON = '0.3';

export function buildJettonTransferPayload(
  jettonAmount: bigint,
  recipient: Address,
  responseAddress: Address,
): string {
  const body = beginCell()
    .storeUint(ASK_TO_TRANSFER_OPCODE, 32)
    .storeUint(0n, 64)
    .storeCoins(jettonAmount)
    .storeAddress(recipient)
    .storeAddress(responseAddress)
    .storeBit(0)
    .storeCoins(0n)
    .storeBit(0)
    .endCell();

  return body.toBoc().toString('base64');
}

export async function fetchJettonWalletAddress(
  client: TonClient,
  minter: Address,
  owner: Address,
): Promise<Address> {
  const result = await client.runMethod(minter, 'get_wallet_address', [
    { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
  ]);
  return result.stack.readAddress();
}

export function transferGasAmount(gasTon = DEFAULT_TRANSFER_GAS_TON): string {
  return toNano(gasTon).toString();
}

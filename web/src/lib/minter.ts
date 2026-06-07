import { Address, beginCell, fromNano, toNano } from '@ton/core';
import { TonClient } from '@ton/ton';

export const BUY_TIME_OPCODE = 0x8f4e2b17;

export function buildBuyTimePayload(queryId = 0n): string {
  const body = beginCell().storeUint(BUY_TIME_OPCODE, 32).storeUint(queryId, 64).endCell();
  return body.toBoc().toString('base64');
}

export function createTonClient(rpcUrl: string, apiKey?: string): TonClient {
  return new TonClient({
    endpoint: rpcUrl,
    apiKey,
  });
}

export async function fetchMintPrice(client: TonClient, minter: Address): Promise<bigint> {
  const result = await client.runMethod(minter, 'get_mint_price');
  return result.stack.readBigNumber();
}

export async function fetchTokensPerMint(client: TonClient, minter: Address): Promise<bigint> {
  const result = await client.runMethod(minter, 'get_tokens_per_mint');
  return result.stack.readBigNumber();
}

export async function fetchJettonBalance(
  client: TonClient,
  minter: Address,
  owner: Address,
): Promise<bigint> {
  const walletResult = await client.runMethod(minter, 'get_wallet_address', [
    { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
  ]);
  const walletAddress = walletResult.stack.readAddress();

  const state = await client.getContractState(walletAddress);
  if (!state || state.state !== 'active') {
    return 0n;
  }

  const walletData = await client.runMethod(walletAddress, 'get_wallet_data');
  return walletData.stack.readBigNumber();
}

export function formatTon(amount: bigint): string {
  return fromNano(amount);
}

export function buyTimeAmount(mintPrice: bigint, gasBufferTon: string): string {
  return (mintPrice + toNano(gasBufferTon)).toString();
}

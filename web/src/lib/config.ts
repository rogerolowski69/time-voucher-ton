import { CHAIN } from '@tonconnect/ui';

export type NetworkMode = 'mainnet' | 'testnet';

export interface AppConfig {
  minterAddress: string;
  nftItemAddress: string;
  network: NetworkMode;
  chain: CHAIN;
  rpcUrl: string;
  tonscanBase: string;
  gasBufferTon: string;
  redeemAddress: string;
  calComUrl: string;
  issuerEmail: string;
  toncenterApiKey?: string;
}

function networkFromEnv(): NetworkMode {
  return import.meta.env.PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
}

export function loadConfig(): AppConfig {
  const network = networkFromEnv();
  const minterAddress = import.meta.env.PUBLIC_MINTER_ADDRESS?.trim() ?? '';
  const nftItemAddress = import.meta.env.PUBLIC_NFT_ITEM_ADDRESS?.trim() ?? '';

  return {
    minterAddress,
    nftItemAddress,
    network,
    chain: network === 'mainnet' ? CHAIN.MAINNET : CHAIN.TESTNET,
    rpcUrl:
      network === 'mainnet'
        ? 'https://toncenter.com/api/v2/jsonRPC'
        : 'https://testnet.toncenter.com/api/v2/jsonRPC',
    tonscanBase: network === 'mainnet' ? 'https://tonscan.org' : 'https://testnet.tonscan.org',
    gasBufferTon: import.meta.env.PUBLIC_GAS_BUFFER_TON ?? '0.3',
    redeemAddress: import.meta.env.PUBLIC_REDEEM_ADDRESS?.trim() ?? '',
    calComUrl: import.meta.env.PUBLIC_CAL_COM_URL ?? 'https://cal.com/your-link',
    issuerEmail: import.meta.env.PUBLIC_ISSUER_EMAIL ?? 'you@example.com',
    toncenterApiKey: import.meta.env.PUBLIC_TONCENTER_API_KEY,
  };
}

/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_MINTER_ADDRESS?: string;
  readonly PUBLIC_NFT_ITEM_ADDRESS?: string;
  readonly PUBLIC_NETWORK?: string;
  readonly PUBLIC_GAS_BUFFER_TON?: string;
  readonly PUBLIC_REDEEM_ADDRESS?: string;
  readonly PUBLIC_CAL_COM_URL?: string;
  readonly PUBLIC_ISSUER_EMAIL?: string;
  readonly PUBLIC_TONCENTER_API_KEY?: string;
  readonly PUBLIC_TELEGRAM_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

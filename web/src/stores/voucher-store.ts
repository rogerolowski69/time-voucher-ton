import { create } from 'zustand';

import { initTelegramWebApp, type TelegramAuthState } from '@/lib/telegram';

export type StatusKind = 'info' | 'ok' | 'error';

export interface StatusState {
  message: string;
  kind: StatusKind;
  html?: string;
}

interface VoucherState {
  telegramAuth: TelegramAuthState;
  mintPrice: bigint;
  tokensPerMint: bigint;
  connectedWalletAddress: string | undefined;
  currentTimeBalance: bigint;
  status: StatusState;
  showBookNow: boolean;
  buying: boolean;
  redeeming: boolean;
  activeTab: 'buy' | 'redeem';
  setTelegramAuth: (auth: TelegramAuthState) => void;
  setMinterData: (price: bigint, perMint: bigint) => void;
  setWalletBalance: (address: string, balance: bigint) => void;
  clearWallet: () => void;
  setStatus: (status: StatusState) => void;
  setPlainStatus: (message: string, kind?: StatusKind) => void;
  setShowBookNow: (show: boolean) => void;
  setBuying: (buying: boolean) => void;
  setRedeeming: (redeeming: boolean) => void;
  setActiveTab: (tab: 'buy' | 'redeem') => void;
}

export const useVoucherStore = create<VoucherState>((set) => ({
  telegramAuth: initTelegramWebApp(),
  mintPrice: 0n,
  tokensPerMint: 1n,
  connectedWalletAddress: undefined,
  currentTimeBalance: 0n,
  status: {
    message: 'Connect a wallet to buy TIME.',
    kind: 'info',
  },
  showBookNow: false,
  buying: false,
  redeeming: false,
  activeTab: 'buy',
  setTelegramAuth: (telegramAuth) => set({ telegramAuth }),
  setMinterData: (mintPrice, tokensPerMint) => set({ mintPrice, tokensPerMint }),
  setWalletBalance: (connectedWalletAddress, currentTimeBalance) =>
    set({ connectedWalletAddress, currentTimeBalance }),
  clearWallet: () => set({ connectedWalletAddress: undefined, currentTimeBalance: 0n }),
  setStatus: (status) => set({ status }),
  setPlainStatus: (message, kind = 'info') => set({ status: { message, kind } }),
  setShowBookNow: (showBookNow) => set({ showBookNow }),
  setBuying: (buying) => set({ buying }),
  setRedeeming: (redeeming) => set({ redeeming }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));

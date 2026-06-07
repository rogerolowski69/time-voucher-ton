import { Address } from '@ton/core';
import type { TonConnectUI } from '@tonconnect/ui';
import type { TonClient } from '@ton/ton';
import { useCallback } from 'preact/hooks';

import { buildCalBookingUrl } from '@/lib/cal-booking';
import type { AppConfig } from '@/lib/config';
import { logPurchaseEvent, logRedeemEvent, tonscanTxUrl } from '@/lib/events-api';
import {
  buildJettonTransferPayload,
  fetchJettonWalletAddress,
  transferGasAmount,
} from '@/lib/jetton-transfer';
import {
  buildBuyTimePayload,
  buyTimeAmount,
  fetchJettonBalance,
  fetchMintPrice,
  fetchTokensPerMint,
} from '@/lib/minter';
import { initTelegramWebApp, redemptionNote, verifyTelegramAuth } from '@/lib/telegram';
import { useVoucherStore } from '@/stores/voucher-store';

export function useVoucherActions(
  config: AppConfig,
  client: TonClient,
  tonConnectUI: TonConnectUI,
): {
  refreshMinterData: () => Promise<{ price: bigint; perMint: bigint } | null>;
  refreshWalletBalance: (address: string) => Promise<void>;
  bootstrapTelegramAuth: () => Promise<void>;
  handleBuy: () => Promise<void>;
  handleRedeem: () => Promise<void>;
  copyBookingNote: () => Promise<void>;
} {
  const store = useVoucherStore;

  const refreshMinterData = useCallback(async (): Promise<{ price: bigint; perMint: bigint } | null> => {
    if (!config.minterAddress) {
      return null;
    }

    try {
      const minter = Address.parse(config.minterAddress);
      const [price, perMint] = await Promise.all([
        fetchMintPrice(client, minter),
        fetchTokensPerMint(client, minter),
      ]);
      store.getState().setMinterData(price, perMint);
      return { price, perMint };
    } catch (error) {
      store.getState().setPlainStatus(
        error instanceof Error ? error.message : 'Could not load minter price from chain.',
        'error',
      );
      return null;
    }
  }, [client, config.minterAddress, store]);

  const refreshWalletBalance = useCallback(
    async (address: string): Promise<void> => {
      if (!config.minterAddress) {
        return;
      }

      try {
        const minter = Address.parse(config.minterAddress);
        const owner = Address.parse(address);
        const balance = await fetchJettonBalance(client, minter, owner);
        store.getState().setWalletBalance(
          owner.toString({ bounceable: false, testOnly: config.network === 'testnet' }),
          balance,
        );
      } catch (error) {
        store.getState().setPlainStatus(
          error instanceof Error ? error.message : 'Could not read TIME balance.',
          'error',
        );
      }
    },
    [client, config.minterAddress, config.network, store],
  );

  const bootstrapTelegramAuth = useCallback(async (): Promise<void> => {
    const initial = initTelegramWebApp();
    store.getState().setTelegramAuth(initial);

    if (!initial.isMiniApp || !initial.initData) {
      return;
    }

    try {
      const verified = await verifyTelegramAuth(initial.initData);
      store.getState().setTelegramAuth({ ...initial, verified });
      if (!verified) {
        store.getState().setPlainStatus('Telegram sign-in could not be verified on the server.', 'error');
      }
    } catch {
      store.getState().setPlainStatus('Telegram auth server is unavailable. User shown, but not verified.', 'error');
    }
  }, [store]);

  const handleBuy = useCallback(async (): Promise<void> => {
    if (!config.minterAddress) {
      store.getState().setPlainStatus('Set PUBLIC_MINTER_ADDRESS in web/.env first.', 'error');
      return;
    }

    const wallet = tonConnectUI.wallet;
    if (!wallet) {
      tonConnectUI.openModal();
      store.getState().setPlainStatus('Connect your TON wallet to continue.', 'info');
      return;
    }

    if (wallet.account.chain !== config.chain) {
      store.getState().setPlainStatus(`Switch your wallet to ${config.network} and try again.`, 'error');
      return;
    }

    const latest = await refreshMinterData();
    if (!latest || latest.price <= 0n) {
      store.getState().setPlainStatus('Mint price is not available yet.', 'error');
      return;
    }

    const { price, perMint } = latest;
    store.getState().setBuying(true);
    store.getState().setPlainStatus('Confirm the purchase in your wallet…', 'info');

    try {
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        network: config.chain,
        messages: [
          {
            address: config.minterAddress,
            amount: buyTimeAmount(price, config.gasBufferTon),
            payload: buildBuyTimePayload(),
          },
        ],
      });

      try {
        const logged = await logPurchaseEvent({
          walletAddress: wallet.account.address,
          boc: result.boc,
          minterAddress: config.minterAddress,
          mintPrice: price.toString(),
          jettonAmount: perMint.toString(),
          tonAmount: buyTimeAmount(price, config.gasBufferTon),
          network: config.network,
        });
        const txUrl = tonscanTxUrl(config.network, logged.event?.txHash ?? null);
        if (txUrl) {
          store.getState().setStatus({
            kind: 'ok',
            message: 'Purchase logged.',
            html: `Purchase logged. <a class="underline" href="${txUrl}" target="_blank" rel="noreferrer">View transaction</a>`,
          });
        } else {
          store.getState().setPlainStatus('Purchase sent. TIME will appear in your wallet shortly.', 'ok');
        }
      } catch (logError) {
        store.getState().setPlainStatus(
          logError instanceof Error
            ? `Purchase sent, but logging failed: ${logError.message}`
            : 'Purchase sent, but logging failed.',
          'ok',
        );
      }

      await refreshWalletBalance(wallet.account.address);
    } catch (error) {
      store.getState().setPlainStatus(
        error instanceof Error ? error.message : 'Purchase was cancelled or failed.',
        'error',
      );
    } finally {
      store.getState().setBuying(false);
    }
  }, [config, refreshMinterData, refreshWalletBalance, store, tonConnectUI]);

  const handleRedeem = useCallback(async (): Promise<void> => {
    if (!config.minterAddress) {
      store.getState().setPlainStatus('Set PUBLIC_MINTER_ADDRESS in web/.env first.', 'error');
      return;
    }

    if (!config.redeemAddress) {
      store.getState().setPlainStatus('Set PUBLIC_REDEEM_ADDRESS to the issuer TON wallet address.', 'error');
      return;
    }

    const wallet = tonConnectUI.wallet;
    if (!wallet) {
      tonConnectUI.openModal();
      store.getState().setPlainStatus('Connect your TON wallet to redeem TIME.', 'info');
      return;
    }

    if (wallet.account.chain !== config.chain) {
      store.getState().setPlainStatus(`Switch your wallet to ${config.network} and try again.`, 'error');
      return;
    }

    const latest = await refreshMinterData();
    if (!latest || latest.perMint <= 0n) {
      store.getState().setPlainStatus('Redeem amount is not available yet.', 'error');
      return;
    }

    const redeemAmount = latest.perMint;
    const { currentTimeBalance, telegramAuth, connectedWalletAddress } = store.getState();

    if (currentTimeBalance < redeemAmount) {
      store.getState().setPlainStatus('You need more TIME before redeeming.', 'error');
      return;
    }

    const bookingNote = redemptionNote(telegramAuth.user, connectedWalletAddress);

    store.getState().setRedeeming(true);
    store.getState().setPlainStatus('Confirm the TIME transfer in your wallet…', 'info');

    try {
      const minter = Address.parse(config.minterAddress);
      const owner = Address.parse(wallet.account.address);
      const issuer = Address.parse(config.redeemAddress);
      const jettonWallet = await fetchJettonWalletAddress(client, minter, owner);

      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        network: config.chain,
        messages: [
          {
            address: jettonWallet.toString(),
            amount: transferGasAmount(),
            payload: buildJettonTransferPayload(redeemAmount, issuer, owner),
          },
        ],
      });

      let loggedTxHash: string | null = null;
      let loggingFailed = false;
      try {
        const logged = await logRedeemEvent({
          walletAddress: wallet.account.address,
          boc: result.boc,
          minterAddress: config.minterAddress,
          redeemAddress: config.redeemAddress,
          jettonAmount: redeemAmount.toString(),
          network: config.network,
          note: bookingNote,
        });
        loggedTxHash = logged.event?.txHash ?? null;
      } catch (logError) {
        loggingFailed = true;
        store.getState().setPlainStatus(
          logError instanceof Error
            ? `TIME sent, but logging failed: ${logError.message}`
            : 'TIME sent, but logging failed.',
          'ok',
        );
      }

      await refreshWalletBalance(wallet.account.address);
      store.getState().setShowBookNow(true);
      store.getState().setActiveTab('redeem');

      if (!loggingFailed) {
        const txUrl = tonscanTxUrl(config.network, loggedTxHash);
        if (txUrl) {
          store.getState().setStatus({
            kind: 'ok',
            message: 'Redemption complete.',
            html: `Redemption complete. <a class="underline" href="${txUrl}" target="_blank" rel="noreferrer">View transaction</a> · book your hour below.`,
          });
        } else {
          store.getState().setPlainStatus('Redemption complete. Book your hour below.', 'ok');
        }
      }
    } catch (error) {
      store.getState().setPlainStatus(
        error instanceof Error ? error.message : 'Redemption was cancelled or failed.',
        'error',
      );
    } finally {
      store.getState().setRedeeming(false);
    }
  }, [client, config, refreshMinterData, refreshWalletBalance, store, tonConnectUI]);

  const copyBookingNote = useCallback(async (): Promise<void> => {
    const { telegramAuth, connectedWalletAddress } = store.getState();
    const note = redemptionNote(telegramAuth.user, connectedWalletAddress);
    try {
      await navigator.clipboard.writeText(note);
      store.getState().setPlainStatus('Booking note copied. Paste it in Cal.com if needed.', 'ok');
    } catch {
      store.getState().setPlainStatus(
        'Could not copy automatically — select the note text and copy manually.',
        'info',
      );
    }
  }, [store]);

  return {
    refreshMinterData,
    refreshWalletBalance,
    bootstrapTelegramAuth,
    handleBuy,
    handleRedeem,
    copyBookingNote,
  };
}

export function useBookingNote(): string {
  const telegramAuth = useVoucherStore((state) => state.telegramAuth);
  const connectedWalletAddress = useVoucherStore((state) => state.connectedWalletAddress);
  return redemptionNote(telegramAuth.user, connectedWalletAddress);
}

export function useBookNowUrl(config: AppConfig): string {
  const telegramAuth = useVoucherStore((state) => state.telegramAuth);
  const bookingNote = useBookingNote();
  return buildCalBookingUrl(config.calComUrl, {
    note: bookingNote,
    guestName: telegramAuth.user
      ? [telegramAuth.user.firstName, telegramAuth.user.lastName].filter(Boolean).join(' ')
      : undefined,
  });
}

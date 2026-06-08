import { Address } from '@ton/core';
import type { TonConnectUI } from '@tonconnect/ui';
import type { TonClient } from '@ton/ton';
import { useCallback } from 'preact/hooks';

import { debugError, debugLog, debugWarn } from '@/lib/debug';
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
import {
  buildRedeemPayload,
  canAccessBookingLink,
  canOpenRedeemPage,
  getRedeemData,
} from '@/lib/redeem-access';
import { initTelegramWebApp, redemptionNote, verifyTelegramAuth } from '@/lib/telegram';
import { useVoucherStore } from '@/stores/voucher-store';

export function useVoucherActions(
  config: AppConfig,
  client: TonClient,
  tonConnectUI: TonConnectUI | null,
): {
  refreshMinterData: () => Promise<{ price: bigint; perMint: bigint } | null>;
  refreshWalletBalance: (address: string) => Promise<void>;
  refreshNftAccess: (address: string) => Promise<void>;
  bootstrapTelegramAuth: () => Promise<void>;
  handleBuy: () => Promise<void>;
  handleRedeem: () => Promise<void>;
  handleNftRedeem: () => Promise<void>;
  copyBookingNote: () => Promise<void>;
} {
  const store = useVoucherStore;
  const testOnly = config.network === 'testnet';

  const refreshMinterData = useCallback(async (): Promise<{ price: bigint; perMint: bigint } | null> => {
    if (!config.minterAddress) {
      debugWarn('minter.refresh.skip', { reason: 'PUBLIC_MINTER_ADDRESS not set' });
      return null;
    }

    debugLog('minter.refresh.start', { minterAddress: config.minterAddress });
    try {
      const minter = Address.parse(config.minterAddress);
      const [price, perMint] = await Promise.all([
        fetchMintPrice(client, minter),
        fetchTokensPerMint(client, minter),
      ]);
      debugLog('minter.refresh.ok', { price: price.toString(), perMint: perMint.toString() });
      store.getState().setMinterData(price, perMint);
      return { price, perMint };
    } catch (error) {
      debugError('minter.refresh.fail', error);
      store.getState().setPlainStatus(
        error instanceof Error ? error.message : 'Could not load minter price from chain.',
        'error',
      );
      return null;
    }
  }, [client, config.minterAddress, store]);

  const refreshNftAccess = useCallback(
    async (address: string): Promise<void> => {
      if (!config.nftItemAddress) {
        store.getState().setNftAccess(null, false, false);
        return;
      }

      try {
        const [booking, redeemPage, data] = await Promise.all([
          canAccessBookingLink(client, config.nftItemAddress, address, testOnly),
          canOpenRedeemPage(client, config.nftItemAddress, address, testOnly),
          getRedeemData(client, config.nftItemAddress, testOnly),
        ]);
        store.getState().setNftAccess(data.redeemed, booking, redeemPage);
        debugLog('nft.access.updated', { redeemed: data.redeemed, booking, redeemPage });
      } catch (error) {
        debugError('nft.access.fail', error);
        store.getState().setNftAccess(null, false, false);
      }
    },
    [client, config.nftItemAddress, store, testOnly],
  );

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
          owner.toString({ bounceable: false, testOnly }),
          balance,
        );
        await refreshNftAccess(address);
      } catch (error) {
        debugError('wallet.balance.fail', error, { address });
        store.getState().setPlainStatus(
          error instanceof Error ? error.message : 'Could not read TIME balance.',
          'error',
        );
      }
    },
    [client, config.minterAddress, refreshNftAccess, store, testOnly],
  );

  const bootstrapTelegramAuth = useCallback(async (): Promise<void> => {
    const initial = initTelegramWebApp();
    debugLog('telegram.bootstrap', {
      isMiniApp: initial.isMiniApp,
      hasUser: Boolean(initial.user),
    });
    store.getState().setTelegramAuth(initial);

    if (!initial.isMiniApp || !initial.initData) {
      return;
    }

    try {
      const verified = await verifyTelegramAuth(initial.initData);
      store.getState().setTelegramAuth({ ...initial, verified });
    } catch (error) {
      debugError('telegram.verify.fail', error);
      store.getState().setPlainStatus('Telegram auth server unavailable.', 'error');
    }
  }, [store]);

  const handleBuy = useCallback(async (): Promise<void> => {
    debugLog('buy.start');

    if (!tonConnectUI) {
      store.getState().setPlainStatus('Wallet UI is still loading. Try again in a moment.', 'info');
      return;
    }

    if (!config.minterAddress) {
      store.getState().setPlainStatus('Set PUBLIC_MINTER_ADDRESS in Railway variables and redeploy.', 'error');
      return;
    }

    const wallet = tonConnectUI.wallet;
    if (!wallet) {
      debugLog('buy.noWallet', { action: 'opening TonConnect modal' });
      try {
        await tonConnectUI.openModal();
      } catch (error) {
        debugError('buy.tonConnectModal.fail', error);
      }
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
      debugLog('buy.sendTransaction.ok', { bocLength: result.boc.length });

      try {
        await logPurchaseEvent({
          walletAddress: wallet.account.address,
          boc: result.boc,
          minterAddress: config.minterAddress,
          mintPrice: price.toString(),
          jettonAmount: perMint.toString(),
          tonAmount: buyTimeAmount(price, config.gasBufferTon),
          network: config.network,
        });
        store.getState().setPlainStatus('Purchase sent. TIME will appear in your wallet shortly.', 'ok');
      } catch (logError) {
        debugError('buy.logEvent.fail', logError);
        store.getState().setPlainStatus('Purchase sent, but server logging failed.', 'ok');
      }

      await refreshWalletBalance(wallet.account.address);
    } catch (error) {
      debugError('buy.fail', error);
      store.getState().setPlainStatus(
        error instanceof Error ? error.message : 'Purchase was cancelled or failed.',
        'error',
      );
    } finally {
      store.getState().setBuying(false);
    }
  }, [config, refreshMinterData, refreshWalletBalance, store, tonConnectUI]);

  const handleNftRedeem = useCallback(async (): Promise<void> => {
    debugLog('nft.redeem.start');

    if (!tonConnectUI) {
      store.getState().setPlainStatus('Wallet UI is still loading.', 'info');
      return;
    }

    if (!config.nftItemAddress) {
      store.getState().setPlainStatus('Set PUBLIC_NFT_ITEM_ADDRESS for NFT redeem flow.', 'error');
      return;
    }

    const wallet = tonConnectUI.wallet;
    if (!wallet) {
      await tonConnectUI.openModal();
      store.getState().setPlainStatus('Connect your TON wallet to redeem.', 'info');
      return;
    }

    const canRedeem = await canOpenRedeemPage(
      client,
      config.nftItemAddress,
      wallet.account.address,
      testOnly,
    );
    if (!canRedeem) {
      store.getState().setPlainStatus('You must own an unredeemed NFT to use Redeem.', 'error');
      return;
    }

    store.getState().setRedeeming(true);
    store.getState().setPlainStatus('Confirm NFT redeem in your wallet…', 'info');

    try {
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        network: config.chain,
        messages: [
          {
            address: config.nftItemAddress,
            amount: transferGasAmount('0.05'),
            payload: buildRedeemPayload(),
          },
        ],
      });
      debugLog('nft.redeem.tx.ok', { bocLength: result.boc.length });

      try {
        await logRedeemEvent({
          walletAddress: wallet.account.address,
          boc: result.boc,
          nftItemAddress: config.nftItemAddress,
          network: config.network,
          note: 'nft redeem',
        });
      } catch (logError) {
        debugError('nft.redeem.log.fail', logError);
      }

      await refreshNftAccess(wallet.account.address);
      store.getState().setShowBookNow(true);
      store.getState().setPlainStatus('NFT redeemed on-chain. Booking link unlocked.', 'ok');
    } catch (error) {
      debugError('nft.redeem.fail', error);
      store.getState().setPlainStatus(
        error instanceof Error ? error.message : 'NFT redeem cancelled or failed.',
        'error',
      );
    } finally {
      store.getState().setRedeeming(false);
    }
  }, [client, config, refreshNftAccess, store, testOnly, tonConnectUI]);

  const handleRedeem = useCallback(async (): Promise<void> => {
    if (config.nftItemAddress) {
      await handleNftRedeem();
      return;
    }

    if (!config.minterAddress || !config.redeemAddress) {
      store.getState().setPlainStatus('Set PUBLIC_MINTER_ADDRESS and PUBLIC_REDEEM_ADDRESS.', 'error');
      return;
    }

    if (!tonConnectUI) {
      return;
    }

    const wallet = tonConnectUI.wallet;
    if (!wallet) {
      await tonConnectUI.openModal();
      store.getState().setPlainStatus('Connect your TON wallet to redeem TIME.', 'info');
      return;
    }

    const latest = await refreshMinterData();
    if (!latest || latest.perMint <= 0n) {
      return;
    }

    const { currentTimeBalance } = store.getState();
    if (currentTimeBalance < latest.perMint) {
      store.getState().setPlainStatus('You need more TIME before redeeming.', 'error');
      return;
    }

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
            payload: buildJettonTransferPayload(latest.perMint, issuer, owner),
          },
        ],
      });

      await logRedeemEvent({
        walletAddress: wallet.account.address,
        boc: result.boc,
        minterAddress: config.minterAddress,
        redeemAddress: config.redeemAddress,
        jettonAmount: latest.perMint.toString(),
        network: config.network,
      });

      await refreshWalletBalance(wallet.account.address);
      store.getState().setShowBookNow(true);
      store.getState().setPlainStatus('Redemption complete. Book your hour below.', 'ok');
    } catch (error) {
      debugError('jetton.redeem.fail', error);
      store.getState().setPlainStatus(
        error instanceof Error ? error.message : 'Redemption was cancelled or failed.',
        'error',
      );
    } finally {
      store.getState().setRedeeming(false);
    }
  }, [client, config, handleNftRedeem, refreshMinterData, refreshWalletBalance, store, tonConnectUI]);

  const copyBookingNote = useCallback(async (): Promise<void> => {
    const { telegramAuth, connectedWalletAddress } = store.getState();
    const note = redemptionNote(telegramAuth.user, connectedWalletAddress);
    try {
      await navigator.clipboard.writeText(note);
      store.getState().setPlainStatus('Booking note copied.', 'ok');
    } catch {
      store.getState().setPlainStatus('Could not copy — select and copy manually.', 'info');
    }
  }, [store]);

  return {
    refreshMinterData,
    refreshWalletBalance,
    refreshNftAccess,
    bootstrapTelegramAuth,
    handleBuy,
    handleRedeem,
    handleNftRedeem,
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

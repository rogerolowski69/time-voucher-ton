import { Address } from '@ton/core';
import { TonConnectUI } from '@tonconnect/ui';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { buildCalBookingUrl } from '@/lib/cal-booking';
import { loadConfig } from '@/lib/config';
import { logPurchaseEvent, logRedeemEvent, tonscanTxUrl } from '@/lib/events-api';
import {
  buildJettonTransferPayload,
  fetchJettonWalletAddress,
  transferGasAmount,
} from '@/lib/jetton-transfer';
import {
  buildBuyTimePayload,
  buyTimeAmount,
  createTonClient,
  fetchJettonBalance,
  fetchMintPrice,
  fetchTokensPerMint,
  formatTon,
} from '@/lib/minter';
import {
  formatTelegramUser,
  initTelegramWebApp,
  redemptionNote,
  verifyTelegramAuth,
  type TelegramAuthState,
} from '@/lib/telegram';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClassName } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type StatusKind = 'info' | 'ok' | 'error';

interface StatusState {
  message: string;
  kind: StatusKind;
  html?: string;
}

const config = loadConfig();

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function TimeVoucherApp() {
  const tonConnectRef = useRef<HTMLDivElement>(null);
  const tonConnectUI = useMemo(
    () =>
      new TonConnectUI({
        manifestUrl: `${window.location.origin}/tonconnect-manifest.json`,
        buttonRootId: 'ton-connect-button',
      }),
    [],
  );
  const client = useMemo(
    () => createTonClient(config.rpcUrl, config.toncenterApiKey),
    [],
  );

  const [telegramAuth, setTelegramAuth] = useState<TelegramAuthState>(initTelegramWebApp);
  const [mintPrice, setMintPrice] = useState(0n);
  const [tokensPerMint, setTokensPerMint] = useState(1n);
  const [connectedWalletAddress, setConnectedWalletAddress] = useState<string | undefined>();
  const [currentTimeBalance, setCurrentTimeBalance] = useState(0n);
  const [status, setStatus] = useState<StatusState>({
    message: 'Connect a wallet to buy TIME.',
    kind: 'info',
  });
  const [showBookNow, setShowBookNow] = useState(false);
  const [buying, setBuying] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const isConfigured = config.minterAddress.length > 0;
  const hasRedeemDestination = config.redeemAddress.length > 0;
  const canRedeem = hasRedeemDestination && currentTimeBalance >= tokensPerMint && tokensPerMint > 0n;

  const bookingNote = redemptionNote(telegramAuth.user, connectedWalletAddress);
  const bookNowUrl = buildCalBookingUrl(config.calComUrl, {
    note: bookingNote,
    guestName: telegramAuth.user
      ? [telegramAuth.user.firstName, telegramAuth.user.lastName].filter(Boolean).join(' ')
      : undefined,
  });

  function setPlainStatus(message: string, kind: StatusKind = 'info'): void {
    setStatus({ message, kind });
  }

  async function refreshMinterData(): Promise<{ price: bigint; perMint: bigint } | null> {
    if (!isConfigured) {
      return null;
    }

    try {
      const minter = Address.parse(config.minterAddress);
      const [price, perMint] = await Promise.all([
        fetchMintPrice(client, minter),
        fetchTokensPerMint(client, minter),
      ]);
      setMintPrice(price);
      setTokensPerMint(perMint);
      return { price, perMint };
    } catch (error) {
      setPlainStatus(
        error instanceof Error ? error.message : 'Could not load minter price from chain.',
        'error',
      );
      return null;
    }
  }

  async function refreshWalletBalance(address: string): Promise<void> {
    if (!isConfigured) {
      return;
    }

    try {
      const minter = Address.parse(config.minterAddress);
      const owner = Address.parse(address);
      const balance = await fetchJettonBalance(client, minter, owner);
      setCurrentTimeBalance(balance);
      setConnectedWalletAddress(
        owner.toString({ bounceable: false, testOnly: config.network === 'testnet' }),
      );
    } catch (error) {
      setPlainStatus(error instanceof Error ? error.message : 'Could not read TIME balance.', 'error');
    }
  }

  async function bootstrapTelegramAuth(): Promise<void> {
    const initial = initTelegramWebApp();
    setTelegramAuth(initial);

    if (!initial.isMiniApp || !initial.initData) {
      return;
    }

    try {
      const verified = await verifyTelegramAuth(initial.initData);
      setTelegramAuth({ ...initial, verified });
      if (!verified) {
        setPlainStatus('Telegram sign-in could not be verified on the server.', 'error');
      }
    } catch {
      setPlainStatus('Telegram auth server is unavailable. User shown, but not verified.', 'error');
    }
  }

  async function handleBuy(): Promise<void> {
    if (!isConfigured) {
      setPlainStatus('Set PUBLIC_MINTER_ADDRESS in web/.env first.', 'error');
      return;
    }

    const wallet = tonConnectUI.wallet;
    if (!wallet) {
      tonConnectUI.openModal();
      setPlainStatus('Connect your TON wallet to continue.', 'info');
      return;
    }

    if (wallet.account.chain !== config.chain) {
      setPlainStatus(`Switch your wallet to ${config.network} and try again.`, 'error');
      return;
    }

    const latest = await refreshMinterData();
    if (!latest || latest.price <= 0n) {
      setPlainStatus('Mint price is not available yet.', 'error');
      return;
    }
    const price = latest.price;
    const perMint = latest.perMint;

    setBuying(true);
    setPlainStatus('Confirm the purchase in your wallet…', 'info');

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
          setStatus({
            kind: 'ok',
            message: 'Purchase logged.',
            html: `Purchase logged. <a class="underline" href="${txUrl}" target="_blank" rel="noreferrer">View transaction</a>`,
          });
        } else {
          setPlainStatus('Purchase sent. TIME will appear in your wallet shortly.', 'ok');
        }
      } catch (logError) {
        setPlainStatus(
          logError instanceof Error
            ? `Purchase sent, but logging failed: ${logError.message}`
            : 'Purchase sent, but logging failed.',
          'ok',
        );
      }

      await refreshWalletBalance(wallet.account.address);
    } catch (error) {
      setPlainStatus(error instanceof Error ? error.message : 'Purchase was cancelled or failed.', 'error');
    } finally {
      setBuying(false);
    }
  }

  async function handleRedeem(): Promise<void> {
    if (!isConfigured) {
      setPlainStatus('Set PUBLIC_MINTER_ADDRESS in web/.env first.', 'error');
      return;
    }

    if (!hasRedeemDestination) {
      setPlainStatus('Set PUBLIC_REDEEM_ADDRESS to the issuer TON wallet address.', 'error');
      return;
    }

    const wallet = tonConnectUI.wallet;
    if (!wallet) {
      tonConnectUI.openModal();
      setPlainStatus('Connect your TON wallet to redeem TIME.', 'info');
      return;
    }

    if (wallet.account.chain !== config.chain) {
      setPlainStatus(`Switch your wallet to ${config.network} and try again.`, 'error');
      return;
    }

    const latest = await refreshMinterData();
    if (!latest || latest.perMint <= 0n) {
      setPlainStatus('Redeem amount is not available yet.', 'error');
      return;
    }
    const redeemAmount = latest.perMint;

    if (currentTimeBalance < redeemAmount) {
      setPlainStatus('You need more TIME before redeeming.', 'error');
      return;
    }

    setRedeeming(true);
    setPlainStatus('Confirm the TIME transfer in your wallet…', 'info');

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
        setPlainStatus(
          logError instanceof Error
            ? `TIME sent, but logging failed: ${logError.message}`
            : 'TIME sent, but logging failed.',
          'ok',
        );
      }

      await refreshWalletBalance(wallet.account.address);
      setShowBookNow(true);

      if (!loggingFailed) {
        const txUrl = tonscanTxUrl(config.network, loggedTxHash);
        if (txUrl) {
          setStatus({
            kind: 'ok',
            message: 'Redemption complete.',
            html: `Redemption complete. <a class="underline" href="${txUrl}" target="_blank" rel="noreferrer">View transaction</a> · book your hour below.`,
          });
        } else {
          setPlainStatus('Redemption complete. Book your hour below.', 'ok');
        }
      }
    } catch (error) {
      setPlainStatus(error instanceof Error ? error.message : 'Redemption was cancelled or failed.', 'error');
    } finally {
      setRedeeming(false);
    }
  }

  async function copyBookingNote(): Promise<void> {
    try {
      await navigator.clipboard.writeText(bookingNote);
      setPlainStatus('Booking note copied. Paste it in Cal.com if needed.', 'ok');
    } catch {
      setPlainStatus('Could not copy automatically — select the note text and copy manually.', 'info');
    }
  }

  useEffect(() => {
    void bootstrapTelegramAuth();
    void refreshMinterData();

    const unsubscribe = tonConnectUI.onStatusChange(async (wallet) => {
      if (!wallet) {
        setConnectedWalletAddress(undefined);
        setCurrentTimeBalance(0n);
        setPlainStatus('Wallet disconnected.', 'info');
        return;
      }

      await refreshWalletBalance(wallet.account.address);
      const who = telegramAuth.user ? formatTelegramUser(telegramAuth.user) : 'Wallet connected';
      setPlainStatus(`${who} — you can buy TIME or redeem below.`, 'ok');
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const buyLabel =
    tokensPerMint === 1n
      ? `Buy 1 hour — ${mintPrice > 0n ? `${formatTon(mintPrice)} TON` : '…'}`
      : `Buy ${tokensPerMint.toString()} TIME — ${mintPrice > 0n ? `${formatTon(mintPrice)} TON` : '…'}`;

  const redeemLabel =
    tokensPerMint === 1n ? 'Redeem 1 hour' : `Redeem ${tokensPerMint.toString()} TIME`;

  const statusVariant =
    status.kind === 'ok' ? 'success' : status.kind === 'error' ? 'error' : 'info';

  const botUsername = import.meta.env.PUBLIC_TELEGRAM_BOT_USERNAME?.trim();

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What you are buying</CardTitle>
            <CardDescription>
              <span className="text-3xl font-bold text-foreground">
                {mintPrice > 0n ? `${formatTon(mintPrice)} TON` : '…'}
              </span>
              <span className="mt-1 block">
                {tokensPerMint === 1n ? '1 TIME' : `${tokensPerMint.toString()} TIME`} per purchase
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>One <code className="font-mono text-foreground">TIME</code> token equals one hour for:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Consulting / code review</li>
              <li>Pairing session</li>
              <li>Architecture or product advice</li>
            </ul>
            <p>Sessions are remote (video call). Scheduling within 30 days of redemption unless we agree otherwise.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buy now</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {telegramAuth.isMiniApp && (
                <Alert variant={telegramAuth.verified ? 'success' : 'info'}>
                  <p className="font-semibold">Telegram</p>
                  <p>{telegramAuth.user ? formatTelegramUser(telegramAuth.user) : 'Signed in'}</p>
                  <p className="text-muted-foreground">
                    {telegramAuth.verified ? 'Telegram identity verified' : 'Signed in via Telegram Mini App'}
                  </p>
                </Alert>
              )}
              <Alert variant="info">
                <p className="font-semibold">TON wallet</p>
                <p className="text-muted-foreground">
                  Connect Tonkeeper (or Telegram’s built-in TON wallet in the Mini App).
                </p>
              </Alert>
            </div>

            {!telegramAuth.isMiniApp && (
              <Alert variant="info">
                <p className="text-muted-foreground">
                  Open this page inside your Telegram bot to sign in.{' '}
                  <a
                    className="text-primary underline"
                    href={
                      botUsername
                        ? `https://t.me/${botUsername}`
                        : 'https://core.telegram.org/bots/webapps'
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {botUsername ? `Open @${botUsername}` : 'Learn about Telegram Mini Apps'}
                  </a>
                </p>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <div id="ton-connect-button" ref={tonConnectRef} className="min-h-11" />
              <Button disabled={!isConfigured || buying} onClick={() => void handleBuy()}>
                {buying ? 'Confirm in wallet…' : buyLabel}
              </Button>
            </div>

            {!isConfigured && (
              <Alert variant="warning">
                Set <code className="font-mono">PUBLIC_MINTER_ADDRESS</code> in <code className="font-mono">web/.env</code> after deploy.
              </Alert>
            )}

            {connectedWalletAddress && (
              <Alert variant="default">
                Connected: <span className="font-mono">{shortAddress(connectedWalletAddress)}</span> · Balance:{' '}
                <strong>{currentTimeBalance.toString()} TIME</strong>
              </Alert>
            )}

            <Alert variant={statusVariant}>
              {status.html ? (
                <span dangerouslySetInnerHTML={{ __html: status.html }} />
              ) : (
                status.message
              )}
            </Alert>

            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>Minter: {isConfigured ? config.minterAddress : 'Set PUBLIC_MINTER_ADDRESS'}</li>
              <li>Network: {config.network}</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card id="redeem">
        <CardHeader>
          <CardTitle>Redeem your hour</CardTitle>
          <CardDescription>
            Send your <code className="font-mono">TIME</code> voucher back to the issuer, then book a call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="secondary" disabled={!canRedeem || redeeming} onClick={() => void handleRedeem()}>
            {redeeming ? 'Confirm in wallet…' : redeemLabel}
          </Button>

          {showBookNow && (
            <Alert variant="success" className="space-y-3">
              <div>
                <p className="font-semibold text-accent">TIME sent — book your hour</p>
                <p className="text-muted-foreground">
                  Your voucher reached the issuer. Pick a slot and the booking note is prefilled.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  className={cn(buttonClassName('default'), 'no-underline')}
                  href={bookNowUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Book on Cal.com
                </a>
                <Button variant="secondary" onClick={() => void copyBookingNote()}>
                  Copy booking note
                </Button>
              </div>
              <p className="font-mono text-xs text-muted-foreground">{bookingNote}</p>
            </Alert>
          )}

          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Connect wallet</strong> and confirm you hold at least 1{' '}
              <code className="font-mono">TIME</code>.
            </li>
            <li>
              <strong className="text-foreground">Redeem</strong> — sends {tokensPerMint.toString()}{' '}
              <code className="font-mono">TIME</code> to{' '}
              <span className="font-mono">{config.redeemAddress || 'Set PUBLIC_REDEEM_ADDRESS'}</span>.
            </li>
            <li>
              <strong className="text-foreground">Book</strong> — use the Cal.com button above (note prefilled with your wallet + Telegram).
            </li>
            <li>
              <strong className="text-foreground">Call</strong> — issuer confirms when they see TIME + your booking.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

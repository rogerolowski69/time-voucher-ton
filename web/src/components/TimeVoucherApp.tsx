import { TonConnectUI } from '@tonconnect/ui';
import { useEffect, useMemo, useRef } from 'preact/hooks';

import { loadConfig } from '@/lib/config';
import { formatTon } from '@/lib/minter';
import { formatTelegramUser } from '@/lib/telegram';
import { Alert } from '@/components/ui/alert';
import { Accordion } from '@/components/ui/accordion';
import { Button, buttonClassName } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { useBookNowUrl, useBookingNote, useVoucherActions } from '@/hooks/use-voucher-actions';
import { createTonClient } from '@/lib/minter';
import { cn } from '@/lib/utils';
import { useVoucherStore } from '@/stores/voucher-store';

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
  const client = useMemo(() => createTonClient(config.rpcUrl, config.toncenterApiKey), []);

  const telegramAuth = useVoucherStore((state) => state.telegramAuth);
  const mintPrice = useVoucherStore((state) => state.mintPrice);
  const tokensPerMint = useVoucherStore((state) => state.tokensPerMint);
  const connectedWalletAddress = useVoucherStore((state) => state.connectedWalletAddress);
  const currentTimeBalance = useVoucherStore((state) => state.currentTimeBalance);
  const status = useVoucherStore((state) => state.status);
  const showBookNow = useVoucherStore((state) => state.showBookNow);
  const buying = useVoucherStore((state) => state.buying);
  const redeeming = useVoucherStore((state) => state.redeeming);
  const activeTab = useVoucherStore((state) => state.activeTab);
  const setActiveTab = useVoucherStore((state) => state.setActiveTab);
  const setPlainStatus = useVoucherStore((state) => state.setPlainStatus);

  const {
    refreshMinterData,
    refreshWalletBalance,
    bootstrapTelegramAuth,
    handleBuy,
    handleRedeem,
    copyBookingNote,
  } = useVoucherActions(config, client, tonConnectUI);

  const bookingNote = useBookingNote();
  const bookNowUrl = useBookNowUrl(config);
  const walletStatusMessage = useWalletStatusMessage();

  const isConfigured = config.minterAddress.length > 0;
  const hasRedeemDestination = config.redeemAddress.length > 0;
  const canRedeem = hasRedeemDestination && currentTimeBalance >= tokensPerMint && tokensPerMint > 0n;

  useEffect(() => {
    void bootstrapTelegramAuth();
    void refreshMinterData();

    const unsubscribe = tonConnectUI.onStatusChange(async (wallet) => {
      if (!wallet) {
        useVoucherStore.getState().clearWallet();
        setPlainStatus('Wallet disconnected.', 'info');
        return;
      }

      await refreshWalletBalance(wallet.account.address);
      const auth = useVoucherStore.getState().telegramAuth;
      const who = auth.user ? formatTelegramUser(auth.user) : 'Wallet connected';
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
  const tabIndex = activeTab === 'buy' ? 0 : 1;

  const buyPanel = (
    <div className="space-y-4">
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
          Set <code className="font-mono">PUBLIC_MINTER_ADDRESS</code> in <code className="font-mono">web/.env</code>{' '}
          after deploy.
        </Alert>
      )}

      {connectedWalletAddress && (
        <Alert variant="default">
          Connected: <span className="font-mono">{shortAddress(connectedWalletAddress)}</span> · Balance:{' '}
          <strong>{currentTimeBalance.toString()} TIME</strong>
        </Alert>
      )}
    </div>
  );

  const redeemPanel = (
    <div className="space-y-4">
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
          <strong className="text-foreground">Book</strong> — use the Cal.com button above (note prefilled with your
          wallet + Telegram).
        </li>
        <li>
          <strong className="text-foreground">Call</strong> — issuer confirms when they see TIME + your booking.
        </li>
      </ol>
    </div>
  );

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
            <p>
              One <code className="font-mono text-foreground">TIME</code> token equals one hour for:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Consulting / code review</li>
              <li>Pairing session</li>
              <li>Architecture or product advice</li>
            </ul>
            <p>Sessions are remote (video call). Scheduling within 30 days of redemption unless we agree otherwise.</p>
          </CardContent>
        </Card>

        <Card id="redeem">
          <CardHeader>
            <CardTitle>Wallet & actions</CardTitle>
            <CardDescription>Buy TIME or redeem your voucher from one place.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs
              selectedIndex={tabIndex}
              onChange={(index) => setActiveTab(index === 0 ? 'buy' : 'redeem')}
              items={[
                { id: 'buy', label: 'Buy TIME', content: buyPanel },
                { id: 'redeem', label: 'Redeem', content: redeemPanel },
              ]}
            />

            <Alert variant={statusVariant}>
              {status.html ? (
                <span dangerouslySetInnerHTML={{ __html: status.html }} />
              ) : (
                status.message
              )}
            </Alert>

            <Accordion
              items={[
                {
                  id: 'technical',
                  title: 'Technical details',
                  content: (
                    <ul className="space-y-1 font-mono text-xs">
                      <li>Minter: {isConfigured ? config.minterAddress : 'Set PUBLIC_MINTER_ADDRESS'}</li>
                      <li>Network: {config.network}</li>
                      <li>Redeem wallet: {config.redeemAddress || 'Set PUBLIC_REDEEM_ADDRESS'}</li>
                    </ul>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

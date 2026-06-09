import type { TonConnectUI } from '@tonconnect/ui';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { TonConnectDiagnostics } from '@/components/TonConnectDiagnostics';
import { debugError, debugLog } from '@/lib/debug';
import { createTonConnect } from '@/lib/tonconnect';
import { tonConnectUserMessage } from '@/lib/tonconnect-errors';
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
  const [tonConnectUI, setTonConnectUI] = useState<TonConnectUI | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [manifestWarning, setManifestWarning] = useState<string | null>(null);
  const [connectStep, setConnectStep] = useState<string>('idle');
  const tonConnectRef = useRef<ReturnType<typeof createTonConnect> | null>(null);

  const client = useMemo(() => createTonClient(config.rpcUrl, config.toncenterApiKey), []);

  const telegramAuth = useVoucherStore((state) => state.telegramAuth);
  const mintPrice = useVoucherStore((state) => state.mintPrice);
  const tokensPerMint = useVoucherStore((state) => state.tokensPerMint);
  const connectedWalletAddress = useVoucherStore((state) => state.connectedWalletAddress);
  const currentTimeBalance = useVoucherStore((state) => state.currentTimeBalance);
  const nftRedeemed = useVoucherStore((state) => state.nftRedeemed);
  const canShowBooking = useVoucherStore((state) => state.canShowBooking);
  const canShowRedeem = useVoucherStore((state) => state.canShowRedeem);
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

  const isMinterConfigured = config.minterAddress.length > 0;
  const isNftMode = config.nftItemAddress.length > 0;
  const canRedeemJetton =
    !isNftMode && config.redeemAddress.length > 0 && currentTimeBalance >= tokensPerMint;
  const showRedeemButton = isNftMode ? canShowRedeem : canRedeemJetton;
  const showBookingLink = isNftMode ? canShowBooking : showBookNow;

  useEffect(() => {
    debugLog('app.mount', {
      network: config.network,
      minterConfigured: isMinterConfigured,
      nftConfigured: isNftMode,
    });

    void bootstrapTelegramAuth();
    void refreshMinterData();

    try {
      const handle = createTonConnect({
        onManifestError: (message) => setManifestWarning(message),
        onDiagnostics: (passed) => {
          if (!passed) {
            setManifestWarning(
              'TonConnect manifest check failed — open Technical details → TonConnect diagnostics.',
            );
          }
        },
      });
      tonConnectRef.current = handle;
      setTonConnectUI(handle.ui);

      const unsubscribe = handle.ui.onStatusChange(async (wallet) => {
        if (!wallet) {
          debugLog('wallet.disconnected');
          useVoucherStore.getState().clearWallet();
          setPlainStatus('Wallet disconnected.', 'info');
          return;
        }
        debugLog('wallet.connected', {
          address: wallet.account.address,
          chain: wallet.account.chain,
          walletName: wallet.device.appName,
        });
        setConnectStep('3.connected');
        await refreshWalletBalance(wallet.account.address);
        const auth = useVoucherStore.getState().telegramAuth;
        const who = auth.user ? formatTelegramUser(auth.user) : 'Wallet connected';
        setPlainStatus(`${who} — you can buy or redeem below.`, 'ok');
      });

      return () => {
        unsubscribe();
        handle.dispose();
        tonConnectRef.current = null;
      };
    } catch (error) {
      debugError('tonconnect.init.fail', error);
      setBootError(tonConnectUserMessage(error));
    }
  }, []);

  const handleConnectWallet = (): void => {
    if (!tonConnectRef.current) {
      setPlainStatus('Wallet UI is still loading. Try again in a moment.', 'info');
      return;
    }
    debugLog('wallet.connect.click', { origin: window.location.origin });
    setConnectStep('1.opening-tonconnect-modal');
    setPlainStatus('Step 1/4: Opening TonConnect wallet picker…', 'info');
    void tonConnectRef.current
      .openConnectModal()
      .then(() => {
        if (!useVoucherStore.getState().connectedWalletAddress) {
          setConnectStep('2.waiting-wallet-approval');
          setPlainStatus(
            'Step 2/4: Approve connection in MyTonWallet/Tonkeeper (bridge tab may open).',
            'info',
          );
        }
      })
      .catch((error: unknown) => {
        setConnectStep('failed');
        debugError('wallet.connect.fail', error);
        setPlainStatus(tonConnectUserMessage(error), 'error');
      });
  };

  const buyLabel =
    tokensPerMint === 1n
      ? `Buy 1 hour — ${mintPrice > 0n ? `${formatTon(mintPrice)} TON` : '…'}`
      : `Buy ${tokensPerMint.toString()} TIME — ${mintPrice > 0n ? `${formatTon(mintPrice)} TON` : '…'}`;

  const statusVariant =
    status.kind === 'ok' ? 'success' : status.kind === 'error' ? 'error' : 'info';

  const botUsername = import.meta.env.PUBLIC_TELEGRAM_BOT_USERNAME?.trim();

  const buyPanel = (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {telegramAuth.isMiniApp && (
          <Alert variant={telegramAuth.verified ? 'success' : 'info'}>
            <p className="font-semibold">Telegram</p>
            <p>{telegramAuth.user ? formatTelegramUser(telegramAuth.user) : 'Signed in'}</p>
          </Alert>
        )}
        <Alert variant="info">
          <p className="font-semibold">TON wallet</p>
          <p className="text-muted-foreground">Connect Tonkeeper or Telegram&apos;s TON wallet.</p>
        </Alert>
      </div>

      {!telegramAuth.isMiniApp && (
        <Alert variant="info">
          <p className="text-muted-foreground">
            Open in Telegram Mini App to sign in.{' '}
            {botUsername ? (
              <a className="underline" href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer">
                Open @{botUsername}
              </a>
            ) : null}
          </p>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={!tonConnectUI} onClick={handleConnectWallet}>
          {connectedWalletAddress ? 'Wallet connected' : 'Connect wallet'}
        </Button>
        <Button
          disabled={buying || !isMinterConfigured}
          onClick={() => {
            debugLog('buy.button.click', { minterConfigured: isMinterConfigured, nftMode: isNftMode });
            void handleBuy();
          }}
        >
          {buying ? 'Confirm in wallet…' : isMinterConfigured ? buyLabel : 'Buy (minter not set)'}
        </Button>
      </div>

      {!isMinterConfigured && !isNftMode && (
        <Alert variant="warning">
          Set <code className="font-mono">PUBLIC_MINTER_ADDRESS</code> in Railway and redeploy.
        </Alert>
      )}

      {!isMinterConfigured && isNftMode && (
        <Alert variant="info">
          NFT redeem mode — jetton minter not required. Use the <strong>Redeem</strong> tab after
          connecting your wallet.
        </Alert>
      )}

      {connectStep !== 'idle' && (
        <Alert variant="info">
          <p className="font-semibold">Connect flow</p>
          <p className="font-mono text-xs">{connectStep}</p>
          <p className="text-xs text-muted-foreground mt-1">
            If you see &quot;Manifest content error&quot; after the bridge opens, the wallet rejected
            localhost — use production HTTPS or Tonkeeper in-browser extension.
          </p>
        </Alert>
      )}

      {connectedWalletAddress && (
        <Alert variant="default">
          Connected: <span className="font-mono">{shortAddress(connectedWalletAddress)}</span>
          {!isNftMode && (
            <>
              {' '}
              · Balance: <strong>{currentTimeBalance.toString()} TIME</strong>
            </>
          )}
        </Alert>
      )}
    </div>
  );

  const redeemPanel = (
    <div className="space-y-4">
      {isNftMode && (
        <Alert variant="info">
          <p className="font-semibold">NFT redeem flow</p>
          <p className="text-sm text-muted-foreground">
            Version B: Redeem button when owner + not redeemed. Version A: Booking link when owner +
            redeemed.
          </p>
          {nftRedeemed !== null && (
            <p className="font-mono text-xs mt-1">
              on-chain redeemed={String(nftRedeemed)} · canRedeem={String(showRedeemButton)} ·
              canBook={String(showBookingLink)}
            </p>
          )}
        </Alert>
      )}

      {showRedeemButton ? (
        <Button variant="secondary" disabled={redeeming} onClick={() => void handleRedeem()}>
          {redeeming ? 'Confirm in wallet…' : isNftMode ? 'Redeem NFT' : 'Redeem TIME'}
        </Button>
      ) : (
        <Alert variant="warning">
          {isNftMode
            ? 'Redeem hidden — you must own this NFT and it must not be redeemed yet (Version B).'
            : 'Redeem hidden — connect wallet and hold enough TIME.'}
        </Alert>
      )}

      {showBookingLink ? (
        <Alert variant="success" className="space-y-3">
          <p className="font-semibold">Booking unlocked (Version A)</p>
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
      ) : isNftMode ? (
        <Alert variant="info">
          Booking link hidden until NFT is redeemed on-chain (Version A).
        </Alert>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-5">
      {bootError ? (
        <Alert variant="error">
          <p className="font-semibold">Wallet UI boot failed</p>
          <p className="text-sm">{bootError}</p>
        </Alert>
      ) : null}

      {manifestWarning ? (
        <Alert variant="warning">
          <p className="font-semibold">TonConnect manifest warning</p>
          <p className="text-sm">{manifestWarning}</p>
        </Alert>
      ) : null}

      {!tonConnectUI ? (
        <Alert variant="info">
          <p className="font-semibold">Loading wallet UI…</p>
          <p className="text-sm text-muted-foreground">TonConnect is initializing.</p>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What you are buying</CardTitle>
            <CardDescription>
              <span className="text-3xl font-bold text-foreground">
                {mintPrice > 0n ? `${formatTon(mintPrice)} TON` : '…'}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>One TIME token = one hour of consulting.</p>
          </CardContent>
        </Card>

        <Card id="redeem">
          <CardHeader>
            <CardTitle>Wallet & actions</CardTitle>
            <CardDescription>Buy TIME or redeem your voucher.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs
              selectedIndex={activeTab === 'buy' ? 0 : 1}
              onChange={(index) => setActiveTab(index === 0 ? 'buy' : 'redeem')}
              items={[
                { id: 'buy', label: 'Buy TIME', content: buyPanel },
                { id: 'redeem', label: 'Redeem', content: redeemPanel },
              ]}
            />

            <Alert variant={statusVariant}>{status.message}</Alert>

            <Accordion
              items={[
                {
                  id: 'technical',
                  title: 'Technical details',
                  content: (
                    <ul className="space-y-1 font-mono text-xs">
                      <li>Origin: {typeof window !== 'undefined' ? window.location.origin : '—'}</li>
                      <li>
                        Manifest:{' '}
                        {typeof window !== 'undefined'
                          ? `${window.location.origin}/tonconnect-manifest.json`
                          : '—'}
                      </li>
                      <li>Minter: {isMinterConfigured ? config.minterAddress : 'not set'}</li>
                      <li>NFT item: {isNftMode ? config.nftItemAddress : 'not set'}</li>
                      <li>Network: {config.network}</li>
                      <li>Wallet: {connectedWalletAddress ?? 'not connected'}</li>
                      <li>Debug: ?debug=1 or localStorage.timeVoucherDebug=1</li>
                    </ul>
                  ),
                },
                {
                  id: 'tonconnect',
                  title: 'TonConnect diagnostics',
                  content: <TonConnectDiagnostics />,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

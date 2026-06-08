import WebApp from '@twa-dev/sdk';

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

export interface TelegramAuthState {
  isMiniApp: boolean;
  verified: boolean;
  user: TelegramUser | null;
  initData: string;
}

function mapUser(): TelegramUser | null {
  const user = WebApp.initDataUnsafe.user;
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    photoUrl: user.photo_url,
  };
}

export function initTelegramWebApp(): TelegramAuthState {
  try {
    const isMiniApp = WebApp.platform !== 'unknown' && Boolean(WebApp.initData);

    if (isMiniApp) {
      WebApp.ready();
      WebApp.expand();
      WebApp.setHeaderColor('#0b1020');
      WebApp.setBackgroundColor('#0b1020');
    }

    return {
      isMiniApp,
      verified: false,
      user: mapUser(),
      initData: WebApp.initData,
    };
  } catch {
    return { isMiniApp: false, verified: false, user: null, initData: '' };
  }
}

export async function verifyTelegramAuth(initData: string): Promise<boolean> {
  if (!initData) {
    return false;
  }

  const response = await fetch('/api/telegram/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });

  return response.ok;
}

export function formatTelegramUser(user: TelegramUser): string {
  if (user.username) {
    return `@${user.username}`;
  }
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}

export function redemptionNote(user: TelegramUser | null, walletAddress?: string): string {
  const parts: string[] = ['TIME voucher redemption'];
  if (user?.username) {
    parts.push(`Telegram: @${user.username}`);
  } else if (user) {
    parts.push(`Telegram ID: ${user.id}`);
  }
  if (walletAddress) {
    parts.push(`Wallet: ${walletAddress}`);
  }
  return parts.join(' · ');
}

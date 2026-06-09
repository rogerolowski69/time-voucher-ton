import { describe, expect, it } from 'vitest';

import {
  TON_CONNECT_ERROR_CODES,
  classifyTonConnectError,
  tonConnectUserMessage,
} from '@/lib/tonconnect-errors';

describe('classifyTonConnectError', () => {
  it('detects manifest content errors', () => {
    const info = classifyTonConnectError(
      new Error('[TON_CONNECT_SDK_ERROR] Manifest content error'),
    );
    expect(info.kind).toBe('manifest_content');
    expect(info.debugSteps.length).toBeGreaterThan(0);
    expect(info.userMessage.toLowerCase()).toContain('manifest');
  });

  it('detects manifest not found by code', () => {
    const info = classifyTonConnectError(new Error('connect_error code 2'));
    expect(info.kind).toBe('manifest_not_found');
    expect(info.code).toBe(TON_CONNECT_ERROR_CODES.MANIFEST_NOT_FOUND);
  });

  it('detects user rejection', () => {
    const info = classifyTonConnectError(new Error('Connection declined'));
    expect(info.kind).toBe('user_rejected');
  });

  it('detects analytics blocked as non-fatal', () => {
    const info = classifyTonConnectError(
      new Error('Failed to send analytics events: Failed to fetch'),
    );
    expect(info.kind).toBe('analytics_blocked');
  });

  it('maps transaction cancel to transaction_rejected', () => {
    const info = classifyTonConnectError(new Error('User rejects the transaction'));
    expect(info.kind).toBe('transaction_rejected');
  });
});

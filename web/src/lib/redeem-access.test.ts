import { Address, Cell } from '@ton/core';
import { describe, expect, it } from 'vitest';

import {
  OP_REDEEM,
  buildRedeemPayload,
  normalizeTonAddress,
  type RedeemData,
} from '@/lib/redeem-access';

function evaluateBookingAccess(data: RedeemData, wallet: string): boolean {
  return (
    normalizeTonAddress(data.ownerAddress) === normalizeTonAddress(wallet) && data.redeemed === true
  );
}

function evaluateRedeemPageAccess(data: RedeemData, wallet: string): boolean {
  return (
    normalizeTonAddress(data.ownerAddress) === normalizeTonAddress(wallet) && data.redeemed === false
  );
}

describe('normalizeTonAddress', () => {
  it('normalizes bounceable and non-bounceable to same form', () => {
    const raw = '0QBiCXrywJ5n4dMZEYpeE174PqPl8XKB6GdmRqUWhgYHnhHQ';
    const parsed = Address.parse(raw).toString({ bounceable: true, testOnly: true });
    expect(normalizeTonAddress(raw, true)).toBe(normalizeTonAddress(parsed, true));
  });
});

describe('buildRedeemPayload', () => {
  it('encodes OP_REDEEM and query id', () => {
    const boc = buildRedeemPayload(42n);
    const slice = Cell.fromBase64(boc).beginParse();
    expect(slice.loadUint(32)).toBe(OP_REDEEM);
    expect(slice.loadUintBig(64)).toBe(42n);
  });
});

describe('Version A — booking after redeem', () => {
  const owner = '0QBiCXrywJ5n4dMZEYpeE174PqPl8XKB6GdmRqUWhgYHnhHQ';

  it('allows booking when owner and redeemed', () => {
    expect(evaluateBookingAccess({ ownerAddress: owner, redeemed: true }, owner)).toBe(true);
  });

  it('blocks booking before redeem', () => {
    expect(evaluateBookingAccess({ ownerAddress: owner, redeemed: false }, owner)).toBe(false);
  });

  it('blocks non-owner', () => {
    expect(evaluateBookingAccess({ ownerAddress: owner, redeemed: true }, 'EQ_OTHER')).toBe(false);
  });
});

describe('Version B — redeem page before redeem', () => {
  const owner = '0QBiCXrywJ5n4dMZEYpeE174PqPl8XKB6GdmRqUWhgYHnhHQ';

  it('allows redeem page when owner and not redeemed', () => {
    expect(evaluateRedeemPageAccess({ ownerAddress: owner, redeemed: false }, owner)).toBe(true);
  });

  it('blocks redeem page after redeem', () => {
    expect(evaluateRedeemPageAccess({ ownerAddress: owner, redeemed: true }, owner)).toBe(false);
  });
});

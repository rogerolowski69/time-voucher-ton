import { describe, expect, it } from 'vitest';

import {
  manifestUrlForOrigin,
  summarizeManifestChecks,
  validateManifestBody,
} from '@/lib/tonconnect-manifest';

const ORIGIN = 'http://localhost:4321';

describe('manifestUrlForOrigin', () => {
  it('builds standard manifest path', () => {
    expect(manifestUrlForOrigin('http://localhost:4321')).toBe(
      'http://localhost:4321/tonconnect-manifest.json',
    );
  });

  it('strips trailing slash from origin', () => {
    expect(manifestUrlForOrigin('http://localhost:4321/')).toBe(
      'http://localhost:4321/tonconnect-manifest.json',
    );
  });
});

describe('validateManifestBody', () => {
  it('passes a valid manifest', () => {
    const checks = validateManifestBody(
      {
        url: ORIGIN,
        name: 'Time Voucher',
        iconUrl: `${ORIGIN}/icon-180.png`,
      },
      ORIGIN,
    );
    expect(checks.some((c) => c.status === 'fail')).toBe(false);
    expect(summarizeManifestChecks(checks)).toBe('Manifest checks passed');
  });

  it('fails when url does not match page origin', () => {
    const checks = validateManifestBody(
      {
        url: 'http://127.0.0.1:8787',
        name: 'Time Voucher',
        iconUrl: 'http://127.0.0.1:8787/icon-180.png',
      },
      ORIGIN,
    );
    expect(checks.find((c) => c.id === 'url-origin')?.status).toBe('fail');
  });

  it('fails on SVG icon', () => {
    const checks = validateManifestBody(
      {
        url: ORIGIN,
        name: 'Time Voucher',
        iconUrl: `${ORIGIN}/icon.svg`,
      },
      ORIGIN,
    );
    expect(checks.find((c) => c.id === 'icon-format')?.status).toBe('fail');
  });

  it('fails when required fields missing', () => {
    const checks = validateManifestBody({ url: ORIGIN }, ORIGIN);
    expect(checks.find((c) => c.id === 'name')?.status).toBe('fail');
    expect(checks.find((c) => c.id === 'iconUrl')?.status).toBe('fail');
  });

  it('warns on localhost', () => {
    const checks = validateManifestBody(
      {
        url: ORIGIN,
        name: 'X',
        iconUrl: `${ORIGIN}/icon-180.png`,
      },
      ORIGIN,
    );
    expect(checks.find((c) => c.id === 'localhost')?.status).toBe('warn');
  });
});

describe('buildTonConnectDiagnosticSteps', () => {
  it('marks origin mismatch as fail', async () => {
    const { buildTonConnectDiagnosticSteps } = await import('@/lib/tonconnect-debug');
    const steps = buildTonConnectDiagnosticSteps(ORIGIN, {
      ok: false,
      httpStatus: 200,
      contentType: 'application/json',
      manifest: {
        url: 'http://127.0.0.1:8787',
        name: 'Time Voucher',
        iconUrl: 'http://127.0.0.1:8787/icon-180.png',
      },
      checks: [
        {
          id: 'url-origin',
          status: 'fail',
          message: 'manifest.url mismatch',
        },
      ],
      iconStatus: 200,
      iconContentType: 'image/png',
    });
    expect(steps.find((s) => s.step === '4.origin-match')?.status).toBe('fail');
  });
});

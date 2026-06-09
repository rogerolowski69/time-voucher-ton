export interface TonConnectManifest {
  url: string;
  name: string;
  iconUrl: string;
  termsOfUseUrl?: string;
  privacyPolicyUrl?: string;
}

export type ManifestCheckStatus = 'ok' | 'warn' | 'fail';

export interface ManifestCheck {
  id: string;
  status: ManifestCheckStatus;
  message: string;
}

export interface ManifestFetchResult {
  ok: boolean;
  httpStatus: number | null;
  contentType: string | null;
  manifest: TonConnectManifest | null;
  checks: ManifestCheck[];
  iconStatus: number | null;
  iconContentType: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function manifestUrlForOrigin(origin: string): string {
  return `${origin.replace(/\/$/, '')}/tonconnect-manifest.json`;
}

export function validateManifestBody(
  manifest: unknown,
  pageOrigin: string,
): ManifestCheck[] {
  const checks: ManifestCheck[] = [];

  if (!isRecord(manifest)) {
    checks.push({ id: 'json', status: 'fail', message: 'Manifest is not a JSON object' });
    return checks;
  }

  const url = typeof manifest.url === 'string' ? manifest.url.trim() : '';
  const name = typeof manifest.name === 'string' ? manifest.name.trim() : '';
  const iconUrl = typeof manifest.iconUrl === 'string' ? manifest.iconUrl.trim() : '';

  if (!url) {
    checks.push({ id: 'url', status: 'fail', message: 'Missing required field: url' });
  } else if (url !== pageOrigin && url.replace(/\/$/, '') !== pageOrigin.replace(/\/$/, '')) {
    checks.push({
      id: 'url-origin',
      status: 'fail',
      message: `manifest.url (${url}) does not match page origin (${pageOrigin})`,
    });
  } else {
    checks.push({ id: 'url', status: 'ok', message: `url matches page origin (${url})` });
  }

  if (!name) {
    checks.push({ id: 'name', status: 'fail', message: 'Missing required field: name' });
  } else {
    checks.push({ id: 'name', status: 'ok', message: `name present (${name})` });
  }

  if (!iconUrl) {
    checks.push({ id: 'iconUrl', status: 'fail', message: 'Missing required field: iconUrl' });
  } else if (iconUrl.toLowerCase().endsWith('.svg')) {
    checks.push({
      id: 'icon-format',
      status: 'fail',
      message: 'iconUrl must be PNG or ICO — SVG is not supported by wallets',
    });
  } else if (!iconUrl.toLowerCase().endsWith('.png') && !iconUrl.toLowerCase().endsWith('.ico')) {
    checks.push({
      id: 'icon-format',
      status: 'warn',
      message: 'iconUrl should be a .png (180×180 recommended)',
    });
  } else {
    checks.push({ id: 'iconUrl', status: 'ok', message: `iconUrl set (${iconUrl})` });
  }

  if (pageOrigin.startsWith('http://') && !pageOrigin.includes('localhost') && !pageOrigin.includes('127.0.0.1')) {
    checks.push({
      id: 'https',
      status: 'warn',
      message: 'App is not HTTPS — some wallets may refuse manifest on production domains',
    });
  }

  if (pageOrigin.includes('localhost') || pageOrigin.includes('127.0.0.1')) {
    checks.push({
      id: 'localhost',
      status: 'warn',
      message: 'Local dev — use the same host in the address bar for manifest.url (localhost vs 127.0.0.1)',
    });
  }

  return checks;
}

export async function fetchManifestHealth(
  manifestUrl: string,
  pageOrigin: string,
): Promise<ManifestFetchResult> {
  const checks: ManifestCheck[] = [];
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  let manifest: TonConnectManifest | null = null;
  let iconStatus: number | null = null;
  let iconContentType: string | null = null;

  try {
    const response = await fetch(manifestUrl, { method: 'GET', cache: 'no-store' });
    httpStatus = response.status;
    contentType = response.headers.get('content-type');

    if (!response.ok) {
      checks.push({
        id: 'fetch',
        status: 'fail',
        message: `Manifest HTTP ${response.status} from ${manifestUrl}`,
      });
      return { ok: false, httpStatus, contentType, manifest, checks, iconStatus, iconContentType };
    }

    if (contentType && !contentType.includes('json')) {
      checks.push({
        id: 'content-type',
        status: 'warn',
        message: `Content-Type is ${contentType} (expected application/json)`,
      });
    } else {
      checks.push({ id: 'fetch', status: 'ok', message: `Manifest HTTP ${response.status}` });
    }

    const body: unknown = await response.json();
    const bodyChecks = validateManifestBody(body, pageOrigin);
    checks.push(...bodyChecks);

    if (isRecord(body) && typeof body.url === 'string' && typeof body.name === 'string') {
      manifest = {
        url: body.url,
        name: body.name,
        iconUrl: typeof body.iconUrl === 'string' ? body.iconUrl : '',
        termsOfUseUrl: typeof body.termsOfUseUrl === 'string' ? body.termsOfUseUrl : undefined,
        privacyPolicyUrl:
          typeof body.privacyPolicyUrl === 'string' ? body.privacyPolicyUrl : undefined,
      };
    }

    if (manifest?.iconUrl) {
      try {
        const iconResponse = await fetch(manifest.iconUrl, { method: 'GET', cache: 'no-store' });
        iconStatus = iconResponse.status;
        iconContentType = iconResponse.headers.get('content-type');
        if (!iconResponse.ok) {
          checks.push({
            id: 'icon-fetch',
            status: 'fail',
            message: `iconUrl HTTP ${iconResponse.status} — wallets may reject manifest`,
          });
        } else if (iconContentType?.includes('svg')) {
          checks.push({
            id: 'icon-fetch',
            status: 'fail',
            message: 'iconUrl returns SVG — wallets require PNG',
          });
        } else {
          checks.push({
            id: 'icon-fetch',
            status: 'ok',
            message: `iconUrl HTTP ${iconResponse.status} (${iconContentType ?? 'unknown type'})`,
          });
        }
      } catch (iconError) {
        checks.push({
          id: 'icon-fetch',
          status: 'fail',
          message: `iconUrl fetch failed: ${iconError instanceof Error ? iconError.message : String(iconError)}`,
        });
      }
    }
  } catch (error) {
    checks.push({
      id: 'fetch',
      status: 'fail',
      message: `Manifest fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { ok: false, httpStatus, contentType, manifest, checks, iconStatus, iconContentType };
  }

  const ok = checks.every((check) => check.status !== 'fail');
  return { ok, httpStatus, contentType, manifest, checks, iconStatus, iconContentType };
}

export function summarizeManifestChecks(checks: ManifestCheck[]): string {
  const failed = checks.filter((c) => c.status === 'fail');
  if (failed.length === 0) {
    return 'Manifest checks passed';
  }
  return failed.map((c) => c.message).join('; ');
}

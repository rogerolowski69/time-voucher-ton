#!/usr/bin/env bash
# Deploy RedeemableNftItem to testnet.
# Prereq: funded deployer wallet — just wallet-reset-testnet (or manual fund if faucet 429)
set -euo pipefail

cd "$(dirname "$0")/.."

: "${NFT_OWNER_ADDRESS:?Set NFT_OWNER_ADDRESS to the voucher owner wallet (your TON address)}"

# Always default to deployer — ignore stale NFT_DEPLOYER=rog1 from earlier sessions
NFT_DEPLOYER="deployer"
export NFT_DEPLOYER
export NFT_OWNER_ADDRESS
export NFT_INDEX="${NFT_INDEX:-1}"
export NFT_CONTENT_URI="${NFT_CONTENT_URI:-ipfs://time-voucher/item-0001.json}"

LOG_FILE="${LOG_FILE:-/tmp/time-voucher-nft-deploy.log}"
MIN_BALANCE_NANOTON="${MIN_BALANCE_NANOTON:-50000000}"

if ! acton wallet list 2>/dev/null | grep -qE "^[[:space:]]+${NFT_DEPLOYER}[[:space:]]"; then
  echo "Wallet '${NFT_DEPLOYER}' not found."
  echo "Run: just wallet-reset-testnet"
  exit 1
fi

DEPLOYER_LINE="$(acton wallet list --balance 2>/dev/null | grep -E "^[[:space:]]+${NFT_DEPLOYER}[[:space:]]" || true)"
echo "${DEPLOYER_LINE}"
DEPLOYER_ADDR="$(echo "${DEPLOYER_LINE}" | awk '{print $2}')"
DEPLOYER_BALANCE_TON="$(echo "${DEPLOYER_LINE}" | sed -n 's/.*—[[:space:]]*\([0-9.]*\)[[:space:]]*TON.*/\1/p')"

if [[ -n "${DEPLOYER_LINE}" ]] && ! python3 -c "import sys; sys.exit(0 if float(sys.argv[1]) >= 0.05 else 1)" "${DEPLOYER_BALANCE_TON:-0}" 2>/dev/null; then
  echo ""
  echo "Deployer balance is too low (${DEPLOYER_BALANCE_TON:-0} TON; need ≥ 0.05). Faucet may be rate-limited (429)."
  NON_BOUNCE="$(cd web && node -e "const {Address}=require('@ton/core');console.log(Address.parse(process.argv[1]).toString({bounceable:false,testOnly:true}))" "${DEPLOYER_ADDR}" 2>/dev/null || echo "${DEPLOYER_ADDR}")"
  echo "Fund manually from MyTonWallet/Tonkeeper testnet (use 0Q non-bounceable):"
  echo "  Send ≥ 0.1 TON → ${NON_BOUNCE}"
  echo "  (not kQ bounceable — inactive wallet will reject/bounce)"
  echo "Then: just wallet-balance && just deploy-nft-testnet-ci"
  exit 1
fi

echo "Deploying NFT item with deployer=${NFT_DEPLOYER} owner=${NFT_OWNER_ADDRESS}"
set +e
acton script scripts/deploy-nft-item.tolk --net testnet 2>&1 | tee "${LOG_FILE}"
deploy_status=${PIPESTATUS[0]}
set -e

if [[ "${deploy_status}" -ne 0 ]]; then
  if grep -qi "No mnemonic found" "${LOG_FILE}"; then
    FAILED_WALLET="$(grep -oE "No mnemonic found for '[^']+'" "${LOG_FILE}" | head -1 | sed "s/No mnemonic found for '//;s/' wallet//")"
    echo ""
    echo "Wallet '${FAILED_WALLET:-${NFT_DEPLOYER}}' has no usable mnemonic on this machine."
    echo "Acton preloads every wallet in ~/.config/acton/wallets/global.wallets.toml on --net;"
    echo "a broken entry blocks deploy even when NFT_DEPLOYER=deployer."
    echo "Fix:"
    if [[ -n "${FAILED_WALLET}" && "${FAILED_WALLET}" != "${NFT_DEPLOYER}" ]]; then
      echo "  acton wallet remove ${FAILED_WALLET} -y   # drop stale global wallet"
    fi
    echo "  unset NFT_DEPLOYER   # ignore stale env"
    echo "  just wallet-reset-testnet"
    echo "  # fund deployer if faucet 429 — send 0.1 TON testnet to address above"
    echo "  export NFT_OWNER_ADDRESS=${NFT_OWNER_ADDRESS}"
    echo "  just deploy-nft-testnet-ci"
  fi
  if grep -qi "insufficient\|not enough\|balance" "${LOG_FILE}"; then
    echo ""
    echo "Likely insufficient TON on deployer. Fund: ${DEPLOYER_ADDR}"
  fi
  exit "${deploy_status}"
fi

NFT_ITEM_ADDRESS="$(grep -E 'NFT NFT_ITEM_ADDRESS=' "${LOG_FILE}" | tail -1 | sed -E 's/.*NFT_ITEM_ADDRESS=([^ (]+).*/\1/')"

echo ""
if [[ -n "${NFT_ITEM_ADDRESS}" ]]; then
  echo "Deployed NFT item: ${NFT_ITEM_ADDRESS}"
  echo ""
  echo "Set in web/.env and Railway (then redeploy):"
  echo "  PUBLIC_NFT_ITEM_ADDRESS=${NFT_ITEM_ADDRESS}"

  if [[ "${WRITE_WEB_ENV:-0}" == "1" && -f web/.env ]]; then
    if grep -q '^PUBLIC_NFT_ITEM_ADDRESS=' web/.env; then
      sed -i "s|^PUBLIC_NFT_ITEM_ADDRESS=.*|PUBLIC_NFT_ITEM_ADDRESS=${NFT_ITEM_ADDRESS}|" web/.env
    else
      echo "PUBLIC_NFT_ITEM_ADDRESS=${NFT_ITEM_ADDRESS}" >> web/.env
    fi
    echo "Updated web/.env"
  fi
else
  echo "Could not parse NFT_ITEM_ADDRESS from ${LOG_FILE}"
  echo "Copy it manually from the deploy output above."
  exit 1
fi

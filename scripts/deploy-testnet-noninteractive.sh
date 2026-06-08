#!/usr/bin/env bash
# Deploy JettonMinter to testnet after creating a deployer wallet.
# Run once: acton wallet new --name deployer --airdrop
set -euo pipefail

cd "$(dirname "$0")/.."

: "${JETTON_DEPLOYER:=deployer}"
: "${JETTON_ADMIN_ADDRESS:?Set JETTON_ADMIN_ADDRESS to your TON wallet (same as PUBLIC_REDEEM_ADDRESS)}"

export JETTON_DEPLOYER
export JETTON_ADMIN_ADDRESS

echo "Deploying with deployer=${JETTON_DEPLOYER} admin=${JETTON_ADMIN_ADDRESS}"
acton run deploy-testnet 2>&1 | tee /tmp/time-voucher-deploy.log

echo ""
echo "Copy JETTON MINTER_ADDRESS from output into:"
echo "  web/.env          → PUBLIC_MINTER_ADDRESS"
echo "  Railway Variables → PUBLIC_MINTER_ADDRESS"
echo "Then redeploy Railway."

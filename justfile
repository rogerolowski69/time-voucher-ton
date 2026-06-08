# Time Voucher TON — Acton + web commands
set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

# --- Toolchain ---
doctor:
    acton doctor
    acton --version

up:
    acton up

# --- Build ---
build:
    acton build

build-nft:
    acton build RedeemableNftItem

wrapper:
    acton wrapper JettonMinter
    acton wrapper JettonWallet
    acton wrapper RedeemableNftItem

clean:
    rm -rf build gen web/dist web/.astro web/data

rebuild: clean build

# --- Quality ---
fmt:
    acton fmt

fmt-check:
    acton fmt --check

check:
    acton check

test:
    acton test

ci: build fmt-check check test

# --- Wallets ---
wallet-new-local name="deployer":
    acton wallet new --name {{name}} --local --airdrop

wallet-new name="deployer":
    acton wallet new --name {{name}} --local --airdrop

wallet-new-testnet name="deployer":
    acton wallet new --name {{name}} --airdrop

# Remove and recreate testnet wallet when mnemonic/keyring is missing.
# Uses --secure false for WSL/Linux keyring compatibility with acton scripts.
wallet-reset-testnet name="deployer":
    acton wallet remove {{name}} -y || true
    acton wallet new --name {{name}} --airdrop --secure false

# Show deployer address + balance (fund manually if faucet 429)
wallet-balance name="deployer":
    @acton wallet list --balance | rg "{{name}}" || acton wallet list --balance

# Print Tonkeeper funding steps when faucet is rate-limited (429)
wallet-fund-hint name="deployer" amount_ton="0.2":
    #!/usr/bin/env bash
    set -euo pipefail
    line="$(acton wallet list --balance | rg "^[[:space:]]+{{name}}[[:space:]]" || true)"
    if [[ -z "$line" ]]; then
      echo "Wallet '{{name}}' not found. Run: just wallet-reset-testnet"
      exit 1
    fi
    addr="$(echo "$line" | awk '{print $2}')"
    bal="$(echo "$line" | sed -n 's/.*—[[:space:]]*\(.*\)/\1/p')"
    non_bounce="$(cd web && node -e "const {Address}=require('@ton/core');console.log(Address.parse(process.argv[1]).toString({bounceable:false,testOnly:true}))" "$addr")"
    nanoton="$(python3 -c "print(int(float('{{amount_ton}}') * 1_000_000_000))")"
    echo "Deployer: {{name}}"
    echo "Balance:  $bal"
    echo ""
    echo "Use NON-BOUNCEABLE address (0Q...) — paste ALL 48 characters:"
    echo ""
    echo "$non_bounce"
    echo ""
    if command -v xclip >/dev/null 2>&1; then
      printf '%s' "$non_bounce" | xclip -selection clipboard
      echo "(copied to clipboard)"
    elif command -v wl-copy >/dev/null 2>&1; then
      printf '%s' "$non_bounce" | wl-copy
      echo "(copied to clipboard)"
    fi
    echo ""
    echo "(Bounceable kQ... bounces back from uninitialized wallets — MyTonWallet will reject it.)"
    echo ""
    echo "Steps:"
    echo "  1. MyTonWallet / Tonkeeper → TESTNET"
    echo "  2. Send {{amount_ton}} TON to the 0Q address above"
    echo "  3. Wait ~30s → just wallet-balance"
    echo "  4. export NFT_OWNER_ADDRESS=<your wallet> && just deploy-nft-testnet-ci"

wallet-list:
    acton wallet list

wallet-airdrop name="deployer":
    acton wallet airdrop {{name}} --net testnet

# --- Jetton deploy ---
deploy: deploy-emulation

deploy-emulation:
    acton run deploy-emulation

deploy-testnet:
    acton run deploy-testnet

deploy-testnet-ci:
    ./scripts/deploy-testnet-noninteractive.sh

# --- NFT deploy ---
deploy-nft: deploy-nft-emulation

deploy-nft-emulation:
    acton run deploy-nft-emulation

deploy-nft-testnet:
    acton run deploy-nft-testnet

# Non-interactive NFT deploy (requires NFT_OWNER_ADDRESS)
deploy-nft-testnet-ci:
    ./scripts/deploy-nft-testnet-noninteractive.sh

# Write PUBLIC_NFT_ITEM_ADDRESS into web/.env after deploy
deploy-nft-testnet-ci-write-env:
    WRITE_WEB_ENV=1 ./scripts/deploy-nft-testnet-noninteractive.sh

nft-info:
    acton run nft-info

nft-info-testnet:
    acton script scripts/nft-info.tolk --net testnet

# --- Jetton ops ---
buy-time:
    acton run buy-time

buy-time-testnet:
    acton script scripts/buy-time.tolk --net testnet

info-testnet:
    acton script scripts/info.tolk --net testnet

verify-all:
    acton verify JettonMinter
    acton verify JettonWallet
    acton verify RedeemableNftItem

# --- Web ---
web-install:
    cd web && npm install
    cd web/api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

web-dev: web-install
    cd web && npm run dev

web-build: web-install
    cd web && npm run build

web-test:
    cd web && npm run test

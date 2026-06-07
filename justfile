# Time Voucher TON — common Acton commands
# https://github.com/casey/just

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

# --- Toolchain ---

# Show Acton version and project health
doctor:
    acton doctor
    acton --version

# Install or update the Acton CLI
up:
    acton up

# --- Build ---

# Compile all contracts
build:
    acton build

# Compile JettonWallet first (generates gen/JettonWallet.code)
build-wallet:
    acton build JettonWallet

# Compile JettonMinter (depends on JettonWallet)
build-minter:
    acton build JettonMinter

# Regenerate contract wrappers from ABI
wrapper:
    acton wrapper JettonMinter
    acton wrapper JettonWallet

# Remove build artifacts (contracts + web)
clean:
    rm -rf build gen web/dist web/.astro web/data

# Rebuild from scratch
rebuild: clean build

# --- Quality ---

# Format all Tolk sources
fmt:
    acton fmt

# Check formatting without writing changes
fmt-check:
    acton fmt --check

# Lint / type-check project sources
check:
    acton check

# Lint with GitHub Actions annotation format
check-ci:
    acton check --output-format github

# Run the full test suite
test:
    acton test

# Run buy-time tests only
test-buy-time:
    acton test tests/buy-time.test.tolk

# Run admin/governance tests only
test-admin:
    acton test tests/admin-and-governance.test.tolk

# Run wallet behavior tests only
test-wallet:
    acton test tests/wallet-behavior.test.tolk

# CI pipeline: build, format, lint, test
ci: build fmt-check check-ci test

# --- Wallets ---

# Create a funded local deployer wallet
wallet-new name="deployer":
    acton wallet new --name {{name}} --local --airdrop

# List configured wallets
wallet-list:
    acton wallet list

# Request testnet coins for a wallet
wallet-airdrop name="deployer":
    acton wallet airdrop {{name}}

# --- Deploy ---

# Deploy minter locally (emulation)
deploy: deploy-emulation

# Deploy minter locally (emulation)
deploy-emulation:
    acton run deploy-emulation

# Deploy minter to testnet
deploy-testnet:
    acton run deploy-testnet

# --- Time voucher (pay-to-mint) ---

# Buy one TIME token with TON (local emulation)
buy-time:
    acton run buy-time

# Buy one TIME token with TON (testnet)
buy-time-testnet:
    acton script scripts/buy-time.tolk --net testnet

# Withdraw earned TON from minter (local emulation)
withdraw:
    acton run withdraw

# Withdraw earned TON from minter (testnet)
withdraw-testnet:
    acton script scripts/withdraw.tolk --net testnet

# --- Jetton admin ---

# Mint jettons as admin (local emulation)
mint:
    acton run jetton-mint

# Mint jettons as admin (testnet)
mint-testnet:
    acton script scripts/mint.tolk --net testnet

# Transfer jettons between wallets (local emulation)
transfer:
    acton run jetton-transfer

# Transfer jettons (testnet)
transfer-testnet:
    acton script scripts/transfer.tolk --net testnet

# Show minter and wallet info (local emulation)
info:
    acton run jetton-info

# Show minter and wallet info (testnet)
info-testnet:
    acton script scripts/info.tolk --net testnet

# Propose a new admin address (local emulation)
change-admin:
    acton run jetton-change-admin

# Propose a new admin address (testnet)
change-admin-testnet:
    acton script scripts/change-admin.tolk --net testnet

# Claim pending admin role (local emulation)
claim-admin:
    acton run jetton-claim-admin

# Claim pending admin role (testnet)
claim-admin-testnet:
    acton script scripts/claim-admin.tolk --net testnet

# Update jetton metadata (local emulation)
change-metadata:
    acton run jetton-change-metadata

# Update jetton metadata (testnet)
change-metadata-testnet:
    acton script scripts/change-metadata.tolk --net testnet

# --- Verify ---

# Verify contract source on TON Verifier
verify contract="JettonMinter":
    acton verify {{contract}}

# --- Dev workflow ---

# Install web + API dependencies
web-install:
    cd web && npm install
    cd web/api && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# Run Astro frontend + FastAPI (http://localhost:4321, API :8787)
web-dev: web-install
    cd web && npm run dev

# Run only the FastAPI backend
web-api: web-install
    cd web && npm run dev:api

# View logged purchase/redeem events (requires ADMIN_API_TOKEN in env)
events:
    curl -s -H "Authorization: Bearer ${ADMIN_API_TOKEN:?set ADMIN_API_TOKEN}" http://localhost:8787/api/admin/events | python3 -m json.tool

# Build Astro static site
web-build: web-install
    cd web && npm run build

# Preview production build (static + FastAPI on PORT)
web-preview: web-install
    cd web && npm run preview

# Run production FastAPI server locally (after build)
web-start: web-build
    cd web && npm start

# Typical local dev loop after contract changes
dev: build test

# Full local flow: deploy, buy time, show balances
demo: deploy-emulation buy-time info

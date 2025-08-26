# 🚀 Deployment Guide

## Quick Deployment Steps

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit with your configuration
# REQUIRED: PRIVATE_KEY, RPC URLs, API keys
```

### 2. Install Dependencies

```bash
npm install
cd sdk && npm install && cd ..
cd dashboard && npm install && cd ..
```

### 3. Compile Contracts

```bash
npx hardhat compile
```

### 4. Run Tests (Recommended)

```bash
npx hardhat test
```

### 5. Deploy to Network

```bash
# Mumbai Testnet (recommended for testing)
npx hardhat run scripts/deploy-enhanced.js --network mumbai

# Polygon Mainnet (production)
npx hardhat run scripts/deploy-enhanced.js --network polygon
```

### 6. Verify Contracts

```bash
# Verification commands will be displayed after deployment
npx hardhat verify --network mumbai <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Supported Networks

| Network | Chain ID | Status | Use Case |
|---------|----------|--------|----------|
| Polygon Mainnet | 137 | ✅ Production | Live dApps |
| Mumbai Testnet | 80001 | ✅ Testing | Development |
| Polygon zkEVM | 1442 | 🚧 Coming Soon | Future scaling |
| Local Hardhat | 31337 | ✅ Development | Local testing |

## Post-Deployment

### SDK Configuration

Update your frontend with deployed addresses:

```typescript
const config = {
  chainId: 80001,
  contracts: {
    subscriptionManager: "0x...",
    paymaster: "0x...",
    smartWalletFactory: "0x...",
    integrationRegistry: "0x..."
  }
};
```

### Dashboard Deployment

```bash
cd dashboard
npm run build
npm run deploy:vercel  # or deploy:netlify
```

### Documentation

- Update contract addresses in documentation
- Test all integration examples
- Verify analytics dashboard functionality

## Troubleshooting

- **Gas Issues**: Ensure sufficient ETH balance for deployment
- **RPC Errors**: Check RPC URL and network connectivity
- **Verification Failures**: Ensure correct constructor arguments

For detailed troubleshooting, see [docs/README-GASLESS.md](./README-GASLESS.md).
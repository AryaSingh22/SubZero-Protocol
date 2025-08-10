# On-Chain Subscription Payment System (Pull Model)

A Solidity-based smart contract system that enables recurring payments using the pull model, where service providers can pull approved tokens from subscribers at specified intervals.

## 🚀 Features

### Core Functionality
- **Subscription Lifecycle Management**: Create, pause, resume, and cancel subscriptions
- **Pull-based Payments**: Service providers pull payments when due (not pushed by users)
- **Flexible Expiration**: Support for time-based expiration and maximum payment limits
- **Batch Operations**: Efficient batch processing of multiple payments
- **Chainlink Keeper Integration**: Automated execution via Chainlink Keepers
- **Security**: Reentrancy protection and safe ERC20 transfers

### Subscription Features
- Customizable payment intervals
- Multiple subscription support per user
- Pause/resume functionality
- Automatic expiration handling
- Event logging for all operations

## 📋 Contract Architecture

### Main Contract: `SubscriptionPaymentSystem.sol`
- Manages all subscription operations
- Implements Chainlink AutomationCompatibleInterface
- Uses OpenZeppelin security patterns

### Supporting Contract: `MockERC20.sol`
- Test ERC20 token for development and testing

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Git

### Installation
```bash
# Clone the repository
git clone <your-repo-url>
cd subscription-payment-system

# Install dependencies
npm install

# Compile contracts
npx hardhat compile
```

## 🧪 Testing

Run the comprehensive test suite:
```bash
# Run all tests
npx hardhat test

# Run tests with gas reporting
npx hardhat test --gas-reporter

# Generate coverage report
npx hardhat coverage
```

### Test Coverage
The test suite covers:
- Subscription creation and validation
- Payment pulling mechanisms
- Subscription management (pause/resume/cancel)
- Expiration handling (time-based and count-based)
- Batch operations
- Chainlink Keeper integration
- Access control and security

## 🚀 Deployment

### Local Development
```bash
# Start local Hardhat node
npx hardhat node

# Deploy to local network
npx hardhat run scripts/deploy.js --network localhost
```

### Testnet/Mainnet Deployment
```bash
# Deploy to specific network
npx hardhat run scripts/deploy.js --network <network-name>

# Example for Polygon Mumbai
npx hardhat run scripts/deploy.js --network mumbai
```

## 📖 Usage Guide

### Creating a Subscription

1. **Approve Tokens**: First, approve the subscription contract to spend your tokens
```javascript
await token.approve(subscriptionSystemAddress, totalAmount);
```

2. **Create Subscription**: Call the createSubscription function
```javascript
await subscriptionSystem.createSubscription(
  recipientAddress,    // Service provider address
  tokenAddress,        // ERC20 token address
  paymentAmount,       // Amount per payment
  paymentInterval,     // Interval in seconds
  maxPayments,         // 0 for unlimited
  expirationDate       // 0 for no expiration
);
```

### Managing Subscriptions

```javascript
// Pause subscription
await subscriptionSystem.pauseSubscription(subscriptionId);

// Resume subscription
await subscriptionSystem.resumeSubscription(subscriptionId);

// Cancel subscription
await subscriptionSystem.cancelSubscription(subscriptionId);
```

### Pulling Payments

Payments can be pulled in several ways:

1. **Manual Pull** (single payment):
```javascript
await subscriptionSystem.pullPayment(subscriptionId);
```

2. **Batch Pull** (multiple payments):
```javascript
await subscriptionSystem.batchPullPayments([id1, id2, id3]);
```

3. **Chainlink Keepers** (automated):
The contract implements `checkUpkeep` and `performUpkeep` for automatic execution.

## 🔗 Chainlink Keeper Integration

The contract is fully compatible with Chainlink Keepers for automated payment execution:

### Setup Steps:
1. Deploy the contract
2. Register the contract with Chainlink Keepers
3. Fund the Keeper with LINK tokens
4. Payments will be automatically pulled when due

### Keeper Functions:
- `checkUpkeep()`: Returns whether upkeep is needed and which subscriptions are due
- `performUpkeep()`: Executes batch payment pulls for due subscriptions

## 🔒 Security Features

- **Reentrancy Protection**: Uses OpenZeppelin's ReentrancyGuard
- **Safe Transfers**: Uses SafeERC20 for all token operations
- **Access Control**: Only subscribers can manage their subscriptions
- **Gas Optimization**: Batch operations with configurable limits
- **Error Handling**: Graceful handling of failed transfers in batch operations

## 📊 Contract Events

The contract emits the following events for monitoring:

```solidity
event SubscriptionCreated(uint256 indexed subscriptionId, address indexed subscriber, address indexed recipient, address token, uint256 amount, uint256 interval);
event PaymentPulled(uint256 indexed subscriptionId, address indexed subscriber, address indexed recipient, uint256 amount, uint256 paymentCount);
event SubscriptionPaused(uint256 indexed subscriptionId, address indexed subscriber);
event SubscriptionResumed(uint256 indexed subscriptionId, address indexed subscriber);
event SubscriptionCancelled(uint256 indexed subscriptionId, address indexed subscriber);
event SubscriptionExpired(uint256 indexed subscriptionId, address indexed subscriber);
```

## 🔧 Configuration

### Network Configuration
Update `hardhat.config.js` to add your target networks:

```javascript
networks: {
  polygon: {
    url: "https://polygon-rpc.com/",
    accounts: [process.env.PRIVATE_KEY]
  },
  mumbai: {
    url: "https://rpc-mumbai.maticvigil.com/",
    accounts: [process.env.PRIVATE_KEY]
  }
}
```

### Environment Variables
Create a `.env` file:
```
PRIVATE_KEY=your_private_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
```

## 📈 Gas Optimization

The contract includes several gas optimization features:
- Batch operations to reduce transaction costs
- Configurable batch size limits
- Efficient storage patterns
- Minimal external calls

## 🛡️ Audit Considerations

Before mainnet deployment, consider:
- Professional smart contract audit
- Extensive testing on testnets
- Gradual rollout with usage limits
- Monitoring and alerting systems

## 📚 API Reference

### Main Functions

#### `createSubscription(address recipient, address token, uint256 amount, uint256 interval, uint256 maxPayments, uint256 expirationDate)`
Creates a new subscription with specified parameters.

#### `pullPayment(uint256 subscriptionId)`
Pulls a single payment for the specified subscription.

#### `batchPullPayments(uint256[] subscriptionIds)`
Pulls payments for multiple subscriptions in a single transaction.

#### `pauseSubscription(uint256 subscriptionId)`
Pauses an active subscription (subscriber only).

#### `resumeSubscription(uint256 subscriptionId)`
Resumes a paused subscription (subscriber only).

#### `cancelSubscription(uint256 subscriptionId)`
Permanently cancels a subscription (subscriber only).

### View Functions

#### `getSubscription(uint256 subscriptionId)`
Returns complete subscription details.

#### `getUserSubscriptions(address user)`
Returns array of subscription IDs for a user.

#### `getRecipientSubscriptions(address recipient)`
Returns array of subscription IDs for a recipient.

#### `checkUpkeep(bytes calldata checkData)`
Chainlink Keeper function to check if upkeep is needed.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This smart contract system is provided as-is for educational and development purposes. Conduct thorough testing and consider professional audits before using in production environments with real funds.

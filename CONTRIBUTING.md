# Contributing to Advanced Gasless Subscription System

Thank you for your interest in contributing to the Advanced Gasless Subscription System! This guide will help you get started and ensure a smooth contribution process.

## 🚀 Quick Start

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone https://github.com/your-username/gasless-subscription-system.git
   cd gasless-subscription-system
   ```
3. **Install dependencies**
   ```bash
   npm install
   ```
4. **Run tests to ensure everything works**
   ```bash
   npm test
   ```

## 🌟 Ways to Contribute

### Code Contributions
- 🐛 **Bug fixes**
- ✨ **New features**
- ⚡ **Performance improvements**
- 🔒 **Security enhancements**
- 📝 **Documentation improvements**

### Non-Code Contributions
- 📖 **Documentation updates**
- 🎨 **UI/UX improvements**
- 🧪 **Testing improvements**
- 🗣️ **Community support**
- 🔍 **Code reviews**

## 📋 Development Process

### Branch Naming Convention

Use descriptive branch names with the following prefixes:

```
feature/    - New features
bugfix/     - Bug fixes
hotfix/     - Critical bug fixes
docs/       - Documentation changes
test/       - Test-related changes
refactor/   - Code refactoring
chore/      - Maintenance tasks
```

**Examples:**
```bash
feature/multi-token-support
bugfix/paymaster-validation-error
docs/sdk-integration-guide
test/subscription-manager-edge-cases
```

### Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(sdk): add support for custom token subscriptions
fix(paymaster): resolve gas estimation error for large batches
docs(readme): update installation instructions
test(subscription): add edge cases for subscription cancellation
```

### Pull Request Process

1. **Create a feature branch** from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our coding standards

3. **Write/update tests** for your changes

4. **Run the full test suite**
   ```bash
   npm test
   npm run lint
   npm run coverage
   ```

5. **Update documentation** if needed

6. **Commit your changes** using conventional commit messages

7. **Push to your fork** and create a pull request

8. **Fill out the PR template** completely

## 🧪 Testing Guidelines

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run coverage

# Run specific test file
npx hardhat test test/specific-test.js

# Run tests with gas reporting
npm run test:gas
```

### Writing Tests

- **Unit tests** for individual functions
- **Integration tests** for contract interactions
- **End-to-end tests** for complete workflows
- **Gas optimization tests** for efficiency

**Test Structure:**
```javascript
describe("SubscriptionManager", function () {
  describe("createPlan", function () {
    it("should create a plan with valid parameters", async function () {
      // Test implementation
    });
    
    it("should revert with invalid token address", async function () {
      // Test implementation
    });
  });
});
```

### Coverage Requirements

- **Minimum 95% code coverage** for new features
- **100% coverage** for critical security functions
- **Edge case testing** for all public functions

## 🎨 Code Style Guidelines

### Solidity Contracts

```solidity
// Use explicit imports
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// Document all functions
/**
 * @dev Creates a new subscription plan
 * @param name Plan name
 * @param price Plan price in tokens
 * @return planId The ID of the created plan
 */
function createPlan(string memory name, uint256 price) external returns (uint256 planId) {
    // Implementation
}

// Use consistent naming
contract SubscriptionManagerV2 {  // PascalCase for contracts
    uint256 public planCounter;    // camelCase for variables
    mapping(uint256 => Plan) private _plans;  // underscore prefix for private
}
```

### TypeScript/JavaScript

```typescript
// Use explicit types
interface SubscriptionPlan {
  id: number;
  name: string;
  price: BigNumber;
}

// Document public functions
/**
 * Subscribe to a plan using gasless transactions
 * @param planId - The plan to subscribe to
 * @param subscriber - The subscriber address
 * @returns Promise resolving to subscription details
 */
async function subscribe(planId: number, subscriber: string): Promise<Subscription> {
  // Implementation
}

// Use consistent naming
const subscriptionManager = new SubscriptionManager();  // camelCase
const PLAN_TYPES = {  // UPPER_SNAKE_CASE for constants
  BASIC: 'basic',
  PREMIUM: 'premium'
};
```

### File Organization

```
src/
├── contracts/           # Smart contracts
│   ├── core/           # Core contracts
│   ├── automation/     # Automation contracts
│   └── interfaces/     # Contract interfaces
├── sdk/                # TypeScript SDK
│   ├── services/       # Core services
│   ├── types/          # Type definitions
│   └── utils/          # Utility functions
└── test/               # Test files
    ├── unit/           # Unit tests
    ├── integration/    # Integration tests
    └── fixtures/       # Test fixtures
```

## 🔒 Security Guidelines

### Smart Contract Security

1. **Follow OpenZeppelin patterns**
2. **Use reentrancy guards** for external calls
3. **Validate all inputs** and check bounds
4. **Use safe math operations** (built-in in Solidity ^0.8.0)
5. **Implement proper access controls**

### Code Review Checklist

- [ ] **Security**: No vulnerabilities or attack vectors
- [ ] **Gas optimization**: Efficient gas usage
- [ ] **Error handling**: Proper error messages and edge cases
- [ ] **Documentation**: Clear comments and documentation
- [ ] **Testing**: Comprehensive test coverage
- [ ] **Code style**: Follows project conventions

## 📝 Documentation Standards

### Code Comments

```solidity
/**
 * @title SubscriptionManagerV2
 * @dev Enhanced subscription manager with multi-token support
 * @notice This contract manages recurring subscriptions using ERC-4337
 */
contract SubscriptionManagerV2 {
    
    /**
     * @dev Creates a subscription plan
     * @param name Plan display name
     * @param description Plan description  
     * @param price Price per billing cycle
     * @param token Payment token address
     * @param frequency Billing frequency (0=daily, 1=weekly, etc.)
     * @param customInterval Custom interval in seconds (if frequency is custom)
     * @param maxPayments Maximum payments (0 = unlimited)
     * @param beneficiary Payment recipient
     * @param trialPeriod Trial period in seconds
     * @param metadata Additional plan metadata
     * @return planId The created plan ID
     */
    function createPlan(
        string memory name,
        string memory description,
        uint256 price,
        address token,
        BillingFrequency frequency,
        uint256 customInterval,
        uint256 maxPayments,
        address beneficiary,
        uint256 trialPeriod,
        string memory metadata
    ) external returns (uint256 planId) {
        // Implementation
    }
}
```

### README Updates

When adding features, update the relevant README sections:
- **Features list**
- **Usage examples**
- **API documentation**
- **Configuration options**

## 🐛 Reporting Issues

### Bug Reports

Use the bug report template and include:
- **Environment details** (OS, Node.js version, network)
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Error messages/logs**
- **Minimal reproduction code**

### Feature Requests

Use the feature request template and include:
- **Problem description**
- **Proposed solution**
- **Alternatives considered**
- **Use cases**

## 🏆 Recognition

### Contributors Hall of Fame

We recognize contributors in multiple ways:
- **GitHub contributors graph**
- **Changelog mentions**
- **Community highlights**
- **Conference presentations**

### Contribution Types

- 🐛 **Bug fixes**
- ✨ **Features**
- 📝 **Documentation**
- 🧪 **Testing**
- 🎨 **Design**
- 💡 **Ideas**
- 🔍 **Review**
- ❓ **Support**

## 📞 Getting Help

### Community Channels

- **GitHub Discussions**: For questions and general discussion
- **Discord**: Real-time chat and support
- **Twitter**: Updates and announcements

### Development Support

- **Code reviews**: Tag maintainers for review
- **Architecture questions**: Open a discussion issue
- **Security concerns**: Email security@gasless-subscribe.com

## 📄 Legal

### Contributor License Agreement

By contributing, you agree that:
- Your contributions are your original work
- You grant the project rights to use your contributions
- Your contributions are licensed under the MIT License

### Code of Conduct

Please read and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## 🎉 Thank You!

Your contributions make this project better for everyone. Whether you're fixing bugs, adding features, improving documentation, or helping other users, your effort is appreciated!

**Happy coding!** 🚀
# System Architecture

## 🏗️ High-Level Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        A[dApp UI] --> B[SDK]
        B --> C[React Components]
        C --> D[Subscribe Button]
    end
    
    subgraph "Account Abstraction Layer (ERC-4337)"
        E[UserOperation] --> F[EntryPoint]
        F --> G[PaymasterV2]
        F --> H[SmartWallet]
    end
    
    subgraph "Business Logic Layer"
        I[SubscriptionManagerV2] --> J[Plans]
        I --> K[Subscriptions] 
        I --> L[Multi-Token Support]
        M[IntegrationRegistry] --> N[Third-party dApps]
    end
    
    subgraph "Automation Layer"
        O[Gelato Network] --> P[Auto Billing]
        Q[Chainlink Automation] --> P
        P --> I
    end
    
    subgraph "Analytics Layer"
        R[Event Indexer] --> S[Analytics API]
        S --> T[Dashboard]
        I --> R
    end
    
    A --> E
    B --> E
    G --> I
    H --> I
    I --> M
```

## 🔄 Transaction Flow

### Gasless Subscription Flow

```mermaid
sequenceDiagram
    participant U as User
    participant W as SmartWallet
    participant E as EntryPoint
    participant P as PaymasterV2
    participant S as SubscriptionManager
    participant T as Token Contract
    
    U->>W: Sign EIP-712 message
    U->>+E: Submit UserOperation
    E->>+P: validatePaymasterUserOp()
    P-->>-E: Valid + context
    E->>+W: validateUserOp()
    W-->>-E: Valid signature
    E->>+W: Execute call
    W->>+S: subscribe(planId, user)
    S->>+T: transferFrom(user, beneficiary, amount)
    T-->>-S: Transfer success
    S-->>-W: Subscription created
    W-->>-E: Execution success
    E-->>-U: Transaction complete
```

### Automated Billing Flow

```mermaid
sequenceDiagram
    participant G as Gelato/Chainlink
    participant A as Automation Contract
    participant S as SubscriptionManager
    participant T as Token Contract
    participant B as Beneficiary
    
    G->>+A: checkUpkeep()
    A->>+S: getDueSubscriptions()
    S-->>-A: [subscription1, subscription2...]
    A-->>-G: upkeepNeeded = true
    
    G->>+A: performUpkeep()
    A->>+S: batchChargeSubscriptions([ids])
    loop For each subscription
        S->>+T: transferFrom(subscriber, beneficiary, amount)
        T-->>-S: Transfer success
        S->>S: Update subscription state
    end
    S-->>-A: Batch complete
    A-->>-G: Upkeep performed
```

## 📊 Component Interactions

### SDK Integration

```mermaid
graph LR
    subgraph "Application Layer"
        A[dApp] --> B[React App]
        B --> C[SubscribeButton]
    end
    
    subgraph "SDK Layer"
        D[GaslessSubscriptionSDK] --> E[Contract Interfaces]
        D --> F[EIP-712 Utils]
        D --> G[Transaction Builder]
    end
    
    subgraph "Blockchain Layer"
        H[Smart Contracts] --> I[Events]
        H --> J[State]
    end
    
    C --> D
    G --> H
    I --> D
```

### Multi-Chain Architecture

```mermaid
graph TB
    subgraph "Application Layer"
        A[Frontend] --> B[SDK Core]
    end
    
    subgraph "Chain Abstraction"
        B --> C[Chain Manager]
        C --> D[Polygon]
        C --> E[Ethereum]
        C --> F[Arbitrum]
        C --> G[zkEVM]
    end
    
    subgraph "Contract Deployment"
        D --> H[Polygon Contracts]
        E --> I[Ethereum Contracts]
        F --> J[Arbitrum Contracts]
        G --> K[zkEVM Contracts]
    end
```

## 🔐 Security Model

### Access Control Matrix

| Role | SmartWallet | SubscriptionManager | PaymasterV2 | IntegrationRegistry |
|------|-------------|-------------------|-------------|-------------------|
| Owner | Full Control | Create Plans | Gas Limits | Register dApps |
| User | Execute Txns | Subscribe/Cancel | - | - |
| Relayer | Submit UserOps | Automated Billing | Whitelisted | - |
| Paymaster | - | - | Sponsor Gas | - |

### Security Layers

```mermaid
graph TB
    A[Application Security] --> B[Input Validation]
    A --> C[Rate Limiting]
    
    D[Contract Security] --> E[ReentrancyGuard]
    D --> F[AccessControl]
    D --> G[Pausable]
    
    H[Protocol Security] --> I[ERC-4337 Validation]
    H --> J[EIP-712 Signatures]
    H --> K[Nonce Management]
    
    L[Infrastructure Security] --> M[Multi-sig Wallets]
    L --> N[Time Locks]
    L --> O[Emergency Pause]
```

## 📈 Scalability Considerations

### Gas Optimization Strategies

1. **Batch Operations**
   - Process multiple subscriptions in one transaction
   - Reduce per-transaction overhead
   - Optimize for high-volume scenarios

2. **Efficient Storage**
   - Pack structs to minimize storage slots
   - Use events for historical data
   - Minimize state changes

3. **Layer 2 Integration**
   - Deploy on Polygon for low costs
   - Support multiple L2 solutions
   - Cross-chain subscription management

### Performance Metrics

| Operation | Gas Cost | Batch Size | Optimization |
|-----------|----------|------------|--------------|
| Single Subscribe | ~200k | 1 | Baseline |
| Batch Subscribe | ~150k | 10 | 25% savings |
| Single Charge | ~80k | 1 | Baseline |
| Batch Charge | ~60k | 25 | 25% savings |

## 🔄 Upgrade Patterns

### Proxy Architecture

```mermaid
graph LR
    A[ProxyAdmin] --> B[TransparentUpgradeableProxy]
    B --> C[SubscriptionManagerV1]
    B -.-> D[SubscriptionManagerV2]
    B -.-> E[SubscriptionManagerV3]
```

### Migration Strategy

1. **Deploy New Implementation**
2. **Test on Testnet**
3. **Gradual Migration**
4. **Full Cutover**

## 📊 Monitoring & Analytics

### Event Architecture

```mermaid
graph TB
    A[Smart Contracts] --> B[Event Logs]
    B --> C[Event Indexer]
    C --> D[Database]
    D --> E[Analytics API]
    E --> F[Dashboard]
    E --> G[Alerts]
```

### Key Metrics

- **Subscription Metrics**: Active subs, churn rate, LTV
- **Financial Metrics**: MRR, revenue per user, payment success rate
- **Technical Metrics**: Gas usage, transaction success rate, automation uptime
- **User Metrics**: Adoption rate, user engagement, support tickets

This architecture enables a scalable, secure, and user-friendly gasless subscription system built on modern Web3 infrastructure.
// Contract ABIs
export const SUBSCRIPTION_MANAGER_ABI = [
  {
    "type": "function",
    "name": "createPlan",
    "inputs": [
      { "name": "name", "type": "string" },
      { "name": "description", "type": "string" },
      { "name": "amount", "type": "uint256" },
      { "name": "tokenAddress", "type": "address" },
      { "name": "billingFrequency", "type": "uint8" },
      { "name": "customInterval", "type": "uint256" },
      { "name": "maxPayments", "type": "uint256" },
      { "name": "trialPeriod", "type": "uint256" }
    ],
    "outputs": [{ "name": "planId", "type": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "subscribe",
    "inputs": [
      { "name": "planId", "type": "uint256" },
      { "name": "subscriber", "type": "address" }
    ],
    "outputs": [{ "name": "subscriptionId", "type": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "unsubscribe",
    "inputs": [
      { "name": "subscriptionId", "type": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pauseSubscription",
    "inputs": [
      { "name": "subscriptionId", "type": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "resumeSubscription",
    "inputs": [
      { "name": "subscriptionId", "type": "uint256" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getSubscription",
    "inputs": [
      { "name": "subscriptionId", "type": "uint256" }
    ],
    "outputs": [
      {
        "type": "tuple",
        "components": [
          { "name": "id", "type": "uint256" },
          { "name": "planId", "type": "uint256" },
          { "name": "subscriber", "type": "address" },
          { "name": "startTime", "type": "uint256" },
          { "name": "nextPaymentTime", "type": "uint256" },
          { "name": "paymentCount", "type": "uint256" },
          { "name": "totalPaid", "type": "uint256" },
          { "name": "isActive", "type": "bool" },
          { "name": "isPaused", "type": "bool" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPlan",
    "inputs": [
      { "name": "planId", "type": "uint256" }
    ],
    "outputs": [
      {
        "type": "tuple",
        "components": [
          { "name": "id", "type": "uint256" },
          { "name": "name", "type": "string" },
          { "name": "description", "type": "string" },
          { "name": "amount", "type": "uint256" },
          { "name": "tokenAddress", "type": "address" },
          { "name": "interval", "type": "uint256" },
          { "name": "maxPayments", "type": "uint256" },
          { "name": "isActive", "type": "bool" },
          { "name": "creator", "type": "address" },
          { "name": "createdAt", "type": "uint256" },
          { "name": "trialPeriod", "type": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getUserSubscriptions",
    "inputs": [
      { "name": "user", "type": "address" }
    ],
    "outputs": [
      { "name": "subscriptionIds", "type": "uint256[]" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "PlanCreated",
    "inputs": [
      { "name": "planId", "type": "uint256", "indexed": true },
      { "name": "creator", "type": "address", "indexed": true },
      { "name": "name", "type": "string", "indexed": false },
      { "name": "amount", "type": "uint256", "indexed": false },
      { "name": "tokenAddress", "type": "address", "indexed": true }
    ]
  },
  {
    "type": "event",
    "name": "SubscriptionCreated",
    "inputs": [
      { "name": "subscriptionId", "type": "uint256", "indexed": true },
      { "name": "planId", "type": "uint256", "indexed": true },
      { "name": "subscriber", "type": "address", "indexed": true },
      { "name": "startTime", "type": "uint256", "indexed": false }
    ]
  },
  {
    "type": "event",
    "name": "SubscriptionCancelled",
    "inputs": [
      { "name": "subscriptionId", "type": "uint256", "indexed": true },
      { "name": "subscriber", "type": "address", "indexed": true }
    ]
  }
];

export const SMART_WALLET_ABI = [
  {
    "type": "function",
    "name": "execute",
    "inputs": [
      { "name": "dest", "type": "address" },
      { "name": "value", "type": "uint256" },
      { "name": "func", "type": "bytes" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "executeBatch",
    "inputs": [
      { "name": "dest", "type": "address[]" },
      { "name": "value", "type": "uint256[]" },
      { "name": "func", "type": "bytes[]" }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "validateUserOp",
    "inputs": [
      {
        "name": "userOp",
        "type": "tuple",
        "components": [
          { "name": "sender", "type": "address" },
          { "name": "nonce", "type": "uint256" },
          { "name": "initCode", "type": "bytes" },
          { "name": "callData", "type": "bytes" },
          { "name": "callGasLimit", "type": "uint256" },
          { "name": "verificationGasLimit", "type": "uint256" },
          { "name": "preVerificationGas", "type": "uint256" },
          { "name": "maxFeePerGas", "type": "uint256" },
          { "name": "maxPriorityFeePerGas", "type": "uint256" },
          { "name": "paymasterAndData", "type": "bytes" },
          { "name": "signature", "type": "bytes" }
        ]
      },
      { "name": "userOpHash", "type": "bytes32" },
      { "name": "missingAccountFunds", "type": "uint256" }
    ],
    "outputs": [
      { "name": "validationData", "type": "uint256" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getNonce",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  }
];

export const SMART_WALLET_FACTORY_ABI = [
  {
    "type": "function",
    "name": "createAccount",
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "salt", "type": "uint256" }
    ],
    "outputs": [
      { "name": "account", "type": "address" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAddress",
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "salt", "type": "uint256" }
    ],
    "outputs": [
      { "name": "", "type": "address" }
    ],
    "stateMutability": "view"
  }
];

export const PAYMASTER_ABI = [
  {
    "type": "function",
    "name": "validatePaymasterUserOp",
    "inputs": [
      {
        "name": "userOp",
        "type": "tuple",
        "components": [
          { "name": "sender", "type": "address" },
          { "name": "nonce", "type": "uint256" },
          { "name": "initCode", "type": "bytes" },
          { "name": "callData", "type": "bytes" },
          { "name": "callGasLimit", "type": "uint256" },
          { "name": "verificationGasLimit", "type": "uint256" },
          { "name": "preVerificationGas", "type": "uint256" },
          { "name": "maxFeePerGas", "type": "uint256" },
          { "name": "maxPriorityFeePerGas", "type": "uint256" },
          { "name": "paymasterAndData", "type": "bytes" },
          { "name": "signature", "type": "bytes" }
        ]
      },
      { "name": "userOpHash", "type": "bytes32" },
      { "name": "maxCost", "type": "uint256" }
    ],
    "outputs": [
      { "name": "context", "type": "bytes" },
      { "name": "validationData", "type": "uint256" }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getBalance",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  }
];

export const ERC20_ABI = [
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      { "name": "to", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      { "name": "account", "type": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint8" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view"
  }
];

// Contract addresses by network
export const CONTRACT_ADDRESSES = {
  // Polygon Mainnet
  137: {
    SUBSCRIPTION_MANAGER: '',
    PAYMASTER: '',
    SMART_WALLET_FACTORY: '',
    ENTRY_POINT: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    INTEGRATION_REGISTRY: ''
  },
  // Polygon Mumbai Testnet
  80001: {
    SUBSCRIPTION_MANAGER: '',
    PAYMASTER: '',
    SMART_WALLET_FACTORY: '',
    ENTRY_POINT: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    INTEGRATION_REGISTRY: ''
  },
  // Polygon zkEVM Testnet
  1442: {
    SUBSCRIPTION_MANAGER: '',
    PAYMASTER: '',
    SMART_WALLET_FACTORY: '',
    ENTRY_POINT: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    INTEGRATION_REGISTRY: ''
  },
  // Local development
  31337: {
    SUBSCRIPTION_MANAGER: '',
    PAYMASTER: '',
    SMART_WALLET_FACTORY: '',
    ENTRY_POINT: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    INTEGRATION_REGISTRY: ''
  }
};

// Common token addresses
export const TOKEN_ADDRESSES = {
  137: { // Polygon Mainnet
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
  },
  80001: { // Mumbai Testnet
    USDC: '0x9999f7Fea5938fD3b1E26A12c3f2fb024e194f97',
    USDT: '0xA02f6adc7926efeBBd59Fd43A84f4E0c0c91e832',
    DAI: '0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F'
  }
};
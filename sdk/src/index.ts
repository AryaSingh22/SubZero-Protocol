// Main SDK export
export { GaslessSubscriptionSDK } from './services/GaslessSubscriptionSDK';

// Type exports
export type {
  SubscriptionPlan,
  Subscription,
  SmartWalletConfig,
  PaymasterConfig,
  UserOperation,
  GaslessSubscriptionConfig,
  TokenInfo,
  BillingFrequency,
  SubscriptionEvent,
  AnalyticsData,
  SDKConfig,
  SubscribeOptions,
  UnsubscribeOptions,
  WalletConnectionStatus,
  TransactionResult,
  GasEstimate,
} from './types';

// Error exports
export {
  SDKError,
  WalletError,
  TransactionError,
  ContractError,
  ValidationError,
} from './types';

// Contract exports
export {
  SUBSCRIPTION_MANAGER_ABI,
  SMART_WALLET_ABI,
  SMART_WALLET_FACTORY_ABI,
  PAYMASTER_ABI,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
  TOKEN_ADDRESSES,
} from './contracts';

// Utility exports
export {
  calculateSmartWalletAddress,
  signUserOperation,
  signSubscribeOperation,
  encodeFunctionData,
  getUserOperationHash,
  formatTokenAmount,
  parseTokenAmount,
  isValidAddress,
  getCurrentTimestamp,
  calculateNextPaymentTime,
  isPaymentDue,
  estimateUserOperationGas,
  generateSalt,
  retry,
  validatePlanParameters,
} from './utils';

// Constants
export const SDK_VERSION = '1.0.0';

export const BILLING_FREQUENCIES = {
  DAILY: { interval: 86400, name: 'Daily', description: 'Charged every day' },
  WEEKLY: { interval: 604800, name: 'Weekly', description: 'Charged every week' },
  MONTHLY: { interval: 2592000, name: 'Monthly', description: 'Charged every 30 days' },
  QUARTERLY: { interval: 7776000, name: 'Quarterly', description: 'Charged every 90 days' },
  YEARLY: { interval: 31536000, name: 'Yearly', description: 'Charged every 365 days' },
};

export const SUPPORTED_NETWORKS = {
  POLYGON: 137,
  POLYGON_MUMBAI: 80001,
  POLYGON_ZKEVM_TESTNET: 1442,
  HARDHAT: 31337,
};

// Factory function for easy SDK initialization
export function createGaslessSubscriptionSDK(config: SDKConfig): GaslessSubscriptionSDK {
  return new GaslessSubscriptionSDK(config);
}

// Default configurations for different networks
export const DEFAULT_CONFIGS: Record<number, Partial<GaslessSubscriptionConfig>> = {
  [SUPPORTED_NETWORKS.POLYGON]: {
    chainId: SUPPORTED_NETWORKS.POLYGON,
    entryPoint: CONTRACT_ADDRESSES[137].ENTRY_POINT,
    rpcUrl: 'https://polygon-rpc.com/',
  },
  [SUPPORTED_NETWORKS.POLYGON_MUMBAI]: {
    chainId: SUPPORTED_NETWORKS.POLYGON_MUMBAI,
    entryPoint: CONTRACT_ADDRESSES[80001].ENTRY_POINT,
    rpcUrl: 'https://rpc-mumbai.maticvigil.com/',
  },
  [SUPPORTED_NETWORKS.POLYGON_ZKEVM_TESTNET]: {
    chainId: SUPPORTED_NETWORKS.POLYGON_ZKEVM_TESTNET,
    entryPoint: CONTRACT_ADDRESSES[1442].ENTRY_POINT,
    rpcUrl: 'https://rpc.public.zkevm-test.net',
  },
  [SUPPORTED_NETWORKS.HARDHAT]: {
    chainId: SUPPORTED_NETWORKS.HARDHAT,
    entryPoint: CONTRACT_ADDRESSES[31337].ENTRY_POINT,
    rpcUrl: 'http://127.0.0.1:8545',
  },
};
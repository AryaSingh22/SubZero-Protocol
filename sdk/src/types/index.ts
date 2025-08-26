export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  amount: string;
  tokenAddress: string;
  interval: number;
  maxPayments: number;
  isActive: boolean;
  createdAt: number;
  creator: string;
}

export interface Subscription {
  id: string;
  planId: string;
  subscriber: string;
  startTime: number;
  nextPaymentTime: number;
  paymentCount: number;
  isActive: boolean;
  isPaused: boolean;
  totalPaid: string;
}

export interface SmartWalletConfig {
  entryPoint: string;
  factory: string;
  owner?: string;
  salt?: string;
}

export interface PaymasterConfig {
  address: string;
  url?: string;
  context?: string;
}

export interface UserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
}

export interface GaslessSubscriptionConfig {
  subscriptionManager: string;
  paymaster: string;
  smartWalletFactory: string;
  entryPoint: string;
  chainId: number;
  rpcUrl: string;
  bundlerUrl?: string;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

export interface BillingFrequency {
  interval: number;
  name: string;
  description: string;
}

export interface SubscriptionEvent {
  eventType: 'SubscriptionCreated' | 'SubscriptionActivated' | 'SubscriptionPaused' | 'SubscriptionCancelled' | 'PaymentProcessed';
  subscriptionId: string;
  planId: string;
  subscriber: string;
  timestamp: number;
  transactionHash: string;
  blockNumber: number;
  data: any;
}

export interface AnalyticsData {
  totalSubscribers: number;
  totalRevenue: string;
  activeSubscriptions: number;
  cancelledSubscriptions: number;
  pausedSubscriptions: number;
  averageSubscriptionDuration: number;
  churnRate: number;
  monthlyRecurringRevenue: string;
  subscriptionsByPlan: Record<string, number>;
  revenueByPlan: Record<string, string>;
}

export interface SDKConfig {
  provider: any; // ethers provider or viem client
  signer?: any; // ethers signer
  config: GaslessSubscriptionConfig;
  debug?: boolean;
}

export interface SubscribeOptions {
  planId: string;
  subscriber?: string;
  customAmount?: string;
  trialPeriod?: number;
  metadata?: Record<string, any>;
}

export interface UnsubscribeOptions {
  subscriptionId: string;
  immediate?: boolean;
}

export interface WalletConnectionStatus {
  isConnected: boolean;
  address?: string;
  chainId?: number;
  smartWalletAddress?: string;
  smartWalletDeployed: boolean;
}

export interface TransactionResult {
  hash: string;
  blockNumber?: number;
  gasUsed?: string;
  status: 'pending' | 'confirmed' | 'failed';
  userOperation?: UserOperation;
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  totalCost: string;
  sponsored: boolean;
}

// Error types
export class SDKError extends Error {
  code: string;
  details?: any;
  
  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.details = details;
  }
}

export class WalletError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, 'WALLET_ERROR', details);
  }
}

export class TransactionError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, 'TRANSACTION_ERROR', details);
  }
}

export class ContractError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, 'CONTRACT_ERROR', details);
  }
}

export class ValidationError extends SDKError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
  }
}
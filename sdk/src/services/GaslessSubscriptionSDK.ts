import { ethers } from 'ethers';
import type {
  SDKConfig,
  SubscribeOptions,
  UnsubscribeOptions,
  SubscriptionPlan,
  Subscription,
  WalletConnectionStatus,
  TransactionResult,
  AnalyticsData,
  GaslessSubscriptionConfig,
  UserOperation,
  SDKError,
  WalletError,
  TransactionError,
  ContractError,
} from '../types';
import {
  SUBSCRIPTION_MANAGER_ABI,
  SMART_WALLET_ABI,
  SMART_WALLET_FACTORY_ABI,
  PAYMASTER_ABI,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
} from '../contracts';
import {
  calculateSmartWalletAddress,
  signUserOperation,
  encodeFunctionData,
  getUserOperationHash,
  formatTokenAmount,
  parseTokenAmount,
  isValidAddress,
  getCurrentTimestamp,
  retry,
} from '../utils';

export class GaslessSubscriptionSDK {
  private provider: ethers.Provider;
  private signer?: ethers.Signer;
  private config: GaslessSubscriptionConfig;
  private debug: boolean;
  
  // Contract instances
  private subscriptionManager: ethers.Contract;
  private smartWalletFactory: ethers.Contract;
  private paymaster: ethers.Contract;
  
  // Connection state
  private walletAddress?: string;
  private smartWalletAddress?: string;
  private smartWallet?: ethers.Contract;

  constructor({ provider, signer, config, debug = false }: SDKConfig) {
    this.provider = provider;
    this.signer = signer;
    this.config = config;
    this.debug = debug;
    
    // Initialize contract instances
    this.subscriptionManager = new ethers.Contract(
      config.subscriptionManager,
      SUBSCRIPTION_MANAGER_ABI,
      provider
    );
    
    this.smartWalletFactory = new ethers.Contract(
      config.smartWalletFactory,
      SMART_WALLET_FACTORY_ABI,
      provider
    );
    
    this.paymaster = new ethers.Contract(
      config.paymaster,
      PAYMASTER_ABI,
      provider
    );
    
    this.log('SDK initialized with config:', config);
  }

  /**
   * Connect a wallet and set up smart wallet
   * @param signer Ethers signer
   * @returns Connection status
   */
  async connect(signer: ethers.Signer): Promise<WalletConnectionStatus> {
    try {
      this.signer = signer;
      this.walletAddress = await signer.getAddress();
      
      // Calculate smart wallet address
      this.smartWalletAddress = calculateSmartWalletAddress(
        this.config.smartWalletFactory,
        this.walletAddress
      );
      
      // Check if smart wallet is deployed
      const code = await this.provider.getCode(this.smartWalletAddress);
      const smartWalletDeployed = code !== '0x';
      
      if (smartWalletDeployed) {
        this.smartWallet = new ethers.Contract(
          this.smartWalletAddress,
          SMART_WALLET_ABI,
          this.provider
        );
      }
      
      const status: WalletConnectionStatus = {
        isConnected: true,
        address: this.walletAddress,
        chainId: (await this.provider.getNetwork()).chainId,
        smartWalletAddress: this.smartWalletAddress,
        smartWalletDeployed,
      };
      
      this.log('Wallet connected:', status);
      return status;
    } catch (error) {
      throw new WalletError(`Failed to connect wallet: ${error}`);
    }
  }

  /**
   * Subscribe to a plan with gasless transaction
   * @param options Subscribe options
   * @returns Transaction result
   */
  async subscribe(options: SubscribeOptions): Promise<TransactionResult> {
    this.ensureConnected();
    
    try {
      const { planId, subscriber, customAmount, trialPeriod, metadata } = options;
      
      // Get plan details
      const plan = await this.getPlan(planId);
      if (!plan) {
        throw new ContractError(`Plan ${planId} not found`);
      }
      
      const subscriberAddress = subscriber || this.walletAddress!;
      
      // Deploy smart wallet if needed
      if (!this.smartWallet) {
        await this.deploySmartWallet();
      }
      
      // Check token allowance and balance
      await this.ensureTokenAllowance(plan.tokenAddress, plan.amount);
      
      // Create subscription transaction
      const callData = encodeFunctionData(
        'subscribe',
        [planId, subscriberAddress],
        SUBSCRIPTION_MANAGER_ABI
      );
      
      // Create user operation
      const userOp = await this.createUserOperation(
        this.config.subscriptionManager,
        '0',
        callData
      );
      
      // Submit user operation
      const result = await this.submitUserOperation(userOp);
      
      this.log('Subscription created:', { planId, subscriber: subscriberAddress, txHash: result.hash });
      return result;
    } catch (error) {
      throw new TransactionError(`Failed to subscribe: ${error}`);
    }
  }

  /**
   * Unsubscribe from a subscription
   * @param options Unsubscribe options
   * @returns Transaction result
   */
  async unsubscribe(options: UnsubscribeOptions): Promise<TransactionResult> {
    this.ensureConnected();
    
    try {
      const { subscriptionId, immediate = false } = options;
      
      // Get subscription details
      const subscription = await this.getSubscription(subscriptionId);
      if (!subscription) {
        throw new ContractError(`Subscription ${subscriptionId} not found`);
      }
      
      // Verify ownership
      if (subscription.subscriber.toLowerCase() !== this.walletAddress!.toLowerCase()) {
        throw new TransactionError('Not authorized to unsubscribe');
      }
      
      // Create unsubscribe transaction
      const functionName = immediate ? 'unsubscribe' : 'pauseSubscription';
      const callData = encodeFunctionData(
        functionName,
        [subscriptionId],
        SUBSCRIPTION_MANAGER_ABI
      );
      
      // Create user operation
      const userOp = await this.createUserOperation(
        this.config.subscriptionManager,
        '0',
        callData
      );
      
      // Submit user operation
      const result = await this.submitUserOperation(userOp);
      
      this.log('Subscription cancelled:', { subscriptionId, immediate, txHash: result.hash });
      return result;
    } catch (error) {
      throw new TransactionError(`Failed to unsubscribe: ${error}`);
    }
  }

  /**
   * Get active subscriptions for a user
   * @param userAddress User address (defaults to connected wallet)
   * @returns Array of subscriptions
   */
  async getActiveSubscriptions(userAddress?: string): Promise<Subscription[]> {
    try {
      const address = userAddress || this.walletAddress;
      if (!address) {
        throw new WalletError('No wallet connected');
      }
      
      // Get subscription IDs from contract
      const subscriptionIds = await this.subscriptionManager.getUserSubscriptions(address);
      
      // Fetch subscription details
      const subscriptions = await Promise.all(
        subscriptionIds.map(async (id: bigint) => {
          const sub = await this.subscriptionManager.getSubscription(id);
          return this.formatSubscription(sub);
        })
      );
      
      // Filter only active subscriptions
      return subscriptions.filter(sub => sub.isActive && !sub.isPaused);
    } catch (error) {
      throw new ContractError(`Failed to get subscriptions: ${error}`);
    }
  }

  /**
   * Get subscription plan details
   * @param planId Plan ID
   * @returns Subscription plan
   */
  async getPlan(planId: string): Promise<SubscriptionPlan | null> {
    try {
      const plan = await this.subscriptionManager.getPlan(planId);
      
      if (!plan.isActive) {
        return null;
      }
      
      return this.formatPlan(plan);
    } catch (error) {
      this.log('Failed to get plan:', error);
      return null;
    }
  }

  /**
   * Get subscription details
   * @param subscriptionId Subscription ID
   * @returns Subscription details
   */
  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      const subscription = await this.subscriptionManager.getSubscription(subscriptionId);
      return this.formatSubscription(subscription);
    } catch (error) {
      this.log('Failed to get subscription:', error);
      return null;
    }
  }

  /**
   * Get analytics data for a plan creator
   * @param creatorAddress Creator address
   * @returns Analytics data
   */
  async getAnalytics(creatorAddress?: string): Promise<AnalyticsData> {
    try {
      const address = creatorAddress || this.walletAddress;
      if (!address) {
        throw new WalletError('No wallet connected');
      }
      
      // This is a simplified implementation
      // In production, you would query events or use The Graph
      return {\n        totalSubscribers: 0,\n        totalRevenue: '0',\n        activeSubscriptions: 0,\n        cancelledSubscriptions: 0,\n        pausedSubscriptions: 0,\n        averageSubscriptionDuration: 0,\n        churnRate: 0,\n        monthlyRecurringRevenue: '0',\n        subscriptionsByPlan: {},\n        revenueByPlan: {},\n      };\n    } catch (error) {\n      throw new ContractError(`Failed to get analytics: ${error}`);\n    }\n  }\n\n  /**\n   * Deploy smart wallet for the connected user\n   * @returns Transaction result\n   */\n  async deploySmartWallet(): Promise<TransactionResult> {\n    this.ensureConnected();\n    \n    try {\n      if (this.smartWallet) {\n        throw new TransactionError('Smart wallet already deployed');\n      }\n      \n      // Create smart wallet\n      const tx = await this.smartWalletFactory.connect(this.signer!).createAccount(\n        this.walletAddress!,\n        0 // salt\n      );\n      \n      const receipt = await tx.wait();\n      \n      // Initialize smart wallet contract instance\n      this.smartWallet = new ethers.Contract(\n        this.smartWalletAddress!,\n        SMART_WALLET_ABI,\n        this.provider\n      );\n      \n      this.log('Smart wallet deployed:', { address: this.smartWalletAddress, txHash: receipt.hash });\n      \n      return {\n        hash: receipt.hash,\n        blockNumber: receipt.blockNumber,\n        gasUsed: receipt.gasUsed?.toString(),\n        status: 'confirmed',\n      };\n    } catch (error) {\n      throw new TransactionError(`Failed to deploy smart wallet: ${error}`);\n    }\n  }\n\n  /**\n   * Create a user operation for gasless execution\n   * @param target Target contract address\n   * @param value ETH value to send\n   * @param data Call data\n   * @returns User operation\n   */\n  private async createUserOperation(\n    target: string,\n    value: string,\n    data: string\n  ): Promise<UserOperation> {\n    this.ensureConnected();\n    \n    if (!this.smartWallet) {\n      throw new TransactionError('Smart wallet not deployed');\n    }\n    \n    try {\n      // Get nonce\n      const nonce = await this.smartWallet.getNonce();\n      \n      // Encode execute call\n      const executeCallData = encodeFunctionData(\n        'execute',\n        [target, value, data],\n        SMART_WALLET_ABI\n      );\n      \n      // Get gas estimates\n      const { gasPrice } = await this.provider.getFeeData();\n      const maxFeePerGas = gasPrice?.toString() || '20000000000';\n      const maxPriorityFeePerGas = '1000000000'; // 1 gwei\n      \n      // Create user operation\n      const userOp: Omit<UserOperation, 'signature'> = {\n        sender: this.smartWalletAddress!,\n        nonce: nonce.toString(),\n        initCode: '0x',\n        callData: executeCallData,\n        callGasLimit: '500000',\n        verificationGasLimit: '500000',\n        preVerificationGas: '21000',\n        maxFeePerGas,\n        maxPriorityFeePerGas,\n        paymasterAndData: this.config.paymaster,\n      };\n      \n      // Sign user operation\n      const signature = await signUserOperation(\n        userOp,\n        this.signer!,\n        this.config.chainId,\n        this.smartWalletAddress!\n      );\n      \n      return {\n        ...userOp,\n        signature,\n      };\n    } catch (error) {\n      throw new TransactionError(`Failed to create user operation: ${error}`);\n    }\n  }\n\n  /**\n   * Submit user operation to bundler\n   * @param userOp User operation\n   * @returns Transaction result\n   */\n  private async submitUserOperation(userOp: UserOperation): Promise<TransactionResult> {\n    try {\n      // In production, this would submit to a bundler service\n      // For now, we'll simulate by directly calling the EntryPoint\n      \n      // Calculate user operation hash\n      const userOpHash = getUserOperationHash(\n        userOp,\n        this.config.entryPoint,\n        this.config.chainId\n      );\n      \n      this.log('Submitting user operation:', { userOpHash, userOp });\n      \n      // Return simulated result\n      return {\n        hash: userOpHash,\n        status: 'pending',\n        userOperation: userOp,\n      };\n    } catch (error) {\n      throw new TransactionError(`Failed to submit user operation: ${error}`);\n    }\n  }\n\n  /**\n   * Ensure token allowance for subscription payments\n   * @param tokenAddress Token contract address\n   * @param amount Required amount\n   */\n  private async ensureTokenAllowance(tokenAddress: string, amount: string): Promise<void> {\n    try {\n      const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);\n      \n      // Check current allowance\n      const allowance = await token.allowance(\n        this.smartWalletAddress!,\n        this.config.subscriptionManager\n      );\n      \n      // Check balance\n      const balance = await token.balanceOf(this.smartWalletAddress!);\n      \n      if (BigInt(balance.toString()) < BigInt(amount)) {\n        throw new TransactionError('Insufficient token balance');\n      }\n      \n      if (BigInt(allowance.toString()) < BigInt(amount)) {\n        // Need to approve more tokens\n        const approveCallData = encodeFunctionData(\n          'approve',\n          [this.config.subscriptionManager, amount],\n          ERC20_ABI\n        );\n        \n        const userOp = await this.createUserOperation(\n          tokenAddress,\n          '0',\n          approveCallData\n        );\n        \n        await this.submitUserOperation(userOp);\n        this.log('Token approval submitted');\n      }\n    } catch (error) {\n      throw new TransactionError(`Failed to ensure token allowance: ${error}`);\n    }\n  }\n\n  /**\n   * Format plan data from contract\n   * @param planData Raw plan data from contract\n   * @returns Formatted plan\n   */\n  private formatPlan(planData: any): SubscriptionPlan {\n    return {\n      id: planData.id.toString(),\n      name: planData.name,\n      description: planData.description,\n      amount: planData.amount.toString(),\n      tokenAddress: planData.tokenAddress,\n      interval: Number(planData.interval),\n      maxPayments: Number(planData.maxPayments),\n      isActive: planData.isActive,\n      createdAt: Number(planData.createdAt),\n      creator: planData.creator,\n    };\n  }\n\n  /**\n   * Format subscription data from contract\n   * @param subscriptionData Raw subscription data from contract\n   * @returns Formatted subscription\n   */\n  private formatSubscription(subscriptionData: any): Subscription {\n    return {\n      id: subscriptionData.id.toString(),\n      planId: subscriptionData.planId.toString(),\n      subscriber: subscriptionData.subscriber,\n      startTime: Number(subscriptionData.startTime),\n      nextPaymentTime: Number(subscriptionData.nextPaymentTime),\n      paymentCount: Number(subscriptionData.paymentCount),\n      isActive: subscriptionData.isActive,\n      isPaused: subscriptionData.isPaused,\n      totalPaid: subscriptionData.totalPaid.toString(),\n    };\n  }\n\n  /**\n   * Ensure wallet is connected\n   */\n  private ensureConnected(): void {\n    if (!this.signer || !this.walletAddress) {\n      throw new WalletError('Wallet not connected');\n    }\n  }\n\n  /**\n   * Log debug messages\n   * @param message Message to log\n   * @param data Additional data\n   */\n  private log(message: string, data?: any): void {\n    if (this.debug) {\n      console.log(`[GaslessSubscriptionSDK] ${message}`, data || '');\n    }\n  }\n\n  // Getters\n  get isConnected(): boolean {\n    return !!this.walletAddress;\n  }\n\n  get connectedAddress(): string | undefined {\n    return this.walletAddress;\n  }\n\n  get smartWalletAddr(): string | undefined {\n    return this.smartWalletAddress;\n  }\n\n  get isSmartWalletDeployed(): boolean {\n    return !!this.smartWallet;\n  }\n}
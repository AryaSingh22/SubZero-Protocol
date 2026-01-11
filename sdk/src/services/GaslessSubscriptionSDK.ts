import { ethers } from 'ethers';
import {
  PAYMASTER_ABI,
  ERC20_ABI,
  SUBSCRIPTION_MANAGER_ABI,
  SMART_WALLET_FACTORY_ABI,
  SMART_WALLET_ABI,
} from '../contracts';
import type {
  SDKConfig,
  SubscribeOptions,
  UnsubscribeOptions,
  SubscriptionPlan,
  Subscription,
  GaslessSubscriptionConfig,
  WalletConnectionStatus,
  TransactionResult,
  UserOperation,
  AnalyticsData,
} from '../types';
import {
  WalletError,
  ContractError,
  TransactionError,
} from '../types';
import {
  calculateSmartWalletAddress,
  signUserOperation,
  encodeFunctionData,
  getUserOperationHash,
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

      if (!this.smartWalletAddress) {
        throw new WalletError('Failed to calculate smart wallet address');
      }

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
        chainId: Number((await this.provider.getNetwork()).chainId),
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
      const { planId, subscriber } = options;

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
        subscriptionIds.map(async (id: any) => {
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
      return {
        totalSubscribers: 0,
        totalRevenue: '0',
        activeSubscriptions: 0,
        cancelledSubscriptions: 0,
        pausedSubscriptions: 0,
        averageSubscriptionDuration: 0,
        churnRate: 0,
        monthlyRecurringRevenue: '0',
        subscriptionsByPlan: {},
        revenueByPlan: {},
      };
    } catch (error) {
      throw new ContractError(`Failed to get analytics: ${error}`);
    }
  }

  /**
   * Deploy smart wallet for the connected user
   * @returns Transaction result
   */
  async deploySmartWallet(): Promise<TransactionResult> {
    this.ensureConnected();

    try {
      if (this.smartWallet) {
        throw new TransactionError('Smart wallet already deployed');
      }

      // Create smart wallet
      const tx = await (this.smartWalletFactory as any).connect(this.signer!).createAccount(
        this.walletAddress!,
        0 // salt
      );

      const receipt = await tx.wait();

      // Initialize smart wallet contract instance
      this.smartWallet = new ethers.Contract(
        this.smartWalletAddress!,
        SMART_WALLET_ABI,
        this.provider
      );

      this.log('Smart wallet deployed:', { address: this.smartWalletAddress, txHash: receipt.hash });

      return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString(),
        status: 'confirmed',
      };
    } catch (error) {
      throw new TransactionError(`Failed to deploy smart wallet: ${error}`);
    }
  }

  /**
   * Create a user operation for gasless execution
   * @param target Target contract address
   * @param value ETH value to send
   * @param data Call data
   * @returns User operation
   */
  private async createUserOperation(
    target: string,
    value: string,
    data: string
  ): Promise<UserOperation> {
    this.ensureConnected();

    if (!this.smartWallet) {
      throw new TransactionError('Smart wallet not deployed');
    }

    try {
      // Get nonce
      const nonce = await this.smartWallet.getNonce();

      // Encode execute call
      const executeCallData = encodeFunctionData(
        'execute',
        [target, value, data],
        SMART_WALLET_ABI
      );

      // Get gas estimates
      const { gasPrice } = await this.provider.getFeeData();
      const maxFeePerGas = gasPrice?.toString() || '20000000000';
      const maxPriorityFeePerGas = '1000000000'; // 1 gwei

      // Create user operation
      const userOp: Omit<UserOperation, 'signature'> = {
        sender: this.smartWalletAddress!,
        nonce: nonce.toString(),
        initCode: '0x',
        callData: executeCallData,
        callGasLimit: '500000',
        verificationGasLimit: '500000',
        preVerificationGas: '21000',
        maxFeePerGas,
        maxPriorityFeePerGas,
        paymasterAndData: this.config.paymaster,
      };

      // Sign user operation
      const signature = await signUserOperation(
        userOp,
        this.signer!,
        this.config.chainId,
        this.smartWalletAddress!
      );

      return {
        ...userOp,
        signature,
      };
    } catch (error) {
      throw new TransactionError(`Failed to create user operation: ${error}`);
    }
  }

  /**
   * Submit user operation to bundler
   * @param userOp User operation
   * @returns Transaction result
   */
  private async submitUserOperation(userOp: UserOperation): Promise<TransactionResult> {
    try {
      // In production, this would submit to a bundler service
      // For now, we'll simulate by directly calling the EntryPoint

      // Calculate user operation hash
      const userOpHash = getUserOperationHash(
        userOp,
        this.config.entryPoint,
        this.config.chainId
      );

      this.log('Submitting user operation:', { userOpHash, userOp });

      // Return simulated result
      return {
        hash: userOpHash,
        status: 'pending',
        userOperation: userOp,
      };
    } catch (error) {
      throw new TransactionError(`Failed to submit user operation: ${error}`);
    }
  }

  /**
   * Ensure token allowance for subscription payments
   * @param tokenAddress Token contract address
   * @param amount Required amount
   */
  private async ensureTokenAllowance(tokenAddress: string, amount: string): Promise<void> {
    try {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

      // Check current allowance
      const allowance = await token.allowance(
        this.smartWalletAddress!,
        this.config.subscriptionManager
      );

      // Check balance
      const balance = await token.balanceOf(this.smartWalletAddress!);

      if (BigInt(balance.toString()) < BigInt(amount)) {
        throw new TransactionError('Insufficient token balance');
      }

      if (BigInt(allowance.toString()) < BigInt(amount)) {
        // Need to approve more tokens
        const approveCallData = encodeFunctionData(
          'approve',
          [this.config.subscriptionManager, amount],
          ERC20_ABI
        );

        const userOp = await this.createUserOperation(
          tokenAddress,
          '0',
          approveCallData
        );

        await this.submitUserOperation(userOp);
        this.log('Token approval submitted');
      }
    } catch (error) {
      throw new TransactionError(`Failed to ensure token allowance: ${error}`);
    }
  }

  /**
   * Format plan data from contract
   * @param planData Raw plan data from contract
   * @returns Formatted plan
   */
  private formatPlan(planData: any): SubscriptionPlan {
    return {
      id: planData.id.toString(),
      name: planData.name,
      description: planData.description,
      amount: planData.amount.toString(),
      tokenAddress: planData.tokenAddress,
      interval: Number(planData.interval),
      maxPayments: Number(planData.maxPayments),
      isActive: planData.isActive,
      createdAt: Number(planData.createdAt),
      creator: planData.creator,
    };
  }

  /**
   * Format subscription data from contract
   * @param subscriptionData Raw subscription data from contract
   * @returns Formatted subscription
   */
  private formatSubscription(subscriptionData: any): Subscription {
    return {
      id: subscriptionData.id.toString(),
      planId: subscriptionData.planId.toString(),
      subscriber: subscriptionData.subscriber,
      startTime: Number(subscriptionData.startTime),
      nextPaymentTime: Number(subscriptionData.nextPaymentTime),
      paymentCount: Number(subscriptionData.paymentCount),
      isActive: subscriptionData.isActive,
      isPaused: subscriptionData.isPaused,
      totalPaid: subscriptionData.totalPaid.toString(),
    };
  }

  /**
   * Ensure wallet is connected
   */
  private ensureConnected(): void {
    if (!this.signer || !this.walletAddress) {
      throw new WalletError('Wallet not connected');
    }
  }

  /**
   * Log debug messages
   * @param message Message to log
   * @param data Additional data
   */
  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[GaslessSubscriptionSDK] ${message}`, data || '');
    }
  }

  // Getters
  get isConnected(): boolean {
    return !!this.walletAddress;
  }

  get connectedAddress(): string | undefined {
    return this.walletAddress;
  }

  get smartWalletAddr(): string | undefined {
    return this.smartWalletAddress;
  }

  get isSmartWalletDeployed(): boolean {
    return !!this.smartWallet;
  }
}
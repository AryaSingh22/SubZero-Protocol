import { ethers } from 'ethers';
import type { UserOperation, GasEstimate } from '../types';

// EIP-712 Domain for SmartWallet operations
export const EIP712_DOMAIN = {
  name: 'SmartWallet',
  version: '1.0.0',
  chainId: 0, // Will be set dynamically
  verifyingContract: '', // Will be set dynamically
};

// EIP-712 Types for SmartWallet operations
export const EIP712_TYPES = {
  UserOperation: [
    { name: 'sender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'initCode', type: 'bytes' },
    { name: 'callData', type: 'bytes' },
    { name: 'callGasLimit', type: 'uint256' },
    { name: 'verificationGasLimit', type: 'uint256' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'maxFeePerGas', type: 'uint256' },
    { name: 'maxPriorityFeePerGas', type: 'uint256' },
    { name: 'paymasterAndData', type: 'bytes' },
  ],
  Execute: [
    { name: 'dest', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'func', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
  ],
  Subscribe: [
    { name: 'planId', type: 'uint256' },
    { name: 'subscriber', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
};

/**
 * Calculate the deterministic address of a SmartWallet
 * @param factory Factory contract address
 * @param owner Owner address
 * @param salt Salt for deterministic deployment
 * @returns Computed SmartWallet address
 */
export function calculateSmartWalletAddress(
  factory: string,
  owner: string,
  salt: string | number = 0
): string {
  // This is a simplified version - actual implementation would match the factory's CREATE2 logic
  const saltBytes = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
  
  // CREATE2 address calculation: keccak256(0xff + factory + salt + keccak256(initCode))
  // For now, we'll return a placeholder - this should be implemented based on your factory contract
  return ethers.getCreate2Address(
    factory,
    saltBytes,
    ethers.keccak256('0x') // Placeholder - should be actual initCode hash
  );
}

/**
 * Sign a UserOperation using EIP-712
 * @param userOp UserOperation to sign
 * @param signer Ethers signer
 * @param chainId Network chain ID
 * @param verifyingContract SmartWallet address
 * @returns Signature
 */
export async function signUserOperation(
  userOp: Omit<UserOperation, 'signature'>,
  signer: ethers.Signer,
  chainId: number,
  verifyingContract: string
): Promise<string> {
  const domain = {
    ...EIP712_DOMAIN,
    chainId,
    verifyingContract,
  };

  const types = {
    UserOperation: EIP712_TYPES.UserOperation,
  };

  const message = {
    sender: userOp.sender,
    nonce: userOp.nonce,
    initCode: userOp.initCode,
    callData: userOp.callData,
    callGasLimit: userOp.callGasLimit,
    verificationGasLimit: userOp.verificationGasLimit,
    preVerificationGas: userOp.preVerificationGas,
    maxFeePerGas: userOp.maxFeePerGas,
    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
    paymasterAndData: userOp.paymasterAndData,
  };

  return await signer.signTypedData(domain, types, message);
}

/**
 * Sign a subscription operation using EIP-712
 * @param planId Plan ID to subscribe to
 * @param subscriber Subscriber address
 * @param nonce Current nonce
 * @param signer Ethers signer
 * @param chainId Network chain ID
 * @param verifyingContract SmartWallet address
 * @returns Signature
 */
export async function signSubscribeOperation(
  planId: string,
  subscriber: string,
  nonce: string,
  signer: ethers.Signer,
  chainId: number,
  verifyingContract: string
): Promise<string> {
  const domain = {
    ...EIP712_DOMAIN,
    chainId,
    verifyingContract,
  };

  const types = {
    Subscribe: EIP712_TYPES.Subscribe,
  };

  const message = {
    planId,
    subscriber,
    nonce,
  };

  return await signer.signTypedData(domain, types, message);
}

/**
 * Encode function call data
 * @param functionName Function name
 * @param functionArgs Function arguments
 * @param abi Contract ABI
 * @returns Encoded call data
 */
export function encodeFunctionData(
  functionName: string,
  functionArgs: any[],
  abi: any[]
): string {
  const iface = new ethers.Interface(abi);
  return iface.encodeFunctionData(functionName, functionArgs);
}

/**
 * Calculate UserOperation hash
 * @param userOp UserOperation
 * @param entryPoint EntryPoint address
 * @param chainId Network chain ID
 * @returns UserOperation hash
 */
export function getUserOperationHash(
  userOp: UserOperation,
  entryPoint: string,
  chainId: number
): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'address', 'uint256', 'bytes32', 'bytes32',
      'uint256', 'uint256', 'uint256', 'uint256',
      'uint256', 'bytes32'
    ],
    [
      userOp.sender,
      userOp.nonce,
      ethers.keccak256(userOp.initCode),
      ethers.keccak256(userOp.callData),
      userOp.callGasLimit,
      userOp.verificationGasLimit,
      userOp.preVerificationGas,
      userOp.maxFeePerGas,
      userOp.maxPriorityFeePerGas,
      ethers.keccak256(userOp.paymasterAndData),
    ]
  );

  const userOpHash = ethers.keccak256(encoded);
  
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'uint256'],
      [userOpHash, entryPoint, chainId]
    )
  );
}

/**
 * Format token amount for display
 * @param amount Amount in wei
 * @param decimals Token decimals
 * @param precision Display precision
 * @returns Formatted amount string
 */
export function formatTokenAmount(
  amount: string,
  decimals = 18,
  precision = 4
): string {
  const formatted = ethers.formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  
  if (num === 0) return '0';
  if (num < 0.0001) return '< 0.0001';
  
  return num.toFixed(precision).replace(/\.?0+$/, '');
}

/**
 * Parse token amount from string
 * @param amount Amount string
 * @param decimals Token decimals
 * @returns Amount in wei
 */
export function parseTokenAmount(amount: string, decimals = 18): string {
  return ethers.parseUnits(amount, decimals).toString();
}

/**
 * Validate Ethereum address
 * @param address Address to validate
 * @returns Whether address is valid
 */
export function isValidAddress(address: string): boolean {
  try {
    ethers.getAddress(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current timestamp in seconds
 * @returns Current timestamp
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Calculate next payment time based on interval
 * @param startTime Start timestamp
 * @param interval Interval in seconds
 * @param paymentCount Current payment count
 * @returns Next payment timestamp
 */
export function calculateNextPaymentTime(
  startTime: number,
  interval: number,
  paymentCount: number
): number {
  return startTime + (interval * (paymentCount + 1));
}

/**
 * Check if subscription payment is due
 * @param nextPaymentTime Next payment timestamp
 * @param gracePeriod Grace period in seconds (default: 1 hour)
 * @returns Whether payment is due
 */
export function isPaymentDue(
  nextPaymentTime: number,
  gracePeriod = 3600
): boolean {
  const now = getCurrentTimestamp();
  return now >= (nextPaymentTime - gracePeriod);
}

/**
 * Estimate gas for UserOperation
 * @param userOp UserOperation
 * @param provider Ethers provider
 * @returns Gas estimate
 */
export async function estimateUserOperationGas(
  userOp: Partial<UserOperation>,
  provider: ethers.Provider
): Promise<GasEstimate> {
  try {
    // This is a simplified estimation - actual implementation would use bundler APIs
    const gasLimit = '500000'; // Default gas limit
    const { gasPrice } = await provider.getFeeData();
    const gasPriceStr = gasPrice?.toString() || '20000000000'; // 20 gwei default
    
    const totalCost = (BigInt(gasLimit) * BigInt(gasPriceStr)).toString();
    
    return {
      gasLimit,
      gasPrice: gasPriceStr,
      totalCost,
      sponsored: true, // Assume sponsored by paymaster
    };
  } catch (error) {
    throw new Error(`Gas estimation failed: ${error}`);
  }
}

/**
 * Generate random salt for deterministic deployment
 * @returns Random salt as hex string
 */
export function generateSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Sleep for specified milliseconds
 * @param ms Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum retry attempts
 * @param baseDelay Base delay in milliseconds
 * @returns Function result
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i === maxRetries) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, i);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}

/**
 * Validate subscription plan parameters
 * @param plan Plan parameters
 * @returns Validation result
 */
export function validatePlanParameters(plan: {
  name: string;
  amount: string;
  interval: number;
  tokenAddress: string;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!plan.name || plan.name.trim().length === 0) {
    errors.push('Plan name is required');
  }
  
  if (!plan.amount || plan.amount === '0') {
    errors.push('Plan amount must be greater than 0');
  }
  
  if (!plan.interval || plan.interval <= 0) {
    errors.push('Plan interval must be greater than 0');
  }
  
  if (!isValidAddress(plan.tokenAddress)) {
    errors.push('Invalid token address');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
/**
 * EIP-712 Utilities for Gasless Subscription Payments
 * Provides functions for signing meta-transactions and managing gasless subscriptions
 */

const { ethers } = require('ethers');

class EIP712Utils {
    constructor(contractAddress, chainId) {
        this.contractAddress = contractAddress;
        this.chainId = chainId;
        
        // Domain separator for SmartWallet
        this.domain = {
            name: 'SmartWallet',
            version: '1',
            chainId: this.chainId,
            verifyingContract: this.contractAddress
        };
    }

    /**
     * Get the typed data for subscription approval
     * @param {string} token - Token contract address
     * @param {string} spender - Spender address (SubscriptionManager)
     * @param {string} amount - Amount to approve (in wei)
     * @param {number} nonce - Nonce for replay protection
     * @param {number} deadline - Signature deadline timestamp
     * @returns {Object} Typed data object for EIP-712 signing
     */
    getSubscriptionApprovalTypedData(token, spender, amount, nonce, deadline) {
        return {
            domain: this.domain,
            types: {
                EIP712Domain: [
                    { name: 'name', type: 'string' },
                    { name: 'version', type: 'string' },
                    { name: 'chainId', type: 'uint256' },
                    { name: 'verifyingContract', type: 'address' }
                ],
                SubscriptionApproval: [
                    { name: 'token', type: 'address' },
                    { name: 'spender', type: 'address' },
                    { name: 'amount', type: 'uint256' },
                    { name: 'nonce', type: 'uint256' },
                    { name: 'deadline', type: 'uint256' }
                ]
            },
            primaryType: 'SubscriptionApproval',
            message: {
                token,
                spender,
                amount,
                nonce,
                deadline
            }
        };
    }

    /**
     * Sign subscription approval using EIP-712
     * @param {ethers.Wallet} signer - Signer wallet
     * @param {string} token - Token contract address
     * @param {string} spender - Spender address
     * @param {string} amount - Amount to approve
     * @param {number} nonce - Nonce for replay protection
     * @param {number} deadline - Signature deadline
     * @returns {string} Signature
     */
    async signSubscriptionApproval(signer, token, spender, amount, nonce, deadline) {
        const typedData = this.getSubscriptionApprovalTypedData(token, spender, amount, nonce, deadline);
        return await signer.signTypedData(typedData.domain, typedData.types, typedData.message);
    }

    /**
     * Create UserOperation for ERC-4337
     * @param {string} sender - SmartWallet address
     * @param {number} nonce - Account nonce
     * @param {string} callData - Encoded call data
     * @param {Object} gasSettings - Gas settings
     * @param {string} paymasterAddress - Paymaster address
     * @returns {Object} UserOperation object
     */
    createUserOperation(sender, nonce, callData, gasSettings, paymasterAddress) {
        const {
            callGasLimit = 300000,
            verificationGasLimit = 150000,
            preVerificationGas = 50000,
            maxFeePerGas = ethers.parseUnits('20', 'gwei'),
            maxPriorityFeePerGas = ethers.parseUnits('2', 'gwei')
        } = gasSettings;

        return {
            sender,
            nonce: ethers.toBeHex(nonce),
            initCode: '0x', // Account already deployed
            callData,
            callGasLimit: ethers.toBeHex(callGasLimit),
            verificationGasLimit: ethers.toBeHex(verificationGasLimit),
            preVerificationGas: ethers.toBeHex(preVerificationGas),
            maxFeePerGas: ethers.toBeHex(maxFeePerGas),
            maxPriorityFeePerGas: ethers.toBeHex(maxPriorityFeePerGas),
            paymasterAndData: paymasterAddress + '0'.repeat(64), // Paymaster address + 32 bytes of data
            signature: '0x' // Will be filled after signing
        };
    }

    /**
     * Sign UserOperation for ERC-4337
     * @param {ethers.Wallet} signer - Signer wallet
     * @param {Object} userOp - UserOperation object
     * @param {string} entryPointAddress - EntryPoint contract address
     * @returns {string} Signature
     */
    async signUserOperation(signer, userOp, entryPointAddress) {
        // Create the hash that will be signed
        const userOpHash = this.getUserOperationHash(userOp, entryPointAddress);
        
        // Sign the hash
        const signature = await signer.signMessage(ethers.getBytes(userOpHash));
        return signature;
    }

    /**
     * Get UserOperation hash for signing
     * @param {Object} userOp - UserOperation object
     * @param {string} entryPointAddress - EntryPoint contract address
     * @returns {string} Hash to be signed
     */
    getUserOperationHash(userOp, entryPointAddress) {
        const packedUserOp = ethers.AbiCoder.defaultAbiCoder().encode(
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
                ethers.keccak256(userOp.paymasterAndData)
            ]
        );

        const userOpHash = ethers.keccak256(packedUserOp);
        
        return ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'address', 'uint256'],
                [userOpHash, entryPointAddress, this.chainId]
            )
        );
    }

    /**
     * Encode call data for SmartWallet.execute()
     * @param {string} target - Target contract address
     * @param {string} value - ETH value to send
     * @param {string} data - Call data
     * @returns {string} Encoded call data
     */
    encodeExecuteCallData(target, value, data) {
        const executeInterface = new ethers.Interface([
            'function execute(address dest, uint256 value, bytes calldata data)'
        ]);
        
        return executeInterface.encodeFunctionData('execute', [target, value, data]);
    }

    /**
     * Encode call data for SubscriptionManager.subscribe()
     * @param {number} planId - Subscription plan ID
     * @param {string} smartWallet - SmartWallet address
     * @param {string} owner - Owner address
     * @param {boolean} autoRenew - Auto-renew flag
     * @returns {string} Encoded call data
     */
    encodeSubscribeCallData(planId, smartWallet, owner, autoRenew) {
        const subscriptionInterface = new ethers.Interface([
            'function subscribe(uint256 planId, address smartWallet, address owner, bool autoRenew) returns (uint256)'
        ]);
        
        return subscriptionInterface.encodeFunctionData('subscribe', [planId, smartWallet, owner, autoRenew]);
    }

    /**
     * Encode call data for SubscriptionManager.chargeSubscriber()
     * @param {number} subscriptionId - Subscription ID
     * @returns {string} Encoded call data
     */
    encodeChargeSubscriberCallData(subscriptionId) {
        const subscriptionInterface = new ethers.Interface([
            'function chargeSubscriber(uint256 subscriptionId)'
        ]);
        
        return subscriptionInterface.encodeFunctionData('chargeSubscriber', [subscriptionId]);
    }

    /**
     * Encode call data for SmartWallet.approveSubscription()
     * @param {string} token - Token address
     * @param {string} spender - Spender address
     * @param {string} amount - Amount to approve
     * @param {number} nonce - Nonce
     * @param {number} deadline - Deadline
     * @param {string} signature - Signature
     * @returns {string} Encoded call data
     */
    encodeApproveSubscriptionCallData(token, spender, amount, nonce, deadline, signature) {
        const walletInterface = new ethers.Interface([
            'function approveSubscription(address token, address spender, uint256 amount, uint256 nonce, uint256 deadline, bytes calldata signature)'
        ]);
        
        return walletInterface.encodeFunctionData('approveSubscription', [
            token, spender, amount, nonce, deadline, signature
        ]);
    }
}

/**
 * Gasless Transaction Helper
 * Provides high-level functions for common gasless subscription operations
 */
class GaslessSubscriptionHelper {
    constructor(provider, entryPointAddress, paymasterAddress) {
        this.provider = provider;
        this.entryPointAddress = entryPointAddress;
        this.paymasterAddress = paymasterAddress;
    }

    /**
     * Create and sign a gasless subscription approval
     * @param {ethers.Wallet} userWallet - User's wallet
     * @param {string} smartWalletAddress - SmartWallet contract address
     * @param {string} subscriptionManagerAddress - SubscriptionManager address
     * @param {string} tokenAddress - Token address
     * @param {string} amount - Amount to approve
     * @param {number} deadline - Signature deadline
     * @returns {Object} Signed UserOperation
     */
    async createGaslessApproval(userWallet, smartWalletAddress, subscriptionManagerAddress, tokenAddress, amount, deadline) {
        const eip712Utils = new EIP712Utils(smartWalletAddress, await this.provider.getNetwork().then(n => n.chainId));
        
        // Get current nonce for subscription approval
        const smartWallet = new ethers.Contract(smartWalletAddress, [
            'function getSubscriptionNonce(address token, address spender) view returns (uint256)',
            'function getNonce(uint192 key) view returns (uint256)'
        ], this.provider);
        
        const subscriptionNonce = await smartWallet.getSubscriptionNonce(tokenAddress, subscriptionManagerAddress);
        const accountNonce = await smartWallet.getNonce(0);
        
        // Sign the subscription approval
        const approvalSignature = await eip712Utils.signSubscriptionApproval(
            userWallet,
            tokenAddress,
            subscriptionManagerAddress,
            amount,
            subscriptionNonce,
            deadline
        );
        
        // Encode the approval call data
        const approvalCallData = eip712Utils.encodeApproveSubscriptionCallData(
            tokenAddress,
            subscriptionManagerAddress,
            amount,
            subscriptionNonce,
            deadline,
            approvalSignature
        );
        
        // Create UserOperation
        const userOp = eip712Utils.createUserOperation(
            smartWalletAddress,
            accountNonce,
            approvalCallData,
            {
                callGasLimit: 200000,
                verificationGasLimit: 150000,
                preVerificationGas: 50000
            },
            this.paymasterAddress
        );
        
        // Sign the UserOperation
        userOp.signature = await eip712Utils.signUserOperation(userWallet, userOp, this.entryPointAddress);
        
        return userOp;
    }

    /**
     * Create a gasless subscription transaction
     * @param {ethers.Wallet} relayerWallet - Relayer's wallet
     * @param {string} subscriptionManagerAddress - SubscriptionManager address
     * @param {number} planId - Plan ID
     * @param {string} smartWalletAddress - SmartWallet address
     * @param {string} userAddress - User's address
     * @param {boolean} autoRenew - Auto-renew flag
     * @returns {Object} Signed UserOperation
     */
    async createGaslessSubscription(relayerWallet, subscriptionManagerAddress, planId, smartWalletAddress, userAddress, autoRenew) {
        const eip712Utils = new EIP712Utils(smartWalletAddress, await this.provider.getNetwork().then(n => n.chainId));
        
        // Get account nonce
        const smartWallet = new ethers.Contract(smartWalletAddress, [
            'function getNonce(uint192 key) view returns (uint256)'
        ], this.provider);
        
        const accountNonce = await smartWallet.getNonce(0);
        
        // Encode subscription call data
        const subscribeCallData = eip712Utils.encodeSubscribeCallData(planId, smartWalletAddress, userAddress, autoRenew);
        
        // Encode execute call data (calling SubscriptionManager from SmartWallet)
        const executeCallData = eip712Utils.encodeExecuteCallData(subscriptionManagerAddress, 0, subscribeCallData);
        
        // Create UserOperation
        const userOp = eip712Utils.createUserOperation(
            smartWalletAddress,
            accountNonce,
            executeCallData,
            {
                callGasLimit: 300000,
                verificationGasLimit: 150000,
                preVerificationGas: 50000
            },
            this.paymasterAddress
        );
        
        // Sign the UserOperation (relayer signs on behalf of user)
        userOp.signature = await eip712Utils.signUserOperation(relayerWallet, userOp, this.entryPointAddress);
        
        return userOp;
    }

    /**
     * Create a gasless charge transaction
     * @param {ethers.Wallet} relayerWallet - Relayer's wallet
     * @param {string} subscriptionManagerAddress - SubscriptionManager address
     * @param {number} subscriptionId - Subscription ID
     * @returns {Object} Transaction object
     */
    async createGaslessCharge(relayerWallet, subscriptionManagerAddress, subscriptionId) {
        // For charging, we can call the SubscriptionManager directly since it's a relayer operation
        const subscriptionManager = new ethers.Contract(subscriptionManagerAddress, [
            'function chargeSubscriber(uint256 subscriptionId)'
        ], relayerWallet);
        
        // The paymaster will sponsor this transaction
        return await subscriptionManager.chargeSubscriber(subscriptionId);
    }

    /**
     * Batch create gasless charges
     * @param {ethers.Wallet} relayerWallet - Relayer's wallet
     * @param {string} subscriptionManagerAddress - SubscriptionManager address
     * @param {number[]} subscriptionIds - Array of subscription IDs
     * @returns {Object} Transaction object
     */
    async createGaslessBatchCharge(relayerWallet, subscriptionManagerAddress, subscriptionIds) {
        const subscriptionManager = new ethers.Contract(subscriptionManagerAddress, [
            'function batchChargeSubscribers(uint256[] calldata subscriptionIds)'
        ], relayerWallet);
        
        return await subscriptionManager.batchChargeSubscribers(subscriptionIds);
    }
}

module.exports = {
    EIP712Utils,
    GaslessSubscriptionHelper
};
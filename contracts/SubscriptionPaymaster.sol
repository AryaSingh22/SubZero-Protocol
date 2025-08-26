// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

interface IEntryPoint {
    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }

    function balanceOf(address account) external view returns (uint256);
    function depositTo(address account) external payable;
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
}

interface ISubscriptionManager {
    function authorizedRelayers(address relayer) external view returns (bool);
}

/**
 * @title SubscriptionPaymaster
 * @dev ERC-4337 Paymaster that sponsors gas fees for subscription-related transactions
 * @notice This paymaster only sponsors transactions to whitelisted SubscriptionManager contracts
 */
contract SubscriptionPaymaster is Ownable, ReentrancyGuard, Pausable {
    
    // EntryPoint contract
    IEntryPoint public immutable entryPoint;
    
    // Whitelisted contracts that can use this paymaster
    mapping(address => bool) public whitelistedTargets;
    
    // Authorized relayers that can use this paymaster
    mapping(address => bool) public authorizedRelayers;
    
    // Gas cost tracking
    mapping(address => uint256) public gasUsedByTarget;
    mapping(address => uint256) public gasLimitPerTarget;
    
    // Paymaster configuration
    uint256 public maxGasPrice = 50 gwei; // Maximum gas price to sponsor
    uint256 public maxGasPerTransaction = 500000; // Maximum gas per transaction
    uint256 public totalGasLimit = 10000000; // Total gas limit per period
    uint256 public gasLimitPeriod = 1 days; // Reset period for gas limits
    uint256 public lastResetTime;
    uint256 public currentPeriodGasUsed;
    
    // Minimum balance threshold
    uint256 public minimumBalance = 0.1 ether;
    
    // Events
    event TargetWhitelisted(address indexed target, bool whitelisted);
    event RelayerAuthorized(address indexed relayer, bool authorized);
    event PaymasterConfigUpdated(
        uint256 maxGasPrice,
        uint256 maxGasPerTransaction,
        uint256 totalGasLimit
    );
    event GasSponsored(
        address indexed sender,
        address indexed target,
        uint256 gasUsed,
        uint256 gasCost
    );
    event BalanceDeposited(address indexed depositor, uint256 amount);
    event BalanceWithdrawn(address indexed recipient, uint256 amount);

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "SubscriptionPaymaster: only EntryPoint");
        _;
    }

    constructor(
        address _entryPoint,
        address _owner
    ) {
        require(_entryPoint != address(0), "SubscriptionPaymaster: invalid EntryPoint");
        entryPoint = IEntryPoint(_entryPoint);
        lastResetTime = block.timestamp;
        _transferOwnership(_owner);
    }

    /**
     * @dev Validate a user operation and determine if we should sponsor it
     * @param userOp The user operation to validate
     * @param userOpHash Hash of the user operation
     * @param maxCost Maximum cost of the operation
     */
    function validatePaymasterUserOp(
        IEntryPoint.UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external onlyEntryPoint whenNotPaused returns (bytes memory context, uint256 validationData) {
        // Reset gas usage if period has elapsed
        if (block.timestamp >= lastResetTime + gasLimitPeriod) {
            currentPeriodGasUsed = 0;
            lastResetTime = block.timestamp;
        }

        // Check if we have sufficient balance
        require(
            entryPoint.balanceOf(address(this)) >= maxCost + minimumBalance,
            "SubscriptionPaymaster: insufficient balance"
        );

        // Parse the target address from callData
        address target = _parseTargetFromCallData(userOp.callData);
        
        // Validate the target is whitelisted
        require(whitelistedTargets[target], "SubscriptionPaymaster: target not whitelisted");

        // Validate gas limits
        uint256 totalGas = userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas;
        require(totalGas <= maxGasPerTransaction, "SubscriptionPaymaster: gas limit exceeded");
        require(userOp.maxFeePerGas <= maxGasPrice, "SubscriptionPaymaster: gas price too high");
        
        // Check period gas limit
        require(
            currentPeriodGasUsed + totalGas <= totalGasLimit,
            "SubscriptionPaymaster: period gas limit exceeded"
        );

        // Validate the transaction is subscription-related
        require(_isValidSubscriptionTransaction(userOp.callData), "SubscriptionPaymaster: invalid transaction");

        // Update gas tracking
        currentPeriodGasUsed += totalGas;
        gasUsedByTarget[target] += totalGas;

        // Return context for post-operation processing
        context = abi.encode(userOp.sender, target, totalGas, maxCost);
        validationData = 0; // Success
    }

    /**
     * @dev Post-operation hook called after the user operation is executed
     * @param context Context data from validatePaymasterUserOp
     * @param actualGasCost Actual gas cost of the operation
     */
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external onlyEntryPoint {
        (address sender, address target, uint256 estimatedGas, uint256 maxCost) = 
            abi.decode(context, (address, address, uint256, uint256));

        // Emit gas sponsorship event
        emit GasSponsored(sender, target, estimatedGas, actualGasCost);

        // Handle failed operations
        if (mode == PostOpMode.postOpReverted) {
            // Could implement penalty logic here
        }
    }

    /**
     * @dev Whitelist or remove a target contract
     * @param target Target contract address
     * @param whitelisted Whether to whitelist or remove
     */
    function setTargetWhitelist(address target, bool whitelisted) external onlyOwner {
        require(target != address(0), "SubscriptionPaymaster: invalid target");
        whitelistedTargets[target] = whitelisted;
        emit TargetWhitelisted(target, whitelisted);
    }

    /**
     * @dev Authorize or revoke a relayer
     * @param relayer Relayer address
     * @param authorized Whether to authorize or revoke
     */
    function setRelayerAuthorization(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerAuthorized(relayer, authorized);
    }

    /**
     * @dev Update paymaster configuration
     * @param _maxGasPrice New maximum gas price
     * @param _maxGasPerTransaction New maximum gas per transaction
     * @param _totalGasLimit New total gas limit per period
     */
    function updateConfig(
        uint256 _maxGasPrice,
        uint256 _maxGasPerTransaction,
        uint256 _totalGasLimit
    ) external onlyOwner {
        require(_maxGasPrice > 0, "SubscriptionPaymaster: invalid gas price");
        require(_maxGasPerTransaction > 0, "SubscriptionPaymaster: invalid gas per tx");
        require(_totalGasLimit > 0, "SubscriptionPaymaster: invalid total gas limit");

        maxGasPrice = _maxGasPrice;
        maxGasPerTransaction = _maxGasPerTransaction;
        totalGasLimit = _totalGasLimit;

        emit PaymasterConfigUpdated(_maxGasPrice, _maxGasPerTransaction, _totalGasLimit);
    }

    /**
     * @dev Set gas limit for a specific target
     * @param target Target contract address
     * @param gasLimit Gas limit for the target
     */
    function setTargetGasLimit(address target, uint256 gasLimit) external onlyOwner {
        gasLimitPerTarget[target] = gasLimit;
    }

    /**
     * @dev Update minimum balance threshold
     * @param _minimumBalance New minimum balance
     */
    function setMinimumBalance(uint256 _minimumBalance) external onlyOwner {
        minimumBalance = _minimumBalance;
    }

    /**
     * @dev Deposit funds to the EntryPoint for this paymaster
     */
    function depositToEntryPoint() external payable onlyOwner {
        entryPoint.depositTo{value: msg.value}(address(this));
        emit BalanceDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw funds from the EntryPoint
     * @param recipient Recipient address
     * @param amount Amount to withdraw
     */
    function withdrawFromEntryPoint(address payable recipient, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(recipient, amount);
        emit BalanceWithdrawn(recipient, amount);
    }

    /**
     * @dev Get the current balance in the EntryPoint
     */
    function getBalance() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    /**
     * @dev Pause the paymaster
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the paymaster
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Emergency withdraw all funds
     * @param recipient Recipient address
     */
    function emergencyWithdraw(address payable recipient) external onlyOwner {
        uint256 balance = entryPoint.balanceOf(address(this));
        if (balance > 0) {
            entryPoint.withdrawTo(recipient, balance);
        }
        
        // Also withdraw any ETH directly held by this contract
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            recipient.transfer(ethBalance);
        }
        
        emit BalanceWithdrawn(recipient, balance + ethBalance);
    }

    /**
     * @dev Parse target address from call data
     * @param callData The call data to parse
     */
    function _parseTargetFromCallData(bytes calldata callData) internal pure returns (address target) {
        // For SmartWallet.execute() calls, the target is in the first parameter
        if (callData.length >= 68) { // 4 bytes selector + 32 bytes address + 32 bytes value
            bytes memory targetBytes = callData[4:36];
            assembly {
                target := mload(add(targetBytes, 20))
            }
        }
        
        // For direct calls to SubscriptionManager, the target is the contract itself
        // This will be handled by the calling context
    }

    /**
     * @dev Validate that the transaction is subscription-related
     * @param callData The call data to validate
     */
    function _isValidSubscriptionTransaction(bytes calldata callData) internal pure returns (bool) {
        if (callData.length < 4) return false;
        
        bytes4 selector = bytes4(callData[:4]);
        
        // SmartWallet functions
        if (selector == bytes4(keccak256("execute(address,uint256,bytes)")) ||
            selector == bytes4(keccak256("executeBatch(address[],uint256[],bytes[])")) ||
            selector == bytes4(keccak256("executeSubscriptionPayment(address,address,uint256)"))) {
            return true;
        }
        
        // SubscriptionManager functions
        if (selector == bytes4(keccak256("subscribe(uint256,address,address,bool)")) ||
            selector == bytes4(keccak256("chargeSubscriber(uint256)")) ||
            selector == bytes4(keccak256("batchChargeSubscribers(uint256[])")) ||
            selector == bytes4(keccak256("unsubscribe(uint256)"))) {
            return true;
        }
        
        return false;
    }

    /**
     * @dev Get gas usage statistics for a target
     * @param target Target contract address
     */
    function getTargetGasUsage(address target) external view returns (uint256) {
        return gasUsedByTarget[target];
    }

    /**
     * @dev Get current period gas usage
     */
    function getCurrentPeriodGasUsage() external view returns (uint256, uint256) {
        return (currentPeriodGasUsed, lastResetTime);
    }

    /**
     * @dev Receive ETH function
     */
    receive() external payable {
        // Allow receiving ETH for funding
    }
}

// PostOpMode enum for post-operation handling
enum PostOpMode {
    opSucceeded,
    opReverted,
    postOpReverted
}
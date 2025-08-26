// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

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

    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external;
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
}

/**
 * @title SmartWallet
 * @dev ERC-4337 compliant smart contract wallet for gasless subscription payments
 * @notice This wallet supports account abstraction and can execute operations without requiring gas from the owner
 */
contract SmartWallet is EIP712, Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // EntryPoint contract address (standard ERC-4337)
    IEntryPoint public immutable entryPoint;
    
    // Nonce for replay protection
    mapping(uint192 => uint256) private _nonces;
    
    // Subscription approvals for gasless recurring payments
    mapping(address => mapping(address => uint256)) public subscriptionApprovals; // token => spender => amount
    mapping(address => mapping(address => uint256)) public subscriptionNonces; // token => spender => nonce
    
    // Events
    event SubscriptionApprovalSigned(
        address indexed token,
        address indexed spender,
        uint256 amount,
        uint256 nonce,
        bytes32 indexed approvalHash
    );
    
    event SubscriptionPaymentExecuted(
        address indexed token,
        address indexed spender,
        uint256 amount,
        uint256 nonce
    );
    
    event WalletInitialized(address indexed owner, address indexed entryPoint);
    
    // EIP-712 type hashes
    bytes32 private constant SUBSCRIPTION_APPROVAL_TYPEHASH = keccak256(
        "SubscriptionApproval(address token,address spender,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "SmartWallet: only EntryPoint");
        _;
    }

    modifier onlyEntryPointOrOwner() {
        require(
            msg.sender == address(entryPoint) || msg.sender == owner(),
            "SmartWallet: only EntryPoint or owner"
        );
        _;
    }

    constructor(
        address _entryPoint,
        address _owner
    ) EIP712("SmartWallet", "1") {
        require(_entryPoint != address(0), "SmartWallet: invalid EntryPoint");
        require(_owner != address(0), "SmartWallet: invalid owner");
        
        entryPoint = IEntryPoint(_entryPoint);
        _transferOwnership(_owner);
        emit WalletInitialized(_owner, _entryPoint);
    }

    /**
     * @dev Validate signature for ERC-4337 UserOperation
     * @param userOp The user operation to validate
     * @param userOpHash Hash of the user operation
     * @return validationData Validation result (0 for success)
     */
    function validateUserOp(
        IEntryPoint.UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 /* missingAccountFunds */
    ) external onlyEntryPoint returns (uint256 validationData) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        address signer = hash.recover(userOp.signature);
        
        if (signer != owner()) {
            return 1; // Invalid signature
        }
        
        return 0; // Valid signature
    }

    /**
     * @dev Execute a transaction from this wallet
     * @param dest Destination address
     * @param value ETH value to send
     * @param data Call data
     */
    function execute(
        address dest,
        uint256 value,
        bytes calldata data
    ) external onlyEntryPointOrOwner {
        _call(dest, value, data);
    }

    /**
     * @dev Execute a batch of transactions
     * @param dest Array of destination addresses
     * @param value Array of ETH values
     * @param data Array of call data
     */
    function executeBatch(
        address[] calldata dest,
        uint256[] calldata value,
        bytes[] calldata data
    ) external onlyEntryPointOrOwner {
        require(
            dest.length == value.length && dest.length == data.length,
            "SmartWallet: array length mismatch"
        );
        
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], value[i], data[i]);
        }
    }

    /**
     * @dev Sign approval for subscription payments (off-chain, gasless)
     * @param token Token address to approve
     * @param spender Address that can spend tokens (SubscriptionManager)
     * @param amount Maximum amount to approve for subscription
     * @param nonce Nonce for replay protection
     * @param deadline Signature deadline
     * @param signature Owner's signature
     */
    function approveSubscription(
        address token,
        address spender,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "SmartWallet: signature expired");
        require(nonce == subscriptionNonces[token][spender], "SmartWallet: invalid nonce");
        
        bytes32 structHash = keccak256(
            abi.encode(
                SUBSCRIPTION_APPROVAL_TYPEHASH,
                token,
                spender,
                amount,
                nonce,
                deadline
            )
        );
        
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        require(signer == owner(), "SmartWallet: invalid signature");
        
        // Update approval and nonce
        subscriptionApprovals[token][spender] = amount;
        subscriptionNonces[token][spender]++;
        
        emit SubscriptionApprovalSigned(token, spender, amount, nonce, hash);
    }

    /**
     * @dev Execute subscription payment (called by SubscriptionManager)
     * @param token Token to transfer
     * @param to Recipient address
     * @param amount Amount to transfer
     */
    function executeSubscriptionPayment(
        address token,
        address to,
        uint256 amount
    ) external nonReentrant {
        require(
            subscriptionApprovals[token][msg.sender] >= amount,
            "SmartWallet: insufficient approval"
        );
        
        // Decrease approval
        subscriptionApprovals[token][msg.sender] -= amount;
        
        // Transfer tokens
        IERC20(token).safeTransfer(to, amount);
        
        emit SubscriptionPaymentExecuted(
            token,
            msg.sender,
            amount,
            subscriptionNonces[token][msg.sender] - 1
        );
    }

    /**
     * @dev Get nonce for ERC-4337
     * @param key Nonce key (usually 0)
     */
    function getNonce(uint192 key) public view returns (uint256) {
        return _nonces[key];
    }

    /**
     * @dev Increment nonce
     * @param key Nonce key
     */
    function incrementNonce(uint192 key) external onlyEntryPointOrOwner {
        _nonces[key]++;
    }

    /**
     * @dev Get subscription approval amount
     * @param token Token address
     * @param spender Spender address
     */
    function getSubscriptionApproval(
        address token,
        address spender
    ) external view returns (uint256) {
        return subscriptionApprovals[token][spender];
    }

    /**
     * @dev Get subscription nonce for a token-spender pair
     * @param token Token address
     * @param spender Spender address
     */
    function getSubscriptionNonce(
        address token,
        address spender
    ) external view returns (uint256) {
        return subscriptionNonces[token][spender];
    }

    /**
     * @dev Emergency function to revoke all subscription approvals for a spender
     * @param token Token address
     * @param spender Spender address
     */
    function revokeSubscriptionApproval(
        address token,
        address spender
    ) external onlyOwner {
        subscriptionApprovals[token][spender] = 0;
        subscriptionNonces[token][spender]++;
    }

    /**
     * @dev Withdraw tokens from the wallet
     * @param token Token address (address(0) for ETH)
     * @param amount Amount to withdraw
     */
    function withdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    /**
     * @dev Internal function to execute calls
     * @param dest Destination address
     * @param value ETH value
     * @param data Call data
     */
    function _call(address dest, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = dest.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /**
     * @dev Deposit function to receive ETH
     */
    function deposit() external payable {
        // Allow deposits
    }

    /**
     * @dev Fallback function to receive ETH
     */
    receive() external payable {
        // Allow receiving ETH
    }

    /**
     * @dev Check if the wallet supports an interface
     * @param interfaceId Interface ID to check
     */
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }
}
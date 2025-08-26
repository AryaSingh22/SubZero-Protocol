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

interface IIntegrationRegistry {
    function isRegisteredIntegration(address target) external view returns (bool);
    function getIntegrationInfo(address target) external view returns (
        string memory name,
        string memory description,
        address owner,
        bool isActive,
        uint256 gasAllowance
    );
}

/**
 * @title PaymasterV2
 * @dev Enhanced ERC-4337 Paymaster with open integration support for multiple dApps
 * @notice Supports multiple target contracts and third-party integrations via registry
 */
contract PaymasterV2 is Ownable, ReentrancyGuard, Pausable {
    
    // EntryPoint contract
    IEntryPoint public immutable entryPoint;
    
    // Integration registry for third-party dApps
    IIntegrationRegistry public integrationRegistry;
    
    // Integration tier configuration
    struct IntegrationTier {
        string name;
        uint256 maxGasPerTransaction;
        uint256 dailyGasAllowance;
        uint256 monthlyGasAllowance;
        uint256 priorityMultiplier; // Basis points (10000 = 1x)
        bool requiresStaking;
        uint256 minimumStake;
    }

    // Integration usage tracking
    struct IntegrationUsage {
        uint256 dailyGasUsed;
        uint256 monthlyGasUsed;
        uint256 lastResetDaily;
        uint256 lastResetMonthly;
        uint256 totalTransactions;
        uint256 totalGasSponsored;
        bool isActive;
        uint256 tierId;
        uint256 stakedAmount;
    }

    // Target contract configuration
    struct TargetConfig {
        bool isWhitelisted;
        uint256 tierId;
        uint256 gasAllowance;
        uint256 gasUsed;
        bool requiresValidation;
        address validator;
    }

    // Whitelisted contracts and their configurations
    mapping(address => TargetConfig) public targetConfigs;
    
    // Integration tiers
    mapping(uint256 => IntegrationTier) public integrationTiers;
    mapping(address => IntegrationUsage) public integrationUsage;
    
    // Authorized relayers that can use this paymaster
    mapping(address => bool) public authorizedRelayers;
    
    // Gas cost tracking and limits
    mapping(address => uint256) public gasUsedByTarget;
    mapping(address => uint256) public gasLimitPerTarget;
    
    // Paymaster configuration
    uint256 public maxGasPrice = 50 gwei;
    uint256 public maxGasPerTransaction = 500000;
    uint256 public totalGasLimit = 50000000; // Increased for multiple integrations
    uint256 public gasLimitPeriod = 1 days;
    uint256 public lastResetTime;
    uint256 public currentPeriodGasUsed;
    
    // Minimum balance threshold
    uint256 public minimumBalance = 1 ether; // Increased for multi-dApp support
    
    // Integration fees and revenue sharing
    uint256 public defaultIntegrationFee = 100; // 1% in basis points
    mapping(address => uint256) public integrationFees; // Custom fees per integration
    address public feeRecipient;
    
    // Events
    event TargetWhitelisted(address indexed target, uint256 tierId, bool whitelisted);
    event RelayerAuthorized(address indexed relayer, bool authorized);
    event PaymasterConfigUpdated(uint256 maxGasPrice, uint256 maxGasPerTransaction, uint256 totalGasLimit);
    event GasSponsored(address indexed sender, address indexed target, uint256 gasUsed, uint256 gasCost, uint256 tierId);
    event IntegrationStaked(address indexed integration, uint256 amount);
    event BalanceDeposited(address indexed depositor, uint256 amount);

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "PaymasterV2: only EntryPoint");
        _;
    }

    modifier validTier(uint256 tierId) {
        require(bytes(integrationTiers[tierId].name).length > 0, "PaymasterV2: invalid tier");
        _;
    }

    constructor(
        address _entryPoint,
        address _owner,
        address _feeRecipient
    ) {
        require(_entryPoint != address(0), "PaymasterV2: invalid EntryPoint");
        require(_feeRecipient != address(0), "PaymasterV2: invalid fee recipient");
        
        entryPoint = IEntryPoint(_entryPoint);
        feeRecipient = _feeRecipient;
        lastResetTime = block.timestamp;
        
        _transferOwnership(_owner);
        
        // Create default integration tiers
        _createDefaultTiers();
    }

    /**
     * @dev Set the integration registry contract
     * @param _integrationRegistry Registry contract address
     */
    function setIntegrationRegistry(address _integrationRegistry) external onlyOwner {
        require(_integrationRegistry != address(0), "PaymasterV2: invalid registry");
        integrationRegistry = IIntegrationRegistry(_integrationRegistry);
    }

    /**
     * @dev Whitelist a target contract with specific tier and configuration
     * @param target Target contract address
     * @param tierId Integration tier ID
     * @param gasAllowance Specific gas allowance for this target
     * @param requiresValidation Whether to use custom validation
     * @param validator Custom validator contract (if needed)
     */
    function whitelistTarget(
        address target,
        uint256 tierId,
        uint256 gasAllowance,
        bool requiresValidation,
        address validator
    ) external onlyOwner validTier(tierId) {
        require(target != address(0), "PaymasterV2: invalid target");
        
        targetConfigs[target] = TargetConfig({
            isWhitelisted: true,
            tierId: tierId,
            gasAllowance: gasAllowance,
            gasUsed: 0,
            requiresValidation: requiresValidation,
            validator: validator
        });
        
        // Initialize integration usage if not exists
        if (!integrationUsage[target].isActive) {
            integrationUsage[target] = IntegrationUsage({
                dailyGasUsed: 0,
                monthlyGasUsed: 0,
                lastResetDaily: block.timestamp,
                lastResetMonthly: block.timestamp,
                totalTransactions: 0,
                totalGasSponsored: 0,
                isActive: true,
                tierId: tierId,
                stakedAmount: 0
            });
        }
        
        emit TargetWhitelisted(target, tierId, true);
    }

    /**
     * @dev Stake tokens for enhanced integration tier
     * @param integration Integration contract address
     */
    function stakeForIntegration(address integration) external payable {
        require(targetConfigs[integration].isWhitelisted, "PaymasterV2: integration not whitelisted");
        require(msg.value > 0, "PaymasterV2: no stake provided");
        
        IntegrationTier storage tier = integrationTiers[targetConfigs[integration].tierId];
        require(tier.requiresStaking, "PaymasterV2: tier doesn't require staking");
        
        integrationUsage[integration].stakedAmount += msg.value;
        require(
            integrationUsage[integration].stakedAmount >= tier.minimumStake,
            "PaymasterV2: insufficient stake"
        );
        
        emit IntegrationStaked(integration, msg.value);
    }

    /**
     * @dev Create default integration tiers
     */
    function _createDefaultTiers() internal {
        // Tier 0: Basic (Free)
        integrationTiers[0] = IntegrationTier({
            name: "Basic",
            maxGasPerTransaction: 100000,
            dailyGasAllowance: 1000000,
            monthlyGasAllowance: 30000000,
            priorityMultiplier: 10000, // 1x
            requiresStaking: false,
            minimumStake: 0
        });
        
        // Tier 1: Pro (Staking required)
        integrationTiers[1] = IntegrationTier({
            name: "Pro",
            maxGasPerTransaction: 300000,
            dailyGasAllowance: 5000000,
            monthlyGasAllowance: 150000000,
            priorityMultiplier: 12000, // 1.2x
            requiresStaking: true,
            minimumStake: 1 ether
        });
    }

    /**
     * @dev Set authorized relayer status
     * @param relayer Relayer address
     * @param authorized Whether the relayer is authorized
     */
    function setAuthorizedRelayer(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerAuthorized(relayer, authorized);
    }

    /**
     * @dev Deposit funds to the EntryPoint for gas sponsorship
     */
    function deposit() external payable onlyOwner {
        require(msg.value > 0, "PaymasterV2: no value provided");
        entryPoint.depositTo{value: msg.value}(address(this));
        emit BalanceDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Get current EntryPoint balance
     * @return balance Current balance in EntryPoint
     */
    function getBalance() external view returns (uint256 balance) {
        return entryPoint.balanceOf(address(this));
    }

    /**
     * @dev Get integration usage statistics
     * @param integration Integration contract address
     * @return usage IntegrationUsage struct
     */
    function getIntegrationUsage(
        address integration
    ) external view returns (IntegrationUsage memory usage) {
        return integrationUsage[integration];
    }

    /**
     * @dev Get integration tier information
     * @param tierId Tier ID
     * @return tier IntegrationTier struct
     */
    function getIntegrationTier(
        uint256 tierId
    ) external view returns (IntegrationTier memory tier) {
        return integrationTiers[tierId];
    }

    /**
     * @dev Get target configuration
     * @param target Target contract address
     * @return config TargetConfig struct
     */
    function getTargetConfig(
        address target
    ) external view returns (TargetConfig memory config) {
        return targetConfigs[target];
    }

    /**
     * @dev Check if target is whitelisted
     * @param target Target contract address
     * @return isWhitelisted Whether target is whitelisted
     */
    function isTargetWhitelisted(address target) external view returns (bool isWhitelisted) {
        return targetConfigs[target].isWhitelisted;
    }

    /**
     * @dev Handle direct ETH transfers
     */
    receive() external payable {
        // Allow direct deposits
        emit BalanceDeposited(msg.sender, msg.value);
    }
}
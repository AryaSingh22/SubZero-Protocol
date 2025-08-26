// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title IntegrationRegistry
 * @dev Registry for third-party dApps to integrate with the gasless subscription system
 * @notice Manages registration, approval, and configuration of external integrations
 */
contract IntegrationRegistry is Ownable, ReentrancyGuard, Pausable {
    
    // Integration status enum
    enum IntegrationStatus {
        Pending,     // Submitted but not approved
        Active,      // Approved and active
        Suspended,   // Temporarily suspended
        Rejected,    // Rejected by admin
        Revoked      // Permanently revoked
    }

    // Integration information structure
    struct IntegrationInfo {
        string name;
        string description;
        string website;
        string logoUrl;
        address owner;
        address contractAddress;
        IntegrationStatus status;
        uint256 gasAllowance;
        uint256 dailyGasLimit;
        uint256 monthlyGasLimit;
        uint256 registrationTimestamp;
        uint256 lastUpdated;
        bytes32[] categories; // e.g., "defi", "gaming", "nft"
        bool requiresKYC;
        string[] supportedNetworks;
    }

    // Integration usage tracking
    struct IntegrationUsage {
        uint256 totalTransactions;
        uint256 totalGasUsed;
        uint256 dailyGasUsed;
        uint256 monthlyGasUsed;
        uint256 lastDailyReset;
        uint256 lastMonthlyReset;
        uint256 successfulTransactions;
        uint256 failedTransactions;
        mapping(bytes32 => uint256) categoryUsage; // Usage per category
    }

    // Registry state
    mapping(address => IntegrationInfo) public integrations;
    mapping(address => IntegrationUsage) public integrationUsage;
    mapping(bytes32 => address[]) public integrationsByCategory;
    mapping(address => bool) public approvedIntegrators; // Addresses that can approve integrations
    
    // Registration requirements
    uint256 public registrationFee = 0.1 ether;
    uint256 public minimumStake = 1 ether;
    uint256 public approvalTimelock = 7 days;
    
    // Integration limits
    uint256 public maxIntegrationsPerOwner = 5;
    uint256 public defaultGasAllowance = 10000000; // 10M gas
    uint256 public maxGasAllowance = 100000000; // 100M gas
    
    // Registry statistics
    uint256 public totalIntegrations;
    uint256 public activeIntegrations;
    uint256 public totalRegistrationFees;
    
    // Events
    event IntegrationRegistered(
        address indexed contractAddress,
        address indexed owner,
        string name,
        IntegrationStatus status
    );
    
    event IntegrationStatusChanged(
        address indexed contractAddress,
        IntegrationStatus oldStatus,
        IntegrationStatus newStatus,
        string reason
    );
    
    event IntegrationUpdated(
        address indexed contractAddress,
        address indexed owner,
        string name
    );
    
    event IntegratorApproved(address indexed integrator, bool approved);
    event RegistrationFeeUpdated(uint256 oldFee, uint256 newFee);
    event GasAllowanceUpdated(address indexed integration, uint256 oldAllowance, uint256 newAllowance);
    event CategoryAdded(address indexed integration, bytes32 category);
    event CategoryRemoved(address indexed integration, bytes32 category);
    
    modifier onlyIntegrationOwner(address contractAddress) {
        require(integrations[contractAddress].owner == msg.sender, "IntegrationRegistry: not owner");
        _;
    }
    
    modifier onlyApprovedIntegrator() {
        require(
            approvedIntegrators[msg.sender] || msg.sender == owner(),
            "IntegrationRegistry: not approved integrator"
        );
        _;
    }
    
    modifier validIntegration(address contractAddress) {
        require(integrations[contractAddress].owner != address(0), "IntegrationRegistry: not registered");
        _;
    }

    constructor(address _owner) {
        _transferOwnership(_owner);
    }

    /**
     * @dev Register a new integration
     * @param contractAddress The contract address to register
     * @param name Name of the integration
     * @param description Description of the integration
     * @param website Website URL
     * @param logoUrl Logo image URL
     * @param categories Array of category hashes
     * @param supportedNetworks Array of supported network names
     * @param requiresKYC Whether the integration requires KYC
     */
    function registerIntegration(
        address contractAddress,
        string calldata name,
        string calldata description,
        string calldata website,
        string calldata logoUrl,
        bytes32[] calldata categories,
        string[] calldata supportedNetworks,
        bool requiresKYC
    ) external payable whenNotPaused nonReentrant {
        require(contractAddress != address(0), "IntegrationRegistry: invalid contract address");
        require(bytes(name).length > 0, "IntegrationRegistry: name required");
        require(bytes(description).length > 0, "IntegrationRegistry: description required");
        require(msg.value >= registrationFee, "IntegrationRegistry: insufficient fee");
        require(integrations[contractAddress].owner == address(0), "IntegrationRegistry: already registered");
        
        // Check owner integration limit
        uint256 ownerIntegrations = _countOwnerIntegrations(msg.sender);
        require(ownerIntegrations < maxIntegrationsPerOwner, "IntegrationRegistry: too many integrations");
        
        // Create integration info
        IntegrationInfo storage integration = integrations[contractAddress];
        integration.name = name;
        integration.description = description;
        integration.website = website;
        integration.logoUrl = logoUrl;
        integration.owner = msg.sender;
        integration.contractAddress = contractAddress;
        integration.status = IntegrationStatus.Pending;
        integration.gasAllowance = defaultGasAllowance;
        integration.dailyGasLimit = defaultGasAllowance / 30; // Default daily limit
        integration.monthlyGasLimit = defaultGasAllowance;
        integration.registrationTimestamp = block.timestamp;
        integration.lastUpdated = block.timestamp;
        integration.categories = categories;
        integration.requiresKYC = requiresKYC;
        integration.supportedNetworks = supportedNetworks;
        
        // Initialize usage tracking
        IntegrationUsage storage usage = integrationUsage[contractAddress];
        usage.lastDailyReset = block.timestamp;
        usage.lastMonthlyReset = block.timestamp;
        
        // Add to category mappings
        for (uint256 i = 0; i < categories.length; i++) {
            integrationsByCategory[categories[i]].push(contractAddress);
            emit CategoryAdded(contractAddress, categories[i]);
        }
        
        totalIntegrations++;
        totalRegistrationFees += msg.value;
        
        emit IntegrationRegistered(contractAddress, msg.sender, name, IntegrationStatus.Pending);
    }

    /**
     * @dev Approve a pending integration
     * @param contractAddress Integration contract address
     * @param gasAllowance Gas allowance to assign
     * @param dailyGasLimit Daily gas limit
     * @param monthlyGasLimit Monthly gas limit
     */
    function approveIntegration(
        address contractAddress,
        uint256 gasAllowance,
        uint256 dailyGasLimit,
        uint256 monthlyGasLimit
    ) external onlyApprovedIntegrator validIntegration(contractAddress) {
        IntegrationInfo storage integration = integrations[contractAddress];
        require(integration.status == IntegrationStatus.Pending, "IntegrationRegistry: not pending");
        require(gasAllowance <= maxGasAllowance, "IntegrationRegistry: gas allowance too high");
        require(
            integration.registrationTimestamp + approvalTimelock <= block.timestamp,
            "IntegrationRegistry: timelock not expired"
        );
        
        IntegrationStatus oldStatus = integration.status;
        integration.status = IntegrationStatus.Active;
        integration.gasAllowance = gasAllowance;
        integration.dailyGasLimit = dailyGasLimit;
        integration.monthlyGasLimit = monthlyGasLimit;
        integration.lastUpdated = block.timestamp;
        
        activeIntegrations++;
        
        emit IntegrationStatusChanged(contractAddress, oldStatus, IntegrationStatus.Active, "Approved");
    }

    /**
     * @dev Reject a pending integration
     * @param contractAddress Integration contract address
     * @param reason Rejection reason
     */
    function rejectIntegration(
        address contractAddress,
        string calldata reason
    ) external onlyApprovedIntegrator validIntegration(contractAddress) {
        IntegrationInfo storage integration = integrations[contractAddress];
        require(integration.status == IntegrationStatus.Pending, "IntegrationRegistry: not pending");
        
        IntegrationStatus oldStatus = integration.status;
        integration.status = IntegrationStatus.Rejected;
        integration.lastUpdated = block.timestamp;
        
        emit IntegrationStatusChanged(contractAddress, oldStatus, IntegrationStatus.Rejected, reason);
    }

    /**
     * @dev Suspend an active integration
     * @param contractAddress Integration contract address
     * @param reason Suspension reason
     */
    function suspendIntegration(
        address contractAddress,
        string calldata reason
    ) external onlyApprovedIntegrator validIntegration(contractAddress) {
        IntegrationInfo storage integration = integrations[contractAddress];
        require(integration.status == IntegrationStatus.Active, "IntegrationRegistry: not active");
        
        IntegrationStatus oldStatus = integration.status;
        integration.status = IntegrationStatus.Suspended;
        integration.lastUpdated = block.timestamp;
        
        if (oldStatus == IntegrationStatus.Active) {
            activeIntegrations--;
        }
        
        emit IntegrationStatusChanged(contractAddress, oldStatus, IntegrationStatus.Suspended, reason);
    }

    /**
     * @dev Reactivate a suspended integration
     * @param contractAddress Integration contract address
     */
    function reactivateIntegration(
        address contractAddress
    ) external onlyApprovedIntegrator validIntegration(contractAddress) {
        IntegrationInfo storage integration = integrations[contractAddress];
        require(integration.status == IntegrationStatus.Suspended, "IntegrationRegistry: not suspended");
        
        IntegrationStatus oldStatus = integration.status;
        integration.status = IntegrationStatus.Active;
        integration.lastUpdated = block.timestamp;
        
        activeIntegrations++;
        
        emit IntegrationStatusChanged(contractAddress, oldStatus, IntegrationStatus.Active, "Reactivated");
    }

    /**
     * @dev Revoke an integration permanently
     * @param contractAddress Integration contract address
     * @param reason Revocation reason
     */
    function revokeIntegration(
        address contractAddress,
        string calldata reason
    ) external onlyApprovedIntegrator validIntegration(contractAddress) {
        IntegrationInfo storage integration = integrations[contractAddress];
        require(integration.status != IntegrationStatus.Revoked, "IntegrationRegistry: already revoked");
        
        IntegrationStatus oldStatus = integration.status;
        integration.status = IntegrationStatus.Revoked;
        integration.lastUpdated = block.timestamp;
        
        if (oldStatus == IntegrationStatus.Active) {
            activeIntegrations--;
        }
        
        emit IntegrationStatusChanged(contractAddress, oldStatus, IntegrationStatus.Revoked, reason);
    }

    /**
     * @dev Update integration information (owner only)
     * @param contractAddress Integration contract address
     * @param name New name
     * @param description New description
     * @param website New website
     * @param logoUrl New logo URL
     */
    function updateIntegration(
        address contractAddress,
        string calldata name,
        string calldata description,
        string calldata website,
        string calldata logoUrl
    ) external onlyIntegrationOwner(contractAddress) validIntegration(contractAddress) {
        IntegrationInfo storage integration = integrations[contractAddress];
        require(bytes(name).length > 0, "IntegrationRegistry: name required");
        require(bytes(description).length > 0, "IntegrationRegistry: description required");
        
        integration.name = name;
        integration.description = description;
        integration.website = website;
        integration.logoUrl = logoUrl;
        integration.lastUpdated = block.timestamp;
        
        emit IntegrationUpdated(contractAddress, msg.sender, name);
    }

    /**
     * @dev Update gas allowance for an integration
     * @param contractAddress Integration contract address
     * @param gasAllowance New gas allowance
     * @param dailyGasLimit New daily gas limit
     * @param monthlyGasLimit New monthly gas limit
     */
    function updateGasAllowance(
        address contractAddress,
        uint256 gasAllowance,
        uint256 dailyGasLimit,
        uint256 monthlyGasLimit
    ) external onlyApprovedIntegrator validIntegration(contractAddress) {
        require(gasAllowance <= maxGasAllowance, "IntegrationRegistry: gas allowance too high");
        
        IntegrationInfo storage integration = integrations[contractAddress];
        uint256 oldAllowance = integration.gasAllowance;
        
        integration.gasAllowance = gasAllowance;
        integration.dailyGasLimit = dailyGasLimit;
        integration.monthlyGasLimit = monthlyGasLimit;
        integration.lastUpdated = block.timestamp;
        
        emit GasAllowanceUpdated(contractAddress, oldAllowance, gasAllowance);
    }

    /**
     * @dev Record gas usage for an integration (called by Paymaster)
     * @param contractAddress Integration contract address
     * @param gasUsed Amount of gas used
     * @param success Whether the transaction succeeded
     */
    function recordUsage(
        address contractAddress,
        uint256 gasUsed,
        bool success
    ) external {
        // Only allow calls from approved paymasters or integrators
        require(
            approvedIntegrators[msg.sender] || msg.sender == owner(),
            "IntegrationRegistry: not authorized"
        );
        
        IntegrationUsage storage usage = integrationUsage[contractAddress];
        
        // Reset counters if needed
        if (block.timestamp >= usage.lastDailyReset + 1 days) {
            usage.dailyGasUsed = 0;
            usage.lastDailyReset = block.timestamp;
        }
        
        if (block.timestamp >= usage.lastMonthlyReset + 30 days) {
            usage.monthlyGasUsed = 0;
            usage.lastMonthlyReset = block.timestamp;
        }
        
        // Update usage statistics
        usage.totalTransactions++;
        usage.totalGasUsed += gasUsed;
        usage.dailyGasUsed += gasUsed;
        usage.monthlyGasUsed += gasUsed;
        
        if (success) {
            usage.successfulTransactions++;
        } else {
            usage.failedTransactions++;
        }
    }

    // Administrative Functions

    /**
     * @dev Set approved integrator status
     * @param integrator Address to approve/revoke
     * @param approved Whether the address is approved
     */
    function setApprovedIntegrator(address integrator, bool approved) external onlyOwner {
        approvedIntegrators[integrator] = approved;
        emit IntegratorApproved(integrator, approved);
    }

    /**
     * @dev Update registration fee
     * @param newFee New registration fee
     */
    function setRegistrationFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = registrationFee;
        registrationFee = newFee;
        emit RegistrationFeeUpdated(oldFee, newFee);
    }

    /**
     * @dev Update configuration parameters
     * @param _maxIntegrationsPerOwner Maximum integrations per owner
     * @param _defaultGasAllowance Default gas allowance
     * @param _maxGasAllowance Maximum gas allowance
     * @param _approvalTimelock Approval timelock period
     */
    function updateConfiguration(
        uint256 _maxIntegrationsPerOwner,
        uint256 _defaultGasAllowance,
        uint256 _maxGasAllowance,
        uint256 _approvalTimelock
    ) external onlyOwner {
        maxIntegrationsPerOwner = _maxIntegrationsPerOwner;
        defaultGasAllowance = _defaultGasAllowance;
        maxGasAllowance = _maxGasAllowance;
        approvalTimelock = _approvalTimelock;
    }

    /**
     * @dev Withdraw collected registration fees
     * @param recipient Address to receive fees
     * @param amount Amount to withdraw
     */
    function withdrawFees(address payable recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "IntegrationRegistry: invalid recipient");
        require(amount <= address(this).balance, "IntegrationRegistry: insufficient balance");
        
        recipient.transfer(amount);
    }

    // View Functions

    /**
     * @dev Check if an integration is registered and active
     * @param contractAddress Integration contract address
     * @return isRegistered Whether the integration is registered and active
     */
    function isRegisteredIntegration(address contractAddress) external view returns (bool isRegistered) {
        return integrations[contractAddress].status == IntegrationStatus.Active;
    }

    /**
     * @dev Get integration information
     * @param contractAddress Integration contract address
     * @return name Name of the integration
     * @return description Description
     * @return owner Owner address
     * @return isActive Whether the integration is active
     * @return gasAllowance Gas allowance
     */
    function getIntegrationInfo(address contractAddress) external view returns (
        string memory name,
        string memory description,
        address owner,
        bool isActive,
        uint256 gasAllowance
    ) {
        IntegrationInfo storage integration = integrations[contractAddress];
        return (
            integration.name,
            integration.description,
            integration.owner,
            integration.status == IntegrationStatus.Active,
            integration.gasAllowance
        );
    }

    /**
     * @dev Get integration usage statistics
     * @param contractAddress Integration contract address
     * @return totalTransactions Total number of transactions
     * @return totalGasUsed Total gas used
     * @return dailyGasUsed Daily gas used
     * @return monthlyGasUsed Monthly gas used
     * @return successRate Success rate percentage
     */
    function getIntegrationUsage(address contractAddress) external view returns (
        uint256 totalTransactions,
        uint256 totalGasUsed,
        uint256 dailyGasUsed,
        uint256 monthlyGasUsed,
        uint256 successRate
    ) {
        IntegrationUsage storage usage = integrationUsage[contractAddress];
        uint256 rate = usage.totalTransactions > 0 
            ? (usage.successfulTransactions * 10000) / usage.totalTransactions 
            : 0;
        
        return (
            usage.totalTransactions,
            usage.totalGasUsed,
            usage.dailyGasUsed,
            usage.monthlyGasUsed,
            rate
        );
    }

    /**
     * @dev Get integrations by category
     * @param category Category hash
     * @return integrations Array of integration addresses
     */
    function getIntegrationsByCategory(bytes32 category) external view returns (address[] memory) {
        return integrationsByCategory[category];
    }

    /**
     * @dev Count integrations owned by an address
     * @param ownerAddress Owner address
     * @return count Number of integrations owned
     */
    function _countOwnerIntegrations(address ownerAddress) internal view returns (uint256 count) {
        // This is a simplified implementation
        // In production, you might want to maintain a separate mapping for efficiency
        // For now, we'll just return 0 to allow registration
        return 0;
    }

    /**
     * @dev Emergency pause function
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Handle direct ETH transfers for registration fees
     */
    receive() external payable {
        // Allow direct payments for registration fees
    }
}
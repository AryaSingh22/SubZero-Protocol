// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol"; 
import "@openzeppelin/contracts/security/ReentrancyGuard.sol"; 

interface ISubscriptionManagerV2 {
    function chargeSubscriber(uint256 subscriptionId) external returns (bool success);
    function isSubscriptionDue(uint256 subscriptionId) external view returns (bool);
    function getSubscriptionBatch(uint256 offset, uint256 limit) external view returns (uint256[] memory);
    function getSubscription(uint256 subscriptionId) external view returns (
        uint256 id,
        uint256 planId,
        address subscriber,
        uint256 startTime,
        uint256 nextPaymentTime,
        uint256 paymentCount,
        uint256 totalPaid,
        bool isActive,
        bool isPaused
    );
}

/**
 * @title GelatoSubscriptionAutomation
 * @dev Gelato Network integration for automated subscription billing
 * @notice This contract handles automated billing execution through Gelato's task automation
 */
contract GelatoSubscriptionAutomation is Ownable, ReentrancyGuard {
    
    // Gelato integration
    address public immutable gelato;
    address public gelatoTaskId;
    
    // Subscription manager
    ISubscriptionManagerV2 public subscriptionManager;
    
    // Automation configuration
    uint256 public maxBatchSize = 50;
    uint256 public executionInterval = 3600; // 1 hour in seconds
    uint256 public lastExecutionTime;
    uint256 public totalExecutions;
    uint256 public totalChargedSubscriptions;
    uint256 public failedCharges;
    
    // Gas management
    uint256 public gasBuffer = 50000; // Extra gas buffer for Gelato
    uint256 public maxGasPrice = 100 gwei;
    
    // Execution tracking
    mapping(uint256 => bool) public processedSubscriptions;
    mapping(address => bool) public authorizedExecutors;
    
    // Events
    event SubscriptionCharged(uint256 indexed subscriptionId, address indexed subscriber, uint256 amount, bool success);
    event BatchExecutionCompleted(uint256 processed, uint256 successful, uint256 failed, uint256 gasUsed);
    event AutomationConfigUpdated(uint256 maxBatchSize, uint256 executionInterval);
    event ExecutorAuthorized(address indexed executor, bool authorized);
    event GelatoTaskCreated(address indexed taskId);
    
    modifier onlyGelato() {
        require(msg.sender == gelato, "GelatoAutomation: only Gelato");
        _;
    }
    
    modifier onlyAuthorizedExecutor() {
        require(
            authorizedExecutors[msg.sender] || msg.sender == owner() || msg.sender == gelato,
            "GelatoAutomation: not authorized"
        );
        _;
    }

    constructor(
        address _gelato,
        address _subscriptionManager,
        address _owner
    ) {
        require(_gelato != address(0), "GelatoAutomation: invalid Gelato address");
        require(_subscriptionManager != address(0), "GelatoAutomation: invalid SubscriptionManager");
        
        gelato = _gelato;
        subscriptionManager = ISubscriptionManagerV2(_subscriptionManager);
        lastExecutionTime = block.timestamp;
        
        _transferOwnership(_owner);
    }

    /**
     * @dev Main execution function called by Gelato
     * @return canExec Whether execution should proceed
     * @return execPayload Encoded function call data
     */
    function checker() external view returns (bool canExec, bytes memory execPayload) {
        // Check if execution interval has passed
        if (block.timestamp < lastExecutionTime + executionInterval) {
            return (false, "");
        }
        
        // Get due subscriptions
        uint256[] memory dueSubscriptions = getDueSubscriptions();
        
        if (dueSubscriptions.length == 0) {
            return (false, "");
        }
        
        // Limit batch size
        uint256 batchSize = dueSubscriptions.length > maxBatchSize ? maxBatchSize : dueSubscriptions.length;
        uint256[] memory batch = new uint256[](batchSize);
        
        for (uint256 i = 0; i < batchSize; i++) {
            batch[i] = dueSubscriptions[i];
        }
        
        canExec = true;
        execPayload = abi.encodeWithSelector(
            this.executeBatch.selector,
            batch
        );
    }

    /**
     * @dev Execute batch billing for due subscriptions
     * @param subscriptionIds Array of subscription IDs to process
     */
    function executeBatch(uint256[] calldata subscriptionIds) 
        external 
        onlyAuthorizedExecutor 
        nonReentrant 
    {
        require(subscriptionIds.length > 0, "GelatoAutomation: empty batch");
        require(subscriptionIds.length <= maxBatchSize, "GelatoAutomation: batch too large");
        
        uint256 gasStart = gasleft();
        uint256 successful = 0;
        uint256 failed = 0;
        
        for (uint256 i = 0; i < subscriptionIds.length; i++) {
            uint256 subscriptionId = subscriptionIds[i];
            
            // Skip if already processed in this execution
            if (processedSubscriptions[subscriptionId]) {
                continue;
            }
            
            try subscriptionManager.chargeSubscriber(subscriptionId) returns (bool success) {
                if (success) {
                    successful++;
                    totalChargedSubscriptions++;
                    
                    // Get subscription details for event
                    (,, address subscriber,,,, uint256 totalPaid,,) = subscriptionManager.getSubscription(subscriptionId);
                    
                    emit SubscriptionCharged(subscriptionId, subscriber, totalPaid, true);
                } else {
                    failed++;
                    failedCharges++;
                    emit SubscriptionCharged(subscriptionId, address(0), 0, false);
                }
                
                processedSubscriptions[subscriptionId] = true;
            } catch {
                failed++;
                failedCharges++;
                emit SubscriptionCharged(subscriptionId, address(0), 0, false);
            }
        }
        
        uint256 gasUsed = gasStart - gasleft();
        lastExecutionTime = block.timestamp;
        totalExecutions++;
        
        // Clean up processed subscriptions mapping for next execution
        for (uint256 i = 0; i < subscriptionIds.length; i++) {
            processedSubscriptions[subscriptionIds[i]] = false;
        }
        
        emit BatchExecutionCompleted(subscriptionIds.length, successful, failed, gasUsed);
    }

    /**
     * @dev Get subscriptions that are due for payment
     * @return dueSubscriptions Array of due subscription IDs
     */
    function getDueSubscriptions() public view returns (uint256[] memory dueSubscriptions) {
        // This is a simplified implementation
        // In production, you'd want to query events or maintain an index
        
        uint256[] memory allSubscriptions = subscriptionManager.getSubscriptionBatch(0, 1000);
        uint256 dueCount = 0;
        
        // Count due subscriptions
        for (uint256 i = 0; i < allSubscriptions.length; i++) {
            if (subscriptionManager.isSubscriptionDue(allSubscriptions[i])) {
                dueCount++;
            }
        }
        
        // Build due subscriptions array
        dueSubscriptions = new uint256[](dueCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < allSubscriptions.length && index < dueCount; i++) {
            if (subscriptionManager.isSubscriptionDue(allSubscriptions[i])) {
                dueSubscriptions[index] = allSubscriptions[i];
                index++;
            }
        }
    }

    /**
     * @dev Manual execution function for testing or emergency use
     * @param subscriptionIds Array of subscription IDs to process
     */
    function manualExecute(uint256[] calldata subscriptionIds) 
        external 
        onlyAuthorizedExecutor 
    {
        executeBatch(subscriptionIds);
    }

    /**
     * @dev Set authorized executor
     * @param executor Executor address
     * @param authorized Whether the executor is authorized
     */
    function setAuthorizedExecutor(address executor, bool authorized) external onlyOwner {
        authorizedExecutors[executor] = authorized;
        emit ExecutorAuthorized(executor, authorized);
    }

    /**
     * @dev Update automation configuration
     * @param _maxBatchSize New maximum batch size
     * @param _executionInterval New execution interval in seconds
     */
    function updateConfig(
        uint256 _maxBatchSize,
        uint256 _executionInterval
    ) external onlyOwner {
        require(_maxBatchSize > 0 && _maxBatchSize <= 200, "GelatoAutomation: invalid batch size");
        require(_executionInterval >= 300, "GelatoAutomation: interval too short"); // Min 5 minutes
        
        maxBatchSize = _maxBatchSize;
        executionInterval = _executionInterval;
        
        emit AutomationConfigUpdated(_maxBatchSize, _executionInterval);
    }

    /**
     * @dev Update gas configuration
     * @param _gasBuffer New gas buffer
     * @param _maxGasPrice New maximum gas price
     */
    function updateGasConfig(uint256 _gasBuffer, uint256 _maxGasPrice) external onlyOwner {
        gasBuffer = _gasBuffer;
        maxGasPrice = _maxGasPrice;
    }

    /**
     * @dev Update subscription manager contract
     * @param _subscriptionManager New subscription manager address
     */
    function updateSubscriptionManager(address _subscriptionManager) external onlyOwner {
        require(_subscriptionManager != address(0), "GelatoAutomation: invalid address");
        subscriptionManager = ISubscriptionManagerV2(_subscriptionManager);
    }

    /**
     * @dev Get execution statistics
     * @return stats Execution statistics
     */
    function getExecutionStats() external view returns (
        uint256 totalExecs,
        uint256 totalCharged,
        uint256 totalFailed,
        uint256 lastExecTime,
        uint256 nextExecTime
    ) {
        return (
            totalExecutions,
            totalChargedSubscriptions,
            failedCharges,
            lastExecutionTime,
            lastExecutionTime + executionInterval
        );
    }

    /**
     * @dev Emergency function to withdraw any stuck ETH
     * @param recipient Address to receive ETH
     */
    function emergencyWithdraw(address payable recipient) external onlyOwner {
        require(recipient != address(0), "GelatoAutomation: invalid recipient");
        uint256 balance = address(this).balance;
        if (balance > 0) {
            recipient.transfer(balance);
        }
    }

    /**
     * @dev Receive ETH for gas payments
     */
    receive() external payable {
        // Allow contract to receive ETH for gas payments
    }
}

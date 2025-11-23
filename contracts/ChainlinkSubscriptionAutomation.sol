// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";  
import "@openzeppelin/contracts/security/ReentrancyGuard.sol"; 

// Chainlink Automation interfaces
interface IKeeperCompatible {
    function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

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
 * @title ChainlinkSubscriptionAutomation
 * @dev Chainlink Automation (formerly Chainlink Keepers) integration for automated subscription billing
 * @notice This contract handles automated billing execution through Chainlink's decentralized automation network
 */
contract ChainlinkSubscriptionAutomation is IKeeperCompatible, Ownable, ReentrancyGuard {
    
    // Subscription manager
    ISubscriptionManagerV2 public subscriptionManager;
    
    // Automation configuration
    uint256 public maxBatchSize = 50;
    uint256 public minInterval = 3600; // Minimum 1 hour between executions
    uint256 public lastPerformTime;
    uint256 public totalPerformances;
    uint256 public totalChargedSubscriptions;
    uint256 public failedCharges;
    
    // Gas management
    uint256 public gasLimit = 2000000; // 2M gas limit for upkeep
    uint256 public maxGasPrice = 100 gwei;
    
    // Keeper configuration
    mapping(address => bool) public authorizedKeepers;
    bool public automationEnabled = true;
    
    // Performance tracking
    struct PerformanceMetrics {
        uint256 timestamp;
        uint256 subscriptionsProcessed;
        uint256 successfulCharges;
        uint256 failedCharges;
        uint256 gasUsed;
        uint256 executionTime;
    }
    
    mapping(uint256 => PerformanceMetrics) public performanceHistory;
    uint256 public performanceHistoryLength;
    
    // Events
    event SubscriptionCharged(uint256 indexed subscriptionId, address indexed subscriber, uint256 amount, bool success);
    event UpkeepPerformed(uint256 indexed performanceId, uint256 processed, uint256 successful, uint256 failed);
    event AutomationConfigUpdated(uint256 maxBatchSize, uint256 minInterval, bool enabled);
    event KeeperAuthorized(address indexed keeper, bool authorized);
    event PerformanceRecorded(uint256 indexed performanceId, uint256 gasUsed, uint256 executionTime);
    
    modifier onlyAuthorizedKeeper() {
        require(
            authorizedKeepers[msg.sender] || msg.sender == owner(),
            "ChainlinkAutomation: not authorized keeper"
        );
        _;
    }
    
    modifier automationActive() {
        require(automationEnabled, "ChainlinkAutomation: automation disabled");
        _;
    }

    constructor(
        address _subscriptionManager,
        address _owner
    ) {
        require(_subscriptionManager != address(0), "ChainlinkAutomation: invalid SubscriptionManager");
        
        subscriptionManager = ISubscriptionManagerV2(_subscriptionManager);
        lastPerformTime = block.timestamp;
        
        _transferOwnership(_owner);
    }

    /**
     * @dev Chainlink Automation checkUpkeep function
     * @param checkData Encoded check parameters (unused in this implementation)
     * @return upkeepNeeded Whether upkeep should be performed
     * @return performData Encoded data for performUpkeep
     */
    function checkUpkeep(bytes calldata checkData) 
        external 
        view 
        override 
        returns (bool upkeepNeeded, bytes memory performData) 
    {
        checkData; // Silence unused parameter warning
        
        if (!automationEnabled) {
            return (false, "");
        }
        
        // Check if minimum interval has passed
        if (block.timestamp < lastPerformTime + minInterval) {
            return (false, "");
        }
        
        // Get due subscriptions
        uint256[] memory dueSubscriptions = getDueSubscriptionsView();
        
        if (dueSubscriptions.length == 0) {
            return (false, "");
        }
        
        // Limit batch size for gas efficiency
        uint256 batchSize = dueSubscriptions.length > maxBatchSize ? maxBatchSize : dueSubscriptions.length;
        uint256[] memory batch = new uint256[](batchSize);
        
        for (uint256 i = 0; i < batchSize; i++) {
            batch[i] = dueSubscriptions[i];
        }
        
        upkeepNeeded = true;
        performData = abi.encode(batch);
    }

    /**
     * @dev Chainlink Automation performUpkeep function
     * @param performData Encoded subscription IDs to process
     */
    function performUpkeep(bytes calldata performData) 
        external 
        override 
        onlyAuthorizedKeeper 
        automationActive 
        nonReentrant 
    {
        uint256 startTime = block.timestamp;
        uint256 gasStart = gasleft();
        
        uint256[] memory subscriptionIds = abi.decode(performData, (uint256[]));
        
        require(subscriptionIds.length > 0, "ChainlinkAutomation: no subscriptions to process");
        require(subscriptionIds.length <= maxBatchSize, "ChainlinkAutomation: batch too large");
        
        uint256 successful = 0;
        uint256 failed = 0;
        
        // Process each subscription
        for (uint256 i = 0; i < subscriptionIds.length; i++) {
            uint256 subscriptionId = subscriptionIds[i];
            
            // Verify subscription is still due (prevent front-running)
            if (!subscriptionManager.isSubscriptionDue(subscriptionId)) {
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
            } catch {
                failed++;
                failedCharges++;
                emit SubscriptionCharged(subscriptionId, address(0), 0, false);
            }
        }
        
        // Update performance metrics
        uint256 gasUsed = gasStart - gasleft();
        uint256 executionTime = block.timestamp - startTime;
        
        lastPerformTime = block.timestamp;
        totalPerformances++;
        
        // Record performance metrics
        performanceHistory[performanceHistoryLength] = PerformanceMetrics({
            timestamp: block.timestamp,
            subscriptionsProcessed: subscriptionIds.length,
            successfulCharges: successful,
            failedCharges: failed,
            gasUsed: gasUsed,
            executionTime: executionTime
        });
        
        emit UpkeepPerformed(performanceHistoryLength, subscriptionIds.length, successful, failed);
        emit PerformanceRecorded(performanceHistoryLength, gasUsed, executionTime);
        
        performanceHistoryLength++;
    }

    /**
     * @dev Get subscriptions that are due for payment (view function for checkUpkeep)
     * @return dueSubscriptions Array of due subscription IDs
     */
    function getDueSubscriptionsView() public view returns (uint256[] memory dueSubscriptions) {
        // This is a simplified implementation for demonstration
        // In production, you'd want to maintain an efficient index or use events
        
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
    function manualPerformUpkeep(uint256[] calldata subscriptionIds) 
        external 
        onlyAuthorizedKeeper 
    {
        bytes memory performData = abi.encode(subscriptionIds);
        this.performUpkeep(performData);
    }

    /**
     * @dev Set authorized keeper
     * @param keeper Keeper address
     * @param authorized Whether the keeper is authorized
     */
    function setAuthorizedKeeper(address keeper, bool authorized) external onlyOwner {
        authorizedKeepers[keeper] = authorized;
        emit KeeperAuthorized(keeper, authorized);
    }

    /**
     * @dev Enable or disable automation
     * @param enabled Whether automation is enabled
     */
    function setAutomationEnabled(bool enabled) external onlyOwner {
        automationEnabled = enabled;
        emit AutomationConfigUpdated(maxBatchSize, minInterval, enabled);
    }

    /**
     * @dev Update automation configuration
     * @param _maxBatchSize New maximum batch size
     * @param _minInterval New minimum interval between executions
     */
    function updateConfig(
        uint256 _maxBatchSize,
        uint256 _minInterval
    ) external onlyOwner {
        require(_maxBatchSize > 0 && _maxBatchSize <= 200, "ChainlinkAutomation: invalid batch size");
        require(_minInterval >= 300, "ChainlinkAutomation: interval too short"); // Min 5 minutes
        
        maxBatchSize = _maxBatchSize;
        minInterval = _minInterval;
        
        emit AutomationConfigUpdated(_maxBatchSize, _minInterval, automationEnabled);
    }

    /**
     * @dev Update gas configuration
     * @param _gasLimit New gas limit for upkeep
     * @param _maxGasPrice New maximum gas price
     */
    function updateGasConfig(uint256 _gasLimit, uint256 _maxGasPrice) external onlyOwner {
        gasLimit = _gasLimit;
        maxGasPrice = _maxGasPrice;
    }

    /**
     * @dev Update subscription manager contract
     * @param _subscriptionManager New subscription manager address
     */
    function updateSubscriptionManager(address _subscriptionManager) external onlyOwner {
        require(_subscriptionManager != address(0), "ChainlinkAutomation: invalid address");
        subscriptionManager = ISubscriptionManagerV2(_subscriptionManager);
    }

    /**
     * @dev Get automation statistics
     * @return totalPerforms Total number of performances
     * @return totalCharged Total charged subscriptions
     * @return totalFailed Total failed charges
     * @return lastPerform Last performance time
     * @return nextEligiblePerform Next eligible performance time
     * @return isEnabled Whether automation is enabled
     */
    function getAutomationStats() external view returns (
        uint256 totalPerforms,
        uint256 totalCharged,
        uint256 totalFailed,
        uint256 lastPerform,
        uint256 nextEligiblePerform,
        bool isEnabled
    ) {
        return (
            totalPerformances,
            totalChargedSubscriptions,
            failedCharges,
            lastPerformTime,
            lastPerformTime + minInterval,
            automationEnabled
        );
    }

    /**
     * @dev Get performance metrics for a specific execution
     * @param performanceId Performance ID to query
     * @return metrics Performance metrics
     */
    function getPerformanceMetrics(uint256 performanceId) 
        external 
        view 
        returns (PerformanceMetrics memory metrics) 
    {
        require(performanceId < performanceHistoryLength, "ChainlinkAutomation: invalid performance ID");
        return performanceHistory[performanceId];
    }

    /**
     * @dev Get recent performance summary
     * @param count Number of recent performances to analyze
     * @return avgGasUsed Average gas used per performance
     * @return avgSuccessRate Average success rate percentage
     * @return avgExecutionTime Average execution time
     */
    function getPerformanceSummary(uint256 count) 
        external 
        view 
        returns (uint256 avgGasUsed, uint256 avgSuccessRate, uint256 avgExecutionTime) 
    {
        if (performanceHistoryLength == 0 || count == 0) {
            return (0, 0, 0);
        }
        
        uint256 startIndex = performanceHistoryLength > count ? performanceHistoryLength - count : 0;
        uint256 totalGas = 0;
        uint256 totalSuccessful = 0;
        uint256 totalProcessed = 0;
        uint256 totalTime = 0;
        uint256 samples = 0;
        
        for (uint256 i = startIndex; i < performanceHistoryLength; i++) {
            PerformanceMetrics memory metrics = performanceHistory[i];
            totalGas += metrics.gasUsed;
            totalSuccessful += metrics.successfulCharges;
            totalProcessed += metrics.subscriptionsProcessed;
            totalTime += metrics.executionTime;
            samples++;
        }
        
        if (samples > 0) {
            avgGasUsed = totalGas / samples;
            avgSuccessRate = totalProcessed > 0 ? (totalSuccessful * 10000) / totalProcessed : 0; // Basis points
            avgExecutionTime = totalTime / samples;
        }
    }

    /**
     * @dev Emergency function to withdraw any stuck ETH
     * @param recipient Address to receive ETH
     */
    function emergencyWithdraw(address payable recipient) external onlyOwner {
        require(recipient != address(0), "ChainlinkAutomation: invalid recipient");
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

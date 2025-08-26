// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./SmartWallet.sol";

/**
 * @title SubscriptionManager
 * @dev Manages gasless subscription plans and billing using ERC-4337 account abstraction
 * @notice This contract handles subscription plans, user subscriptions, and automated billing
 */
contract SubscriptionManager is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // Subscription plan structure
    struct SubscriptionPlan {
        uint256 planId;
        string name;
        string description;
        address paymentToken;
        uint256 price;
        uint256 billingInterval; // in seconds
        uint256 maxSubscriptions; // 0 for unlimited
        uint256 currentSubscriptions;
        bool isActive;
        address beneficiary; // who receives the payments
        uint256 createdAt;
    }

    // User subscription structure
    struct UserSubscription {
        uint256 subscriptionId;
        uint256 planId;
        address subscriber; // SmartWallet address
        address owner; // actual user who owns the SmartWallet
        uint256 startTime;
        uint256 nextBillingTime;
        uint256 lastChargedTime;
        uint256 totalPayments;
        bool isActive;
        bool autoRenew;
    }

    // State variables
    mapping(uint256 => SubscriptionPlan) public subscriptionPlans;
    mapping(uint256 => UserSubscription) public userSubscriptions;
    mapping(address => uint256[]) public userSubscriptionIds;
    mapping(uint256 => uint256[]) public planSubscriptionIds;
    mapping(address => bool) public authorizedRelayers;
    
    uint256 public nextPlanId;
    uint256 public nextSubscriptionId;
    uint256 public maxBatchSize = 50;
    uint256 public gracePeriod = 7 days; // Grace period for failed payments
    uint256 public platformFeePercentage = 250; // 2.5% platform fee (basis points)
    address public platformFeeRecipient;

    // Events
    event PlanCreated(
        uint256 indexed planId,
        string name,
        address indexed paymentToken,
        uint256 price,
        uint256 billingInterval,
        address indexed beneficiary
    );

    event Subscribed(
        uint256 indexed subscriptionId,
        uint256 indexed planId,
        address indexed subscriber,
        address owner,
        uint256 timestamp
    );

    event Charged(
        uint256 indexed subscriptionId,
        address indexed subscriber,
        uint256 amount,
        uint256 platformFee,
        uint256 timestamp
    );

    event Unsubscribed(
        uint256 indexed subscriptionId,
        address indexed subscriber,
        uint256 timestamp,
        string reason
    );

    event PlanUpdated(uint256 indexed planId, bool isActive);
    event RelayerAuthorized(address indexed relayer, bool authorized);
    event PlatformFeeUpdated(uint256 newFeePercentage, address newRecipient);

    modifier onlyAuthorizedRelayer() {
        require(authorizedRelayers[msg.sender] || msg.sender == owner(), "SubscriptionManager: unauthorized relayer");
        _;
    }

    modifier validPlan(uint256 planId) {
        require(planId < nextPlanId, "SubscriptionManager: invalid plan ID");
        require(subscriptionPlans[planId].isActive, "SubscriptionManager: plan not active");
        _;
    }

    modifier validSubscription(uint256 subscriptionId) {
        require(subscriptionId < nextSubscriptionId, "SubscriptionManager: invalid subscription ID");
        _;
    }

    constructor(address _platformFeeRecipient) {
        require(_platformFeeRecipient != address(0), "SubscriptionManager: invalid fee recipient");
        platformFeeRecipient = _platformFeeRecipient;
        _transferOwnership(msg.sender);
    }

    /**
     * @dev Create a new subscription plan
     * @param name Plan name
     * @param description Plan description
     * @param paymentToken Token address for payments
     * @param price Price per billing cycle
     * @param billingInterval Billing interval in seconds
     * @param maxSubscriptions Maximum number of subscriptions (0 for unlimited)
     * @param beneficiary Address that receives payments
     */
    function createPlan(
        string calldata name,
        string calldata description,
        address paymentToken,
        uint256 price,
        uint256 billingInterval,
        uint256 maxSubscriptions,
        address beneficiary
    ) external onlyOwner returns (uint256 planId) {
        require(bytes(name).length > 0, "SubscriptionManager: invalid name");
        require(paymentToken != address(0), "SubscriptionManager: invalid token");
        require(price > 0, "SubscriptionManager: invalid price");
        require(billingInterval > 0, "SubscriptionManager: invalid interval");
        require(beneficiary != address(0), "SubscriptionManager: invalid beneficiary");

        planId = nextPlanId++;
        
        subscriptionPlans[planId] = SubscriptionPlan({
            planId: planId,
            name: name,
            description: description,
            paymentToken: paymentToken,
            price: price,
            billingInterval: billingInterval,
            maxSubscriptions: maxSubscriptions,
            currentSubscriptions: 0,
            isActive: true,
            beneficiary: beneficiary,
            createdAt: block.timestamp
        });

        emit PlanCreated(planId, name, paymentToken, price, billingInterval, beneficiary);
    }

    /**
     * @dev Subscribe to a plan (gasless for user)
     * @param planId Plan ID to subscribe to
     * @param smartWallet User's SmartWallet address
     * @param owner Actual owner of the SmartWallet
     * @param autoRenew Whether to auto-renew the subscription
     */
    function subscribe(
        uint256 planId,
        address smartWallet,
        address owner,
        bool autoRenew
    ) external onlyAuthorizedRelayer validPlan(planId) whenNotPaused returns (uint256 subscriptionId) {
        SubscriptionPlan storage plan = subscriptionPlans[planId];
        
        // Check max subscriptions limit
        if (plan.maxSubscriptions > 0) {
            require(
                plan.currentSubscriptions < plan.maxSubscriptions,
                "SubscriptionManager: max subscriptions reached"
            );
        }

        // Verify SmartWallet ownership
        require(SmartWallet(payable(smartWallet)).owner() == owner, "SubscriptionManager: invalid wallet owner");

        subscriptionId = nextSubscriptionId++;
        
        userSubscriptions[subscriptionId] = UserSubscription({
            subscriptionId: subscriptionId,
            planId: planId,
            subscriber: smartWallet,
            owner: owner,
            startTime: block.timestamp,
            nextBillingTime: block.timestamp + plan.billingInterval,
            lastChargedTime: 0,
            totalPayments: 0,
            isActive: true,
            autoRenew: autoRenew
        });

        // Update plan subscription count
        plan.currentSubscriptions++;
        
        // Track user subscriptions
        userSubscriptionIds[smartWallet].push(subscriptionId);
        planSubscriptionIds[planId].push(subscriptionId);

        emit Subscribed(subscriptionId, planId, smartWallet, owner, block.timestamp);
    }

    /**
     * @dev Charge a subscriber (called by relayers or during batch processing)
     * @param subscriptionId Subscription ID to charge
     */
    function chargeSubscriber(
        uint256 subscriptionId
    ) external onlyAuthorizedRelayer nonReentrant validSubscription(subscriptionId) whenNotPaused {
        UserSubscription storage subscription = userSubscriptions[subscriptionId];
        require(subscription.isActive, "SubscriptionManager: subscription not active");
        require(
            block.timestamp >= subscription.nextBillingTime,
            "SubscriptionManager: billing not due"
        );

        SubscriptionPlan storage plan = subscriptionPlans[subscription.planId];
        require(plan.isActive, "SubscriptionManager: plan not active");

        SmartWallet wallet = SmartWallet(payable(subscription.subscriber));
        
        // Check if wallet has sufficient approval
        uint256 approval = wallet.getSubscriptionApproval(plan.paymentToken, address(this));
        if (approval < plan.price) {
            _handleFailedPayment(subscriptionId, "insufficient approval");
            return;
        }

        // Check if wallet has sufficient balance
        IERC20 token = IERC20(plan.paymentToken);
        uint256 balance = token.balanceOf(subscription.subscriber);
        if (balance < plan.price) {
            _handleFailedPayment(subscriptionId, "insufficient balance");
            return;
        }

        // Calculate platform fee
        uint256 platformFee = (plan.price * platformFeePercentage) / 10000;
        uint256 beneficiaryAmount = plan.price - platformFee;

        try wallet.executeSubscriptionPayment(plan.paymentToken, plan.beneficiary, beneficiaryAmount) {
            // Transfer platform fee if any
            if (platformFee > 0) {
                wallet.executeSubscriptionPayment(plan.paymentToken, platformFeeRecipient, platformFee);
            }

            // Update subscription
            subscription.lastChargedTime = block.timestamp;
            subscription.nextBillingTime = block.timestamp + plan.billingInterval;
            subscription.totalPayments++;

            emit Charged(subscriptionId, subscription.subscriber, plan.price, platformFee, block.timestamp);
        } catch {
            _handleFailedPayment(subscriptionId, "transfer failed");
        }
    }

    /**
     * @dev Batch charge multiple subscribers
     * @param subscriptionIds Array of subscription IDs to charge
     */
    function batchChargeSubscribers(
        uint256[] calldata subscriptionIds
    ) external onlyAuthorizedRelayer nonReentrant whenNotPaused {
        require(subscriptionIds.length <= maxBatchSize, "SubscriptionManager: batch too large");

        for (uint256 i = 0; i < subscriptionIds.length; i++) {
            if (subscriptionIds[i] < nextSubscriptionId) {
                UserSubscription storage subscription = userSubscriptions[subscriptionIds[i]];
                
                if (subscription.isActive && 
                    block.timestamp >= subscription.nextBillingTime &&
                    subscriptionPlans[subscription.planId].isActive) {
                    
                    // Use internal charge logic without reentrancy protection
                    _chargeSubscriberInternal(subscriptionIds[i]);
                }
            }
        }
    }

    /**
     * @dev Unsubscribe from a plan (emergency function, can be called by user)
     * @param subscriptionId Subscription ID to cancel
     */
    function unsubscribe(uint256 subscriptionId) external validSubscription(subscriptionId) {
        UserSubscription storage subscription = userSubscriptions[subscriptionId];
        require(subscription.isActive, "SubscriptionManager: already inactive");
        
        // Allow unsubscribe by owner of the SmartWallet or authorized relayer
        require(
            SmartWallet(payable(subscription.subscriber)).owner() == msg.sender ||
            authorizedRelayers[msg.sender] ||
            msg.sender == owner(),
            "SubscriptionManager: unauthorized"
        );

        subscription.isActive = false;
        
        // Decrease plan subscription count
        subscriptionPlans[subscription.planId].currentSubscriptions--;

        emit Unsubscribed(subscriptionId, subscription.subscriber, block.timestamp, "user initiated");
    }

    /**
     * @dev Get subscription details
     * @param subscriptionId Subscription ID
     */
    function getSubscription(uint256 subscriptionId) external view validSubscription(subscriptionId) returns (UserSubscription memory) {
        return userSubscriptions[subscriptionId];
    }

    /**
     * @dev Get subscription plan details
     * @param planId Plan ID
     */
    function getPlan(uint256 planId) external view returns (SubscriptionPlan memory) {
        require(planId < nextPlanId, "SubscriptionManager: invalid plan ID");
        return subscriptionPlans[planId];
    }

    /**
     * @dev Get user's subscription IDs
     * @param user User's SmartWallet address
     */
    function getUserSubscriptions(address user) external view returns (uint256[] memory) {
        return userSubscriptionIds[user];
    }

    /**
     * @dev Get subscriptions for a plan
     * @param planId Plan ID
     */
    function getPlanSubscriptions(uint256 planId) external view returns (uint256[] memory) {
        return planSubscriptionIds[planId];
    }

    /**
     * @dev Get subscriptions due for billing
     * @param limit Maximum number of subscriptions to return
     */
    function getSubscriptionsDue(uint256 limit) external view returns (uint256[] memory) {
        uint256[] memory dueSubscriptions = new uint256[](limit);
        uint256 count = 0;
        
        for (uint256 i = 0; i < nextSubscriptionId && count < limit; i++) {
            UserSubscription storage subscription = userSubscriptions[i];
            if (subscription.isActive && 
                block.timestamp >= subscription.nextBillingTime &&
                subscriptionPlans[subscription.planId].isActive) {
                dueSubscriptions[count] = i;
                count++;
            }
        }
        
        // Resize array to actual count
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = dueSubscriptions[i];
        }
        
        return result;
    }

    /**
     * @dev Authorize or revoke relayer
     * @param relayer Relayer address
     * @param authorized Whether to authorize or revoke
     */
    function setRelayerAuthorization(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
        emit RelayerAuthorized(relayer, authorized);
    }

    /**
     * @dev Update platform fee
     * @param newFeePercentage New fee percentage (basis points)
     * @param newRecipient New fee recipient
     */
    function updatePlatformFee(uint256 newFeePercentage, address newRecipient) external onlyOwner {
        require(newFeePercentage <= 1000, "SubscriptionManager: fee too high"); // Max 10%
        require(newRecipient != address(0), "SubscriptionManager: invalid recipient");
        
        platformFeePercentage = newFeePercentage;
        platformFeeRecipient = newRecipient;
        
        emit PlatformFeeUpdated(newFeePercentage, newRecipient);
    }

    /**
     * @dev Update plan status
     * @param planId Plan ID
     * @param isActive New status
     */
    function updatePlanStatus(uint256 planId, bool isActive) external onlyOwner {
        require(planId < nextPlanId, "SubscriptionManager: invalid plan ID");
        subscriptionPlans[planId].isActive = isActive;
        emit PlanUpdated(planId, isActive);
    }

    /**
     * @dev Set maximum batch size
     * @param newMaxBatchSize New maximum batch size
     */
    function setMaxBatchSize(uint256 newMaxBatchSize) external onlyOwner {
        require(newMaxBatchSize > 0, "SubscriptionManager: invalid batch size");
        maxBatchSize = newMaxBatchSize;
    }

    /**
     * @dev Pause the contract
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
     * @dev Internal function to charge a subscriber (without reentrancy guard)
     * @param subscriptionId Subscription ID
     */
    function _chargeSubscriberInternal(uint256 subscriptionId) internal {
        UserSubscription storage subscription = userSubscriptions[subscriptionId];
        SubscriptionPlan storage plan = subscriptionPlans[subscription.planId];

        SmartWallet wallet = SmartWallet(payable(subscription.subscriber));
        
        // Check approval and balance
        uint256 approval = wallet.getSubscriptionApproval(plan.paymentToken, address(this));
        IERC20 token = IERC20(plan.paymentToken);
        uint256 balance = token.balanceOf(subscription.subscriber);
        
        if (approval < plan.price || balance < plan.price) {
            _handleFailedPayment(subscriptionId, approval < plan.price ? "insufficient approval" : "insufficient balance");
            return;
        }

        // Calculate platform fee
        uint256 platformFee = (plan.price * platformFeePercentage) / 10000;
        uint256 beneficiaryAmount = plan.price - platformFee;

        try wallet.executeSubscriptionPayment(plan.paymentToken, plan.beneficiary, beneficiaryAmount) {
            // Transfer platform fee if any
            if (platformFee > 0) {
                wallet.executeSubscriptionPayment(plan.paymentToken, platformFeeRecipient, platformFee);
            }

            // Update subscription
            subscription.lastChargedTime = block.timestamp;
            subscription.nextBillingTime = block.timestamp + plan.billingInterval;
            subscription.totalPayments++;

            emit Charged(subscriptionId, subscription.subscriber, plan.price, platformFee, block.timestamp);
        } catch {
            _handleFailedPayment(subscriptionId, "transfer failed");
        }
    }

    /**
     * @dev Handle failed payment
     * @param subscriptionId Subscription ID
     * @param reason Failure reason
     */
    function _handleFailedPayment(uint256 subscriptionId, string memory reason) internal {
        UserSubscription storage subscription = userSubscriptions[subscriptionId];
        
        // If grace period has passed, cancel subscription
        if (block.timestamp >= subscription.nextBillingTime + gracePeriod) {
            subscription.isActive = false;
            subscriptionPlans[subscription.planId].currentSubscriptions--;
            
            emit Unsubscribed(subscriptionId, subscription.subscriber, block.timestamp, reason);
        }
        // Otherwise, extend next billing time by 1 day for retry
        else {
            subscription.nextBillingTime = block.timestamp + 1 days;
        }
    }
}
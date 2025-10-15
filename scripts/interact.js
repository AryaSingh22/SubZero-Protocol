const { ethers } = require("hardhat");

async function main() {
  // Replace with your deployed contract addresses
  const SUBSCRIPTION_SYSTEM_ADDRESS = "YOUR_DEPLOYED_ADDRESS_HERE";
  const TOKEN_ADDRESS = "YOUR_TOKEN_ADDRESS_HERE";

  const [deployer, subscriber, recipient] = await ethers.getSigners();

  // Get contract instances
  const SubscriptionPaymentSystem = await ethers.getContractFactory("SubscriptionPaymentSystem"); 
  const subscriptionSystem = SubscriptionPaymentSystem.attach(SUBSCRIPTION_SYSTEM_ADDRESS);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = MockERC20.attach(TOKEN_ADDRESS);

  console.log("Interacting with SubscriptionPaymentSystem...");
  console.log("Contract address:", SUBSCRIPTION_SYSTEM_ADDRESS);

  // Example: Create a subscription
  const paymentAmount = ethers.parseEther("10"); // 10 tokens
  const paymentInterval = 86400; // 1 day in seconds

  try {
    // First, approve the subscription system to spend tokens
    console.log("\n1. Approving tokens...");
    const approveTx = await token.connect(subscriber).approve(SUBSCRIPTION_SYSTEM_ADDRESS, paymentAmount * 10n);
    await approveTx.wait();
    console.log("Tokens approved!");

    // Create subscription
    console.log("\n2. Creating subscription...");
    const createTx = await subscriptionSystem.connect(subscriber).createSubscription(
      recipient.address,
      TOKEN_ADDRESS,
      paymentAmount,
      paymentInterval,
      0, // unlimited payments
      0  // no expiration
    );
    const receipt = await createTx.wait();
    console.log("Subscription created! Transaction hash:", receipt.hash);

    // Get subscription details
    console.log("\n3. Getting subscription details...");
    const subscription = await subscriptionSystem.getSubscription(0);
    console.log("Subscription details:", {
      subscriber: subscription.subscriber,
      recipient: subscription.recipient,
      amount: ethers.formatEther(subscription.amount),
      interval: subscription.interval.toString(),
      status: subscription.status.toString(),
      paymentCount: subscription.paymentCount.toString()
    });

    // Check user subscriptions
    console.log("\n4. Getting user subscriptions...");
    const userSubs = await subscriptionSystem.getUserSubscriptions(subscriber.address);
    console.log("User subscriptions:", userSubs.map(id => id.toString()));

    // Simulate time passing and pull payment (in real scenario, this would be done by Chainlink Keeper)
    console.log("\n5. Simulating payment pull...");
    console.log("Note: In production, payments would be pulled automatically by Chainlink Keepers");
    console.log("or triggered by off-chain services when due.");

  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Helper function to check if payments are due
async function checkDuePayments(subscriptionSystemAddress) {
  const SubscriptionPaymentSystem = await ethers.getContractFactory("SubscriptionPaymentSystem");
  const subscriptionSystem = SubscriptionPaymentSystem.attach(subscriptionSystemAddress);

  console.log("Checking for due payments...");
  const [upkeepNeeded, performData] = await subscriptionSystem.checkUpkeep("0x");
  
  if (upkeepNeeded) {
    console.log("Payments are due! Perform data:", performData);
    const subscriptionIds = ethers.AbiCoder.defaultAbiCoder().decode(["uint256[]"], performData)[0];
    console.log("Due subscription IDs:", subscriptionIds.map(id => id.toString()));
  } else {
    console.log("No payments due at this time.");
  }
}

// Helper function to pull payments manually
async function pullPayments(subscriptionSystemAddress, subscriptionIds) {
  const SubscriptionPaymentSystem = await ethers.getContractFactory("SubscriptionPaymentSystem");
  const subscriptionSystem = SubscriptionPaymentSystem.attach(subscriptionSystemAddress);

  console.log("Pulling payments for subscriptions:", subscriptionIds);
  
  try {
    const tx = await subscriptionSystem.batchPullPayments(subscriptionIds);
    const receipt = await tx.wait();
    console.log("Payments pulled! Transaction hash:", receipt.hash);
  } catch (error) {
    console.error("Error pulling payments:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

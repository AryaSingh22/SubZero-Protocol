const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
  console.log("🔄 Simple Gasless Subscription Interaction...");

  // Load deployment info
  let deploymentInfo;
  try {
    const deploymentData = fs.readFileSync('deployment.json', 'utf8');
    deploymentInfo = JSON.parse(deploymentData);
    console.log("📋 Loaded deployment info");
  } catch (error) {
    console.error("❌ Could not load deployment.json. Please deploy first with: npx hardhat run scripts/deploy-gasless.js");
    process.exit(1);
  }

  const [deployer, user] = await ethers.getSigners();
  console.log("\n👥 Accounts:");
  console.log("├─ Deployer:", deployer.address);
  console.log("└─ User:", user.address);

  // Get contract instances
  const mockToken = await ethers.getContractAt("MockERC20", deploymentInfo.contracts.mockERC20);
  const subscriptionManager = await ethers.getContractAt("SubscriptionManager", deploymentInfo.contracts.subscriptionManager);
  const paymaster = await ethers.getContractAt("SubscriptionPaymaster", deploymentInfo.contracts.subscriptionPaymaster);
  const walletFactory = await ethers.getContractAt("SmartWalletFactory", deploymentInfo.contracts.smartWalletFactory);

  // Check system status
  console.log("\n📊 System Status:");
  const paymasterBalance = await paymaster.getBalance();
  const plan = await subscriptionManager.getPlan(0);
  
  console.log("├─ Paymaster balance:", ethers.formatEther(paymasterBalance), "ETH");
  console.log("├─ Sample plan price:", ethers.formatEther(plan.price), "TEST tokens");
  console.log("├─ Billing interval:", plan.billingInterval / (24 * 60 * 60), "days");
  console.log("└─ Plan active:", plan.isActive);

  // Create or get user wallet
  console.log("\n👛 User SmartWallet:");
  let userWalletAddress;
  const isDeployed = await walletFactory.isWalletDeployed(user.address, 0);
  
  if (!isDeployed) {
    console.log("├─ Creating new SmartWallet...");
    const createTx = await walletFactory.createWallet(user.address, 0);
    await createTx.wait();
    userWalletAddress = await walletFactory.getWalletAddress(user.address, 0);
    console.log("├─ SmartWallet created:", userWalletAddress);
  } else {
    userWalletAddress = await walletFactory.getWalletAddress(user.address, 0);
    console.log("├─ Using existing SmartWallet:", userWalletAddress);
  }

  // Fund user wallet
  const userWalletBalance = await mockToken.balanceOf(userWalletAddress);
  console.log("├─ Current balance:", ethers.formatEther(userWalletBalance), "TEST");
  
  if (userWalletBalance < ethers.parseEther("50")) {
    console.log("├─ Funding wallet with tokens...");
    await mockToken.transfer(userWalletAddress, ethers.parseEther("100"));
    console.log("└─ Transferred 100 TEST tokens");
  } else {
    console.log("└─ Wallet has sufficient balance");
  }

  // Check subscription status
  console.log("\n📋 Subscription Status:");
  const userSubscriptions = await subscriptionManager.getUserSubscriptions(userWalletAddress);
  console.log("├─ Total subscriptions:", userSubscriptions.length);
  
  if (userSubscriptions.length > 0) {
    for (let i = 0; i < userSubscriptions.length; i++) {
      const sub = await subscriptionManager.getSubscription(userSubscriptions[i]);
      console.log(`├─ Subscription ${i}:`);
      console.log(`│  ├─ ID: ${sub.subscriptionId}`);
      console.log(`│  ├─ Active: ${sub.isActive}`);
      console.log(`│  ├─ Payments made: ${sub.totalPayments}`);
      console.log(`│  └─ Next billing: ${new Date(Number(sub.nextBillingTime) * 1000).toLocaleString()}`);
    }
  } else {
    console.log("└─ No subscriptions found");
  }

  // Check for due subscriptions
  console.log("\n⏰ Billing Status:");
  const subscriptionsDue = await subscriptionManager.getSubscriptionsDue(10);
  console.log("├─ Subscriptions due:", subscriptionsDue.length);
  
  if (subscriptionsDue.length > 0) {
    console.log("├─ Due subscription IDs:", subscriptionsDue.map(id => id.toString()).join(", "));
    console.log("└─ Run billing with: npx hardhat run scripts/process-billing.js");
  } else {
    console.log("└─ No subscriptions due for billing");
  }

  // Show available actions
  console.log("\n🚀 Available Actions:");
  console.log("├─ Create subscription approval: Use EIP-712 signing");
  console.log("├─ Subscribe to plan: Call SubscriptionManager.subscribe()");
  console.log("├─ Process billing: Run billing script for due subscriptions");
  console.log("└─ Emergency unsubscribe: Call SubscriptionManager.unsubscribe()");

  console.log("\n✅ Interaction completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Interaction failed:", error);
    process.exit(1);
  });
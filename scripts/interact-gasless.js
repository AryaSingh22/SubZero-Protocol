const { ethers } = require("hardhat");
const { EIP712Utils, GaslessSubscriptionHelper } = require("./eip712-utils");
const fs = require('fs');

async function main() {
  console.log("🔄 Testing Gasless Subscription System...");

  // Load deployment info
  let deploymentInfo;
  try {
    const deploymentData = fs.readFileSync('deployment.json', 'utf8');
    deploymentInfo = JSON.parse(deploymentData);
    console.log("📋 Loaded deployment info from deployment.json");
  } catch (error) {
    console.error("❌ Could not load deployment.json. Please deploy first.");
    process.exit(1);
  }

  const [deployer, user1, user2, relayer] = await ethers.getSigners();
  console.log("\n👥 Test Accounts:");
  console.log("├─ Deployer:", deployer.address);
  console.log("├─ User1:", user1.address);
  console.log("├─ User2:", user2.address);
  console.log("└─ Relayer:", relayer.address);

  // Get contract instances
  const mockToken = await ethers.getContractAt("MockERC20", deploymentInfo.contracts.mockERC20);
  const subscriptionManager = await ethers.getContractAt("SubscriptionManager", deploymentInfo.contracts.subscriptionManager);
  const paymaster = await ethers.getContractAt("SubscriptionPaymaster", deploymentInfo.contracts.subscriptionPaymaster);
  const walletFactory = await ethers.getContractAt("SmartWalletFactory", deploymentInfo.contracts.smartWalletFactory);

  console.log("\n📄 Contract Instances Created");

  // Test 1: Create user wallets
  console.log("\n🧪 Test 1: Creating SmartWallets for users...");
  
  const user1WalletTx = await walletFactory.createWallet(user1.address, 1);
  await user1WalletTx.wait();
  const user1WalletAddress = await walletFactory.getWalletAddress(user1.address, 1);
  
  const user2WalletTx = await walletFactory.createWallet(user2.address, 2);
  await user2WalletTx.wait();
  const user2WalletAddress = await walletFactory.getWalletAddress(user2.address, 2);

  console.log("├─ User1 SmartWallet:", user1WalletAddress);
  console.log("└─ User2 SmartWallet:", user2WalletAddress);

  // Fund user wallets with test tokens
  console.log("\n💰 Funding user wallets with test tokens...");
  await mockToken.transfer(user1WalletAddress, ethers.parseEther("100"));
  await mockToken.transfer(user2WalletAddress, ethers.parseEther("100"));
  
  const user1Balance = await mockToken.balanceOf(user1WalletAddress);
  const user2Balance = await mockToken.balanceOf(user2WalletAddress);
  console.log("├─ User1 wallet balance:", ethers.formatEther(user1Balance), "TEST");
  console.log("└─ User2 wallet balance:", ethers.formatEther(user2Balance), "TEST");

  // Test 2: Setup gasless subscription approval
  console.log("\n🧪 Test 2: Creating gasless subscription approvals...");
  
  const network = await ethers.provider.getNetwork();
  const eip712Utils = new EIP712Utils(user1WalletAddress, Number(network.chainId));
  
  // Get current nonce for subscription approval
  const user1Wallet = await ethers.getContractAt("SmartWallet", user1WalletAddress);
  const subscriptionNonce = await user1Wallet.getSubscriptionNonce(
    deploymentInfo.contracts.mockERC20,
    deploymentInfo.contracts.subscriptionManager
  );
  
  // Create approval signature (user signs off-chain)
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const approvalAmount = ethers.parseEther("50"); // Approve 50 tokens for subscriptions
  
  const approvalSignature = await eip712Utils.signSubscriptionApproval(
    user1, // User signs their own approval
    deploymentInfo.contracts.mockERC20,
    deploymentInfo.contracts.subscriptionManager,
    approvalAmount.toString(),
    Number(subscriptionNonce),
    deadline
  );
  
  console.log("├─ Approval amount:", ethers.formatEther(approvalAmount), "TEST");
  console.log("├─ Subscription nonce:", subscriptionNonce.toString());
  console.log("└─ Signature created:", approvalSignature.slice(0, 10) + "...");

  // Test 3: Submit gasless approval transaction
  console.log("\n🧪 Test 3: Submitting gasless approval transaction...");
  
  // Call approveSubscription on SmartWallet (this is gasless)
  try {
    const approvalTx = await user1Wallet.approveSubscription(
      deploymentInfo.contracts.mockERC20,
      deploymentInfo.contracts.subscriptionManager,
      approvalAmount,
      subscriptionNonce,
      deadline,
      approvalSignature
    );
    await approvalTx.wait();
    
    const currentApproval = await user1Wallet.getSubscriptionApproval(
      deploymentInfo.contracts.mockERC20,
      deploymentInfo.contracts.subscriptionManager
    );
    
    console.log("✅ Gasless approval successful!");
    console.log("└─ Current approval:", ethers.formatEther(currentApproval), "TEST");
  } catch (error) {
    console.error("❌ Approval failed:", error.message);
  }

  // Test 4: Create subscription (gasless for user)
  console.log("\n🧪 Test 4: Creating gasless subscription...");
  
  // Authorize relayer in subscription manager first
  await subscriptionManager.setRelayerAuthorization(relayer.address, true);
  console.log("├─ Authorized relayer for subscriptions");
  
  try {
    // This would normally be done through the EntryPoint with a UserOperation
    // For testing, we'll call directly as an authorized relayer
    const subscribeTx = await subscriptionManager.connect(relayer).subscribe(
      0, // Plan ID
      user1WalletAddress,
      user1.address,
      true // Auto-renew
    );
    const receipt = await subscribeTx.wait();
    
    // Get subscription ID from events
    const subscribeEvent = receipt.logs.find(log => {
      try {
        const parsed = subscriptionManager.interface.parseLog(log);
        return parsed.name === 'Subscribed';
      } catch {
        return false;
      }
    });
    
    const subscriptionId = subscribeEvent ? 
      subscriptionManager.interface.parseLog(subscribeEvent).args.subscriptionId : 0;
    
    console.log("✅ Subscription created!");
    console.log("└─ Subscription ID:", subscriptionId.toString());
    
    // Test 5: Charge subscriber (gasless billing)
    console.log("\n🧪 Test 5: Processing gasless billing...");
    
    // Check subscription before charging
    const subscription = await subscriptionManager.getSubscription(subscriptionId);
    console.log("├─ Next billing time:", new Date(Number(subscription.nextBillingTime) * 1000).toLocaleString());
    console.log("├─ Is active:", subscription.isActive);
    
    // Fast forward time for testing (in real scenario, this would be automatic)
    await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
    await ethers.provider.send("evm_mine");
    
    console.log("├─ Time advanced by 30 days for testing");
    
    // Charge the subscriber
    const chargeTx = await subscriptionManager.connect(relayer).chargeSubscriber(subscriptionId);
    const chargeReceipt = await chargeTx.wait();
    
    console.log("✅ Billing processed successfully!");
    
    // Check charged event
    const chargedEvent = chargeReceipt.logs.find(log => {
      try {
        const parsed = subscriptionManager.interface.parseLog(log);
        return parsed.name === 'Charged';
      } catch {
        return false;
      }
    });
    
    if (chargedEvent) {
      const eventData = subscriptionManager.interface.parseLog(chargedEvent);
      console.log("└─ Amount charged:", ethers.formatEther(eventData.args.amount), "TEST");
    }
    
  } catch (error) {
    console.error("❌ Subscription/billing failed:", error.message);
  }

  // Test 6: Batch operations
  console.log("\n🧪 Test 6: Testing batch operations...");
  
  try {
    // Create second subscription for user2
    await mockToken.transfer(user2WalletAddress, ethers.parseEther("50"));
    
    // Create approval for user2 (simplified for testing)
    const user2Wallet = await ethers.getContractAt("SmartWallet", user2WalletAddress);
    const user2Nonce = await user2Wallet.getSubscriptionNonce(
      deploymentInfo.contracts.mockERC20,
      deploymentInfo.contracts.subscriptionManager
    );
    
    const user2EIP712 = new EIP712Utils(user2WalletAddress, Number(network.chainId));
    const user2Signature = await user2EIP712.signSubscriptionApproval(
      user2,
      deploymentInfo.contracts.mockERC20,
      deploymentInfo.contracts.subscriptionManager,
      approvalAmount.toString(),
      Number(user2Nonce),
      deadline
    );
    
    await user2Wallet.connect(user2).approveSubscription(
      deploymentInfo.contracts.mockERC20,
      deploymentInfo.contracts.subscriptionManager,
      approvalAmount,
      user2Nonce,
      deadline,
      user2Signature
    );
    
    const subscription2Tx = await subscriptionManager.connect(relayer).subscribe(
      0, // Same plan
      user2WalletAddress,
      user2.address,
      true
    );
    await subscription2Tx.wait();
    
    console.log("├─ Created second subscription for user2");
    
    // Get subscriptions due for billing
    const subscriptionsDue = await subscriptionManager.getSubscriptionsDue(10);
    console.log("├─ Subscriptions due:", subscriptionsDue.length);
    
    if (subscriptionsDue.length > 0) {
      // Batch charge
      const batchChargeTx = await subscriptionManager.connect(relayer).batchChargeSubscribers(subscriptionsDue);
      await batchChargeTx.wait();
      console.log("✅ Batch billing completed!");
    }
    
  } catch (error) {
    console.error("❌ Batch operations failed:", error.message);
  }

  // Test 7: Emergency unsubscribe
  console.log("\n🧪 Test 7: Testing emergency unsubscribe...");
  
  try {
    const unsubscribeTx = await subscriptionManager.connect(user1).unsubscribe(0);
    await unsubscribeTx.wait();
    
    console.log("✅ Emergency unsubscribe successful!");
    
    const updatedSubscription = await subscriptionManager.getSubscription(0);
    console.log("└─ Subscription active:", updatedSubscription.isActive);
    
  } catch (error) {
    console.error("❌ Unsubscribe failed:", error.message);
  }

  // Final status
  console.log("\n📊 Final System Status:");
  
  const paymasterBalance = await paymaster.getBalance();
  const user1TokenBalance = await mockToken.balanceOf(user1WalletAddress);
  const user2TokenBalance = await mockToken.balanceOf(user2WalletAddress);
  const deployerTokenBalance = await mockToken.balanceOf(deployer.address);
  
  console.log("├─ Paymaster balance:", ethers.formatEther(paymasterBalance), "ETH");
  console.log("├─ User1 token balance:", ethers.formatEther(user1TokenBalance), "TEST");
  console.log("├─ User2 token balance:", ethers.formatEther(user2TokenBalance), "TEST");
  console.log("└─ Deployer token balance:", ethers.formatEther(deployerTokenBalance), "TEST");

  console.log("\n🎉 Gasless subscription system testing completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Testing failed:", error);
    process.exit(1);
  });
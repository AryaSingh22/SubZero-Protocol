const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("🚀 Deploying Gasless Subscription Payment System...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));

  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "(Chain ID:", network.chainId, ")");

  // Get EntryPoint address from environment or use default
  const ENTRYPOINT_ADDRESS = process.env.ENTRYPOINT_ADDRESS || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  console.log("Using EntryPoint address:", ENTRYPOINT_ADDRESS);

  // Deploy MockERC20 for testing
  console.log("\n📄 Deploying MockERC20...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy(
    "Test Token",
    "TEST",
    ethers.parseEther("1000000") // 1M tokens
  );
  await mockToken.waitForDeployment();
  console.log("MockERC20 deployed to:", await mockToken.getAddress());

  // Deploy SubscriptionManager
  console.log("\n📄 Deploying SubscriptionManager...");
  const SubscriptionManager = await ethers.getContractFactory("SubscriptionManager");
  const subscriptionManager = await SubscriptionManager.deploy(
    deployer.address // Platform fee recipient
  );
  await subscriptionManager.waitForDeployment();
  const subscriptionManagerAddress = await subscriptionManager.getAddress();
  console.log("SubscriptionManager deployed to:", subscriptionManagerAddress);

  // Deploy SubscriptionPaymaster
  console.log("\n📄 Deploying SubscriptionPaymaster...");
  const SubscriptionPaymaster = await ethers.getContractFactory("SubscriptionPaymaster");
  const paymaster = await SubscriptionPaymaster.deploy(
    ENTRYPOINT_ADDRESS,
    deployer.address
  );
  await paymaster.waitForDeployment();
  const paymasterAddress = await paymaster.getAddress();
  console.log("SubscriptionPaymaster deployed to:", paymasterAddress);

  // Deploy SmartWalletFactory
  console.log("\n📄 Deploying SmartWalletFactory...");
  const SmartWalletFactory = await ethers.getContractFactory("SmartWalletFactory");
  const walletFactory = await SmartWalletFactory.deploy(ENTRYPOINT_ADDRESS);
  await walletFactory.waitForDeployment();
  const walletFactoryAddress = await walletFactory.getAddress();
  console.log("SmartWalletFactory deployed to:", walletFactoryAddress);

  // Configuration
  console.log("\n⚙️  Configuring contracts...");
  
  // Whitelist SubscriptionManager in Paymaster
  console.log("Whitelisting SubscriptionManager in Paymaster...");
  await paymaster.setTargetWhitelist(subscriptionManagerAddress, true);
  
  // Authorize deployer as relayer in SubscriptionManager
  console.log("Authorizing deployer as relayer...");
  await subscriptionManager.setRelayerAuthorization(deployer.address, true);
  
  // Authorize deployer as relayer in Paymaster
  console.log("Authorizing deployer as relayer in Paymaster...");
  await paymaster.setRelayerAuthorization(deployer.address, true);

  // Fund the Paymaster with some ETH
  const fundAmount = ethers.parseEther("1.0"); // 1 ETH
  console.log("Funding Paymaster with", ethers.formatEther(fundAmount), "ETH...");
  await paymaster.depositToEntryPoint({ value: fundAmount });

  // Create a sample subscription plan
  console.log("\n📋 Creating sample subscription plan...");
  const planTx = await subscriptionManager.createPlan(
    "Premium Plan",
    "Premium subscription with advanced features",
    await mockToken.getAddress(),
    ethers.parseEther("10"), // 10 tokens per billing cycle
    30 * 24 * 60 * 60, // 30 days billing interval
    0, // No max subscriptions
    deployer.address // Beneficiary
  );
  await planTx.wait();
  console.log("Sample plan created with ID: 0");

  // Deploy a sample SmartWallet for testing
  console.log("\n👛 Deploying sample SmartWallet...");
  const sampleWalletTx = await walletFactory.createWallet(deployer.address, 0);
  const sampleWalletReceipt = await sampleWalletTx.wait();
  
  // Get the SmartWallet address
  const sampleWalletAddress = await walletFactory.getWalletAddress(deployer.address, 0);
  console.log("Sample SmartWallet deployed to:", sampleWalletAddress);

  // Transfer some test tokens to the sample wallet
  console.log("\n💰 Funding sample wallet with test tokens...");
  await mockToken.transfer(sampleWalletAddress, ethers.parseEther("1000"));
  console.log("Transferred 1000 TEST tokens to sample wallet");

  // Print deployment summary
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Addresses:");
  console.log("├─ EntryPoint:", ENTRYPOINT_ADDRESS);
  console.log("├─ MockERC20:", await mockToken.getAddress());
  console.log("├─ SubscriptionManager:", subscriptionManagerAddress);
  console.log("├─ SubscriptionPaymaster:", paymasterAddress);
  console.log("├─ SmartWalletFactory:", walletFactoryAddress);
  console.log("└─ Sample SmartWallet:", sampleWalletAddress);
  
  console.log("\n🔧 Configuration:");
  console.log("├─ Sample Plan ID: 0");
  console.log("├─ Plan Price: 10 TEST tokens");
  console.log("├─ Billing Interval: 30 days");
  console.log("├─ Paymaster Balance:", ethers.formatEther(await paymaster.getBalance()), "ETH");
  console.log("└─ Sample Wallet Balance:", ethers.formatEther(await mockToken.balanceOf(sampleWalletAddress)), "TEST");

  console.log("\n🚀 Next Steps:");
  console.log("1. Set up your .env file with the contract addresses");
  console.log("2. Run the interaction script to test gasless subscriptions");
  console.log("3. Implement your frontend with the EIP-712 utilities");
  
  // Save deployment info to file
  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      entryPoint: ENTRYPOINT_ADDRESS,
      mockERC20: await mockToken.getAddress(),
      subscriptionManager: subscriptionManagerAddress,
      subscriptionPaymaster: paymasterAddress,
      smartWalletFactory: walletFactoryAddress,
      sampleSmartWallet: sampleWalletAddress
    },
    configuration: {
      samplePlanId: 0,
      planPrice: "10",
      billingInterval: 30 * 24 * 60 * 60,
      paymasterBalance: ethers.formatEther(await paymaster.getBalance()),
      sampleWalletBalance: ethers.formatEther(await mockToken.balanceOf(sampleWalletAddress))
    }
  };

  const fs = require('fs');
  fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 Deployment info saved to deployment.json");

  // Verification for testnets/mainnet
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\n🔍 Starting contract verification...");
    
    // Wait for confirmations
    console.log("Waiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
    
    try {
      console.log("Verifying SubscriptionManager...");
      await hre.run("verify:verify", {
        address: subscriptionManagerAddress,
        constructorArguments: [deployer.address],
      });
      
      console.log("Verifying SubscriptionPaymaster...");
      await hre.run("verify:verify", {
        address: paymasterAddress,
        constructorArguments: [ENTRYPOINT_ADDRESS, deployer.address],
      });
      
      console.log("Verifying SmartWalletFactory...");
      await hre.run("verify:verify", {
        address: walletFactoryAddress,
        constructorArguments: [ENTRYPOINT_ADDRESS],
      });
      
      console.log("Verifying MockERC20...");
      await hre.run("verify:verify", {
        address: await mockToken.getAddress(),
        constructorArguments: ["Test Token", "TEST", ethers.parseEther("1000000")],
      });
      
      console.log("✅ All contracts verified successfully!");
    } catch (error) {
      console.log("❌ Verification failed:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
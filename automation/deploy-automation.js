const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying Automation Contracts...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Configuration
  const config = {
    // Gelato addresses by network
    gelato: {
      137: "0x3CACa7b48D0573D611c5f7C582447468a4d04671", // Polygon Mainnet
      80001: "0xF82D64357D9120a760e1E4C75f646E0618e5d895", // Mumbai Testnet
      31337: deployer.address // Use deployer for local testing
    },
    // Subscription Manager (should be already deployed)
    subscriptionManager: process.env.SUBSCRIPTION_MANAGER_ADDRESS || "",
  };

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const gelatoAddress = config.gelato[chainId] || deployer.address;

  if (!config.subscriptionManager) {
    throw new Error("SUBSCRIPTION_MANAGER_ADDRESS environment variable not set");
  }

  console.log(`Network Chain ID: ${chainId}`);
  console.log(`Gelato Address: ${gelatoAddress}`);
  console.log(`Subscription Manager: ${config.subscriptionManager}`);

  // Deploy Gelato Automation Contract
  console.log("\n1. Deploying GelatoSubscriptionAutomation...");
  const GelatoAutomation = await ethers.getContractFactory("GelatoSubscriptionAutomation");
  const gelatoAutomation = await GelatoAutomation.deploy(
    gelatoAddress,
    config.subscriptionManager,
    deployer.address
  );
  await gelatoAutomation.waitForDeployment();

  console.log("GelatoSubscriptionAutomation deployed to:", gelatoAutomation.target);

  // Deploy Chainlink Automation Contract
  console.log("\n2. Deploying ChainlinkSubscriptionAutomation...");
  const ChainlinkAutomation = await ethers.getContractFactory("ChainlinkSubscriptionAutomation");
  const chainlinkAutomation = await ChainlinkAutomation.deploy(
    config.subscriptionManager,
    deployer.address
  );
  await chainlinkAutomation.waitForDeployment();

  console.log("ChainlinkSubscriptionAutomation deployed to:", chainlinkAutomation.target);

  // Configure automation contracts
  console.log("\n3. Configuring automation contracts...");

  // Set deployer as authorized executor for testing
  await gelatoAutomation.setAuthorizedExecutor(deployer.address, true);
  console.log("✓ Gelato: Authorized deployer as executor");

  await chainlinkAutomation.setAuthorizedKeeper(deployer.address, true);
  console.log("✓ Chainlink: Authorized deployer as keeper");

  // Set reasonable batch sizes and intervals
  await gelatoAutomation.updateConfig(25, 3600); // 25 subscriptions per batch, 1-hour interval
  console.log("✓ Gelato: Updated configuration");

  await chainlinkAutomation.updateConfig(25, 3600); // 25 subscriptions per batch, 1-hour interval
  console.log("✓ Chainlink: Updated configuration");

  // Save deployment addresses
  const deploymentInfo = {
    network: hre.network.name,
    chainId: chainId,
    gelatoSubscriptionAutomation: gelatoAutomation.target,
    chainlinkSubscriptionAutomation: chainlinkAutomation.target,
    subscriptionManager: config.subscriptionManager,
    deployer: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    gelatoAddress: gelatoAddress
  };

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log(`Network: ${deploymentInfo.network} (Chain ID: ${deploymentInfo.chainId})`);
  console.log(`Gelato Automation: ${deploymentInfo.gelatoSubscriptionAutomation}`);
  console.log(`Chainlink Automation: ${deploymentInfo.chainlinkSubscriptionAutomation}`);
  console.log(`Subscription Manager: ${deploymentInfo.subscriptionManager}`);
  console.log(`Deployer: ${deploymentInfo.deployer}`);
  console.log(`Block Number: ${deploymentInfo.blockNumber}`);

  // Test automation functionality
  console.log("\n4. Testing automation functionality...");
  
  try {
    // Test Gelato checker
    const [canExecGelato, execPayloadGelato] = await gelatoAutomation.checker();
    console.log(`✓ Gelato checker: canExec=${canExecGelato}`);

    // Test Chainlink checkUpkeep
    const [upkeepNeeded, performData] = await chainlinkAutomation.checkUpkeep("0x");
    console.log(`✓ Chainlink checkUpkeep: upkeepNeeded=${upkeepNeeded}`);

    // Get due subscriptions count
    const dueSubscriptions = await gelatoAutomation.getDueSubscriptions();
    console.log(`✓ Due subscriptions found: ${dueSubscriptions.length}`);

  } catch (error) {
    console.log(`⚠ Warning: Could not test automation (this is normal if no subscriptions exist yet)`);
    console.log(`  Error: ${error.message}`);
  }

  // Contract verification instructions
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n" + "=".repeat(60));
    console.log("VERIFICATION COMMANDS");
    console.log("=".repeat(60));
    console.log("Run these commands to verify contracts on Etherscan:");
    console.log("");
    console.log(`npx hardhat verify --network ${hre.network.name} ${gelatoAutomation.target} "${gelatoAddress}" "${config.subscriptionManager}" "${deployer.address}"`);
    console.log("");
    console.log(`npx hardhat verify --network ${hre.network.name} ${chainlinkAutomation.target} "${config.subscriptionManager}" "${deployer.address}"`);
  }

  // Setup instructions
  console.log("\n" + "=".repeat(60));
  console.log("NEXT STEPS");
  console.log("=".repeat(60));
  console.log("1. For Gelato Network:");
  console.log(`   - Visit https://app.gelato.network/`);
  console.log(`   - Create a new task targeting: ${gelatoAutomation.target}`);
  console.log(`   - Use the 'checker()' function as the condition`);
  console.log(`   - Fund your Gelato balance with ETH for gas costs`);
  console.log("");
  console.log("2. For Chainlink Automation:");
  console.log(`   - Visit https://automation.chain.link/`);
  console.log(`   - Register a new upkeep targeting: ${chainlinkAutomation.target}`);
  console.log(`   - Fund your upkeep with LINK tokens`);
  console.log(`   - Set gas limit to at least 2,000,000`);
  console.log("");
  console.log("3. Monitor execution:");
  console.log(`   - Check contract events for SubscriptionCharged and BatchExecutionCompleted`);
  console.log(`   - Use getExecutionStats() and getAutomationStats() for monitoring`);
  
  console.log("\n✅ Automation deployment completed successfully!");

  // Save deployment info to file
  const fs = require('fs');
  const deploymentPath = `deployments/automation-${hre.network.name}-${Date.now()}.json`;
  fs.mkdirSync('deployments', { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`📁 Deployment info saved to: ${deploymentPath}`);
}

// Helper function for verification
async function verifyContract(address, constructorArguments) {
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArguments,
    });
    console.log(`✅ Contract ${address} verified successfully`);
  } catch (error) {
    console.log(`❌ Verification failed for ${address}: ${error.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying Enhanced Gasless Subscription System...");
  console.log("=" .repeat(80));

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log("Network Chain ID:", chainId);

  // Configuration
  const config = {
    // EntryPoint address (standard across networks)
    entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    
    // Gelato addresses by network
    gelato: {
      137: "0x3CACa7b48D0573D611c5f7C582447468a4d04671", // Polygon Mainnet
      80001: "0xF82D64357D9120a760e1E4C75f646E0618e5d895", // Mumbai Testnet
      31337: deployer.address // Use deployer for local testing
    },

    // Supported tokens by network
    supportedTokens: {
      137: [ // Polygon Mainnet
        "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC
        "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
        "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", // DAI
      ],
      80001: [ // Mumbai Testnet
        "0x9999f7Fea5938fD3b1E26A12c3f2fb024e194f97", // USDC
        "0xA02f6adc7926efeBBd59Fd43A84f4E0c0c91e832", // USDT
        "0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F", // DAI
      ],
      31337: [] // Will deploy mock tokens
    }
  };

  const gelatoAddress = config.gelato[chainId] || deployer.address;
  let supportedTokens = config.supportedTokens[chainId] || [];

  // Deploy mock tokens for local testing
  if (chainId === 31337n) {
    console.log("\n📝 Deploying mock ERC20 tokens for testing...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    
    const usdc = await MockERC20.deploy("USD Coin", "USDC", ethers.parseUnits("1000000", 6));
    await usdc.waitForDeployment();
    
    const usdt = await MockERC20.deploy("Tether USD", "USDT", ethers.parseUnits("1000000", 6));
    await usdt.waitForDeployment();
    
    const dai = await MockERC20.deploy("Dai Stablecoin", "DAI", ethers.parseEther("1000000"));
    await dai.waitForDeployment();
    
    supportedTokens = [usdc.target, usdt.target, dai.target];
    
    console.log("✅ Mock USDC deployed to:", usdc.target);
    console.log("✅ Mock USDT deployed to:", usdt.target);
    console.log("✅ Mock DAI deployed to:", dai.target);
  }

  // 1. Deploy SmartWalletFactory
  console.log("\n🏭 Deploying SmartWalletFactory...");
  const SmartWalletFactory = await ethers.getContractFactory("SmartWalletFactory");
  const smartWalletFactory = await SmartWalletFactory.deploy(config.entryPoint);
  await smartWalletFactory.waitForDeployment();
  console.log("✅ SmartWalletFactory deployed to:", smartWalletFactory.target);

  // 2. Deploy SubscriptionManagerV2
  console.log("\n📋 Deploying SubscriptionManagerV2...");
  const SubscriptionManagerV2 = await ethers.getContractFactory("SubscriptionManagerV2");
  const subscriptionManager = await SubscriptionManagerV2.deploy(
    deployer.address, // owner
    smartWalletFactory.target,
    supportedTokens
  );
  await subscriptionManager.waitForDeployment();
  console.log("✅ SubscriptionManagerV2 deployed to:", subscriptionManager.target);

  // 3. Deploy IntegrationRegistry
  console.log("\n📚 Deploying IntegrationRegistry...");
  const IntegrationRegistry = await ethers.getContractFactory("IntegrationRegistry");
  const integrationRegistry = await IntegrationRegistry.deploy(deployer.address);
  await integrationRegistry.waitForDeployment();
  console.log("✅ IntegrationRegistry deployed to:", integrationRegistry.target);

  // 4. Deploy PaymasterV2
  console.log("\n💰 Deploying PaymasterV2...");
  const PaymasterV2 = await ethers.getContractFactory("PaymasterV2");
  const paymaster = await PaymasterV2.deploy(
    config.entryPoint,
    deployer.address, // owner
    deployer.address  // fee recipient
  );
  await paymaster.waitForDeployment();
  console.log("✅ PaymasterV2 deployed to:", paymaster.target);

  // 5. Deploy GelatoSubscriptionAutomation
  console.log("\n🤖 Deploying GelatoSubscriptionAutomation...");
  const GelatoAutomation = await ethers.getContractFactory("GelatoSubscriptionAutomation");
  const gelatoAutomation = await GelatoAutomation.deploy(
    gelatoAddress,
    subscriptionManager.target,
    deployer.address
  );
  await gelatoAutomation.waitForDeployment();
  console.log("✅ GelatoSubscriptionAutomation deployed to:", gelatoAutomation.target);

  // 6. Deploy ChainlinkSubscriptionAutomation
  console.log("\n⛓️ Deploying ChainlinkSubscriptionAutomation...");
  const ChainlinkAutomation = await ethers.getContractFactory("ChainlinkSubscriptionAutomation");
  const chainlinkAutomation = await ChainlinkAutomation.deploy(
    subscriptionManager.target,
    deployer.address
  );
  await chainlinkAutomation.waitForDeployment();
  console.log("✅ ChainlinkSubscriptionAutomation deployed to:", chainlinkAutomation.target);

  // Configuration Phase
  console.log("\n⚙️  Configuring contracts...");

  // Configure PaymasterV2
  console.log("Setting up PaymasterV2...");
  await paymaster.setIntegrationRegistry(integrationRegistry.target);
  await paymaster.whitelistTarget(
    subscriptionManager.target,
    1, // Pro tier
    ethers.parseEther("10"), // 10 ETH gas allowance
    false, // no custom validation
    ethers.ZeroAddress
  );
  console.log("✅ PaymasterV2 configured");

  // Configure IntegrationRegistry
  console.log("Setting up IntegrationRegistry...");
  await integrationRegistry.setApprovedIntegrator(deployer.address, true);
  await integrationRegistry.setApprovedIntegrator(paymaster.target, true);
  console.log("✅ IntegrationRegistry configured");

  // Configure SubscriptionManager
  console.log("Setting up SubscriptionManagerV2...");
  await subscriptionManager.setAuthorizedRelayer(deployer.address, true);
  await subscriptionManager.setAuthorizedRelayer(paymaster.target, true);
  await subscriptionManager.setAuthorizedRelayer(gelatoAutomation.target, true);
  await subscriptionManager.setAuthorizedRelayer(chainlinkAutomation.target, true);
  console.log("✅ SubscriptionManagerV2 configured");

  // Configure automation contracts
  console.log("Setting up automation contracts...");
  await gelatoAutomation.setAuthorizedExecutor(deployer.address, true);
  await chainlinkAutomation.setAuthorizedKeeper(deployer.address, true);
  
  await gelatoAutomation.updateConfig(25, 3600); // 25 per batch, 1-hour interval
  await chainlinkAutomation.updateConfig(25, 3600);
  console.log("✅ Automation contracts configured");

  // Fund PaymasterV2 for gas sponsorship
  const fundAmount = ethers.parseEther("1"); // 1 ETH
  console.log(`💸 Funding PaymasterV2 with ${ethers.formatEther(fundAmount)} ETH...`);
  await paymaster.deposit({ value: fundAmount });
  console.log("✅ PaymasterV2 funded");

  // Create sample subscription plan for testing
  if (supportedTokens.length > 0) {
    console.log("\n📋 Creating sample subscription plans...");
    
    // Basic Plan - USDC
    await subscriptionManager.createPlan(
      "Basic Plan",
      "Monthly basic subscription with USDC payments",
      chainId === 31337n ? ethers.parseUnits("10", 6) : ethers.parseUnits("9.99", 6), // 10 or 9.99 USDC
      supportedTokens[0], // USDC
      2, // Monthly billing frequency
      0, // No custom interval
      0, // Unlimited payments
      604800 // 7-day trial period
    );

    // Premium Plan - DAI
    if (supportedTokens.length > 2) {
      await subscriptionManager.createPlan(
        "Premium Plan",
        "Monthly premium subscription with DAI payments",
        ethers.parseEther("29.99"), // 29.99 DAI
        supportedTokens[2], // DAI
        2, // Monthly billing frequency
        0, // No custom interval
        0, // Unlimited payments
        0 // No trial period
      );
    }
    
    console.log("✅ Sample plans created");
  }

  // Collect deployment information
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number(chainId),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    
    // Core contracts
    smartWalletFactory: smartWalletFactory.target,
    subscriptionManagerV2: subscriptionManager.target,
    integrationRegistry: integrationRegistry.target,
    paymasterV2: paymaster.target,
    
    // Automation contracts
    gelatoAutomation: gelatoAutomation.target,
    chainlinkAutomation: chainlinkAutomation.target,
    
    // Configuration
    entryPoint: config.entryPoint,
    gelatoAddress: gelatoAddress,
    supportedTokens: supportedTokens,
    
    // SDK Configuration
    sdkConfig: {
      subscriptionManager: subscriptionManager.target,
      paymaster: paymaster.target,
      smartWalletFactory: smartWalletFactory.target,
      entryPoint: config.entryPoint,
      chainId: Number(chainId),
      integrationRegistry: integrationRegistry.target
    }
  };

  // Display deployment summary
  console.log("\n" + "=".repeat(80));
  console.log("🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!");
  console.log("=".repeat(80));
  console.log(`📍 Network: ${deploymentInfo.network} (Chain ID: ${deploymentInfo.chainId})`);
  console.log(`👤 Deployer: ${deploymentInfo.deployer}`);
  console.log(`📦 Block: ${deploymentInfo.blockNumber}`);
  console.log("\n📋 CORE CONTRACTS:");
  console.log(`├─ SmartWalletFactory: ${deploymentInfo.smartWalletFactory}`);
  console.log(`├─ SubscriptionManagerV2: ${deploymentInfo.subscriptionManagerV2}`);
  console.log(`├─ IntegrationRegistry: ${deploymentInfo.integrationRegistry}`);
  console.log(`└─ PaymasterV2: ${deploymentInfo.paymasterV2}`);
  console.log("\n🤖 AUTOMATION CONTRACTS:");
  console.log(`├─ Gelato Automation: ${deploymentInfo.gelatoAutomation}`);
  console.log(`└─ Chainlink Automation: ${deploymentInfo.chainlinkAutomation}`);
  
  if (supportedTokens.length > 0) {
    console.log("\n🪙 SUPPORTED TOKENS:");
    supportedTokens.forEach((token, index) => {
      const symbol = chainId === 31337n ? ['USDC', 'USDT', 'DAI'][index] : ['USDC', 'USDT', 'DAI'][index];
      console.log(`├─ ${symbol}: ${token}`);
    });
  }

  // Contract verification
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n" + "=".repeat(80));
    console.log("📋 VERIFICATION COMMANDS");
    console.log("=".repeat(80));
    console.log("Run these commands to verify contracts:");
    console.log("");
    console.log(`npx hardhat verify --network ${hre.network.name} ${smartWalletFactory.target} "${config.entryPoint}"`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${subscriptionManager.target} "${deployer.address}" "${smartWalletFactory.target}" "[${supportedTokens.map(t => `"${t}"`).join(',')}]"`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${integrationRegistry.target} "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${paymaster.target} "${config.entryPoint}" "${deployer.address}" "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${gelatoAutomation.target} "${gelatoAddress}" "${subscriptionManager.target}" "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${chainlinkAutomation.target} "${subscriptionManager.target}" "${deployer.address}"`);
  }

  // Setup instructions
  console.log("\n" + "=".repeat(80));
  console.log("🚀 NEXT STEPS");
  console.log("=".repeat(80));
  console.log("1. 📱 SDK Integration:");
  console.log("   Copy the sdkConfig from the deployment file to configure your frontend");
  console.log("");
  console.log("2. 🤖 Automation Setup:");
  console.log("   For Gelato: Visit https://app.gelato.network/");
  console.log("   For Chainlink: Visit https://automation.chain.link/");
  console.log("");
  console.log("3. 💰 Fund Contracts:");
  console.log("   - Fund PaymasterV2 with more ETH for gas sponsorship");
  console.log("   - Fund automation contracts with ETH/LINK as needed");
  console.log("");
  console.log("4. 🧪 Testing:");
  console.log("   - Use the interaction scripts to test functionality");
  console.log("   - Run the expanded test suite to verify all features");
  console.log("");
  console.log("5. 📊 Analytics:");
  console.log("   - Deploy the analytics dashboard");
  console.log("   - Configure environment variables with contract addresses");

  // Save deployment info
  const fs = require('fs');
  fs.mkdirSync('deployments', { recursive: true });
  
  const deploymentPath = `deployments/complete-${hre.network.name}-${Date.now()}.json`;
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  
  const latestPath = `deployments/latest-${hre.network.name}.json`;
  fs.writeFileSync(latestPath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`\n📁 Deployment info saved to:`);
  console.log(`   📄 ${deploymentPath}`);
  console.log(`   📄 ${latestPath}`);
  
  console.log(`\n✨ Enhanced Gasless Subscription System deployment completed successfully! ✨`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
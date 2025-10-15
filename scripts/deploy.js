const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying SubscriptionPaymentSystem...");

  // Get the deployer account 
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy SubscriptionPaymentSystem
  const SubscriptionPaymentSystem = await ethers.getContractFactory("SubscriptionPaymentSystem");
  const subscriptionSystem = await SubscriptionPaymentSystem.deploy();
  await subscriptionSystem.waitForDeployment();

  console.log("SubscriptionPaymentSystem deployed to:", subscriptionSystem.target);
 
  // Deploy MockERC20 for testing (optional)
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test Token", "TEST", 1000000);
  await mockToken.waitForDeployment();

  console.log("MockERC20 deployed to:", mockToken.target);

  // Save deployment addresses
  const deploymentInfo = {
    network: hre.network.name,
    subscriptionPaymentSystem: subscriptionSystem.target,
    mockToken: mockToken.target,
    deployer: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString()
  };

  console.log("\nDeployment Summary:");
  console.log("==================");
  console.log(`Network: ${deploymentInfo.network}`);
  console.log(`SubscriptionPaymentSystem: ${deploymentInfo.subscriptionPaymentSystem}`);
  console.log(`MockERC20: ${deploymentInfo.mockToken}`);
  console.log(`Deployer: ${deploymentInfo.deployer}`);
  console.log(`Block Number: ${deploymentInfo.blockNumber}`);

  // Verify contracts on Etherscan (if not local network)
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting for block confirmations...");
    await subscriptionSystem.deploymentTransaction().wait(6);
    await mockToken.deploymentTransaction().wait(6);

    console.log("Verifying contracts on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: subscriptionSystem.target,
        constructorArguments: [],
      });
      console.log("SubscriptionPaymentSystem verified!");
    } catch (error) {
      console.log("Verification failed:", error.message);
    }

    try {
      await hre.run("verify:verify", {
        address: mockToken.target,
        constructorArguments: ["Test Token", "TEST", 1000000],
      });
      console.log("MockERC20 verified!");
    } catch (error) {
      console.log("Verification failed:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

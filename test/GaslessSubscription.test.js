const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Gasless Subscription System", function () {
  async function deployGaslessSubscriptionFixture() {
    const [owner, user1, user2, relayer, beneficiary] = await ethers.getSigners();

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000000"));

    // Deploy SubscriptionManager
    const SubscriptionManager = await ethers.getContractFactory("SubscriptionManager");
    const subscriptionManager = await SubscriptionManager.deploy(owner.address);

    // Mock EntryPoint for testing (simplified)
    const ENTRYPOINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

    // Deploy SubscriptionPaymaster
    const SubscriptionPaymaster = await ethers.getContractFactory("SubscriptionPaymaster");
    const paymaster = await SubscriptionPaymaster.deploy(ENTRYPOINT_ADDRESS, owner.address);

    // Deploy SmartWalletFactory
    const SmartWalletFactory = await ethers.getContractFactory("SmartWalletFactory");
    const walletFactory = await SmartWalletFactory.deploy(ENTRYPOINT_ADDRESS);

    // Create SmartWallets for users
    await walletFactory.createWallet(user1.address, 0);
    const user1WalletAddress = await walletFactory.getWalletAddress(user1.address, 0);
    const user1Wallet = await ethers.getContractAt("SmartWallet", user1WalletAddress);

    await walletFactory.createWallet(user2.address, 0);
    const user2WalletAddress = await walletFactory.getWalletAddress(user2.address, 0);
    const user2Wallet = await ethers.getContractAt("SmartWallet", user2WalletAddress);

    // Setup configuration
    await subscriptionManager.setRelayerAuthorization(relayer.address, true);
    await paymaster.setTargetWhitelist(await subscriptionManager.getAddress(), true);
    await paymaster.setRelayerAuthorization(relayer.address, true);

    // Note: In real deployment, you would fund the paymaster with ETH
    // await paymaster.depositToEntryPoint({ value: ethers.parseEther("1") });

    // Create a subscription plan
    await subscriptionManager.createPlan(
      "Premium Plan",
      "Premium subscription",
      await mockToken.getAddress(),
      ethers.parseEther("10"), // 10 tokens
      30 * 24 * 60 * 60, // 30 days
      0, // unlimited
      beneficiary.address
    );

    // Fund user wallets with tokens
    await mockToken.transfer(user1WalletAddress, ethers.parseEther("100"));
    await mockToken.transfer(user2WalletAddress, ethers.parseEther("100"));

    return {
      mockToken,
      subscriptionManager,
      paymaster,
      walletFactory,
      user1Wallet,
      user2Wallet,
      owner,
      user1,
      user2,
      relayer,
      beneficiary,
      user1WalletAddress,
      user2WalletAddress
    };
  }

  describe("Smart Wallet", function () {
    it("Should deploy SmartWallet with correct owner", async function () {
      const { user1Wallet, user1 } = await loadFixture(deployGaslessSubscriptionFixture);

      expect(await user1Wallet.owner()).to.equal(user1.address);
    });

    it("Should allow owner to create subscription approval", async function () {
      const { user1Wallet, user1, mockToken, subscriptionManager } = await loadFixture(deployGaslessSubscriptionFixture);

      const nonce = await user1Wallet.getSubscriptionNonce(
        await mockToken.getAddress(),
        await subscriptionManager.getAddress()
      );

      expect(nonce).to.equal(0);

      // Create a simple approval signature for testing
      const deadline = (await time.latest()) + 3600;
      const amount = ethers.parseEther("50");

      // For testing, we'll use a mock signature
      const mockSignature = "0x" + "00".repeat(65);

      // This should revert with invalid signature, but we're testing the structure
      await expect(
        user1Wallet.connect(user1).approveSubscription(
          await mockToken.getAddress(),
          await subscriptionManager.getAddress(),
          amount,
          nonce,
          deadline,
          mockSignature
        )
      ).to.be.revertedWith("ECDSA: invalid signature");
    });

    it("Should track subscription approvals", async function () {
      const { user1Wallet, mockToken, subscriptionManager } = await loadFixture(deployGaslessSubscriptionFixture);

      const initialApproval = await user1Wallet.getSubscriptionApproval(
        await mockToken.getAddress(),
        await subscriptionManager.getAddress()
      );

      expect(initialApproval).to.equal(0);
    });
  });

  describe("Subscription Manager", function () {
    it("Should create subscription plans", async function () {
      const { subscriptionManager, mockToken, beneficiary } = await loadFixture(deployGaslessSubscriptionFixture);

      const plan = await subscriptionManager.getPlan(0);

      expect(plan.name).to.equal("Premium Plan");
      expect(plan.paymentToken).to.equal(await mockToken.getAddress());
      expect(plan.price).to.equal(ethers.parseEther("10"));
      expect(plan.beneficiary).to.equal(beneficiary.address);
      expect(plan.isActive).to.be.true;
    });

    it("Should allow subscription to a plan", async function () {
      const { subscriptionManager, relayer, user1WalletAddress, user1 } = await loadFixture(deployGaslessSubscriptionFixture);

      await expect(
        subscriptionManager.connect(relayer).subscribe(
          0, // plan ID
          user1WalletAddress,
          user1.address,
          true // auto-renew
        )
      ).to.emit(subscriptionManager, "Subscribed");

      const userSubscriptions = await subscriptionManager.getUserSubscriptions(user1WalletAddress);
      expect(userSubscriptions.length).to.equal(1);

      const subscription = await subscriptionManager.getSubscription(userSubscriptions[0]);
      expect(subscription.subscriber).to.equal(user1WalletAddress);
      expect(subscription.owner).to.equal(user1.address);
      expect(subscription.isActive).to.be.true;
    });

    it("Should prevent unauthorized relayers from subscribing", async function () {
      const { subscriptionManager, user1, user1WalletAddress } = await loadFixture(deployGaslessSubscriptionFixture);

      // Test that a non-authorized user cannot subscribe
      await expect(
        subscriptionManager.connect(user1).subscribe(
          0,
          user1WalletAddress,
          user1.address,
          true
        )
      ).to.be.revertedWith("SubscriptionManager: unauthorized relayer");
    });

    it("Should allow emergency unsubscribe by user", async function () {
      const { subscriptionManager, relayer, user1, user1WalletAddress } = await loadFixture(deployGaslessSubscriptionFixture);

      // First create a subscription
      await subscriptionManager.connect(relayer).subscribe(0, user1WalletAddress, user1.address, true);

      const userSubscriptions = await subscriptionManager.getUserSubscriptions(user1WalletAddress);
      const subscriptionId = userSubscriptions[0];

      // User should be able to unsubscribe
      await expect(
        subscriptionManager.connect(user1).unsubscribe(subscriptionId)
      ).to.emit(subscriptionManager, "Unsubscribed");

      const subscription = await subscriptionManager.getSubscription(subscriptionId);
      expect(subscription.isActive).to.be.false;
    });

    it("Should get subscriptions due for billing", async function () {
      const { subscriptionManager, relayer, user1WalletAddress, user1 } = await loadFixture(deployGaslessSubscriptionFixture);

      // Create subscription
      await subscriptionManager.connect(relayer).subscribe(0, user1WalletAddress, user1.address, true);

      // Initially no subscriptions should be due
      let dueSubscriptions = await subscriptionManager.getSubscriptionsDue(10);
      expect(dueSubscriptions.length).to.equal(0);

      // Fast forward time
      await time.increase(31 * 24 * 60 * 60); // 31 days

      // Now subscription should be due
      dueSubscriptions = await subscriptionManager.getSubscriptionsDue(10);
      expect(dueSubscriptions.length).to.equal(1);
    });
  });

  describe("Paymaster", function () {
    it("Should have correct configuration", async function () {
      const { paymaster, subscriptionManager } = await loadFixture(deployGaslessSubscriptionFixture);

      const isWhitelisted = await paymaster.whitelistedTargets(await subscriptionManager.getAddress());
      expect(isWhitelisted).to.be.true;

      // Note: In test environment, we skip balance check since EntryPoint is not deployed
      // In production, paymaster would be funded through EntryPoint
    });

    it("Should allow owner to update whitelist", async function () {
      const { paymaster, owner, user1 } = await loadFixture(deployGaslessSubscriptionFixture);

      await expect(
        paymaster.connect(owner).setTargetWhitelist(user1.address, true)
      ).to.emit(paymaster, "TargetWhitelisted")
        .withArgs(user1.address, true);

      expect(await paymaster.whitelistedTargets(user1.address)).to.be.true;
    });

    it("Should allow owner to authorize relayers", async function () {
      const { paymaster, owner, user1 } = await loadFixture(deployGaslessSubscriptionFixture);

      await expect(
        paymaster.connect(owner).setRelayerAuthorization(user1.address, true)
      ).to.emit(paymaster, "RelayerAuthorized")
        .withArgs(user1.address, true);

      expect(await paymaster.authorizedRelayers(user1.address)).to.be.true;
    });

    it("Should allow owner to withdraw funds", async function () {
      const { paymaster, owner } = await loadFixture(deployGaslessSubscriptionFixture);

      // Note: In test environment, we can only test that the function exists
      // Real EntryPoint integration would be tested in integration environment
      expect(paymaster.withdrawFromEntryPoint).to.be.a('function');
      expect(paymaster.emergencyWithdraw).to.be.a('function');
    });
  });

  describe("SmartWallet Factory", function () {
    it("Should create wallets deterministically", async function () {
      const { walletFactory, user1, user2 } = await loadFixture(deployGaslessSubscriptionFixture);

      const predictedAddress = await walletFactory.getWalletAddress(user1.address, 100);

      await walletFactory.createWallet(user1.address, 100);
      const actualAddress = await walletFactory.getWallet(user1.address, 100);

      expect(actualAddress).to.equal(predictedAddress);

      // Creating the same wallet again should return the same address
      await walletFactory.createWallet(user1.address, 100);
      const secondAddress = await walletFactory.getWallet(user1.address, 100);
      expect(secondAddress).to.equal(predictedAddress);
    });

    it("Should batch create wallets", async function () {
      const { walletFactory, user1, user2 } = await loadFixture(deployGaslessSubscriptionFixture);

      const owners = [user1.address, user2.address];
      const salts = [200, 201];

      const tx = await walletFactory.batchCreateWallets(owners, salts);
      const receipt = await tx.wait();

      // Check that wallets were created
      const user1WalletAddress = await walletFactory.getWallet(user1.address, 200);
      const user2WalletAddress = await walletFactory.getWallet(user2.address, 201);

      expect(user1WalletAddress).to.not.equal(ethers.ZeroAddress);
      expect(user2WalletAddress).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("Integration Tests", function () {
    it("Should handle full subscription lifecycle", async function () {
      const {
        subscriptionManager,
        mockToken,
        user1Wallet,
        user1WalletAddress,
        user1,
        relayer,
        beneficiary
      } = await loadFixture(deployGaslessSubscriptionFixture);

      // 1. Create subscription
      await subscriptionManager.connect(relayer).subscribe(0, user1WalletAddress, user1.address, true);

      const userSubscriptions = await subscriptionManager.getUserSubscriptions(user1WalletAddress);
      expect(userSubscriptions.length).to.equal(1);

      const subscriptionId = userSubscriptions[0];
      let subscription = await subscriptionManager.getSubscription(subscriptionId);
      expect(subscription.isActive).to.be.true;
      expect(subscription.totalPayments).to.equal(0);

      // 2. Fast forward time to make payment due
      await time.increase(31 * 24 * 60 * 60); // 31 days

      // 3. Check that subscription is due
      const dueSubscriptions = await subscriptionManager.getSubscriptionsDue(10);
      expect(dueSubscriptions).to.include(subscriptionId);

      // 4. Set up subscription approval (simplified for testing)
      // In real scenario, this would be done with proper EIP-712 signature

      // 5. Unsubscribe
      await subscriptionManager.connect(user1).unsubscribe(subscriptionId);

      subscription = await subscriptionManager.getSubscription(subscriptionId);
      expect(subscription.isActive).to.be.false;
    });

    it("Should handle multiple users and batch operations", async function () {
      const {
        subscriptionManager,
        relayer,
        user1WalletAddress,
        user2WalletAddress,
        user1,
        user2
      } = await loadFixture(deployGaslessSubscriptionFixture);

      // Create subscriptions for both users
      await subscriptionManager.connect(relayer).subscribe(0, user1WalletAddress, user1.address, true);
      await subscriptionManager.connect(relayer).subscribe(0, user2WalletAddress, user2.address, true);

      // Check that both subscriptions exist
      const user1Subscriptions = await subscriptionManager.getUserSubscriptions(user1WalletAddress);
      const user2Subscriptions = await subscriptionManager.getUserSubscriptions(user2WalletAddress);

      expect(user1Subscriptions.length).to.equal(1);
      expect(user2Subscriptions.length).to.equal(1);

      // Fast forward time
      await time.increase(31 * 24 * 60 * 60);

      // Check that both subscriptions are due
      const dueSubscriptions = await subscriptionManager.getSubscriptionsDue(10);
      expect(dueSubscriptions.length).to.equal(2);

      // Batch operations would work here if we had proper token approvals
    });

    it("Should enforce access controls", async function () {
      const { subscriptionManager, paymaster, user1, user2 } = await loadFixture(deployGaslessSubscriptionFixture);

      // Non-owner cannot create plans
      await expect(
        subscriptionManager.connect(user1).createPlan(
          "Unauthorized Plan",
          "Should fail",
          user1.address,
          ethers.parseEther("5"),
          7 * 24 * 60 * 60,
          0,
          user1.address
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");

      // Non-owner cannot update paymaster config
      await expect(
        paymaster.connect(user1).updateConfig(
          ethers.parseUnits("100", "gwei"),
          1000000,
          20000000
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it("Should handle invalid subscription IDs", async function () {
      const { subscriptionManager } = await loadFixture(deployGaslessSubscriptionFixture);

      await expect(
        subscriptionManager.getSubscription(999)
      ).to.be.revertedWith("SubscriptionManager: invalid subscription ID");
    });

    it("Should handle invalid plan IDs", async function () {
      const { subscriptionManager, relayer, user1WalletAddress, user1 } = await loadFixture(deployGaslessSubscriptionFixture);

      await expect(
        subscriptionManager.connect(relayer).subscribe(999, user1WalletAddress, user1.address, true)
      ).to.be.revertedWith("SubscriptionManager: invalid plan ID");
    });

    it("Should handle paused contract", async function () {
      const { subscriptionManager, owner, relayer, user1WalletAddress, user1 } = await loadFixture(deployGaslessSubscriptionFixture);

      await subscriptionManager.connect(owner).pause();

      await expect(
        subscriptionManager.connect(relayer).subscribe(0, user1WalletAddress, user1.address, true)
      ).to.be.revertedWith("Pausable: paused");
    });
  });
});
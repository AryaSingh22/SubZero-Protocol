require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    // Add other networks as needed
    // polygon: {
    //   url: "https://polygon-rpc.com/",
    //   accounts: [process.env.PRIVATE_KEY]
    // }
  },
  gasReporter: {
    enabled: true,
    currency: "USD"
  },
  etherscan: {
    // apiKey: process.env.ETHERSCAN_API_KEY
  }
};

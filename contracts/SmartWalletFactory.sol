// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SmartWallet.sol"; 

/**
 * @title SmartWalletFactory
 * @dev Factory contract for deploying SmartWallet instances using CREATE2
 * @notice This factory allows deterministic deployment of SmartWallet contracts
 */
contract SmartWalletFactory {
    address public immutable entryPoint;
    
    // Mapping to track deployed wallets
    mapping(address => mapping(uint256 => address)) public wallets; // owner => salt => wallet
    
    event WalletCreated(
        address indexed owner,
        address indexed wallet,
        uint256 salt
    );

    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "SmartWalletFactory: invalid EntryPoint");
        entryPoint = _entryPoint;
    }

    /**
     * @dev Create a new SmartWallet using CREATE2
     * @param owner Owner of the wallet
     * @param salt Salt for deterministic address generation
     * @return wallet Address of the created wallet
     */
    function createWallet(
        address owner,
        uint256 salt
    ) external returns (address wallet) {
        require(owner != address(0), "SmartWalletFactory: invalid owner");
        
        // Check if wallet already exists
        wallet = getWalletAddress(owner, salt);
        if (wallet.code.length > 0) {
            return wallet; // Wallet already deployed
        }
        
        // Deploy new SmartWallet
        bytes memory bytecode = abi.encodePacked(
            type(SmartWallet).creationCode,
            abi.encode(entryPoint, owner)
        );
        
        assembly {
            wallet := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        
        require(wallet != address(0), "SmartWalletFactory: create2 failed");
        
        // Store the wallet address
        wallets[owner][salt] = wallet;
        
        emit WalletCreated(owner, wallet, salt);
    }

    /**
     * @dev Calculate the address of a SmartWallet before deployment
     * @param owner Owner of the wallet
     * @param salt Salt for address generation
     * @return wallet Predicted wallet address
     */
    function getWalletAddress(
        address owner,
        uint256 salt
    ) public view returns (address wallet) {
        bytes memory bytecode = abi.encodePacked(
            type(SmartWallet).creationCode,
            abi.encode(entryPoint, owner)
        );
        
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );
        
        wallet = address(uint160(uint256(hash)));
    }

    /**
     * @dev Get wallet address for an owner with specific salt
     * @param owner Owner address
     * @param salt Salt value
     * @return wallet Wallet address (zero if not deployed)
     */
    function getWallet(address owner, uint256 salt) external view returns (address wallet) {
        return wallets[owner][salt];
    }

    /**
     * @dev Check if a wallet is deployed
     * @param owner Owner address
     * @param salt Salt value
     * @return deployed True if wallet is deployed
     */
    function isWalletDeployed(address owner, uint256 salt) external view returns (bool deployed) {
        address wallet = getWalletAddress(owner, salt);
        return wallet.code.length > 0;
    }

    /**
     * @dev Batch create multiple wallets
     * @param owners Array of owner addresses
     * @param salts Array of salt values
     * @return createdWallets Array of created wallet addresses
     */
    function batchCreateWallets(
        address[] calldata owners,
        uint256[] calldata salts
    ) external returns (address[] memory createdWallets) {
        require(owners.length == salts.length, "SmartWalletFactory: array length mismatch");
        
        createdWallets = new address[](owners.length);
        
        for (uint256 i = 0; i < owners.length; i++) {
            createdWallets[i] = this.createWallet(owners[i], salts[i]);
        }
    }
}

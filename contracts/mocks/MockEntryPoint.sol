// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockEntryPoint
 * @dev Mock implementation of ERC-4337 EntryPoint for testing
 */
contract MockEntryPoint {
    // Track balances deposited to this EntryPoint
    mapping(address => uint256) private balances;
    
    // Events
    event Deposited(address indexed account, uint256 totalDeposit);
    event Withdrawn(address indexed account, address withdrawAddress, uint256 amount);
    
    /**
     * @dev Get the current balance of an account
     * @param account Account to check balance for
     * @return balance Current balance
     */
    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }
    
    /**
     * @dev Deposit ETH for a specific account
     * @param account Account to deposit for
     */
    function depositTo(address account) external payable {
        require(msg.value > 0, "MockEntryPoint: no value provided");
        balances[account] += msg.value;
        emit Deposited(account, balances[account]);
    }
    
    /**
     * @dev Withdraw ETH from an account (only account owner can withdraw)
     * @param withdrawAddress Address to send withdrawn ETH
     * @param withdrawAmount Amount to withdraw
     */
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external {
        require(balances[msg.sender] >= withdrawAmount, "MockEntryPoint: insufficient balance");
        require(withdrawAddress != address(0), "MockEntryPoint: invalid withdraw address");
        
        balances[msg.sender] -= withdrawAmount;
        withdrawAddress.transfer(withdrawAmount);
        emit Withdrawn(msg.sender, withdrawAddress, withdrawAmount);
    }
    
    /**
     * @dev Allow direct deposits to the contract
     */
    receive() external payable {
        // Accept ETH for testing purposes
    }
}
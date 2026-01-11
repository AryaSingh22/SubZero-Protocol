import { describe, it, expect } from '@jest/globals';
import { GaslessSubscriptionSDK } from '../services/GaslessSubscriptionSDK';
import { ethers } from 'ethers';

describe('GaslessSubscriptionSDK', () => {
    it('should be defined', () => {
        expect(GaslessSubscriptionSDK).toBeDefined();
    });

    it('should instantiate with valid config', () => {
        const mockProvider = new ethers.JsonRpcProvider('https://rpc-mumbai.maticvigil.com');
        const sdk = new GaslessSubscriptionSDK({
            provider: mockProvider,
            config: {
                subscriptionManager: '0x123',
                paymaster: '0x456',
                smartWalletFactory: '0x789',
                entryPoint: '0xabc',
                chainId: 80001,
                rpcUrl: 'https://rpc-mumbai.maticvigil.com',
            },
        });
        expect(sdk).toBeDefined();
    });
});

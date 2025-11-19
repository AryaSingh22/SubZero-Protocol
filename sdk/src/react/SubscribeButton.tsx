import React, { useState, useEffect, useCallback } from 'react';
import { GaslessSubscriptionSDK } from '../services/GaslessSubscriptionSDK';
import type {
  SubscriptionPlan,
  WalletConnectionStatus,
  TransactionResult,
  SubscribeOptions,
} from '../types';

// Component Props
export interface SubscribeButtonProps {
  // Required props
  planId: string;
  sdk: GaslessSubscriptionSDK;
  
  // Optional styling
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  
  // Button text customization
  connectText?: string;
  subscribeText?: string;
  subscribingText?: string;
  subscribedText?: string;
  
  // Plan customization
  customAmount?: string;
  trialPeriod?: number;
  
  // Event handlers
  onConnect?: (status: WalletConnectionStatus) => void;
  onSubscribeStart?: (options: SubscribeOptions) => void;
  onSubscribeSuccess?: (result: TransactionResult) => void;
  onSubscribeError?: (error: Error) => void;
  
  // UI customization
  showPlanDetails?: boolean;
  showPrice?: boolean;
  theme?: 'light' | 'dark' | 'custom';
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'outline';
}

// Component state
interface SubscribeButtonState {
  isConnected: boolean;
  isLoading: boolean;
  isSubscribing: boolean;
  isSubscribed: boolean;
  plan: SubscriptionPlan | null;
  error: string | null;
  walletStatus: WalletConnectionStatus | null;
}

// Default styles
const getDefaultStyles = (theme: string, size: string, variant: string) => {
  const themes = {
    light: {
      primary: {
        backgroundColor: '#3b82f6',
        color: '#ffffff',
        border: '1px solid #3b82f6',
      },
      secondary: {
        backgroundColor: '#6b7280',
        color: '#ffffff',
        border: '1px solid #6b7280',
      },
      outline: {
        backgroundColor: 'transparent',
        color: '#3b82f6',
        border: '1px solid #3b82f6',
      },
    },
    dark: {
      primary: {
        backgroundColor: '#1d4ed8',
        color: '#ffffff',
        border: '1px solid #1d4ed8',
      },
      secondary: {
        backgroundColor: '#4b5563',
        color: '#ffffff',
        border: '1px solid #4b5563',
      },
      outline: {
        backgroundColor: 'transparent',
        color: '#60a5fa',
        border: '1px solid #60a5fa',
      },
    },
  };

  const sizes = {
    small: {
      padding: '8px 16px',
      fontSize: '14px',
      borderRadius: '4px',
    },
    medium: {
      padding: '12px 24px',
      fontSize: '16px',
      borderRadius: '6px',
    },
    large: {
      padding: '16px 32px',
      fontSize: '18px',
      borderRadius: '8px',
    },
  };

  return {
    ...themes[theme as keyof typeof themes]?.[variant as keyof typeof themes.light] || themes.light.primary,
    ...sizes[size as keyof typeof sizes] || sizes.medium,
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    textAlign: 'center' as const,
    display: 'inline-block',
    textDecoration: 'none',
    userSelect: 'none' as const,
  };
};

export const SubscribeButton: React.FC<SubscribeButtonProps> = ({
  planId,
  sdk,
  className = '',
  style = {},
  disabled = false,
  connectText = 'Connect Wallet',
  subscribeText = 'Subscribe',
  subscribingText = 'Subscribing...',
  subscribedText = 'Subscribed ✓',
  customAmount,
  trialPeriod,
  onConnect,
  onSubscribeStart,
  onSubscribeSuccess,
  onSubscribeError,
  showPlanDetails = true,
  showPrice = true,
  theme = 'light',
  size = 'medium',
  variant = 'primary',
}) => {
  const [state, setState] = useState<SubscribeButtonState>({
    isConnected: false,
    isLoading: true,
    isSubscribing: false,
    isSubscribed: false,
    plan: null,
    error: null,
    walletStatus: null,
  });

  // Load plan details on mount
  useEffect(() => {
    loadPlan();
  }, [planId]);

  // Check wallet connection status
  useEffect(() => {
    if (sdk.isConnected) {
      const walletStatus: WalletConnectionStatus = {
        isConnected: true,
        smartWalletDeployed: sdk.isSmartWalletDeployed,
      };

      if (sdk.connectedAddress) {
        walletStatus.address = sdk.connectedAddress;
      }
      if (sdk.smartWalletAddr) {
        walletStatus.smartWalletAddress = sdk.smartWalletAddr;
      }

      setState(prev => ({
        ...prev,
        isConnected: true,
        walletStatus,
      }));
    }
  }, [sdk]);

  const loadPlan = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      const plan = await sdk.getPlan(planId);
      
      if (!plan) {
        throw new Error(`Plan ${planId} not found or inactive`);
      }
      
      setState(prev => ({ ...prev, plan, isLoading: false }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load plan',
        isLoading: false,
      }));
    }
  };

  const handleConnect = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      // In a real app, this would trigger wallet connection
      // For now, we assume the wallet is already connected to the SDK
      if (!sdk.isConnected) {
        throw new Error('Please connect your wallet first');
      }
      
      const status: WalletConnectionStatus = {
        isConnected: true,
        smartWalletDeployed: sdk.isSmartWalletDeployed,
      };

      if (sdk.connectedAddress) {
        status.address = sdk.connectedAddress;
      }
      if (sdk.smartWalletAddr) {
        status.smartWalletAddress = sdk.smartWalletAddr;
      }
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        walletStatus: status,
        isLoading: false,
      }));
      
      onConnect?.(status);
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to connect wallet',
        isLoading: false,
      }));
    }
  };

  const handleSubscribe = async () => {
    if (!state.plan || state.isSubscribing || state.isSubscribed) return;
    
    try {
      setState(prev => ({ ...prev, isSubscribing: true, error: null }));
      
      const options: SubscribeOptions = {
        planId,
        customAmount,
        trialPeriod,
      };
      
      onSubscribeStart?.(options);
      
      const result = await sdk.subscribe(options);
      
      setState(prev => ({
        ...prev,
        isSubscribing: false,
        isSubscribed: true,
      }));
      
      onSubscribeSuccess?.(result);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isSubscribing: false,
        error: error instanceof Error ? error.message : 'Failed to subscribe',
      }));
      
      onSubscribeError?.(error instanceof Error ? error : new Error('Failed to subscribe'));
    }
  };

  const formatPrice = (amount: string, tokenAddress: string) => {
    // This is simplified - in production you'd want to fetch token metadata
    const formattedAmount = parseFloat(amount) / Math.pow(10, 18); // Assume 18 decimals
    return `${formattedAmount} ${getTokenSymbol(tokenAddress)}`;
  };

  const getTokenSymbol = (tokenAddress: string) => {
    // This is simplified - in production you'd want to fetch from contract or token list
    const tokenSymbols: Record<string, string> = {
      '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174': 'USDC',
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F': 'USDT',
      '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063': 'DAI',
    };
    return tokenSymbols[tokenAddress] || 'Token';
  };

  const getButtonText = () => {
    if (!state.isConnected) return connectText;
    if (state.isSubscribing) return subscribingText;
    if (state.isSubscribed) return subscribedText;
    return subscribeText;
  };

  const isButtonDisabled = () => {
    return disabled || state.isLoading || state.isSubscribing || state.isSubscribed || !!state.error;
  };

  const buttonStyles = {
    ...getDefaultStyles(theme, size, variant),
    ...style,
  };

  if (state.isLoading) {
    return (
      <div className={className} style={buttonStyles}>
        Loading...
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={className} style={{ ...buttonStyles, backgroundColor: '#ef4444' }}>
        Error: {state.error}
      </div>
    );
  }

  return (
    <div className="gasless-subscribe-button\">
      {showPlanDetails && state.plan && (
        <div className="plan-details\" style={{ marginBottom: '12px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>{state.plan.name}</h3>
          <p style={{ margin: '0 0 8px 0', color: '#666', fontSize: '14px' }}>
            {state.plan.description}
          </p>
          {showPrice && (
            <div style={{ fontSize: '16px', fontWeight: '600' }}>
              {formatPrice(customAmount || state.plan.amount, state.plan.tokenAddress)}
              <span style={{ fontSize: '14px', color: '#666', marginLeft: '8px' }}>per month</span>
            </div>
          )}
        </div>
      )}
      
      <button
        className={className}
        style={buttonStyles}
        onClick={state.isConnected ? handleSubscribe : handleConnect}
        disabled={isButtonDisabled()}
      >
        {getButtonText()}
      </button>
      
      {state.walletStatus && (
        <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
          {state.walletStatus.smartWalletDeployed ? (
            `Smart Wallet: ${state.walletStatus.smartWalletAddress?.slice(0, 6)}...${state.walletStatus.smartWalletAddress?.slice(-4)}`
          ) : (
            'Smart Wallet will be deployed automatically'
          )}
        </div>
      )}
    </div>
  );
};

// Hook for using the SDK in React components
export const useGaslessSubscription = (sdk: GaslessSubscriptionSDK) => {
  const [isConnected, setIsConnected] = useState(sdk.isConnected);
  const [walletAddress, setWalletAddress] = useState(sdk.connectedAddress);
  const [smartWalletAddress, setSmartWalletAddress] = useState(sdk.smartWalletAddr);

  useEffect(() => {
    // Update state when SDK connection changes
    setIsConnected(sdk.isConnected);
    setWalletAddress(sdk.connectedAddress);
    setSmartWalletAddress(sdk.smartWalletAddr);
  }, [sdk]);

  const subscribe = useCallback(async (options: SubscribeOptions) => {
    return await sdk.subscribe(options);
  }, [sdk]);

  const unsubscribe = useCallback(async (subscriptionId: string) => {
    return await sdk.unsubscribe({ subscriptionId });
  }, [sdk]);

  const getActiveSubscriptions = useCallback(async (userAddress?: string) => {
    return await sdk.getActiveSubscriptions(userAddress);
  }, [sdk]);

  const getPlan = useCallback(async (planId: string) => {
    return await sdk.getPlan(planId);
  }, [sdk]);

  return {
    isConnected,
    walletAddress,
    smartWalletAddress,
    isSmartWalletDeployed: sdk.isSmartWalletDeployed,
    subscribe,
    unsubscribe,
    getActiveSubscriptions,
    getPlan,
  };
};

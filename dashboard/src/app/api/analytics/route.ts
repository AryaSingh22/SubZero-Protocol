import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// Contract ABI (simplified for analytics)
const SUBSCRIPTION_MANAGER_ABI = [
  {
    "type": "function",
    "name": "getPlan",
    "inputs": [{ "name": "planId", "type": "uint256" }],
    "outputs": [
      {
        "type": "tuple",
        "components": [
          { "name": "id", "type": "uint256" },
          { "name": "name", "type": "string" },
          { "name": "description", "type": "string" },
          { "name": "amount", "type": "uint256" },
          { "name": "tokenAddress", "type": "address" },
          { "name": "interval", "type": "uint256" },
          { "name": "maxPayments", "type": "uint256" },
          { "name": "isActive", "type": "bool" },
          { "name": "creator", "type": "address" },
          { "name": "createdAt", "type": "uint256" },
          { "name": "trialPeriod", "type": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSubscription",
    "inputs": [{ "name": "subscriptionId", "type": "uint256" }],
    "outputs": [
      {
        "type": "tuple",
        "components": [
          { "name": "id", "type": "uint256" },
          { "name": "planId", "type": "uint256" },
          { "name": "subscriber", "type": "address" },
          { "name": "startTime", "type": "uint256" },
          { "name": "nextPaymentTime", "type": "uint256" },
          { "name": "paymentCount", "type": "uint256" },
          { "name": "totalPaid", "type": "uint256" },
          { "name": "isActive", "type": "bool" },
          { "name": "isPaused", "type": "bool" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPlanAnalytics",
    "inputs": [{ "name": "planId", "type": "uint256" }],
    "outputs": [
      {
        "type": "tuple",
        "components": [
          { "name": "totalSubscribers", "type": "uint256" },
          { "name": "activeSubscribers", "type": "uint256" },
          { "name": "totalRevenue", "type": "uint256" },
          { "name": "averageLifetime", "type": "uint256" },
          { "name": "churnRate", "type": "uint256" }
        ]
      }
    ],
    "stateMutability": "view"
  }
];

// Event signatures for filtering
const EVENT_SIGNATURES = {
  PlanCreated: "0x...", // You'll need to calculate the actual event signature hashes
  SubscriptionCreated: "0x...",
  SubscriptionCancelled: "0x...",
  PaymentProcessed: "0x...",
};

// Configuration
const RPC_URLS = {
  137: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com/',
  80001: process.env.MUMBAI_RPC_URL || 'https://rpc-mumbai.maticvigil.com/',
  31337: 'http://127.0.0.1:8545',
};

const CONTRACT_ADDRESSES = {
  137: {
    SUBSCRIPTION_MANAGER: process.env.SUBSCRIPTION_MANAGER_POLYGON || '',
  },
  80001: {
    SUBSCRIPTION_MANAGER: process.env.SUBSCRIPTION_MANAGER_MUMBAI || '',
  },
  31337: {
    SUBSCRIPTION_MANAGER: process.env.SUBSCRIPTION_MANAGER_LOCAL || '',
  },
};

interface AnalyticsRequest {
  chainId?: number;
  creator?: string;
  planId?: string;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  startDate?: string;
  endDate?: string;
}

interface AnalyticsResponse {
  totalSubscribers: number;
  totalRevenue: string;
  activeSubscriptions: number;
  cancelledSubscriptions: number;
  pausedSubscriptions: number;
  averageSubscriptionDuration: number;
  churnRate: number;
  monthlyRecurringRevenue: string;
  subscriptionsByPlan: Record<string, number>;
  revenueByPlan: Record<string, string>;
  revenueOverTime: Array<{
    date: string;
    revenue: string;
    subscriptions: number;
  }>;
  topPlans: Array<{
    id: string;
    name: string;
    subscribers: number;
    revenue: string;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const params: AnalyticsRequest = {
      chainId: parseInt(searchParams.get('chainId') || '80001'),
      creator: searchParams.get('creator') || undefined,
      planId: searchParams.get('planId') || undefined,
      timeRange: (searchParams.get('timeRange') as any) || 'month',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    };

    const analytics = await fetchAnalytics(params);
    
    return NextResponse.json(analytics);
  } catch (error) {
    console.error('Analytics API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function fetchAnalytics(params: AnalyticsRequest): Promise<AnalyticsResponse> {
  const chainId = params.chainId || 80001;
  const rpcUrl = RPC_URLS[chainId as keyof typeof RPC_URLS];
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES]?.SUBSCRIPTION_MANAGER;

  if (!rpcUrl || !contractAddress) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, SUBSCRIPTION_MANAGER_ABI, provider);

  // Calculate time range
  const endTime = params.endDate ? new Date(params.endDate) : new Date();
  const startTime = params.startDate 
    ? new Date(params.startDate) 
    : getStartTimeForRange(params.timeRange || 'month', endTime);

  // Fetch events from the blockchain
  const events = await fetchSubscriptionEvents(provider, contractAddress, startTime, endTime, params.creator);
  
  // Process events to generate analytics
  const analytics = await processEventsToAnalytics(events, contract, params);
  
  return analytics;
}

async function fetchSubscriptionEvents(
  provider: ethers.Provider,
  contractAddress: string,
  startTime: Date,
  endTime: Date,
  creator?: string
) {
  const startBlock = await getBlockByTimestamp(provider, startTime);
  const endBlock = await getBlockByTimestamp(provider, endTime);

  console.log(`Fetching events from block ${startBlock} to ${endBlock}`);

  // Fetch different types of events
  const filter = {
    address: contractAddress,
    fromBlock: startBlock,
    toBlock: endBlock,
  };

  const logs = await provider.getLogs(filter);
  
  // Parse events (simplified - in production you'd want to parse each event type properly)
  const events = logs.map(log => ({
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockHash: log.blockHash,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
  }));

  return events;
}

async function processEventsToAnalytics(
  events: any[],
  contract: ethers.Contract,
  params: AnalyticsRequest
): Promise<AnalyticsResponse> {
  // This is a simplified implementation
  // In production, you would parse events properly and calculate real metrics
  
  // Mock data for demonstration
  const mockAnalytics: AnalyticsResponse = {
    totalSubscribers: events.length * 3 + Math.floor(Math.random() * 100),
    totalRevenue: ethers.parseEther((events.length * 50 + Math.random() * 1000).toString()).toString(),
    activeSubscriptions: Math.floor(events.length * 0.7 + Math.random() * 50),
    cancelledSubscriptions: Math.floor(events.length * 0.2 + Math.random() * 20),
    pausedSubscriptions: Math.floor(events.length * 0.1 + Math.random() * 10),
    averageSubscriptionDuration: 45 + Math.floor(Math.random() * 60), // days
    churnRate: 5 + Math.random() * 10, // percentage
    monthlyRecurringRevenue: ethers.parseEther((events.length * 30 + Math.random() * 500).toString()).toString(),
    subscriptionsByPlan: {
      '1': 25 + Math.floor(Math.random() * 50),
      '2': 15 + Math.floor(Math.random() * 30),
      '3': 10 + Math.floor(Math.random() * 20),
    },
    revenueByPlan: {
      '1': ethers.parseEther('2500').toString(),
      '2': ethers.parseEther('1800').toString(),
      '3': ethers.parseEther('1200').toString(),
    },
    revenueOverTime: generateRevenueOverTime(params.timeRange || 'month'),
    topPlans: [
      {
        id: '1',
        name: 'Premium Plan',
        subscribers: 45,
        revenue: ethers.parseEther('2500').toString(),
      },
      {
        id: '2',
        name: 'Basic Plan',
        subscribers: 32,
        revenue: ethers.parseEther('1800').toString(),
      },
      {
        id: '3',
        name: 'Pro Plan',
        subscribers: 28,
        revenue: ethers.parseEther('1200').toString(),
      },
    ],
  };

  return mockAnalytics;
}

function generateRevenueOverTime(timeRange: string) {
  const data = [];
  const intervals = timeRange === 'day' ? 24 : timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 365;
  
  for (let i = intervals - 1; i >= 0; i--) {
    const date = new Date();
    if (timeRange === 'day') {
      date.setHours(date.getHours() - i);
    } else if (timeRange === 'week') {
      date.setDate(date.getDate() - i);
    } else if (timeRange === 'month') {
      date.setDate(date.getDate() - i);
    } else {
      date.setDate(date.getDate() - i * 7);
    }
    
    data.push({
      date: date.toISOString().split('T')[0],
      revenue: ethers.parseEther((Math.random() * 100 + 50).toString()).toString(),
      subscriptions: Math.floor(Math.random() * 10 + 5),
    });
  }
  
  return data;
}

async function getBlockByTimestamp(provider: ethers.Provider, timestamp: Date): Promise<number> {
  // This is a simplified implementation
  // In production, you'd want to use binary search to find the exact block
  const currentBlock = await provider.getBlockNumber();
  const currentBlockData = await provider.getBlock(currentBlock);
  
  if (!currentBlockData) {
    throw new Error('Could not fetch current block');
  }
  
  const currentTimestamp = currentBlockData.timestamp * 1000;
  const targetTimestamp = timestamp.getTime();
  const timeDiff = currentTimestamp - targetTimestamp;
  
  // Approximate: ~2 seconds per block on Polygon
  const blockDiff = Math.floor(timeDiff / 2000);
  
  return Math.max(0, currentBlock - blockDiff);
}

function getStartTimeForRange(timeRange: string, endTime: Date): Date {
  const startTime = new Date(endTime);
  
  switch (timeRange) {
    case 'day':
      startTime.setDate(startTime.getDate() - 1);
      break;
    case 'week':
      startTime.setDate(startTime.getDate() - 7);
      break;
    case 'month':
      startTime.setMonth(startTime.getMonth() - 1);
      break;
    case 'year':
      startTime.setFullYear(startTime.getFullYear() - 1);
      break;
    default:
      startTime.setMonth(startTime.getMonth() - 1);
  }
  
  return startTime;
}
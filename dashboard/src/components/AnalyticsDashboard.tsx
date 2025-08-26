'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  Calendar,
  Activity,
  Pause,
  X,
  RefreshCw
} from 'lucide-react';
import { ethers } from 'ethers';

interface AnalyticsData {
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

interface FilterOptions {
  chainId: number;
  timeRange: 'day' | 'week' | 'month' | 'year';
  creator?: string;
  planId?: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  color?: string;
}> = ({ title, value, change, icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {change !== undefined && (
            <div className="flex items-center mt-2">
              {change >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
              )}
              <span className={`text-sm font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(change).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const FilterPanel: React.FC<{
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  onRefresh: () => void;
  isLoading: boolean;
}> = ({ filters, onFiltersChange, onRefresh, isLoading }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Network:</label>
          <select
            value={filters.chainId}
            onChange={(e) => onFiltersChange({ ...filters, chainId: parseInt(e.target.value) })}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={137}>Polygon Mainnet</option>
            <option value={80001}>Mumbai Testnet</option>
            <option value={31337}>Local Network</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Time Range:</label>
          <select
            value={filters.timeRange}
            onChange={(e) => onFiltersChange({ ...filters, timeRange: e.target.value as any })}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="day">Last 24 Hours</option>
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="year">Last Year</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Creator:</label>
          <input
            type="text"
            placeholder="0x..."
            value={filters.creator || ''}
            onChange={(e) => onFiltersChange({ ...filters, creator: e.target.value || undefined })}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
          />
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </div>
  );
};

export default function AnalyticsDashboard() {
  const [filters, setFilters] = useState<FilterOptions>({
    chainId: 80001,
    timeRange: 'month',
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['analytics', filters],
    queryFn: async (): Promise<AnalyticsData> => {
      const params = new URLSearchParams();
      params.append('chainId', filters.chainId.toString());
      params.append('timeRange', filters.timeRange);
      if (filters.creator) params.append('creator', filters.creator);
      if (filters.planId) params.append('planId', filters.planId);

      const response = await fetch(`/api/analytics?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }
      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const formatTokenAmount = (amount: string) => {
    try {
      const formatted = ethers.formatEther(amount);
      const num = parseFloat(formatted);
      if (num < 0.01) return '< 0.01';
      return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch {
      return '0';
    }
  };

  const formatRevenueData = (revenueOverTime: AnalyticsData['revenueOverTime']) => {
    return revenueOverTime.map(item => ({
      ...item,
      revenueFormatted: parseFloat(ethers.formatEther(item.revenue)),
      date: new Date(item.date).toLocaleDateString(),
    }));
  };

  const formatPlanData = (subscriptionsByPlan: Record<string, number>) => {
    return Object.entries(subscriptionsByPlan).map(([planId, count]) => ({
      name: `Plan ${planId}`,
      value: count,
    }));
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <X className="h-12 w-12 mx-auto" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Analytics</h2>
          <p className="text-gray-600 mb-4">{error instanceof Error ? error.message : 'Unknown error'}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Gasless Subscription Analytics
          </h1>
          <p className="text-gray-600">
            Monitor your subscription performance and revenue metrics
          </p>
        </div>

        {/* Filters */}
        <FilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          onRefresh={() => refetch()}
          isLoading={isLoading}
        />

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading analytics...</p>
            </div>
          </div>
        ) : data ? (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <MetricCard
                title="Total Subscribers"
                value={data.totalSubscribers.toLocaleString()}
                change={5.2}
                icon={<Users className="h-6 w-6" />}
                color="blue"
              />
              <MetricCard
                title="Total Revenue"
                value={`${formatTokenAmount(data.totalRevenue)} ETH`}
                change={12.8}
                icon={<DollarSign className="h-6 w-6" />}
                color="green"
              />
              <MetricCard
                title="Active Subscriptions"
                value={data.activeSubscriptions.toLocaleString()}
                change={8.1}
                icon={<Activity className="h-6 w-6" />}
                color="purple"
              />
              <MetricCard
                title="Churn Rate"
                value={`${data.churnRate.toFixed(1)}%`}
                change={-2.3}
                icon={<TrendingDown className="h-6 w-6" />}
                color="yellow"
              />
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <MetricCard
                title="Monthly Recurring Revenue"
                value={`${formatTokenAmount(data.monthlyRecurringRevenue)} ETH`}
                icon={<Calendar className="h-6 w-6" />}
                color="green"
              />
              <MetricCard
                title="Paused Subscriptions"
                value={data.pausedSubscriptions.toLocaleString()}
                icon={<Pause className="h-6 w-6" />}
                color="yellow"
              />
              <MetricCard
                title="Avg. Subscription Duration"
                value={`${data.averageSubscriptionDuration} days`}
                icon={<Calendar className="h-6 w-6" />}
                color="blue"
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Revenue Over Time */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Over Time</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={formatRevenueData(data.revenueOverTime)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(4)} ETH`, 'Revenue']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenueFormatted" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Subscriptions by Plan */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscriptions by Plan</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={formatPlanData(data.subscriptionsByPlan)}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {formatPlanData(data.subscriptionsByPlan).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Plans */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Plans</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subscribers
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg. Revenue per User
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.topPlans.map((plan) => (
                      <tr key={plan.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {plan.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.subscribers.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatTokenAmount(plan.revenue)} ETH
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatTokenAmount((BigInt(plan.revenue) / BigInt(Math.max(plan.subscribers, 1))).toString())} ETH
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
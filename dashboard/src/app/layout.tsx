import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Gasless Subscription Analytics',
  description: 'Analytics dashboard for gasless subscription payments using ERC-4337',
  keywords: ['ethereum', 'erc-4337', 'gasless', 'subscription', 'analytics', 'web3'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
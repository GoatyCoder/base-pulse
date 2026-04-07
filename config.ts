import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'BasePulse OnChain',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', // Prendilo gratis su cloud.walletconnect.com
  chains: [base],
  ssr: true,
});
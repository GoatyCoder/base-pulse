import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'BasePulse OnChain',
  projectId: 'ddf172d3592beb62f5681b0f82c3574d', // Prendilo gratis su cloud.walletconnect.com
  chains: [base],
  ssr: true,
});
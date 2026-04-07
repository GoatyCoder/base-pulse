"use client";

import Image from 'next/image';
import Link from 'next/link';
import '@rainbow-me/rainbowkit/styles.css';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { isAddress } from 'viem';
import { WagmiProvider, usePublicClient, useReadContract } from 'wagmi';
import { config } from '../../../config';

const queryClient = new QueryClient();
const CONTRACT_ADDRESS = '0xC41581Cc82446374f882d699B5a680229d3D2295' as const;
const ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'profiles',
    outputs: [
      { internalType: 'string', name: 'status', type: 'string' },
      { internalType: 'uint256', name: 'totalTips', type: 'uint256' },
      { internalType: 'bool', name: 'hasProfile', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'status', type: 'string' }
    ],
    name: 'ProfileMinted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      { indexed: false, internalType: 'string', name: 'newStatus', type: 'string' }
    ],
    name: 'StatusUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'TipSent',
    type: 'event'
  }
] as const;

type ActivityItem = {
  id: string;
  blockNumber: bigint;
  text: string;
};

function SharedProfileContent() {
  const params = useParams<{ address: string }>();
  const publicClient = usePublicClient();

  const rawAddress = Array.isArray(params.address) ? params.address[0] : params.address;
  const profileAddress = useMemo(
    () => (isAddress(rawAddress ?? '') ? (rawAddress as `0x${string}`) : null),
    [rawAddress]
  );

  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [tokenUri, setTokenUri] = useState('');
  const [tokenImage, setTokenImage] = useState('');
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const { data: profile } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'profiles',
    args: [profileAddress as `0x${string}`],
    query: { enabled: !!profileAddress }
  });

  const decodeTokenUri = (uri: string) => {
    if (!uri.startsWith('data:application/json;base64,')) {
      setTokenImage('');
      return;
    }

    try {
      const encodedJson = uri.split(',')[1] ?? '';
      const decodedJson = JSON.parse(atob(encodedJson)) as { image?: string };
      setTokenImage(decodedJson.image ?? '');
    } catch {
      setTokenImage('');
    }
  };

  const loadData = useCallback(async () => {
    if (!publicClient || !profileAddress) return;

    const profileMintedLogs = await publicClient.getLogs({
      address: CONTRACT_ADDRESS,
      event: ABI[2],
      args: { user: profileAddress },
      fromBlock: BigInt(0),
      toBlock: 'latest'
    });

    if (profileMintedLogs.length) {
      const mintedTokenId = profileMintedLogs[profileMintedLogs.length - 1].args.tokenId as bigint;
      setTokenId(mintedTokenId);

      const uri = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'tokenURI',
        args: [mintedTokenId]
      });

      setTokenUri(uri);
      decodeTokenUri(uri);
    } else {
      setTokenId(null);
      setTokenUri('');
      setTokenImage('');
    }

    const [statusUpdated, tipsSent, tipsReceived] = await Promise.all([
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: ABI[3],
        args: { user: profileAddress },
        fromBlock: BigInt(0),
        toBlock: 'latest'
      }),
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: ABI[4],
        args: { from: profileAddress },
        fromBlock: BigInt(0),
        toBlock: 'latest'
      }),
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: ABI[4],
        args: { to: profileAddress },
        fromBlock: BigInt(0),
        toBlock: 'latest'
      })
    ]);

    const mapped: ActivityItem[] = [
      ...statusUpdated.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        blockNumber: log.blockNumber ?? BigInt(0),
        text: `Status aggiornato: ${String(log.args.newStatus ?? '')}`
      })),
      ...tipsSent.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        blockNumber: log.blockNumber ?? BigInt(0),
        text: `Mancia inviata a ${String(log.args.to ?? '').slice(0, 10)}... (${Number(log.args.amount ?? BigInt(0)) / 1e18} ETH)`
      })),
      ...tipsReceived.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        blockNumber: log.blockNumber ?? BigInt(0),
        text: `Mancia ricevuta da ${String(log.args.from ?? '').slice(0, 10)}... (${Number(log.args.amount ?? BigInt(0)) / 1e18} ETH)`
      }))
    ];

    setActivity(mapped.sort((a, b) => Number(b.blockNumber - a.blockNumber)).slice(0, 8));
  }, [profileAddress, publicClient]);

  useEffect(() => {
    if (!profileAddress || !publicClient) return;

    const timeoutId = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [profileAddress, publicClient, loadData]);

  return (
    <div className="min-h-screen bg-[#0052FF]/5 text-white font-sans p-4">
      <div className="max-w-xl mx-auto space-y-6">
        <header className="flex justify-between items-center py-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0052FF]">BasePulse 🔵</h1>
            <p className="text-zinc-500 text-sm">Profilo condiviso on-chain</p>
          </div>
          <ConnectButton />
        </header>

        {!profileAddress ? (
          <div className="bg-white text-black p-6 rounded-3xl shadow-xl border border-zinc-200">
            <h2 className="text-xl font-bold mb-3">Indirizzo non valido</h2>
            <p className="text-sm text-zinc-600">L&apos;URL deve essere nel formato /u/0x...</p>
          </div>
        ) : (
          <>
            <div className="bg-white text-black p-6 rounded-3xl shadow-xl border border-zinc-200">
              <h2 className="text-xl font-bold mb-3">Profilo</h2>
              <p className="text-xs text-zinc-500 break-all mb-3">{profileAddress}</p>
              {profile && profile[2] ? (
                <div className="space-y-2">
                  <p className="bg-zinc-100 p-3 rounded-xl italic">&ldquo;{profile[0]}&rdquo;</p>
                  <p className="text-sm text-zinc-500">Mance totali: {Number(profile[1]) / 1e18} ETH</p>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Nessun profilo on-chain trovato.</p>
              )}
            </div>

            <div className="bg-white text-black p-6 rounded-3xl shadow-xl border border-zinc-200">
              <h2 className="text-xl font-bold mb-3">NFT On-Chain</h2>
              {tokenId !== null ? (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-500">Token ID: #{String(tokenId)}</p>
                  {tokenImage ? (
                    <Image
                      src={tokenImage}
                      alt="Anteprima NFT BasePulse"
                      width={350}
                      height={350}
                      unoptimized
                      className="w-full rounded-2xl border border-zinc-200 bg-zinc-100"
                    />
                  ) : (
                    <p className="text-sm text-zinc-500">Immagine non disponibile.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`https://basescan.org/token/${CONTRACT_ADDRESS}?a=${String(tokenId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-100 border border-zinc-300"
                    >
                      Apri su BaseScan
                    </a>
                    <a
                      href={`https://opensea.io/assets/base/${CONTRACT_ADDRESS}/${String(tokenId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block px-3 py-2 text-xs font-semibold rounded-lg bg-zinc-100 border border-zinc-300"
                    >
                      Apri su OpenSea
                    </a>
                  </div>
                  {tokenUri && (
                    <p className="text-xs text-zinc-500 break-all">tokenURI: {tokenUri.slice(0, 100)}...</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Nessun NFT trovato per questo wallet.</p>
              )}
            </div>

            <div className="bg-white text-black p-6 rounded-3xl shadow-xl border border-zinc-200">
              <h2 className="text-xl font-bold mb-3">Attivita On-Chain</h2>
              {activity.length ? (
                <ul className="space-y-2 text-sm text-zinc-700">
                  {activity.map(item => (
                    <li key={item.id} className="bg-zinc-100 p-3 rounded-xl">{item.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">Nessun evento trovato.</p>
              )}
            </div>
          </>
        )}

        <Link href="/" className="inline-block text-sm text-[#0052FF] font-semibold">
          Torna alla home
        </Link>
      </div>
    </div>
  );
}

export default function SharedProfilePage() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <SharedProfileContent />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

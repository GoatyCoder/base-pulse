"use client";
import Image from 'next/image';
import '@rainbow-me/rainbowkit/styles.css';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '../config';
import { useCallback, useEffect, useState } from 'react';
import { waitForTransactionReceipt } from '@wagmi/core';
import { BaseError, isAddress, parseEther } from 'viem';

const queryClient = new QueryClient();
const CONTRACT_ADDRESS = '0xC41581Cc82446374f882d699B5a680229d3D2295' as const;
const ABI = [
  {
    inputs: [{ internalType: 'string', name: '_status', type: 'string' }],
    name: 'initProfile',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: '_to', type: 'address' }],
    name: 'tipUser',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
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
    inputs: [{ internalType: 'string', name: '_status', type: 'string' }],
    name: 'setStatus',
    outputs: [],
    stateMutability: 'nonpayable',
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

function AppContent() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [profileStatus, setProfileStatus] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [tipTo, setTipTo] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [uiMessage, setUiMessage] = useState("");
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [tokenUri, setTokenUri] = useState('');
  const [tokenImage, setTokenImage] = useState('');
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  // Legge i dati del profilo dal mapping pubblico
  const { data: profile, refetch: refetchProfile } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'profiles',
    args: [address!],
    query: { enabled: !!address }
  });

  const { writeContractAsync, isPending } = useWriteContract();

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

  const loadNftPreview = useCallback(async (user: `0x${string}`) => {
    if (!publicClient) return;

    const profileMintedLogs = await publicClient.getLogs({
      address: CONTRACT_ADDRESS,
      event: ABI[5],
      args: { user },
      fromBlock: BigInt(0),
      toBlock: 'latest'
    });

    if (profileMintedLogs.length === 0) {
      setTokenId(null);
      setTokenUri('');
      setTokenImage('');
      return;
    }

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
  }, [publicClient]);

  const loadActivity = useCallback(async (user: `0x${string}`) => {
    if (!publicClient) return;

    const [minted, statusUpdated, tipsSent, tipsReceived] = await Promise.all([
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: ABI[5],
        args: { user },
        fromBlock: BigInt(0),
        toBlock: 'latest'
      }),
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: ABI[6],
        args: { user },
        fromBlock: BigInt(0),
        toBlock: 'latest'
      }),
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: ABI[7],
        args: { from: user },
        fromBlock: BigInt(0),
        toBlock: 'latest'
      }),
      publicClient.getLogs({
        address: CONTRACT_ADDRESS,
        event: ABI[7],
        args: { to: user },
        fromBlock: BigInt(0),
        toBlock: 'latest'
      })
    ]);

    const mapped: ActivityItem[] = [
      ...minted.map(log => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        blockNumber: log.blockNumber ?? BigInt(0),
        text: `NFT mintato (token #${String(log.args.tokenId ?? '')})`
      })),
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

    const unique = new Map<string, ActivityItem>();
    mapped.forEach(item => unique.set(item.id, item));

    setActivity(
      Array.from(unique.values())
        .sort((a, b) => Number(b.blockNumber - a.blockNumber))
        .slice(0, 8)
    );
  }, [publicClient]);

  const refreshOnchainData = useCallback(async () => {
    if (!address) return;

    await refetchProfile();
    await Promise.all([loadNftPreview(address), loadActivity(address)]);
  }, [address, refetchProfile, loadActivity, loadNftPreview]);

  useEffect(() => {
    if (!address || !publicClient) return;

    const timeoutId = setTimeout(() => {
      void refetchProfile();
      void loadNftPreview(address);
      void loadActivity(address);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [address, publicClient, refetchProfile, loadNftPreview, loadActivity]);

  const getErrorMessage = (error: unknown) => {
    if (error instanceof BaseError) {
      return error.shortMessage || error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Errore sconosciuto durante la transazione.';
  };

  const mintProfile = async () => {
    if (!profileStatus.trim()) {
      setUiMessage('Inserisci uno status prima di mintare il profilo.');
      return;
    }

    try {
      setUiMessage('Conferma la transazione nel wallet...');
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'initProfile',
        args: [profileStatus]
      });

      setUiMessage(`Tx inviata: ${hash.slice(0, 10)}... In attesa di conferma on-chain...`);
      await waitForTransactionReceipt(config, { hash });

      setUiMessage('Profilo NFT mintato con successo.');
      setProfileStatus('');
      await refreshOnchainData();
    } catch (error) {
      setUiMessage(getErrorMessage(error));
    }
  };

  const updateStatus = async () => {
    if (!newStatus.trim()) {
      setUiMessage('Inserisci un nuovo status.');
      return;
    }

    try {
      setUiMessage('Conferma l\'aggiornamento status nel wallet...');
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'setStatus',
        args: [newStatus]
      });

      setUiMessage(`Tx inviata: ${hash.slice(0, 10)}... In attesa di conferma on-chain...`);
      await waitForTransactionReceipt(config, { hash });

      setUiMessage('Status aggiornato con successo.');
      setNewStatus('');
      await refreshOnchainData();
    } catch (error) {
      setUiMessage(getErrorMessage(error));
    }
  };

  const sendTip = async () => {
    if (!isAddress(tipTo)) {
      setUiMessage('Inserisci un address valido (0x...).');
      return;
    }

    try {
      setUiMessage('Conferma la mancia nel wallet...');
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'tipUser',
        args: [tipTo],
        value: parseEther(amount)
      });

      setUiMessage(`Tx inviata: ${hash.slice(0, 10)}... In attesa di conferma on-chain...`);
      await waitForTransactionReceipt(config, { hash });

      setUiMessage('Mancia inviata con successo.');
      await refreshOnchainData();
    } catch (error) {
      setUiMessage(getErrorMessage(error));
    }
  };

  return (
    <div className="min-h-screen bg-[#0052FF]/5 text-white font-sans p-4">
      <div className="max-w-xl mx-auto space-y-6">
        <header className="flex justify-between items-center py-6">
          <h1 className="text-2xl font-bold text-[#0052FF]">BasePulse 🔵</h1>
          <ConnectButton />
        </header>

        {isConnected ? (
          <>
            {/* Box Profilo */}
            <div className="bg-white text-black p-6 rounded-3xl shadow-xl border border-zinc-200">
              <h2 className="text-xl font-bold mb-4">Il tuo Profilo</h2>
              {profile && profile[2] ? (
                <div className="space-y-2">
                  <p className="bg-zinc-100 p-3 rounded-xl italic">&ldquo;{profile[0]}&rdquo;</p>
                  <p className="text-sm text-zinc-500">Mance totali: {Number(profile[1]) / 1e18} ETH</p>
                  <div className="pt-3 space-y-2">
                    <input
                      placeholder="Nuovo status"
                      className="w-full border p-3 rounded-xl"
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}
                    />
                    <button
                      onClick={updateStatus}
                      disabled={isPending}
                      className="w-full bg-zinc-900 text-white p-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Aggiorna Status
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    placeholder="Che stai pensando?"
                    className="w-full border p-3 rounded-xl"
                    value={profileStatus}
                    onChange={e => setProfileStatus(e.target.value)}
                  />
                  <button
                    onClick={mintProfile}
                    disabled={isPending}
                    className="w-full bg-[#0052FF] text-white p-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending ? 'Invio in corso...' : 'Minta Profilo NFT'}
                  </button>
                </div>
              )}
            </div>

            {/* Box Mance */}
            <div className="bg-zinc-900 p-6 rounded-3xl shadow-xl">
              <h2 className="text-xl font-bold mb-4 text-white">Invia una Mancia</h2>
              <input placeholder="Indirizzo (0x...)" className="w-full bg-zinc-800 p-3 rounded-xl mb-3 text-white" onChange={e => setTipTo(e.target.value)} />
              <input type="number" step="0.001" className="w-full bg-zinc-800 p-3 rounded-xl mb-3 text-white" value={amount} onChange={e => setAmount(e.target.value)} />
              <button onClick={sendTip} disabled={isPending} className="w-full bg-green-500 text-black p-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed">Invia ETH</button>
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

            {uiMessage && (
              <div className="bg-zinc-100 text-zinc-800 p-4 rounded-2xl border border-zinc-300 text-sm">
                {uiMessage}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-zinc-500">Connetti il wallet per interagire con Base.</div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <AppContent />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

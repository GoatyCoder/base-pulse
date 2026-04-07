"use client";
import '@rainbow-me/rainbowkit/styles.css';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider, useAccount, useReadContract, useWriteContract } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '../config';
import { useState } from 'react';
import { waitForTransactionReceipt } from '@wagmi/core';
import { BaseError, isAddress, parseEther } from 'viem';

const queryClient = new QueryClient();
const CONTRACT_ADDRESS = "0xC41581Cc82446374f882d699B5a680229d3D2295";
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
  }
] as const;

function AppContent() {
  const { address, isConnected } = useAccount();
  const [profileStatus, setProfileStatus] = useState("");
  const [tipTo, setTipTo] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [uiMessage, setUiMessage] = useState("");

  // Legge i dati del profilo dal mapping pubblico
  const { data: profile, refetch: refetchProfile } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'profiles',
    args: [address!],
    query: { enabled: !!address }
  });

  const { writeContractAsync, isPending } = useWriteContract();

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
      await refetchProfile();
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
      await refetchProfile();
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

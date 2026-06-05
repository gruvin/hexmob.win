import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { http } from 'viem'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, pulsechain as pulsechainDefault } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'
import App from './App.tsx'
import './App.scss'
import "./i18n"

// Get AppKit Project ID from environment
const REOWN_APPKIT_ID = import.meta.env.VITE_REOWN_APPKIT_ID;
if (!REOWN_APPKIT_ID) throw new Error('AppKit ID (REOWN_APPKIT_ID) is not defined')

const metadata = {
  name: 'HEXMOB',
  description: 'HEX Mining Mobile Interface',
  url: window.location.origin,
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

// Create custom Pulsechain network with icon
// Mainnet uses the default icon from AppKit, but we add a custom icon for Pulsechain
const pulsechain: AppKitNetwork = {
  ...pulsechainDefault,
  chainImage: '/pulsechain.png'
} as AppKitNetwork

// Set the networks for Wagmi and AppKit
const networks = [pulsechain, mainnet] as [AppKitNetwork, ...AppKitNetwork[]]

// Create Wagmi Adapter.
// Reads (call()) go through a Viem Public Client — the transport below — NOT the
// wallet; writes/signing always go through the wallet regardless. So the transport
// is purely a read-path concern. We use each chain's *definition default* RPC
// (http() with no URL) rather than hardcoding endpoints we'd have to maintain:
// PulseChain resolves to rpc.pulsechain.com via its network def, mainnet to viem's
// maintained default. This avoids the app breaking because one of our own
// hardcoded providers went away. A user's wallet RPC config is theirs to manage.
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: REOWN_APPKIT_ID,
  transports: {
    [mainnet.id]: http(),
    [pulsechain.id]: http()
  },
  ssr: false
})

// Initialize AppKit with Wagmi adapter
// AppKit provides wallet selection UI and network switching capabilities
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId: REOWN_APPKIT_ID,
  metadata,
  features: {
    analytics: false,
    allWallets: true
  },
  themeMode: 'dark',
  defaultNetwork: pulsechain
})

// Create Query Client for TanStack Query
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)

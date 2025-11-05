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

// Create Wagmi Adapter with explicit RPC transports
// This allows reads/writes to work reliably without depending on WalletConnect RPC
const infuraId = import.meta.env.VITE_INFURA_ID as string | undefined
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: REOWN_APPKIT_ID,
  transports: {
    [mainnet.id]: http(
      infuraId ? `https://mainnet.infura.io/v3/${infuraId}` : 'https://eth.llamarpc.com'
    ),
    [pulsechain.id]: http('https://rpc.pulsechain.com')
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

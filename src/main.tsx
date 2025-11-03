import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { mainnet, goerli, pulsechain, pulsechainV4, hardhat } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react'
import { walletConnect, injected } from 'wagmi/connectors'
import App from './App.tsx'
import './App.scss'
import "./i18n"

const chains = [mainnet, goerli, pulsechain, pulsechainV4, hardhat] as const

// Get project ID from environment
const projectId = import.meta.env.VITE_WALLET_CONNECT_ID || 'fallback-project-id'

// 1. Get projectId from https://cloud.walletconnect.com
if (!projectId) throw new Error('Project ID is not defined')

const metadata = {
  name: 'HexMob',
  description: 'HEX Mobile Wallet Interface',
  url: 'https://hexmob.win', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

// 2. Create wagmiConfig
const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  connectors: [
    injected({ 
      target: 'metaMask',
      shimDisconnect: true,
    }),
    injected({
      shimDisconnect: true,
    }),
    walletConnect({ 
      projectId,
      showQrModal: false,
    }),
  ],
})

// 3. Create modal
createWeb3Modal({
  wagmiConfig,
  projectId,
  enableAnalytics: false,
  allowUnsupportedChain: true,
  themeMode: 'dark',
  enableOnramp: false,
})

// Create Query Client
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)

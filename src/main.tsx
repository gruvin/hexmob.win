import React from 'react'
import ReactDOM from 'react-dom/client'
import { configureChains, createConfig, WagmiConfig } from 'wagmi'
import { mainnet, goerli, pulsechain, pulsechainV4 } from 'wagmi/chains'
import { EthereumClient, w3mConnectors, w3mProvider } from '@web3modal/ethereum'
import { infuraProvider } from 'wagmi/providers/infura'
// import { jsonRpcProvider } from 'wagmi/providers/jsonRpc'
import { Web3Modal } from '@web3modal/react'
import App from './App.tsx'
import './App.scss'

const chains = [mainnet, goerli, pulsechain, pulsechainV4]

// ref: https://wagmi.sh/react/providers/configuring-chains
const projectId = import.meta.env.VITE_WALLET_CONNECT_ID
const { publicClient } = configureChains(
  chains,
  [
    // jsonRpcProvider({
    //   rpc: (chain) => {
    //     if (chain.id == 943) return {
    //       http: "http://pulsechainv4.local:8545",
    //       webSocket: `ws://pulsechainv4.local:8546`,
    //     }
    //     return null
    //   }
    // }),
    
    // it seems to matter that w3wmprovider comes FIRST
    w3mProvider({ projectId }),
    infuraProvider({ apiKey: import.meta.env.VITE_INFURA_ID }),
  ],
)

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors: w3mConnectors({ projectId, chains }),
  publicClient,
})
const ethereumClient = new EthereumClient(wagmiConfig, chains)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <WagmiConfig config={wagmiConfig} >
      <App />
    </WagmiConfig>
    <Web3Modal projectId={projectId} ethereumClient={ethereumClient} />
  </React.StrictMode>,
)

export interface TChain {
    description: string
    name: string
    avatar?: string
    rpcURL: string
    wssURL: string
    explorerURL: string | undefined
}
export interface TChainArray {
    [ index: number]: TChain
}
export default {
    0: {
        description: "Not Connected",
        name: "offline",
        avatar: "/disconnected.png",
        rpcURL: "",
        wssURL: "",
        explorerURL: "https://etherscan.io/tx",
    },
    1: {
        description: "Ethereum Mainnet",
        name: "Ethereum",
        avatar: "/ethereum.png",
        rpcURL: "https://mainnet.infura.io/v3/",
        wssURL: "wss://mainnet.infura.io/ws/v3/",
        explorerURL: "https://etherscan.io/tx",
    },
    3: {
        description: "Ropsten Testnet",
        name: "ropsten",
        rpcURL: "https://ropsten.infura.io/v3/",
        wssURL: "wss://ropsten.infura.io/ws/v3/",
        explorerURL: "https://etherscan.io/tx",
    },
    369: {
        description: "PulseChain",
        name: "pulsechain",
        avatar: "/pulsechain.png",
        rpcURL: "https://rpc.pulsechain.com",
        wssURL: "wss://rpc.pulsechain.com",
        explorerURL: "https://scan.pulsechain.com/",
    },
    943: {
      description: "Pulse Testnet V4",
      name: "pulse-testnet",
      rpcURL: "https://rpc.v4.testnet.pulsechain.com",
      wssURL: "wss://rpc.v4.testnet.pulsechain.com",
      explorerURL: "https://scan.v4.testnet.pulsechain.com/",
    },
    10001: {
      description: "ETHW POW",
      name: "ETHW-mainnet",
      rpcURL: "https://mainnet.ethereumpow.org",
      wssURL: "",
      explorerURL: "https://www.oklink.com/en/ethw/tx/"
    },
    31337: {
      description: "Hardhat",
      name: "Hardhat",
      rpcURL: "http://localhost:8545",
      wssURL: "",
      explorerURL: undefined
    },
    513100: {
        description: "ETH FAIR",
        name: "ETHf-mainnet",
        rpcURL: "https://rpc.etherfair.org/",
        wssURL: "",
        explorerURL: "https://www.oklink.com/en/ethf/tx/"
    },
  } as TChainArray


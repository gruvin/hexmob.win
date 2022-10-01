export interface TChain {
    description: string
    name: string
    rpcURL: string
    wssURL: string
    explorerURL: string
}
export interface TChainArray {
    [ index: number]: TChain
}
const chains: TChainArray = {
    0: {
        description: "Not Connected",
        name: "offline",
        rpcURL: "",
        wssURL: "",
        explorerURL: "https://etherscan.io/tx"
    },
    1: {
        description: "Ethereum Mainnet",
        name: "mainnet",
        rpcURL: "https://mainnet.infura.io/v3/",
        wssURL: "wss://mainnet.infura.io/ws/v3/",
        explorerURL: "https://etherscan.io/tx"
    },
    3: {
        description: "Ropsten Testnet",
        name: "ropsten",
        rpcURL: "https://ropsten.infura.io/v3/",
        wssURL: "wss://ropsten.infura.io/ws/v3/",
        explorerURL: "https://etherscan.io/tx"
    },
    941: {
      description: "Pulse Testnet v2",
      name: "pulse-testnet",
      rpcURL: "https://rpc.v2b.testnet.pulsechain.com",
      wssURL: "",
      explorerURL: "https://scan.v2b.testnet.pulsechain.com/",
    },
    10001: {
      description: "ETHW POW",
      name: "ETHW-mainnet",
      rpcURL: "https://mainnet.ethereumpow.org",
      wssURL: "",
      explorerURL: "https://www.oklink.com/en/ethw/tx/"
    },
    513100: {
        description: "ETH FAIR",
        name: "ETHf-mainnet",
        rpcURL: "https://rpc.etherfair.org/",
        wssURL: "",
        explorerURL: "https://www.oklink.com/en/ethf/tx/"
    },
  }

export default chains
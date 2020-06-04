import React from 'react'
import { BigNumber } from 'bignumber.js'
import { 
    Container,
    Card,
    Row,
    Col,
    Button,
    Badge,
    ProgressBar
} from 'react-bootstrap'
import { DebugPanel } from './Widgets'
import Stakes from './Stakes'
import Lobby from './Lobby'
import Blurb from './Blurb' 
import HEX from './hex_contract'
import Web3 from "web3";
import Web3Modal, { getProviderInfo } from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider"
//import Portis from "@portis/web3";
import { detectTrustWallet } from './util'
import './App.scss'
const debug = require('./debug')('App')
const uriQuery = new URLSearchParams(window.location.search)
if (uriQuery.has('debug')) {
    window.localStorage.setItem('debug', '*')
} else {
    window.localStorage.removeItem('debug')
}

const INITIAL_STATE = {
    chainId: 0,
    network: 'none',
    currentProvider: '---',
    walletConnected: false,
    wallet: {
        address: '',
        balance: new BigNumber(0)
    },
    contractReady: false,
    contractGlobals: null,
    debug: [ ]
}

class App extends React.Component {
    constructor(props) {
        super(props)

        const m = window.location.href.match(/\?r=([^&]+)/)
        const incomingReferrer = (m && m.length > 1)
        const referrer = (incomingReferrer ? m[1] : '0xD30542151ea34007c4c4ba9d653f4DC4707ad2d2').toLowerCase()

        this.web3modal = new Web3Modal({
            cacheProvider: true,                                    // optional
            providerOptions: {                                      // required
                walletconnect: {
                    package: WalletConnectProvider,                 // required
                    options: {
                        infuraId: process.env.REACT_APP_INFURA_ID   // required
                    }
                },
            }
        })
        this.triggerWeb3Modal = false
        this.web3 = null
        this.subscriptions = [ ]
        this.contract = null
        this.state = {
            ...INITIAL_STATE,
            incomingReferrer,
            referrer
        }
    }

    subscribeProvider = async (provider) => {
        if (!provider.on) {
            return
        }

        if (provider.isMetaMask) {
            const ethereum = window.ethereum
            if (ethereum && ethereum.autoRefreshOnNetworkChange) 
                ethereum.autoRefreshOnNetworkChange = false // will be default behavour in new MM api

            // MetaMask has no 'close' or 'disconnect' event. Workaround ...
            ethereum.on('accountsChanged', (accounts) => {
                if (!accounts.length)                   // => event:"close" (logged out)
                    this.resetApp()
                else {                                  // => event:"accountsChanged"
                    const newAddress = accounts[0]
                    debug('ADDRESS CHANGE [metamask]: %s(old) => %s', this.state.wallet.address, newAddress)
                    this.setState({ 
                        wallet: { ...this.state.wallet, address: accounts[0] } 
                    }, this.updateHEXBalance)
                }
            })
        } else { // WalletConnect (and others?) ...

            provider.on("close", () => {  
                debug('provider::event:close')
            })

            provider.on("stop", async (networkId: number) => { // WalletConnect: fires when remote wallet is disconnected
                this.resetApp()
            })
            
            provider.on("accountsChanged", async (accounts) => {
                const newAddress = accounts[0]
                debug('ADDRESS CHANGE: %s(old) => %s', this.state.wallet.address, newAddress)
                await this.setState({ wallet: { ...this.state.wallet, address: newAddress } })
                this.updateHEXBalance()
            })
        }

        provider.on("chainChanged", async (chainId) => {
            window.location.reload()
        })

        provider.on("networkChanged", async (networkId: number) => {
            window.location.reload()
        })
    }

    subscribeEvents = () => {
        const eventCallback = (error, result) => {
            //debug('events.Transfer[error, result] => ', error, result.returnValues )
            this.updateHEXBalance()
        }
        this.subscriptions.push(
            this.contract.events.Transfer( {filter:{from:this.state.wallet.address}}, eventCallback).on('connected', (id) => debug('subbed: HEX from:', id))
        )
        this.subscriptions.push(
            this.contract.events.Transfer( {filter:{to:this.state.wallet.address}}, eventCallback).on('connected', (id) => debug('subbed: HEX to:', id))
        )
    }

    unsubscribeEvents = () => {
        if (this.scrubscriptions && this.scrubscriptions.length) { 
            this.web3 && this.web3.eth && this.web3.eth.clearSubscriptions()
            this.web3 && this.web3.shh && this.web3.shh.clearSubscriptions()
        }
    }

    updateHEXBalance = async () => {
        const balance = await this.contract.methods.balanceOf(this.state.wallet.address).call()
        this.setState({ wallet: { ...this.state.wallet, balance: new BigNumber(balance) } })
    }

    async selectWeb3ModalWallet() {
        this.walletProvider = null
        try {
            return await this.web3modal.connect()
        } catch(e) { // user closed dialog withot selection 
            return null
        }
    }

    /* returns address or null */
    async establishWeb3Provider() {
        // Check for non-web3modal injected providers (mobile dApp browsers)
        if (detectTrustWallet()) {                                                  // TrustWallet
            debug("Detected TrustWallet")
            const chainId = window.web3.currentProvider.chainId
            const mainnet = {
                chainId, 
                rpcUrl: HEX.CHAINS[Number(chainId)].rpcURL
            }
            this.walletProvider = new window.Trust(mainnet)
            this.setState({ currentProvider: 'TrustWallet' })
        } else if (window.ethereum && window.ethereum.isImToken === true ) {        // imToken
            debug("Detected imToken wallet")
            window.ethereum.chainId = '0x1' // imToken returns null
            this.walletProvider = window.ethereum
            this.setState({ currentProvider: 'TrustWallet' })
        } else {                                                                    // web3modal selection
            this.setState({ currentProvider: 'web3modal' })
            debug('this.web3modal.cachedProvider: ', this.web3modal.cachedProvider)
            if (this.web3modal.cachedProvider !== '' || this.triggerWeb3Modal) {
                this.triggerWeb3Modal = false
                this.web3modal.clearCachedProvider()
                this.walletProvider = await this.selectWeb3ModalWallet()
                const currentProvider = this.walletProvider ? getProviderInfo(this.walletProvider).name : '---'
                this.setState({ currentProvider })
            }
        }

        // We set up TWO providers. Once from the wallet to handle sending transactions
        // and one for all other chain quuery operations (using Infura or the like)
        // this.walletProvider stores the transaction provider
        // this.provider stores the query provider
        if (!this.walletProvider || !this.walletProvider.chainId) 
            return debug('web3modal cancelled by user') // User will need to click the button to connect again
        
        // we only get here if this.walletProvider has been established

        const chainId = Number(this.walletProvider.chainId)
        const networkData = HEX.CHAINS[chainId] || null
        if (!networkData) return debug(`Unsupported chainId '${chainId}'`);

        const network = networkData.name || 'error'
        const wssURL = networkData.wssURL || null 

        await this.setState({ chainId, network })

        this.provider = new Web3.providers.WebsocketProvider(wssURL)
        debug('web3 providers established')

        window.web3 = new Web3(this.walletProvider) // window.web3 used for sending/signing transactions
        this.web3 = new Web3(this.provider)         // this.web3 used for everything else 

        if (!window.web3 || !this.web3) return debug('Unexpected error setting up Web3 instances')
        
        // ref: https://soliditydeveloper.com/web3-1-2-5-revert-reason-strings
        if (window.web3.eth.hasOwnProperty('handleRevert'))  window.web3.eth.handleRevert = true 
        if (this.web3.eth.hasOwnProperty('handleRevert'))  this.web3.eth.handleRevert = true 
        debug('web3 providers connected')

        // Different ewallets have different methods of supplying the user's active ETH address
        var address = null
        if (this.walletProvider.isMetaMask) {               // METAMASK
            debug('MetaMask detected')
            /* EIP1102. Not working. WHY? :/ MM extension too old? Weird. 
            const accounts = await window.ethereum.send('eth_requestAccounts')
            address = accounts[0] */
            // UGLY: MetaMask takes time to sort itself out (EIP-1102 'eth_requestAccounts' not available yet)
            address = await new Promise((resolve, reject) => {
                let retries = 10
                let timer = setInterval(() => {
                    debug('MM address poll %d of 10', 11-retries)
                    address = window.web3.eth.givenProvider.selectedAddress
                    if (address) {
                        clearInterval(timer)
                        return resolve(address)
                    }
                    if (!retries--) {
                        clearInterval(timer)
                        return reject(null)
                    }
                }, 100)
            })
        } else if (detectTrustWallet()) {                 // TRUST WALLET
            this.walletProvider.enable()
            address = window.web3.eth.givenProvider.address || '0x7357000000000000000000000000000000000000'
            this.walletProvider.setAddress(address)
        } else if (window.web3.currentProvider.isPortis) {
            this.walletProvider.enable()
            const accounts = await window.web3.eth.getAccounts()
            address = accounts[0]
        } else if (window.web3.currentProvider.isImToken) { // imTOKEN
            debug('imToken Wallet detected')
            const accounts = await window.ethereum.send('eth_requestAccounts') // EIP1102
            address = accounts[0]
        } else                                              // OTHERS (WalletConnect)
            address = window.web3.eth.accounts[0]
        return (address.toLowerCase().slice(0, 2) === '0x') ? address : null
    }

    async componentDidMount() {
        debug('process.env: ', process.env)
        window._APP = this // DEBUG remove me
        window._w3M = Web3Modal

        const address = await this.establishWeb3Provider() 
        if (!address) return debug('No wallet address supplied - STOP')

        window.contract = new window.web3.eth.Contract(HEX.ABI, HEX.CHAINS[this.state.chainId].address)    // wallet's provider
        this.contract = new this.web3.eth.Contract(HEX.ABI, HEX.CHAINS[this.state.chainId].address)        // INFURA
        this.subscribeProvider(this.walletProvider)

        await this.setState({ 
            wallet: { ...this.state.wallet, address },
            walletConnected: true 
        })

        Promise.all([
            this.contract.methods.balanceOf(this.state.wallet.address).call(), // [0] HEX balance
            this.contract.methods.allocatedSupply().call(),  // [1]
            this.contract.methods.currentDay().call(),       // [2]
            this.contract.methods.globals().call()           // [3]
        ]).then((results) => {
            const balance = new BigNumber(results[0])
            const allocatedSupply = new BigNumber(results[1])
            const currentDay = Number(results[2])
            const rawGlobals = results[3]
            
            // parse globals
            const globals = { }
            for (const k in rawGlobals) if (isNaN(k)) globals[k] = new BigNumber(rawGlobals[k]);

            // decode globals.claimstats
            const SATOSHI_UINT_SIZE = 51 // bits
            let binaryClaimStats = globals.claimStats.toString(2).padStart(153, '0')
            let a = binaryClaimStats.slice(0, SATOSHI_UINT_SIZE)
            let b = binaryClaimStats.slice(SATOSHI_UINT_SIZE, SATOSHI_UINT_SIZE * 2)
            let c = binaryClaimStats.slice(SATOSHI_UINT_SIZE * 2)
            globals.claimStats = {
                claimedBtcAddrCount: new BigNumber(a, 2),
                claimedSatoshisTotal: new BigNumber(b, 2),
                unclaimedSatoshisTotal: new BigNumber(c, 2)
            }

            // adding this to web3 contract for convenience down the road
            this.contract.Data = { 
                allocatedSupply,
                currentDay,
                globals
            }
            window.contract.Data = this.contract.Data

            // setState doesn't handle > 1 level trees at all well but we like to live dangerously 
            this.setState({
                wallet: {
                    address: address.toLowerCase(),
                    balance
                },
                contractReady: true,
            })
            this.subscribeEvents()
        })
        .catch(e => debug("App::cpompentDidMount:Promise.all(...): ", e))

        // update UI and contract currentDay every hour
        var lastHour = -1;
        setInterval(async () => {
            if (!this.state.contractReady) return
            var d = new Date();
            var currentHour = d.getHours();
            if (currentHour !== lastHour) {
                lastHour = currentHour;
                const currentDay = Number(await this.contract.methods.currentDay().call())
                this.contract.Data.currentDay = currentDay
                this.setState({ currentDay: currentDay+1 })
                // TODO: other UI stuff should update here as well
            }
        }, 1000);
    }

    componentWillUnmount = () => {
        try { this.web3.eth.clearSubscriptions() } catch(e) { }
    }

    resetApp = async () => {
        const o = new Web3Modal()
        o.clearCachedProvider()
        window.location.reload()
    }

    handleConnectWalletButton = async () => {
        this.triggerWeb3Modal = true // used to trigger modal pop-up in this.establishWeb3Provider()
        this.componentDidMount()
    }

    disconnectWallet = async () => {
        const provider = this.provider || null
        if (provider && provider.close) {
            await this.unsubscribeEvents()
            await this.web3modal.clearCachedProvider()
            await this.provider.close()
        } else {
            this.resetApp()
        }
    }

    WalletStatus = () => {
        const { address } = this.state.wallet
        const addressFragment = address && address !== ''
            ? address.slice(0,6)+'...'+address.slice(-4) : 'unknown'
        return (
            <Container id="wallet_status" fluid>
            <Row>
                <Col><Badge variant={this.state.network === 'mainnet' ? "success" : "danger"} className="small">{this.state.network}</Badge></Col>
                <Col className="text-muted text-center small">{this.state.currentProvider}</Col>
                <Col className="text-right">
                    <Badge className="text-info">{ addressFragment }</Badge>
                </Col>
            </Row>
            </Container>
        )
    }

    AppContent = () => {
        if (!this.state.walletConnected) { // 'connect wallet' button
            return (
                <Container fluid className="text-center mb-3">
                    <Button id="connect_wallet" variant="info" onClick={this.handleConnectWalletButton} >
                        <span className="d-none d-sm-inline">Click to Connect a Wallet</span>
                        <span className="d-inline d-sm-none">Connect Wallet</span>
                    </Button>
                    <Blurb />
                </Container>
            )
        } else if (!this.state.contractReady) {
            return (
                <ProgressBar variant="secondary" animated now={60} label="initializing" />
            )
        } else {
            return (
                <>
                    <Stakes contract={this.contract} wallet={this.state.wallet} />
                    <Lobby contract={this.contract} wallet={this.state.wallet} />
                </>
            )
        }
    }

    render() {
        return (
            <>
                <Container id="hexmob_header" fluid>
                    <h1>HEX<sup>mob.win</sup></h1>
                    <div className="day">
                        <span className="text-muted small ml-3">DAY</span><span className="day-number">{this.state.currentDay}</span>
                    </div>
                    <h2>...stake on the run</h2>
                    <h3>Open BETA <span>{process.env.REACT_APP_VERSION || 'v0.0.0A'}</span></h3>
                </Container>
                <Container id="hexmob_body" fluid className="p-1">
                    <Container className="p-1">
                        <this.AppContent />
                        { HEX.lobbyIsActive() &&
                            <Container className="p-3 my-3 text-center">
                                <Card.Body as={Button} variant="success" className="w-100"
                                    href={'https://go.hex.win/?r='+this.state.referrer} target="_blank" rel="noopener noreferrer"
                                >
                                    <div><img src="/extra-bonus-10.png" alt="extra bonus 10%" /></div>
                                    <div>
                                        Receive an extra <b>10%&nbsp;FREE&nbsp;BONUS&nbsp;HEX</b> just for <b>using&nbsp;this&nbsp;App </b> 
                                        to TRANSFORM&nbsp;ETH in the <b>AA&nbsp;Lobby</b>&nbsp;(above)<br/>
                                        <small>standard 10% bonus from Dev's referral addr</small>
                                    </div>
                                    { this.state.incomingReferrer && <div className="small"><em>fwd: {this.state.referrer}</em></div> }
                                </Card.Body>
                            </Container>
                        }
                    </Container>

                    
                    { !detectTrustWallet() && /* TrustWallet won't follow external links */
                    <>
                        <Container className="p-3 my-3">
                            <Card.Body as={Button} variant="info" className="w-100" style={{ cursor: "pointer" }}
                                href="https://changelly.com/?ref_id=1b7z255j4rfbxsyd#buy" target="_blank" rel="noopener noreferrer"
                            >
                                <div>
                                    <img className="d-inline-block" src="/buy-eth.png" alt="buy ethereum here" style={{ verticalAlign: "middle" }} />
                                    <div className="d-inline-block text-center" style={{ verticalAlign: "middle" }}>
                                        Click HERE to<br/>
                                        <strong>buy Ethereum</strong><br/>
                                        using Credit Card
                                    </div>
                                </div>
                            </Card.Body>
                        </Container>
                        <Container className="p-3 my-3">
                            <Card.Body as={Button} variant="warning" className="text-center w-100" style={{ cursor: "pointer" }}
                                href="https://hexdex.win/swap" target="_blank" rel="noopener noreferrer"
                            >
                                <img className="d-inline-block" src="/holders.png" alt="swap HEX for USDC or DAI" style={{ verticalAlign: "middle", height: "97px" }} />
                                <div className="text-right d-inline-block" style={{ verticalAlign: "middle", marginLeft: "28px" }}>
                                    <strong>Swap HEX</strong> with<br/>
                                    ERC20s including<br/>
                                    <strong>USDC</strong> & <strong>DAI</strong>
                                    <br/>
                                </div>
                            </Card.Body>
                        </Container>
                    </> 
                    } 

                    <Container>
                        <div className="text-center m-3">
                            <Button variant="outline-danger" onClick={ this.disconnectWallet } >
                                DISCONNECT WALLET
                            </Button>
                        </div>
                    </Container>
            
                    { uriQuery.has('debug') &&
                        <DebugPanel />
                    }
                </Container>
                <Container>
                    { this.state.walletConnected && <this.WalletStatus />}
                </Container>
            </>
        )
    }
}

export default App

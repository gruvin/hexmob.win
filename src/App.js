import React from 'react'
import { 
    Container,
    Card,
    Row,
    Col,
    Button,
    Badge,
    ProgressBar
} from 'react-bootstrap'
import { BigNumber } from 'bignumber.js'
import { GitHubInfo } from './Widgets'
import Stakes from './Stakes'
import Stats from './Stats'
import Lobby from './Lobby'
import Blurb from './Blurb' 
import Tewkenaire from './Tewkenaire'
import { WhatIsThis, Donaticator, MetamaskUtils } from './Widgets'
import HEX from './hex_contract'
import UNIV2 from './univ2_contract' /* HEX/USDC pair */
import Web3 from 'web3';
import Web3Modal, { getProviderInfo } from 'web3modal';
import WalletConnectProvider from '@walletconnect/web3-provider'
//import Portis from "@portis/web3";
import { detectTrustWallet } from './util'
import './App.scss'
//const BN = BigNumber
const { format } = require('d3-format')
const axios = require('axios').create({
    baseURL: '/',
    timeout: 3000,
    headers: { "Content-Type": "application/json", "Accept": "applicaiton/json"},
});
const uriQuery = new URLSearchParams(window.location.search)
if (uriQuery.has('debug')) {
    const d = uriQuery.get("debug")
    if (d === "") {
        localStorage.setItem('debug', '*')
    } else {
        localStorage.setItem('debug', d)
    }
} else {
    localStorage.removeItem('debug')
}
const debug = require('debug')('App')

const INITIAL_STATE = {
    chainId: 0,
    network: 'none',
    currentProvider: '---',
    walletConnected: false,
    wallet: {
        address: '',
        balance: new BigNumber(0),
        balanceETH: new BigNumber(0)
    },
    contractReady: false,
    contractGlobals: null,
    currentDay: Number(0),
    USDHEX: Number(0.0),
    donation: "",
    totalHearts: new BigNumber(0),
    USD: Number(0.0),
    referrer: "",
    accounts: [],
}

class App extends React.Component {
    constructor(props) {
        super(props)
        this.triggerWeb3Modal = false
        this.web3 = null
        this.wssProvider = null
        this.subscriptions = [ ]
        this.contract = null
        this.state = { ...INITIAL_STATE }
        this.dayInterval = null
        this.usdHexInterval = null

        const { hostname } = window.location
        window.hostIsHM = hostname === "hexmob.win" //|| hostname === "localhost" 
        window.hostIsTSA = hostname === "go.tshare.app" || hostname === "localhost" 
        window.metamaskOnline = () => this.state.walletConnected && window.ethereum && window.ethereum.isMetaMask
    }

    subscribeProvider = async (provider) => {
        if (!provider.on) {
            debug('WARNING: web3hexmob.on != f()')
            return
        }

        if (provider.isMetaMask) {
            debug("PROVIDER IS METAMASK")
            const ethereum = window.ethereum
            if (ethereum.autoRefreshOnNetworkChange) 
                ethereum.autoRefreshOnNetworkChange = false // will be default behavour in new MM api

            ethereum.on('disconnect', () => { debug("RPC disconnected => reset"); this.resetApp() })
            ethereum.on('chainChanged', () => { debug("wallet chainChanged => reset"); this.resetApp() })
            ethereum.on('accountsChanged', (accounts) => {
                if (!accounts.length)                   // => legacy workaround for lack of event:[close|disconnect] (logged out)
                    this.resetApp()
                else 
                {                                       // => event:accountsChanged actual
                    const newAddress = accounts[0]
                    debug('ADDRESS CHANGE [metamask]: %s(old) => %s', this.state.wallet.address, newAddress)
                    this.setState({ 
                        wallet: { ...this.state.wallet, address: accounts[0] } 
                    }, this.updateHEXBalance)
                }
            })
        } else { // WalletConnect (and others?) ...
            debug("PROVIDER IS OTHER")

            // 'close' is deprecated in favour of 'disconnect' in MetaMask but not some other wallets
            provider.on("close", () => {  
                debug('provider::event:close')
            })

            provider.on("stop", async (networkId) => { // WalletConnect: fires when remote wallet is disconnected
                this.resetApp()
            })
            
            provider.on("accountsChanged", async (accounts) => {
                const newAddress = accounts[0]
                debug('ADDRESS CHANGE: %s(old) => %s', this.state.wallet.address, newAddress)
                this.setState({ wallet: { ...this.state.wallet, address: newAddress } })
                this.updateHEXBalance()
            })
        }

        provider.on("chainChanged", async (chainId) => {
            window.location.reload()
        })

        try {
            window.web3hexmob.currentProvider.publicConfigStore.on('update', this.updateETHBalance)
        } catch(e) {
        }
    }

    handleSubscriptionError = (e, r) => {
        debug("subscription error: ", e)
    }
    
    subscribeEvents = () => {
        const eventCallbackHEX = (error, result) => {
            //debug('events.Transfer[error, result] => ', error, result.returnValues )
            this.updateHEXBalance()
        }
        const eventCallbackUNIV2 = (error, result) => {
            //debug('UNI: event.Swap[error, result] => ', error, result )
            if (error) return
            const { amount0In, amount1In, amount0Out, amount1Out } = result.returnValues
            try {
                const USDHEX = parseInt(amount1In) !== 0 
                    ? Number(parseInt(amount1In) / parseInt(amount0Out) * 100)
                    : Number(parseInt(amount1Out) / parseInt(amount0In) * 100)
                this.setState({ USDHEX })
            } catch(e) {
                debug(`UNIV2:USDHEX Exception %o: amount1In:${amount1In} amount0Out: ${amount0Out}`, e)
            }
        }
        const hexEvent = this.contract.events
        hexEvent.Transfer( {filter:{from:this.state.wallet.address}}, eventCallbackHEX)
            .on('connected', (id) => debug('subbed: HEX from:', id))
            .on('error', this.handleSubscriptionError)
        hexEvent.Transfer( {filter:{to:this.state.wallet.address}}, eventCallbackHEX)
            .on('connected', (id) => debug('subbed: HEX to:', id))
            .on('error', this.handleSubscriptionError)

        const univ2Event = this.univ2Contract.events
        univ2Event.Swap( {fromBlock: "latest", toBlock: "latest" }, eventCallbackUNIV2)
            .on('connected', (id) => debug('subbed: UNIV2 to:', id))
            .on('error', this.handleSubscriptionError)

        const address = this.state.wallet.address
        this.web3.eth.subscribe('logs', {
            address,
            fromBlock: "0x9CAA35",
        })
        .on('connected', id => debug('SS::subbed: %s -- addr: %s', id, address))
        .on("message", (log) => {
            debug('SS::message: ', log);
        })
        .on("changed", (log) => {
            debug('SS::changed: ', log);
        })
        .on('error', this.handleSubscriptionError)

        this.updateETHBalance()
    }

    unsubscribeEvents = () => {
        try {
            this.web3.eth.clearSubscriptions()
            this.contract.clearSubscriptions()
        } catch(e) {}
    }
    
    updateETHBalance = async () => {
        const balance = await this.web3.eth.getBalance(this.state.wallet.address)
        this.setState({ wallet: { ...this.state.wallet, balanceETH: new BigNumber(balance) } })
    }

    updateHEXBalance = async () => {
        const balance = await this.contract.methods.balanceOf(this.state.wallet.address).call()
        this.setState({ wallet: { ...this.state.wallet, balance: new BigNumber(balance) } })
    }

    async selectWeb3ModalWallet() {
        debug('inside selectWeb3ModalWallet()')
        try {
            return await this.web3modal.connect()
        } catch(e) { // user closed dialog withot selection 
            return null
        }
    }

    /* returns address or null */
    async establishWeb3Provider() {
        if (window.ethereum && !window.ethereum.chainId) window.ethereum.chainId = '0x1'

        // Check for non-web3modal injected providers (mobile dApp browsers)
        if (detectTrustWallet()) {                                                  // TrustWallet internal browser (now defunct)
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
            this.walletProvider = window.ethereum
            this.setState({ currentProvider: 'imToken' })
        } else if (window.ethereum && window.ethereum.isToshi === true && window.ethereum.isCipher ) { // Coinbase (mobile)
            debug("Detected Coinbase wallet")
            this.walletProvider = window.ethereum
            this.walletProvider.isCoinBase = true
            this.setState({ currentProvider: 'CoinBase' })
        } else { // web3modal it is ...
            this.setState({ currentProvider: 'web3modal' })
            debug('this.web3modal.cachedProvider: ', this.web3modal.cachedProvider)
            if (this.web3modal.cachedProvider !== '' || this.triggerWeb3Modal) {
                this.triggerWeb3Modal = false
                this.walletProvider = await this.selectWeb3ModalWallet()
                const currentProvider = this.walletProvider ? getProviderInfo(this.walletProvider).name : '---'
                this.setState({ currentProvider })
            }
        }

        // We set up TWO providers. One from the connected wallet to handle sending transactions
        // and one for all other chain quuery operations (using Infura or the like)
        // this.walletProvider stores the transaction provider
        // this.provider stores the query provider
        if (!this.walletProvider || !this.walletProvider.chainId) 
            return debug('web3modal failed to resolve a wallet')
        
        // we only get here if this.walletProvider has been established

        const chainId = Number(this.walletProvider.chainId)
        const networkData = HEX.CHAINS[chainId] || null
        if (!networkData) return debug(`Unsupported chainId '${chainId}'`);

        const network = networkData.name || 'error'
        const wssURL = networkData.wssURL || null 

        this.setState({ chainId, network })

        this.wssProvider = new Web3.providers.WebsocketProvider(wssURL)
        this.wssProvider
            .on('close', (e) => {
                debug("WSS CONNECTION DOWN")
                this.unsubscribeEvents()
            })
            .on('error', (e) => {
                this.unsubscribeEvents()
                this.web3.currentProvider.disconnect()
                this.resetApp() // TODO: try to gracefully reconnect etc
            })

        window.web3hexmob = new Web3(this.walletProvider)   // window.web3hexmob used for sending/signing transactions
        this.web3 = new Web3(this.wssProvider)              // this.web3 used for everything else (Infura)
        if (!window.web3hexmob || !this.web3) throw new Error('Unexpected error setting up Web3 instances')

        debug(`web3 providers connected [this.wssProvider=%O]`, this.wssProvider)
        if (process.env.NODE_ENV === "development") window._w3 = this.web3
        
        // ref: https://soliditydeveloper.com/web3-1-2-5-revert-reason-strings
        if (window.web3hexmob.eth.hasOwnProperty('handleRevert')) window.web3hexmob.eth.handleRevert = true 

        // Different wallets have different methods of supplying the user's active ETH address
        var address = null
        if (this.walletProvider.isMetaMask) {               // MetaMask
            debug('web3modal provider is MetaMask')
            let accounts = null
            if (window.ethereum.request) { // new way
                debug('accounts[] new method')
                const response = await window.ethereum.request({method: 'eth_accounts'})
                accounts = response
            } else { // legacy way
                debug('accounts[] legacy method')
                const response = await window.ethereum.send('eth_requestAccounts') // EIP1102(ish)
                accounts = response.result
            }
            debug('accounts[]: ', accounts)
            address = accounts[0]
        } else if (this.walletProvider.isCoinBase) {        // CoinBase
            debug('Provider is Coinbase')
            await this.walletProvider.enable()
            const accounts = await this.walletProvider.eth.getAccounts()
            address=accounts[0]
        } else if (detectTrustWallet()) {                   // TrustWallet internal browser (since removed 'cause Apple sux)
            debug('Provider is TrustWallet (internal browser)')
            this.walletProvider.enable()
            address = window.web3.eth.givenProvider.address || '0x7357000000000000000000000000000000000000'
            this.walletProvider.setAddress(address)
        } else if (this.walletProvider.isWalletConnect) {    // Wallet Connect
            debug('web3modal provider is WalletConnect (QR code)')
            address = this.walletProvider.accounts[0]
        } else if (window.web3hexmob.currentProvider.isPortis) {
            await this.walletProvider.enable()
            const accounts = await this.walletProvider.eth.getAccounts()
            address = accounts[0]
        } else if (window.web3hexmob.currentProvider.isImToken) { // imToken
            debug('imToken Wallet detected')
            const accounts = await window.ethereum.send('eth_requestAccounts') // EIP1102
            address = accounts[0]
        } else                                              // OTHERS (WalletConnect)
            address = window.web3hexmob.eth.accounts[0]
        return (address.toLowerCase().slice(0, 2) === '0x') ? address : null
    }

    updateUsdHex() {
        // https://github.com/HexCommunity/HEX-APIs
        axios.get("https://uniswapdataapi.azurewebsites.net/api/hexPrice")
            .then(response => response.data)
            .then(data => this.setState({ USDHEX: parseFloat(data.hexUsd) }))
            .catch(e => console.log('updateUsdHex: ', e))
    }

    async componentDidMount() {
        debug('process.env: ', process.env)
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
        const referrer = (uriQuery.get('r') || "").toLowerCase()
        if (uriQuery.has("reset")) { return this.resetApp() }
        if (uriQuery.has('account')) {
            const uriAccounts = uriQuery.getAll('account')
            const accounts = uriAccounts.map(account => { const s = account.split(":"); return { address: s[0], name: s[1] || "" }})
            this.setState({ accounts })
        }

        if (localStorage.getItem('debug')) {
            window._APP = this
            window._w3M = this.web3modal
            window._HEX = HEX
            window._UNIV2 = UNIV2
        }

        const address = await this.establishWeb3Provider() 
        if (!address) return debug('No wallet address supplied - STOP')

        window.contract = await new window.web3hexmob.eth.Contract(HEX.ABI, HEX.CHAINS[this.state.chainId].address)   // wallet provider
        this.contract = await new this.web3.eth.Contract(HEX.ABI, HEX.CHAINS[this.state.chainId].address)             // INFURA
        this.univ2Contract = await new this.web3.eth.Contract(UNIV2.ABI, UNIV2.CHAINS[this.state.chainId].address)    // INFURA
        this.subscribeProvider(this.walletProvider)

        this.setState({ 
            referrer,
            wallet: { ...this.state.wallet, address },
            walletConnected: true 
        })

        Promise.all([
            this.contract.methods.balanceOf(this.state.wallet.address).call().catch(e => debug('1:', e)), // [0] HEX balance
            this.contract.methods.allocatedSupply().call().catch(e => debug('2:', e)),  // [1]
            this.contract.methods.currentDay().call().catch(e => debug('3:', e)),       // [2]
            this.contract.methods.globals().call().catch(e => debug('4:', e))           // [3]
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
        .catch(e => debug("App::componentDidMount:Promise.all(...): ", e))

        // update UI and contract currentDay every hour
        var lastHour = -1;
        this.dayInterval = setInterval(async () => {
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

        this.updateUsdHex()
        this.usdHexInterval = setInterval(this.updateUsdHex.call(this), 10000)
    }

    componentWillUnmount = () => {
        try {
            clearInterval(this.dayInterval)
            clearInterval(this.usdHexInterval)
            this.unsubscribeEvents()
        } catch(e) { }
    }

    resetApp = async () => {
        this.web3modal && this.web3modal.clearCachedProvider()
        window.location.reload()
    }

    handleConnectWalletButton = async () => {
        this.triggerWeb3Modal = true // used to trigger modal pop-up in this.establishWeb3Provider()
        this.componentDidMount()
    }

    disconnectWallet = async () => {
        const provider = this.walletProvider || null
        try {
            this.unsubscribeEvents()
            this.web3modal.clearCachedProvider()
            if (provider.disconnect) await provider.disconnect()
            else if (provider.close) await provider.close()
        } catch {
        }
        this.resetApp()
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
                    <WhatIsThis tooltip={address}>
                        <Badge className="text-info">
                          { addressFragment }
                        </Badge>
                    </WhatIsThis>
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
                        <span className="d-inline d-sm-none">CONNECT WALLET</span>
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
                    <Stakes 
                        parent={this}
                        contract={this.contract}
                        wallet={this.state.wallet}
                        usdhex={this.state.USDHEX}
                        openActive={!uriQuery.has('closed')}
                    />
                    {this.state.accounts.length > 0 && this.state.accounts.map(account => (
                        <Stakes
                            key={`public:${account.address}`}
                            className="mt-3"
                            publicAddress={account.address} 
                            publicName={account.name}
                            contract={this.contract} wallet={this.state.wallet} usdhex={this.state.USDHEX}
                        />
                    ))}
                    { uriQuery.has('tewk') && <Tewkenaire parent={this} usdhex={this.state.USDHEX} />}
                    <Stats parent={this} contract={this.contract} wallet={this.state.wallet} usdhex={this.state.USDHEX} />
                    <Lobby parent={this} contract={this.contract} wallet={this.state.wallet} />
                    <Container className="text-center">
                        <Badge variant="dark"><span className="text-bold">CONTRACT ADDRESS </span>
                        <br className="d-md-none"/>
                        <a  
                            className="a-blue"
                            href="https://etherscan.io/address/{this.contract._address}" 
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {this.contract._address}
                        </a></Badge>
                    </Container>
                </>
            )
        }
    }
   
    render() {
        const headerLogo = document.getElementById("header_logo")
        if (headerLogo) headerLogo.style.backgroundImage = window.hostIsTSA
            ? "url('/tsa/android-icon-96x96.png')"
            : "url('/hexmob/android-icon-96x96.png')"

        return (
            <>
                <Container id="hexmob_header" fluid>
                { window.hostIsTSA
                    ? <h1 id="header_logo">GO<sup className="text-muted small"> .tshare.app</sup></h1>
                    : <h1 id="header_logo">HEX<sup className="text-muted">mob.win</sup></h1>
                }
                    <h3>{process.env.REACT_APP_VERSION || 'v0.0.0A'}</h3>
                    <div id="usdhex" className="text-success">
                        <span className="text-muted small mr-1">USD</span>
                        <span className="numeric">{ "$" + ( this.state.USDHEX ? format(",.4f")(this.state.USDHEX) : "-.--") }</span>
                    </div>
                    <div className="day">
                        <span className="text-muted small mr-1">DAY</span>
                        <span className="numeric text-info">{ this.state.currentDay ? this.state.currentDay : "---" }</span>
                    </div>
                </Container>
                <Container id="hexmob_body" fluid className="p-1">
                    <Container className="p-1">
                        <this.AppContent />
                        { HEX.lobbyIsActive() &&
                            <Container className="p-1 my-3 text-center">
                                <Card.Body as={Button} variant="success" className="w-100"
                                >
                                    <div><img src="/extra-bonus-10.png" alt="extra bonus 10%" /></div>
                                    <div>
                                        Receive an extra <b>10%&nbsp;FREE&nbsp;BONUS&nbsp;HEX</b> just for <b>using&nbsp;this&nbsp;App </b> 
                                        to TRANSFORM&nbsp;ETH in the <b>AA&nbsp;Lobby</b>&nbsp;(above)<br/>
                                        <small>standard 10% bonus from Dev's referral addr</small>
                                    </div>
                                    { this.state.referrer !== "" && <div className="small"><em>fwd: {this.state.referrer}</em></div> }
                                </Card.Body>
                            </Container>
                        }
                        { !detectTrustWallet() && /* TrustWallet won't follow external links */
                        <>
                            <Container className="py-2 my-3">
                                <Card.Body as={Button} variant="info" className="w-100 rounded text-light bg-info-faded border-0" 
                                    href="https://changelly.com/?ref_id=1b7z255j4rfbxsyd#buy" target="_blank" rel="noopener noreferrer"
                                >
                                    <div>
                                        <img className="d-inline-block" src="/buy-eth.png" alt="buy ethereum here" style={{ verticalAlign: "middle" }} />
                                        <div className="d-inline-block text-enter" style={{ verticalAlign: "middle", marginLeft: "28px" }}>
                                            <h1>Buy ETH</h1>
                                            (Debit Card)
                                        </div>
                                    </div>
                                </Card.Body>
                            </Container>
                            <Container className="py-3 my-3">
                                <Card.Body as={Button} className="w-100 rounded text-light bg-dark border-0" 
                                    href="https://ethhex.com" target="_blank" rel="noopener noreferrer"
                                >
                                    <img 
                                        className="d-inline-block" 
                                        src="/swap-eth-hex-96.png" alt="swap HEX for USDC or DAI" 
                                        style={{ verticalAlign: "middle", height: "96px" }} 
                                    />
                                    <div className="text-right d-inline-block" style={{ verticalAlign: "middle" }}>
                                        <h1>Swap ETH for HEX</h1>
                                    </div>
                                </Card.Body>
                            </Container>
                        </> 
                        }
                        { this.state.walletConnected &&
                            <Container>
                                <div className="text-center m-3">
                                    <Button variant="outline-danger" onClick={ this.disconnectWallet } >
                                        DISCONNECT WALLET
                                    </Button>
                                </div>
                            </Container>
                        }

                    </Container>
                    <GitHubInfo />
                    { window.hostIsHM && <Donaticator walletConnected={this.state.walletConnected} fromAddress={this.state.wallet.address || null} />}
                    { !window.hostIsTSA && window.metamaskOnline() && <MetamaskUtils /> }
                </Container>
                <Container id="hexmob_footer" fluid>
                    { this.state.walletConnected && <this.WalletStatus /> }
                </Container>
            </>
        )
    }
}

export default App

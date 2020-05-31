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
import { detectedTrustWallet } from './util'
import './App.scss'
const debug = require('./debug')('App')
if ('development' === process.env.REACT_APP_NODE_ENV) {
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

        this.web3 = null
        this.subscriptions = [ ]
        this.contract = null
        this.state = {
            ...INITIAL_STATE,
            incomingReferrer,
            referrer
        }
        this.debug = [ <p>DEBUG</p> ]
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
                    debug('***** ADDRESS CHANGE ***** %s(old) => %s', this.state.wallet.address, newAddress)
                    this.setState({ 
                        wallet: { ...this.state.wallet, address: accounts[0] } 
                    }, this.updateHEXBalance)
                }
            })
        } else { // WalletConnect (and others?) ...

            provider.on("close", () => {  
                console.log('[Event] App:provider:close')
            })

            provider.on("stop", async (networkId: number) => { // WalletConnect: fires when remote wallet is disconnected
                this.resetApp()
            })
            
            provider.on("accountsChanged", async (accounts) => {
                const newAddress = accounts[0]
                debug('***** ADDRESS CHANGE [2] ***** %s(old) => %s', this.state.wallet.address, newAddress)
                await this.setState({ wallet: { ...this.state.wallet, address: newAddress } })
                this.updateHEXBalance()
            })
        }

        provider.on("chainChanged", async (chainId) => {
            const networkId = await this.web3.eth.net.getId()
            await this.setState({ chainId, networkId })
            this.updateHEXBalance()
        })

        provider.on("networkChanged", async (networkId: number) => {
            const chainId = await this.web3.eth.chainId()
            await this.setState({ chainId, networkId })
            this.updateHEXBalance()
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

    componentDidMount = async () => {
        
        debug('process.env: ', process.env)
        window._APP = this // DEBUG remove me
        if (!this.walletProvider) {
            // check first for Mobile TrustWallet
            if (detectedTrustWallet) {
                const mainnet = {
                    chainId: window.web3.currentProvider.chainId,
                    rpcUrl: HEX.CHAINS[Number(window.web3.currentProvider.chainId)].rpcUrl
                };
                /* XXX: 
                    Ancient legacy 0.5.x web3 code. provider.sendAync uses only callback, no Promise.
                    It doesn't matter because TrustWallet (iOS) sends no response back to browser
                    after signing (or not) a provider.sendAsync('send_Transaction') anyway. :'( 

                    More ominous even ...

                    2020-05-21: Telegram::@hewig (Tao X) referring to [@trustwallet/trust-web3-provider]
                        ................... unfortunately legacy trust provider
                        is not fully eip1193 compatible, apple doesn’t like dapp
                        browsers, we might have some difficult decision to make 
                        in a few weeks

                    0uc4
                */
                this.walletProvider = new window.Trust(mainnet)
                this.setState({ currentProvider: 'TrustWallet' })
            } else if (window.ethereum && window.ethereum.isImToken === true ) {
                this.walletProvider = window.ethereum
            } else {
                this.setState({ currentProvider: 'web3modal' })
                return this.connectWeb3ModalWallet()
            }
        }
        if (!this.walletProvider) return // User will need to click the button to connect again


        debug('web3 provider established')

        // window.web3 used for sending/signing transactions
        window.web3 = new Web3(this.walletProvider)

        // this.web3 used for everything else 
        this.provider = new Web3.providers.WebsocketProvider(HEX.CHAINS[Number(window.web3.currentProvider.chainId)].wssUrl)
        this.web3 = new Web3(this.provider)

        // ref: https://soliditydeveloper.com/web3-1-2-5-revert-reason-strings
        if (window.web3.eth.hasOwnProperty('handleRevert'))  window.web3.eth.handleRevert = true 
        if (this.web3.eth.hasOwnProperty('handleRevert'))  this.web3.eth.handleRevert = true 
       
        debug('web3 provider connected')

        var address
        if (this.walletProvider.isMetaMask) {
            debug('MetaMask detected')
            /*
            const accounts = await window.ethereum.send('eth_requestAccounts') // EIP1102. Not working. WHY? :/ MM extension too old? Weird. 
            address = accounts[0]
            */
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
        } else if (detectedTrustWallet) {
            this.walletProvider.enable()
            address = window.web3.eth.givenProvider.address || 0x7357000000000000000000000000000000000000
            this.provider.setAddress(address)
        } else if (window.web3.currentProvider.isPortis) {
            this.walletProvider.enable()
            const accounts = await window.web3.eth.getAccounts()
            address = accounts[0]
        } else if (window.web3.currentProvider.isImToken) {
            debug('imToken Wallet detected')
            const accounts = await window.ethereum.send('eth_requestAccounts') // EIP1102
            address = accounts[0]
        } else 
            address = window.web3.eth.accounts[0]   // everyone else ... maybe

        debug('wallet address: ', address)
        if (!address) {
            debug('Wallet address unknown. STOP.')
            return // web3Modal should take it from here
        }

        const chainId = Number(window.web3.currentProvider.chainId)
        let network
        if (HEX.CHAINS[chainId]) {
            network = HEX.CHAINS[chainId].name
            await this.setState({ chainId, network })
        } else {
            network = 'unavailable'
            await this.setState({ chainId, network })
            return
        }

        window.contract = new window.web3.eth.Contract(HEX.ABI, HEX.CHAINS[this.state.chainId].address)    // wallet's provider
        this.contract = new this.web3.eth.Contract(HEX.ABI, HEX.CHAINS[this.state.chainId].address)        // INFURA
        this.subscribeProvider(this.provider)

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
    }

    componentWillUnmount = () => {
        try { this.web3.eth.clearSubscriptions() } catch(e) { }
    }

    resetApp = async () => {
        await this.unsubscribeEvents()
        await this.web3Modal.clearCachedProvider()
        await this.setState({ ...INITIAL_STATE })
        this.provider = null
        this.web3 = null
        window.location.reload()
    }

    getProviderOptions = () => {
        const providerOptions = {
            walletconnect: {
                package: WalletConnectProvider, // required
                options: {
                    infuraId: process.env.REACT_APP_INFURA_ID // required
                }
            },
            // portis: {
            //     package: Portis, // required
            //     options: {
            //         id: process.env.REACT_APP_PORTIS_ID // required
            //     }
            // }
        }
        return providerOptions
    }

    connectWeb3ModalWallet = async (reset) => {
        if (reset) {
            await this.web3Modal.clearCachedProvider()
            window.web3 = null
            this.web3 = null
            this.provider = null
        }
        this.web3Modal = new Web3Modal({
            network: "mainnet",                         // optional
            cacheProvider: true,                        // optional
            providerOptions: this.getProviderOptions()  // required
        });
        this.walletProvider = await this.web3Modal.connect()
        if (this.walletProvider) {
            debug('web3Modal getProviderInfo: ', getProviderInfo(this.walletProvider))
            this.setState({ currentProvider: getProviderInfo(this.walletProvider).name })
            this.componentDidMount()
        }
    }

    disconnectWallet = async () => {
        const provider = this.provider || null
        if (provider && provider.close) {
            await this.unsubscribeEvents()
            await this.web3Modal.clearCachedProvider()
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
                <Col className="text-light text-center">{this.state.currentProvider}</Col>
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
                    <Button id="connect_wallet" onClick={() => this.connectWeb3ModalWallet(true)} variant="info">
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
                    <h2>...stake on the run</h2>
                    <h3>Open BETA <span>{process.env.REACT_APP_VERSION} ({process.env.REACT_APP_HEXMOB_COMMIT_HASH})</span></h3>
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

                    
                    { !detectedTrustWallet && /* TrustWallet won't follow external links */
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
            
                    { (process.env.REACT_APP_NODE_ENV === 'development' || window.location.hostname.match(/^dev\./) !== null) &&
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

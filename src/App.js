import React from 'react'
import { BigNumber } from 'bignumber.js'
import { HexNum } from './Widgets'
import { Container,
    Card,
    Row,
    Col,
    Button,
    Badge,
    ProgressBar,
    Image
} from 'react-bootstrap'
import Stakes from './Stakes'
import Lobby from './Lobby'

import Web3 from "web3";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider"
import Portis from "@portis/web3";

import HEX from './hex_contract'

import './App.scss'
const debug = require('debug')('App')
debug('loading')

const INITIAL_STATE = {
    chainId: 1, // ETH mainnet
    walletConnected: false,
    wallet: {
        address: '',
        balance: new BigNumber(0)
    },
    contractReady: false,
    contractGlobals: null
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
        window._APP = this // DEBUG remove me
    }

    getProviderOptions = () => {
        const providerOptions = {
            walletconnect: {
                package: WalletConnectProvider, // required
                options: {
                    infuraId: "ba82349aaccf4a448b43bf651e4d9145" // required
                }
            },
            portis: {
                package: Portis, // required
                options: {
                    id: "e55eff64-770e-4b93-9377-fb42791b5738" // required
                }
            }
        }
        return providerOptions
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
            this.contract.events.Transfer( {filter:{from:this.state.wallet.address}}, eventCallback).on('connected', (id) => debug('sub: HEX from:', id))
        )
        this.subscriptions.push(
            this.contract.events.Transfer( {filter:{to:this.state.wallet.address}}, eventCallback).on('connected', (id) => debug('sub: HEX to:', id))
        )
    }

    unsubscribeEvents = () => {
        if (this.subscriptions.length) {
            this.subscriptions = [ ]
            this.web3.shh.clearSubscriptions()
        }
    }

    updateHEXBalance = async () => {
        const balance = await this.contract.methods.balanceOf(this.state.wallet.address).call()
        this.setState({ wallet: { ...this.state.wallet, balance: new BigNumber(balance) } })
    }

    componentDidMount = async () => {
        if (!this.provider) {
            // check first for Mobile TrustWallet
            if (window.web3 && window.web3.currentProvider.isTrust) {
                const mainnet = {
                    chainId: 1,
                    rpcUrl: "https://mainnet.infura.io/v3/ba82349aaccf4a448b43bf651e4d9145"
                };
                /* XXX: 
                    Ancient legacy 0.5.x web3 code. provider.sendAync used only callback.
                    It doesn't matter because TrustWallet (iOS) sends no response back to
                    browser after signing (or not) a provider.sendAsync('send_Transaction')
                    anyway. :'( More ominous even ...

                    2020-05-21: Telegram::@hewig (Tao X) referring to [@trustwallet/trust-web3-provider]
                        ................... unfortunately legacy trust provider
                        is not fully eip1193 compatible, apple doesn’t like dapp
                        browsers, we might have some difficult decision to make 
                        in a few weeks

                    0uc4
                */
                this.provider = new window.Trust(mainnet)
            } else {
                return this.connectWeb3ModalWallet()
            }
        }
        if (!this.provider) return // User will need to click the button to connect again
        this.provider.enable()
        
        debug('web3 provider established')

        if (!this.web3) this.web3 = await new Web3(this.provider)
        debug('web3 provider connected')

//        window._P = this.provider // DEBUG remove mer
//        window._W3 = this.web3 // DEBUG remove me

        var address
        if (this.provider.isMetaMask) {
            debug('MetaMask detected')
            // UGLY: MetaMask takes time to srot itself out 
            address = await new Promise((resolve, reject) => {
                let retries = 10
                let timer = setInterval(() => {
                    debug('try ', retries)
                    address = this.web3.eth.accounts.givenProvider.selectedAddress
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
            if (!address) throw new Error("MetaMask failed to provide user's selected address")
        } else if (window.web3 && window.web3.currentProvider.isTrust) {
            address = this.web3.eth.givenProvider.address
            this.provider.setAddress(address)
        } else if (this.provider.isPortis) {
            const accounts = await this.web3.eth.getAccounts()
            address = accounts[0]
        } else 
            address = this.web3.eth.accounts.currentProvider.accounts[0]   // everyone else ... maybe

        debug('wallet address: ', address)
        if (!address) return // web3Modal will take it from here

        await this.setState({ 
            wallet: { ...this.state.wallet, address },
            walletConnected: true }
        )
        // WARNING: do not move this to before address establishment, because race conditionsi re MM selectedAddress
        try {
            this.contract = new this.web3.eth.Contract(HEX.ABI, HEX.ContractAddress)
            this.subscribeProvider(this.provider)
        } catch(e) {
            throw new Error('Contract instantiation failed', e)
        }

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

            // setState doesn't handle > 1 level trees at all well but we like to live dangerously 
            this.setState({
                wallet: {
                    address: address.toLowerCase(),
                    balance
                },
                contractReady: true
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
        window.location.reload()
    }

    connectWeb3ModalWallet = async (reset) => {
        this.web3Modal = new Web3Modal({
            network: "mainnet",                         // optional
            cacheProvider: true,                        // optional
            providerOptions: this.getProviderOptions()  // required
        });
        if (reset) await this.web3Modal.clearCachedProvider()
        this.provider = null
        while (this.provider === null) {
            this.provider = await this.web3Modal.connect()
            .catch(() => {
                debug('web3 provider connection cancelled')
            })
        }
        if (this.provider) this.componentDidMount()
    }

    disconnectWallet = async () => {
        const { provider } = this.web3
        if (provider && provider.close) {
            await this.unsubscribeEvents()
            await this.web3Modal.clearCachedProvider()
            provider.close()
        } else {
            this.resetApp()
        }
    }

    WalletStatus = () => {
        const { address, balance } = this.state.wallet
        const addressFragment = address && address !== ''
            ? address.slice(0,6)+'...'+address.slice(-4) : 'unknown'
        return (
            <Container id="wallet_status" fluid>
            <Row>
                <Col><Badge variant="success" className="small">mainnet</Badge></Col>
                <Col className="text-center"> 
                    <Badge variant="info" className="small"> 
                        <HexNum value={balance} showUnit />
                    </Badge>
                </Col>
                <Col className="text-right">
                    <Badge className="text-info d-none d-md-inline">{ addressFragment }</Badge>
                    <Badge variant="secondary" style={{ cursor: "pointer" }} onClick={ this.disconnectWallet } className="small">
                        disconnect
                    </Badge>
                </Col>
            </Row>
            </Container>
        )
    }

    AppContent = () => {
        if (!this.state.walletConnected) {
            return (
                <Container fluid className="text-center mb-3">
                    <Button id="connect_wallet" onClick={() => this.connectWeb3ModalWallet(true)} variant="info">
                        <span className="d-none">Click to Connect a Wallet</span>
                        <span className="sm-inline">Connect Wallet</span>
                    </Button>
                    <Container fluid id="mobile_devices" className="bg-light text-dark rounded p-3 my-3 overflow-hidden text-left">
                        <Container fluid className="my-3" id="mobile_trust_wallet">
                            <Row>
                                <Col className="text-center">
                                    <p><small><small>COMPATIBLE WITH ...</small></small></p>
                                    <p>
                                        <em><Image src="/mm-wordmark.svg" alt="Metamask" height={56} /></em> <em>on</em> <strong>Desktops</strong>
                                    </p>
                                    <p>
                                        <Image src="/trustwallet-logo.png" alt="Trust Wallet" height={64} /><em> on </em><strong>Mobile</strong>
                                        </p>
                                    <p>
                                        HEX<sup>mobile</sup> runs in TrustWallet's built-in dApp browser.
                                    </p>
                                </Col>
                            </Row>
                            <Row className="h-100">
                                <Col xs={12} sm={4}>
                                <img className="d-none d-sm-block"
                                    style={{ maxWidth: "90%" }}
                                    alt="TrustWallet on iPhone11"
                                    src="/trustwallet-iphone11.png"
                                />
                                <img className="d-block d-sm-none"
                                    style={{ maxWidth: "100%" }}
                                    alt="TrustWallet on iPhone11"
                                    src="/trustwallet-iphone11-cropped.png"
                                />
                                </Col>
                                <Col xs={12} sm={8} className="py-3 text-center text-sm-left m-auto allign-middle">
                                    <h3>Get&nbsp;Trust&nbsp;Wallet</h3>
                                    <div>
                                        <div className="m-3 d-inline-block">
                                            <a href="https://apps.apple.com/app/trust-ethereum-wallet/id1288339409">
                                                <Image src="/dltw-appstore.png" height={56} alt="Download on the App Store" />
                                            </a>
                                        </div>
                                        <div className="m-3 d-inline-block">
                                            <a href="https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp">
                                                <Image src="/dltw-googleplay.png" height={56} alt="Get it at Google Play" />
                                            </a>
                                        </div>
                                        <div className="m-3 d-inline-block">
                                            <a href="https://trustwallet.com/dl/apk">
                                                <Image src="/dltw-android.png" height={56} alt="Download for Android ARK" />
                                            </a>
                                        </div>
                                    </div>
                                </Col>
                            </Row>
                        </Container>
                        <Container>
                            <hr/>
                        </Container>
                        <Container fluid className="my-3" id="mobile_wallet_connect">
                            <Row className="h-100">
                                <Col>
                                    <h2 className="text-center text-sm-left"><img width={120} src="/walletconnect.svg" alt="" /> WalletConnect</h2>
                                    <p>
                                        A WalletConnect mobile wallet allows us to use any browser -- on any
                                        device -- even if it's <em>physically separate</em>.
                                    </p>

                                    <p>
                                        Once connected, simply use HEX<sup>mobile</sup> as usual, on your Desktop
                                        or other device. When you need to sign a transaction, your
                                        WalletConnect device handle the request, forwarding the results back to
                                        the browser. Tekanogikill!™
                                    </p>
                                    <hr/>
                                </Col>
                            </Row>
                            <Row>
                                <Col>
                                    <h5>To use WalletConnect on the <em><strong>same device</strong></em> ...</h5>
                                    <ol>
                                        <li>take a screenshot of the QR code</li>
                                        <li>point WalletConnect wallet to that image</li>
                                    </ol>
                                </Col>
                                <Col xs={12} sm={3} className="text-center">
                                    <img style={{ maxWidth: "90%", maxHeight: "300px" }} src="/wc-qr-example.png" alt="QR code example" />
                                </Col>
                            </Row>
                        </Container>
                    </Container>
                </Container>
            )
        } else if (!this.state.contractReady) {
            return (
                <ProgressBar variant="secondary" animated now={60} label="initializing" />
            )
        } else {
            return (
                <>
                    <Lobby contract={this.contract} wallet={this.state.wallet} />
                    <Stakes contract={this.contract} wallet={this.state.wallet} />
                </>
            )
        }
    }

    render() {
        // TrustWallet won't follow external links
        const isTrust = window.web3 && window.web3.currentProvider.isTrust
        return (
            <>
                <Container id="hexmob_header" fluid>
                    <h1>HEX<span>mobile</span></h1>
                    <h2> ...stake on the run</h2>
                    <h3>Open BETA <span>USE AT YOUR OWN RISK</span></h3>
                </Container>
                <Container id="hexmob_body" fluid className="p-1 text-center">
                    <Container>
                        <this.AppContent />
                    </Container>
                { "When AA Lobby gets here, if it ever gets here" === true &&  
                    <Container className="p-3 my-3 text-center">
                        <Card.Body as={Button} variant="success" className="w-100"
                            href={'https://go.hex.win/?r='+this.state.referrer} target="_blank" rel="noopener noreferrer"
                        >
                            <div><img src="/extra-bonus-10.png" alt="extra bonus 10%" /></div>
                            <div>
                                when you <strong>transform ETH to HEX</strong><br/>
                                using this app! 
                            </div>
                            { this.state.incomingReferrer && <div className="small"><em>fwd: {this.state.referrer}</em></div> }
                        </Card.Body>
                    </Container>
                }
                    { !isTrust && 
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
                </Container>
                <Container>
                    { this.state.walletConnected && <this.WalletStatus />}
                </Container>
            </>
        )
    }
}

export default App;

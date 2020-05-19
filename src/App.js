import React from 'react'
import { BigNumber } from 'bignumber.js'
import { HexNum } from './Widgets'
import { Container, Card, Row, Col, Button, Badge, ProgressBar } from 'react-bootstrap'
import Stakes from './Stakes'

import Web3 from "web3";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";

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
        window._APP = this // DEBUG REMOVE ME
    }

    getProviderOptions = () => {
        const providerOptions = {
            walletconnect: {
                package: WalletConnectProvider, // required
                options: {
                    infuraId: "ba82349aaccf4a448b43bf651e4d9145" // required
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
                await this.setState({ wallet: { address: newAddress } })
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
        this.subscriptions.concat(
            this.contract.events.Transfer( {filter:{from:this.state.wallet.address}}, eventCallback).on('connected', (id) => debug('sub: HEX from:', id))
        )
        this.subscriptions.concat(
            this.contract.events.Transfer( {filter:{to:this.state.wallet.address}}, eventCallback).on('connected', (id) => debug('sub: HEX to:', id))
        )
    }

    unsubscribeEvents = () => {
        if (this.subscriptions.length) {
            this.subscriptions = [ ]
            this.web3.eth.clearSubscriptions()
        }
    }

    updateHEXBalance = async () => {
        const balance = await this.contract.methods.balanceOf(this.state.wallet.address).call()
        this.setState({ wallet: { balance: new BigNumber(balance) } })
    }

    componentDidMount = async () => {
    
        // check first for Mobile TrustWallet
        if (window.web3.currentProvider.isTrust) {
            const mainnet = {
                chainId: 1,
                rpcUrl: "https://mainnet.infura.io/v3/ba82349aaccf4a448b43bf651e4d9145"
            };
            this.provider = new window.Trust(mainnet)
            this.web3 = new Web3(this.provider)

        } else {
            this.web3Modal = new Web3Modal({
                network: "mainnet",                         // optional
                cacheProvider: true,                        // optional
                providerOptions: this.getProviderOptions()  // required
            });
            try {
                this.provider = await this.web3Modal.connect()
            } catch(e) {
                this.provider = null;
                debug('Provider connection failed: ', e)
                alert('Please reload')
            }
        }

        if (!this.provider) throw new Error('Web3 provider appears broken :/')

        if (!this.web3) this.web3 = new Web3(this.provider)
        

        let address
        if (this.provider.isMetaMask)
            address = this.web3.eth.accounts.givenProvider.selectedAddress // MetaMask
        else if (window.web3 && window.web3.currentProvider.isTrust) {
            address = this.web3.eth.givenProvider.address
        }
        else 
            address = this.web3.eth.accounts.currentProvider.accounts[0]   // everyone else
        if (!address) return // web3Modal will take it from here

        this.setState({ 
            walletConnected: true }
        )

        try {
            this.contract = new this.web3.eth.Contract(HEX.ABI, HEX.ContractAddress)
            this.subscribeProvider(this.provider)
        } catch(e) {
            throw new Error('Contract instantiation failed', e)
        }

        Promise.all([
            this.contract.methods.balanceOf(address).call(), // [0] HEX balance
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
            <Container fluid className="fixed-top" style={{ backgroundColor: "black" }}>
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
                <Card bg="secondary" text="light" className="overflow-auto m-2">
                    <Card.Body className="p-2">
                        <Card.Title as="h5" className="m-0">Please Connect a Wallet (below)</Card.Title>
                        <Button onClick={() => this.resetApp()} variant="primary">RESET</Button>
                    </Card.Body>
                </Card>
            )
        } else if (!this.state.contractReady) {
            return (
                <ProgressBar variant="secondary" animated now={60} label="initializing" />
            )
        } else {
            return (
                <Stakes contract={this.contract} wallet={this.state.wallet} />
            )
        }
    }

    render() {
        return (
            <>
                { this.state.walletConnected && <this.WalletStatus />}
                <Container className="overflow-auto p-1" style={{ marginTop: "24px" }}>
                    <this.AppContent />
                </Container>
                <Container className="p-1 text-center">
                    <Card.Body as={Button} variant="success" className="w-100" style={{ cursor: "pointer" }}
                        href={'https://go.hex.win/?r='+this.state.referrer} target="_blank" rel="noopener noreferrer"
                    >
                        <div><img src="/extra-bonus-10.png" alt="extra bonus 10%" /></div>
                        <div>
                            when you <strong>transform ETH to HEX</strong><br/>
                            TAP HERE 
                        </div>
                        { this.state.incomingReferrer && <div className="small"><em>fwd: {this.state.referrer}</em></div> }
                    </Card.Body>
                </Container>
                <Container className="p-1">
                    <Card.Body as={Button} variant="info" className="w-100" style={{ cursor: "pointer" }}
                        href="https://changelly.com/?ref_id=1b7z255j4rfbxsyd#buy" target="_blank" rel="noopener noreferrer"
                    >
                        <div>
                            <img className="d-inline-block" src="/buy-eth.png" alt="buy ethereum here" style={{ verticalAlign: "middle" }} />
                            <div className="d-inline-block text-center" style={{ verticalAlign: "middle" }}>
                                TAP HERE to<br/>
                                <strong>buy Ethereum</strong><br/>
                                using Credit Card
                            </div>
                        </div>
                    </Card.Body>
                </Container>
                <Container className="p-1 mb-3">
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
        )
    }
}

export default App;

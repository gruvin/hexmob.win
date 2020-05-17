import React from 'react'
import { BigNumber } from 'bignumber.js'
import { format } from 'd3-format'
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
        address: null,
        hexBalance: new BigNumber(0)
    },
    contractReady: false,
    contractGlobals: null
}

class App extends React.Component {
    constructor(props) {
        super(props)

        this.web3 = null
        this.subscriptions = [ ]
        this.contract = null
        this.state = {
            ...INITIAL_STATE
        }
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
                    this.setState({ 
                        wallet: { ...this.state.wallet, address: accounts[0] } 
                    }) // , this.updateHEXBalance)
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
                await this.setState({ walletAddress: accounts[0] })
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
            debug('events.Transfer[error, result] => ', error, result.returnValues )
            this.updateHEXBalance()
        }
        this.subscriptions.concat(
            this.contract.events.Transfer( {filter:{from:this.state.wallet.address}}, eventCallback).on('connected', (id) => debug('from:', id))
        )
        this.subscriptions.concat(
            this.contract.events.Transfer( {filter:{to:this.state.wallet.address}}, eventCallback).on('connected', (id) => debug('to:', id))
        )
    }

    unsubscribeEvents = () => {
        if (this.subscriptions.length) {
            this.subscriptions = [ ]
            this.web3.eth.clearSubscriptions()
        }
    }


    componentDidMount = () => {
        this.web3Modal = new Web3Modal({
            network: "mainnet",                         // optional
            cacheProvider: true,                        // optional
            providerOptions: this.getProviderOptions()  // required
        });
        this.web3Modal.connect()
        .then((provider) => {
            console.log(provider)
            this.provider = provider
            this.subscribeProvider(this.provider)
            this.web3 = new Web3(provider)
            
            try {
                this.contract = new this.web3.eth.Contract(HEX.ABI, HEX.ContractAddress)
            } catch(e) {
                throw new Error('Contract instantiation failed', e)
            }

            const address = provider.isMetaMask
                ? this.web3.eth.accounts.givenProvider.selectedAddress // MetaMask
                : this.web3.eth.accounts.currentProvider.accounts[0]   // everyone else
            if (!address) return // web3Modal will take it from here
            this.setState({ walletConnected: true })

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
        })
        .catch((e) => console.error('Provider connection failed: ', e))
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
        const { provider } = this
        provider && provider.close && await provider.close()
    }

    WalletStatus = () => {
        const { address, balance } = this.state.wallet
        const addressFragment = address && address !== ''
            ? address.slice(0,6)+'...'+address.slice(-4) : 'unknown'
        return (
            <Container fluid>
            <Row>
                <Col md={{span: 2}}><Badge variant="success" className="small">mainnet</Badge></Col>
                <Col md={{span: 2, offset: 3}} className="text-center"> 
                    <Badge variant="info" className="small"> 
                        { format(',')(balance) }
                    </Badge>
                </Col>
                <Col md={{span: 3, offset: 2}} className="text-right">
                    <Badge className="text-info">{ addressFragment }</Badge>
                    <Badge variant="secondary" style={{ cursor: "pointer" }} onClick={ this.disconnectWallet } className="small">
                        disconnect</Badge>
                </Col>
            </Row>
            </Container>
        )
    }

    AppContent = () => {
        if (!this.state.walletConnected) {
            return (
                <>
                    <Card bg="primary" text="light" className="overflow-auto m-2">
                        <Card.Body className="p-2">
                            <Card.Title as="h5" className="m-0">Please Connect a Wallet (below)</Card.Title>
                            <Button onClick={() => this.resetApp()} variant="primary">RESET</Button>
                        </Card.Body>
                    </Card>
                </>
            )
        } else if (!this.state.contractReady) {
            return (
                <ProgressBar variant="secondary" animated now={60} label="initializing" />
            )
        } else {
            return (
                <>
                    <Stakes contract={this.contract} wallet={this.state.wallet} />
                </>
            )
        }
    }

    render() {
        return (
            <>
           { this.state.walletConnected && <this.WalletStatus />}
            <Container className="overflow-auto p-1">
                <this.AppContent />
            </Container>
            <Container className="overflow-auto p-3">
                <Button size="sm" variant="primary" 
                    href="https://changelly.com/?ref_id=1b7z255j4rfbxsyd#buy"
                    target="_blank" rel="noopener noreferrer"
                >
                    buy ETH
                </Button>
                {' '}
                <Button size="sm" variant="success" href="http://get.dogehex.win" target="_blank" rel="noopener noreferrer">
                    Get HEX +10% Bonus
                </Button>
                {' '}
                <Button size="sm" variant="info" href="https://hexdex.win/swap" target="_blank" rel="noopener noreferrer">
                    Swap HEX
                </Button>
            </Container>
            </>
        )
    }
}

export default App;

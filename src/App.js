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

const INITIAL_STATE = {
    chainId: 1, // ETH mainnet
    walletConnected: false,
    walletAddress: null,
    walletHEX: new BigNumber(0),
    contractReady: false,
    contractGlobals: null
}

class App extends React.Component {
    constructor(props) {
        super(props)

        this.web3 = null
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

        // MetaMask has no 'close' or 'disconnect' event. Workaround ...
        if (provider.isMetaMask) {
            window.ethereum.on('accountsChanged', async (accounts) => {
                if (!accounts.length)                   // => event:"close" (logged out)
                    this.resetApp()
                else                                    // => event:"accountsChanged"
                    await this.setState({ walletAddress: accounts[0] })
                    this.updateHEXBalance()
            })
            if (window.ethereum && window.ethereum.autoRefreshOnNetworkChange) 
                window.ethereum.autoRefreshOnNetworkChange = false
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

    subscribeTransfers = () => {
        this.wssInSubscription = this.web3.eth.subscribe('logs', {
            address: HEX.ContractAddress,
            topics: [
                this.state.contractData.TOPIC_HASH_TRANSFER,
                null,
                '0x' + this.state.walletAddress.slice(2).toLowerCase().padStart(64, '0')
            ]
        }, (error, result) => {
            if (error) return
            console.log('EVENT: HEX [IN] from: 0x' + result.topics[1].match(/[^0x]+.+/)[0])
            this.updateHEXBalance()
        });
        this.wssOutSubscription = this.web3.eth.subscribe('logs', {
            address: HEX.ContractAddress,
            topics: [
                this.state.contractData.TOPIC_HASH_TRANSFER,
                '0x' + this.state.walletAddress.slice(2).toLowerCase().padStart(64, '0')
            ]
        }, (error, result) => {
            if (error) return
            console.log('EVENT: HEX [OUT] to: 0x' + result.topics[2].match(/[^0x]+.+/)[0])
            this.updateHEXBalance()
        });
    }

    unsubscribeTransfers = () => {
        this.wssInSubscription.unsubscribe()
        this.wssOutSubscription.unsubscribe()
    }

    updateHEXBalance = () => {
        return new Promise((resolve, reject) => {
            if (!this.contract) return reject('contract not available')
            this.contract.methods.balanceOf(this.state.walletAddress).call()
            .then((bal) => {
                this.setState({ walletHEX: new BigNumber(bal)})
                resolve(bal)
            })
        })
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
            
            const walletAddress = provider.isMetaMask
                ? this.web3.eth.accounts.givenProvider.selectedAddress // MetaMask
                : this.web3.eth.accounts.currentProvider.accounts[0]   // everyone else
            if (!walletAddress) return

            this.setState({ walletAddress }, () => {

                this.contract = new this.web3.eth.Contract(HEX.ABI, HEX.ContractAddress)
                this.setState({
                    walletConnected: true 
                })

                
                Promise.all([
                    this.contract.methods.allocatedSupply().call(),  // [0]
                    this.contract.methods.currentDay().call(),       // [1]
                    this.contract.methods.globals().call()           // [2]
                ]).then((results) => {
                    const allocatedSupply = new BigNumber(results[0])
                    const currentDay = Number(results[1])
                    const rawGlobals = results[2]
                    
                    const globals = { }
                    for (const k in rawGlobals) {
                        if (isNaN(k)) globals[k] = new BigNumber(rawGlobals[k]);
                    }

                    // decode claimstats
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

                    let contractData = { 
                        allocatedSupply,
                        currentDay,
                        globals,
                    }
                    this.setState({
                        contractData,
                        contractReady: true,
                    })

                    this.updateHEXBalance()
                    this.subscribeTransfers()
                    //setInterval(this.updateHEXBalance, 30000) // a fallback, in case our wss feed breaks
                })
            })
        })
        .catch((e) => console.error('Wallet Connect ERROR: ', e))
    }

    componentWillUnmount = () => {
        this.unsubscribeTransfers()
    }

    resetApp = async () => {
        await this.unsubscribeTransfers()
        await this.web3Modal.clearCachedProvider()
        await this.setState({ ...INITIAL_STATE })
        window.location.reload()
    }

    disconnectWallet = async () => {
        const { web3 } = this
        if (web3 && web3.currentProvider && web3.currentProvider.close) {
            await web3.currentProvider.close()
        }
    }

    WalletStatus = () => {
        const balanceHEX = this.state.walletHEX.idiv(1e8).toString()
        return (
            <Container fluid>
            <Row>
                <Col md={{span: 2}}><Badge variant="success" className="small">mainnet</Badge></Col>
                <Col md={{span: 2, offset: 3}} className="text-center"> 
                    <Badge variant="info" className="small"> 
                        { format(',')(balanceHEX) }
                    </Badge>
                </Col>
                <Col md={{span: 3, offset: 2}} className="text-right">
                    <Badge className="text-info">{ this.state.walletAddress.slice(0,6)+'...'+this.state.walletAddress.slice(-4) }</Badge>
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
        } else {
            return (
                <>
                {this.state.contractReady
                    ? <Stakes contract={this.contract} context={this.state} />
                    : <ProgressBar variant="secondary" animated now={60} label="initializing" />
                }
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

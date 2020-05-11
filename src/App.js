import React from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'
import { BigNumber } from 'bignumber.js'
import { format } from 'd3-format'
import { Container, Card, Row, Col, Button, Badge, ProgressBar } from 'react-bootstrap'

import Stakes from './Stakes.js'

import './App.css'
import Web3 from "web3";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";

const INITIAL_STATE = {
    chainId: 1, // ETH mainnet
    walletConnected: false,
    walletAddress: null,
    walletHEX: new BigNumber(0),
    contractReady: false,
    contractGlobals: null
}
const contractABI = require('./hexabi.js')
const contractAddress ="0x2b591e99afe9f32eaa6214f7b7629768c40eeb39"

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
        provider.on("close", () => this.resetApp()) 

        // onClose (above) not supported by MetaMask. Work around ...
        if (provider.isMetaMask) {
            window.ethereum.on('accountsChanged', async (accounts) => {
                if (!accounts.length) 
                    this.resetApp() // logged out
                else 
                    await this.setState({ walletAddress: accounts[0] })
                    this.updateHEXBalance()
            })
            if (window.ethereum && window.ethereum.autoRefreshOnNetworkChange) 
                window.ethereum.autoRefreshOnNetworkChange = false
        } else {

            provider.on("accountsChanged", async (accounts) => {
                await this.setState({ walletAddress: accounts[0] })
                this.updateHEXBalance()
            })
        }

        provider.on("chainChanged", async (chainId) => {
            const { web3 } = this
            const networkId = await web3.eth.net.getId()
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
            address: contractAddress,
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
            address: contractAddress,
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
            this.provider = provider
            this.web3 = new Web3(provider)
            
            const accounts = this.web3.eth.accounts
            this.setState({ walletAddress: accounts.givenProvider.selectedAddress }, () => {

                //Check if Metamask is locked
                if (this.state.walletAddress && this.state.walletAddress !== '') {
                    
                    this.contract = new this.web3.eth.Contract(contractABI, contractAddress)
                    this.subscribeProvider(this.provider)
                    this.setState({
                        walletConnected: true 
                    })

                    
                    Promise.all([
                        this.contract.methods.allocatedSupply().call(),
                        this.contract.methods.currentDay().call(),
                        this.contract.methods.globals().call()
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

                        const START_DATE = new Date('2019-12-02 00:00:00 UTC')
                        const CLAIM_PHASE_START_DAY =  1
                        const CLAIM_PHASE_DAYS =  (7 * 50)
                        const CLAIM_PHASE_END_DAY =  CLAIM_PHASE_START_DAY + CLAIM_PHASE_DAYS
                        const BIG_PAY_DAY =  CLAIM_PHASE_END_DAY + 1
                        const CLAIMABLE_BTC_ADDR_COUNT =  new BigNumber('27997742')
                        const CLAIMABLE_SATOSHIS_TOTAL =  new BigNumber('910087996911001')
                        const HEARTS_PER_SATOSHI =  10000
                        const TOPIC_HASH_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
                        let contractData = { 
                            START_DATE,
                            CLAIM_PHASE_START_DAY,
                            CLAIM_PHASE_DAYS,
                            CLAIM_PHASE_END_DAY,
                            BIG_PAY_DAY,
                            CLAIMABLE_BTC_ADDR_COUNT,
                            CLAIMABLE_SATOSHIS_TOTAL,
                            HEARTS_PER_SATOSHI,
                            TOPIC_HASH_TRANSFER,
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
                }
            })
        })
        .catch((e) => console.error('Wallet Connect ERROR: ', e))
    }

    componentWillUnmount = () => {
        this.unsubscribeTransfers()
    }

    resetApp = async () => {
        const { web3 } = this
        if (web3 && web3.currentProvider && web3.currentProvider.close) {
            await web3.currentProvider.close()
        }
        await this.web3Modal.clearCachedProvider()
        this.setState({ ...INITIAL_STATE })
        window.location.reload()
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
                    <Badge variant="secondary" style={{cursor: "pointer"}} onClick={this.resetApp} className="small">
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
                            <Button onClick={() => window.location.reload(false)} variant="primary">Reload</Button>
                        </Card.Body>
                    </Card>
                </>
            )
        } else {
            return (
                <>
                {this.state.contractReady
                    ? <Stakes contract={this.contract} contractData={this.state.contractData} walletAddress={this.state.walletAddress} />
                    : <ProgressBar animated now={60} label="initializing" />
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
                <a href="https://changelly.com/?ref_id=1b7z255j4rfbxsyd#buy" target="_blank" rel="noopener noreferrer">buy ETH</a>
            </Container>
            </>
        )
    }
}

export default App;

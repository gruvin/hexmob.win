import React from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'
import { BigNumber } from 'bignumber.js'
import { Container, Card, Row, Col, Button, Badge, ProgressBar } from 'react-bootstrap'

import Stakes from './Stakes.js'

import './App.css'
import Web3 from "web3";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";

import { apiGetAccountAssets } from './lib/api'

/*
function sleep(ms) {
  return new Promise(resolve => { setTimeout(resolve, ms) });
}
*/
const INITIAL_STATE = {
    chainId: 1, // ETH mainnet
    walletConnected: false,
    walletAddress: null,
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
        provider.on("close", () => this.resetApp()) // not supported by MetaMask ...
        // ... work around ...
        if (provider.isMetaMask) {
            window.ethereum.on('accountsChanged', async (accounts) => {
                if (!accounts.length) this.resetApp() 
                else this.setState({ walletAddress: accounts[0] })
            })
            if (window.ethereum && window.ethereum.autoRefreshOnNetworkChange) window.ethereum.autoRefreshOnNetworkChange = false
        } else {

            provider.on("accountsChanged", async (accounts) => {
                await this.setState({ walletAddress: accounts[0] })
                await this.getAccountAssets()
            })
        }

        provider.on("chainChanged", async (chainId) => {
            const { web3 } = this
            const networkId = await web3.eth.net.getId()
            await this.setState({ chainId, networkId })
            await this.getAccountAssets()
        })

        provider.on("networkChanged", async (networkId: number) => {
            const { web3 } = this
            const chainId = await web3.eth.chainId()
            await this.setState({ chainId, networkId })
            await this.getAccountAssets()
        })

    }

    getAccountAssets = async () => {
        const { walletAddress:address, chainId } = this.state;
        this.setState({ fetching: true });
        try {
            // get account balances
            const assets = await apiGetAccountAssets(address, chainId);
            console.log("ASSETS: ", address, assets)

            await this.setState({ fetching: false, assets });
        } catch (error) {
            console.error(error); // tslint:disable-line
            await this.setState({ fetching: false });
        }
    }

    componentDidMount = () => {
        const contractABI = require('./hexabi.js')
        const contractAddress ="0x2b591e99afe9f32eaa6214f7b7629768c40eeb39"
        this.web3Modal = new Web3Modal({
            network: "mainnet",                         // optional
            cacheProvider: true,                        // optional
            providerOptions: this.getProviderOptions()  // required
        });
        this.web3Modal.connect()
        .then((provider) => {
            this.provider = provider
            this.web3 = new Web3(provider)
            
            const account = this.web3.eth.accounts
            this.setState({ walletAddress: account.givenProvider.selectedAddress }, () => {

                //Check if Metamask is locked
                if (this.state.walletAddress && this.state.walletAddress !== '') {
                    
                    this.contract = new this.web3.eth.Contract(contractABI, contractAddress)
                    this.subscribeProvider(this.provider)
                    this.setState({
                        walletConnected: true 
                    })
                    
                    Promise.all([
                        this.getAccountAssets(),
                        this.contract.methods.allocatedSupply().call(),
                        this.contract.methods.currentDay().call(),
                        this.contract.methods.globals().call()
                    ]).then((results) => {
                        let globals = { }
                        const rawGlobals = results[3]
                        for (const k in rawGlobals) {
                            const v = rawGlobals[k]
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
                            allocatedSupply:    new BigNumber(results[1]),
                            currentDay:         Number(results[2]),
                            globals:            globals
                        }
                        this.setState({
                            contractData,
                            contractReady: true 
                        })
                    })
                }
            })
        })
        .catch((e) => console.error('Wallet Connect ERROR: ', e))
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
        return (
            <Container fluid>
            <Row>
                <Col md={{span: 2}}><Badge variant="success" className="small">mainnet</Badge></Col>
                <Col md={{span: 4, offset: 6}} className="text-right">
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
            </>
        )
    }
}

export default App;

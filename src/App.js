import React from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'
import { BigNumber } from 'bignumber.js'
import { Container, Card, Row, Col, Button } from 'react-bootstrap'

import Stakes from './Stakes.js'

import './App.css'
import Web3 from "web3";
import Web3Modal from "web3modal";

import WalletConnectProvider from "@walletconnect/web3-provider";
const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider, // required
    options: {
      infuraId: "ba82349aaccf4a448b43bf651e4d9145" // required
    }
  }
};
const web3Modal = new Web3Modal({
  network: "mainnet", // optional
  cacheProvider: true, // optional
  providerOptions // required
});
const contractABI = require('./hexabi.js')
const contractAddress ="0x2b591e99afe9f32eaa6214f7b7629768c40eeb39"
const myAddress = '0xD30542151ea34007c4c4ba9d653f4DC4707ad2d2'

/*
function sleep(ms) {
  return new Promise(resolve => { setTimeout(resolve, ms) });
}
*/


class App extends React.Component {
    //const web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/ba82349aaccf4a448b43bf651e4d9145"))

    constructor(props) {
        super(props)
        this.web3 = null
        this.contract = null
        this.state = {
            walletConnected: false,
            walletAddress: null,
            contractGlobals: null,
            appReady: false
        }
    }

    componentDidMount() {
        web3Modal
        .connect()
        .then((provider) => {
            this.provider = provider
            this.web3 = new Web3(provider)
            
            this.contract = new this.web3.eth.Contract(contractABI, contractAddress)
            this.contract.globals = { }

            let account = this.web3.eth.accounts
            let walletAddress = account.givenProvider.selectedAddress
            //Check if Metamask is locked
            if (walletAddress) {
                window.ethereum.on('accountsChanged', function (accounts) {
                    console.log("MetaMask account change. Reloading...");
                    window.location.reload(); 
                })            
                this.setState({
                    walletAddress: account.givenProvider.selectedAddress,
                    walletConnected: true 
                })

                Promise.all([
                    this.contract.methods.allocatedSupply().call(),
                    this.contract.methods.currentDay().call(),
                    this.contract.methods.globals().call()
                ]).then((results) => {
                    let contractData = { 
                        allocatedSupply:    new BigNumber(results[0]),
                        currentDay:         Number(results[1]),
                        globals:            results[2]
                    }
                    // decode claimstats
                    const SATOSHI_UINT_SIZE = 51 // bits
                    let binaryClaimStats = new BigNumber(contractData.globals.claimStats).toString(2).padStart(153, '0')
                    let a = binaryClaimStats.slice(0, SATOSHI_UINT_SIZE)
                    let b = binaryClaimStats.slice(SATOSHI_UINT_SIZE, SATOSHI_UINT_SIZE * 2)
                    let c = binaryClaimStats.slice(SATOSHI_UINT_SIZE * 2)
                    contractData.globals.claimStats = {
                        claimedBtcAddrCount: new BigNumber(a, 2).toString(),
                        claimedSatoshisTotal: new BigNumber(b, 2).toString(),
                        unclaimedSatoshisTotal: new BigNumber(c, 2).toString()
                    }

                    this.setState({
                        contractData,
                        appReady: true 
                    })
                })
            }
        })
    }

    MyAddress = () => {
        return (
            <Card bg="primary" text="light" className="overflow-auto m-2">
                <Card.Body className="p-2">
                    <Card.Title as="h5" className="m-0">{this.state.walletAddress}</Card.Title>
                </Card.Body>
            </Card>
        )
    }

    render() {
        if (!this.state.walletConnected && !this.state.appReady) {
            return (
                <Card bg="primary" text="light" className="overflow-auto m-2">
                    <Card.Body className="p-2">
                        <Card.Title as="h5" className="m-0">Wallet is Locked</Card.Title>
                        <p>Please unlock and connect your wallet</p>
                        <Button onClick={() => window.location.reload(false)} variant="primary">Reload</Button>
                    </Card.Body>
                </Card>
            )
        } else {
            return (
                <Container className="overflow-auto p-1">
                    {this.state.walletConnected && <this.MyAddress />}
                    {this.state.appReady 
                        ? <Stakes contract={this.contract} contractData={this.state.contractData} myAddress={this.state.walletAddress} />
                        : <div>Loading contract data ...</div>
                    }
                </Container>
            )
        }
    }
}

export default App;

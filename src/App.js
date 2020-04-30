import React from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'
//import Container from 'react-bootstrap/Container'
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
            walletAddress: null
        }
    }

    componentDidMount() {
        web3Modal
        .connect()
        .then((provider) => {
            this.provider = provider
            this.web3 = new Web3(provider)
            this.contract = new this.web3.eth.Contract(contractABI, contractAddress)
            let account = this.web3.eth.accounts
            let walletAddress = account.givenProvider.selectedAddress
            //Check if Metamask is locked
            if (walletAddress) {
                window.ethereum.on('accountsChanged', function (accounts) {
                    console.log("MetaMask account change. Reloading...");
                    window.location.reload(); 
                })            
                this.state.walletAddress = account.givenProvider.selectedAddress
                this.setState({ walletConnected: true });
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
        if (!this.state.walletConnected) {
            return (
                <Card bg="primary" text="light" className="overflow-auto m-2">
                    <Card.Body className="p-2">
                        <Card.Title as="h5" className="m-0">Wallet is Locked</Card.Title>
                        <p>Please unlock your wallet to use this App</p>
                        <Button onClick={() => window.location.reload(false)} variant="primary">Reload</Button>
                    </Card.Body>
                </Card>
            )
        } else {
            return (
                <Container fluid className="overflow-auto p-1">
                    <this.MyAddress />
                    {this.state.walletConnected && <Stakes contract={this.contract} myAddress={this.state.walletAddress} /> }
                </Container>
            )
        }
    }
}

export default App;

import React from "react"
import Container from "react-bootstrap/Container"
import Card from "react-bootstrap/Card"
import Row from "react-bootstrap/Row"
import Col from "react-bootstrap/Col"
import Button from "react-bootstrap/Button"
import Badge from "react-bootstrap/Badge"
import CopyToClipboard from 'react-copy-to-clipboard'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons'
import ProgressBar from "react-bootstrap/ProgressBar"
import { GitHubInfo } from "./Widgets"
import * as AppT from "./lib/App"
import BrandLogo from "./BrandLogo"
import { WhatIsThis, MetamaskUtils } from "./Widgets"
import CHAINS, { type TChain } from "./chains"
import HEX, { type HEXContract, type HEXGlobals } from "./hex_contract"
// import UNIV2 from "./univ2_contract" /* HEX/USDC pair */
import { ethers, BigNumber } from "ethers";

import SignClient from "@walletconnect/sign-client"
import { Web3Modal } from "@web3modal/standalone"

//import Portis from "@portis/web3";
import { decodeClaimStats, bnPrefixObject } from "./util"
import "./App.scss"
import ReactGA from "react-ga"
import { format } from "d3-format"
import _axios from "axios"
import _debug from "debug"

const axios = _axios.create({
    baseURL: "/",
    timeout: 3000,
    headers: { "Content-Type": "application/json", "Accept": "applicaiton/json" },
})

const uriQuery = new URLSearchParams(window.location.search)
const debug = _debug("App")

switch (window.location.hostname) {
    case "hexmob.win":
    case "dev.hexmob.win":
        window.hostIsTSA = false
        window.hostIsHM = true
        break

    case "127.0.0.1":
    case "go.tshare.app":
    default:
        window.hostIsTSA = true
        window.hostIsHM = false
}

// @ref https://docs.walletconnect.com/2.0/web3modal/standalone/installation
const web3Modal = new Web3Modal({
    //
    walletConnectVersion: 1, // or 2
    projectId: import.meta.env.VITE_WALLET_CONNECT_ID,
    standaloneChains: ["eip155:1"],
    themeMode: "dark",
});
const signClient = await SignClient.init({ projectId: import.meta.env.VITE_WALLET_CONNECT_ID });

const Stakes = React.lazy(() => import("./Stakes"));
const Tewkenaire = React.lazy(() => import("./Tewkenaire"));
const Lobby = React.lazy(() => import("./Lobby"));
const Blurb = React.lazy(() => import("./Blurb"));
const Stats = React.lazy(() => import("./Stats"));

const INITIAL_STATE: AppT.State = {
    chainId: 0,
    network: null,
    currentProvider: "---",
    walletConnected: false,
    wallet: {
        address: "",
        bnBalance: ethers.constants.Zero,
        bnBalanceETH: ethers.constants.Zero
    },
    contractReady: false,
    contractGlobals: {},
    currentDay: Number(0),
    USDHEX: Number(0.0),
    donation: "",
    bnTotalHearts: ethers.constants.Zero,
    USD: Number(0.0),
    referrer: "",
    accounts: [],
}

class App extends React.Component<AppT.Props, AppT.State> {
    triggerWeb3Modal: boolean = false
    web3?: any
    wssProvider?: any
    subscriptions: any[] = [] // XXX no longer used?
    contract?: HEXContract
    dayInterval?: NodeJS.Timer
    usdHexInterval?: NodeJS.Timer
    retryCounter: number = 2
    web3modal: Web3Modal | null = null
    // univ2contract?: any
    walletProvider?: any
    web3provider?: any
    usdProgress: Element | null = null
    USDHEX?: Element
    currentUTCday: number = new Date().getUTCDay()

    state: AppT.State = { ...INITIAL_STATE }

    constructor(props: AppT.Props) {
        super(props)
        window.metamaskOnline = () => this.state.walletConnected && window.ethereum && window.ethereum.isMetaMask

    }

    subscribeProvider = async (provider: any) => {
        if (provider.isMetaMask) {

            provider.on("disconnect", () => { debug("RPC disconnected => reset"); this.resetApp() })
            provider.on("chainChanged", () => { debug("wallet chainChanged => reset"); this.resetApp() })
            provider.on("accountsChanged", (accounts: string[]) => {
                if (!accounts.length)                   // => legacy workaround for lack of event:[close|disconnect] (logged out)
                    this.resetApp()
                else {                                  // => event:accountsChanged actual
                    const newAddress: String = accounts[0]
                    debug("ADDRESS CHANGE [metamask]: %s(old) => %s", this.state.wallet.address, newAddress)
                    this.setState({
                        wallet: { ...this.state.wallet, address: accounts[0] }
                    }, this.updateHEXBalance)
                }
            })

        } else { // WalletConnect (and others) ...

            // "close" is deprecated in favour of "disconnect" in MetaMask but not some other wallets
            provider.on("close", () => {
                debug("provider::event:close")
            })

            provider.on("stop", async (networkId?: number) => { // WalletConnect: fires when remote wallet is disconnected
                this.resetApp()
            })

            provider.on("accountsChanged", async (accounts: string[]) => {
                const newAddress: string = accounts[0]
                debug("ADDRESS CHANGE: %s(old) => %s", this.state.wallet.address, newAddress)
                this.setState({ wallet: { ...this.state.wallet, address: newAddress } })
                this.updateHEXBalance()
            })
        }

        provider.on("chainChanged", async (chainId?: number) => {
            this.resetApp()
        })

        provider.on("network", (_?: any, oldNetwork?: string) => { if (oldNetwork) this.resetApp() });

        try {
            window.web3signer.currentProvider.publicConfigStore
                .on("update", this.updateETHBalance)
        } catch (e) { }
    }

    subscribeEvents = async () => {
        if (this.state.wallet.address === "") {
            setTimeout(this.subscribeEvents, 1000)
            return
        }
        this.contract?.on(this.contract.filters.Transfer(this.state.wallet.address), this.updateHEXBalance)
        this.contract?.on(this.contract.filters.Transfer(null, this.state.wallet.address), this.updateHEXBalance)

        // this.univ2contract.on("Swap", (amount0In: string, amount1In: string, amount0Out: string, amount1Out: string) => {
        //     try {
        //         const USDHEX = (parseInt(amount1In) !== 0)
        //             ? Number(parseInt(amount1In) * 100 / parseInt(amount0Out))
        //             : Number(parseInt(amount1Out) * 100 / parseInt(amount0In))
        //         debug(`USDHEX(Swap) = $${USDHEX}`)
        //         this.setState({ USDHEX })
        //     } catch(e) { // should never happen
        //         debug(`UNIV2[Swap]: Exception %o: amount1In:${amount1In} amount0Out: ${amount0Out}`, e)
        //     }
        // })

        // check for new currentDay every second
        // update UI immediately. confirm actual contract day 3 seconds later
        this.dayInterval = setInterval(async () => {
            const _currentUTCday = new Date().getUTCDay()
            if (_currentUTCday != this.currentUTCday) {
                this.currentUTCday = _currentUTCday
                if (this.state.currentDay !== 0) this.setState({ currentDay: this.state.currentDay + 1 })
                setTimeout(async () => {
                    try {
                        this.currentUTCday = _currentUTCday
                        const currentDay = (await this.contract!.currentDay()).toNumber()
                        this.contract!.Data!.currentDay = currentDay
                        this.setState({ currentDay })
                    } catch (e) {
                        debug("contract.currentDay() failed :/")
                    }
                }, 5000)
            }
        }, 1000);

        debug("Event subscriptions complete")

    }

    unsubscribeEvents = () => {
        try {
            // this.univ2contract?.removeAllListeners()
            this.contract?.removeAllListeners()
        } catch (e) { }
    }

    updateETHBalance = () => {
        const wallet = this.state.wallet
        const { address } = wallet
        if (address.slice(0, 2) !== "0x") return
        window.web3signer.getBalance(address)
            .then((bnBalanceETH: BigNumber) => this.setState({ wallet: { ...wallet, bnBalanceETH } }))
            .catch((e: Error) => debug("updateETHBalance(): ", e))
    }

    updateHEXBalance = () => {
        this.contract?.balanceOf(this.state.wallet.address)
            .then((bnBalance: BigNumber) => this.setState({ wallet: { ...this.state.wallet, bnBalance } }))
            .catch((e: Error) => debug("updateHEXBalance(): ", e))
    }

    /* returns address or null */
    async establishWeb3Provider(): Promise<string | null> {

        // Check for non-web3modal injected providers (mobile dApp browsers)
        if (window.ethereum?.isMetaMask === true) {        // imToken
            debug("Detected Metamask wallet")
            this.walletProvider = window.ethereum
            this.setState({ currentProvider: "Metamask" })
        } else { // web3modal it is ...
            this.setState({ currentProvider: "web3modal" })
            if (this.triggerWeb3Modal) {
                this.triggerWeb3Modal = false

                try {
                    if (signClient) {
                        const { uri, approval } = await signClient.connect({
                            requiredNamespaces: {
                                eip155: {
                                    methods: ["eth_sign"],
                                    chains: ["eip155:1"],
                                    events: ["accountsChanged"],
                                },
                            },
                        });
                        if (uri) {
                            await web3Modal.openModal({ uri });
                            await approval();
                            web3Modal.closeModal();
                            this.walletProvider = signClient
                        }
                    }
                } catch (err) {
                    console.error(err);
                }

                const currentProvider = this.walletProvider
                    ? this.walletProvider.getProviderInfo(this.walletProvider).namespaces
                    : "---"

                this.setState({ currentProvider })
            }
        }

        // @dev this.walletProvider is our transaction signing provider, such as MetaMask
        if (!this.walletProvider || !this.walletProvider.chainId) return Promise.reject(new Error("web3modal no wallet chossen"))

        const chainId = Number(this.walletProvider.chainId)
        const network = CHAINS[chainId] || null
        if (!network) return Promise.reject(`Unsupported Network (chainId: ${chainId})`)

        this.setState({ chainId, network })

        this.web3provider = (chainId === 1)
            ? new ethers.providers.InfuraProvider(network.name, import.meta.env.VITE_INFURA_ID) // INFURA (read ony)
            : new ethers.providers.Web3Provider(this.walletProvider) // Infura not available. Use wallet provider

        this.web3provider.on("error", (e: any) => {
            console.log("UNEXPECTED DISCONNECTION: Error => ", e)
            alert("UNEXPECTED DISCONNECTION\n\n"
                + "If running on iOS v15+, please use Safari and disable "
                + "Apple's buggy [NSURLSession Websocket] 'feature' found at ..."
                + "\nSettings -> Safari -> Advanced -> Experimental Features -> NSURLSession Websocket"
                + "\n\nDoing so will not adversely affect other activities.")
            this.resetApp() // TODO: try to gracefully reconnect etc
        })

        window.web3signer = new ethers.providers.Web3Provider(this.walletProvider)  // signer (eg MetaMask from web3modal selection)
        if (!this.web3provider || !window.web3signer) return Promise.reject("Unexpected error establishing web3 providers")

        debug("Web3 providers connected:\n\tthis.web3provider: %O\n\twindow.web3signer: %O", this.web3provider, window.web3signer)
        if (import.meta.env.NODE_ENV === "development") {
            window._W3provider = this.web3provider
            window._W3signer = this.web3provider
        }

        // Different wallets have different methods of supplying the user"s active ETH address
        let address = ""
        if (this.walletProvider.isMetaMask) {               // MetaMask
            debug("web3modal provider is MetaMask")
            let accounts = null
            if (this.walletProvider.request) { // new way
                debug("accounts[] new method")
                const response = await this.walletProvider.request({ method: "eth_accounts" })
                accounts = response
            }
            debug("accounts[]: ", accounts)
            address = accounts[0]
        } else if (this.walletProvider.isCoinBase) {        // CoinBase
            debug("Provider is Coinbase")
            await this.walletProvider.enable()
            const accounts = await this.walletProvider.eth.getAccounts()
            address = accounts[0]
        } else if (this.walletProvider.isWalletConnect) {    // Wallet Connect
            debug("web3modal provider is WalletConnect (QR code)")
            address = this.walletProvider.accounts[0]
        } else if (window.web3signer.currentProvider.isPortis) {
            await this.walletProvider.enable()
            const accounts = await this.walletProvider.eth.getAccounts()
            address = accounts[0]
        } else if (window.web3signer.currentProvider.isImToken) { // imToken
            debug("imToken Wallet detected")
            const accounts = await window.web3signer.currentProvider.send("eth_requestAccounts") // EIP1102
            address = accounts[0]
        } else                                              // OTHERS (WalletConnect)
            address = window.web3signer.eth.accounts[0]

        return (address.toLowerCase().slice(0, 2) === "0x") ? address : null
    }

    // this function will be called eery 10 seconds after the first invocation.
    subscribeUpdateUsdHex = async () => {

        if (!this.usdProgress || !this.usdProgress.firstElementChild) return // can happen when auto-compile causes page reload during dev session

        this.usdProgress.firstElementChild.classList.remove("countdown")

        // look for last session cached value in localStorage first
        let { USDHEX } = this.state
        if (!USDHEX && (USDHEX = Number(localStorage.getItem("usdhex_cache")))) this.setState({ USDHEX })

        // debug("USDHEX: request")
        // Original/alternative https://github.com/HexCommunity/HEX-APIs
        axios.get("https://uniswapdataapi.azurewebsites.net/api/hexPrice", {
            timeout: 5000,  // expect answer within 2.5 seconds
            headers: { "accept": "application/json" }
        })
            .then(response => response.data)
            .then(data => {
                const USDHEX = parseFloat(data.hexUsd) || Number(0.0)
                if (USDHEX) {
                    this.retryCounter = 2
                    localStorage.setItem("usdhex_cache", USDHEX.toString())
                    this.setState({ USDHEX })
                    debug(`USDHEX = $${USDHEX}`)
                    this.setState({ USDHEX }, () => {
                        if (!this.usdProgress || !this.usdProgress.firstElementChild) return
                        this.usdProgress.firstElementChild.classList.add("countdown")
                        setTimeout(this.subscribeUpdateUsdHex, 9000)
                    })
                }
            })
            .catch(e => {
                if (--this.retryCounter === 0) {
                    this.retryCounter = 2
                    debug("subscribeUpdateUsdHex: Too many failures. Invalidating cached USDHEX.")
                    localStorage.removeItem("usdhex_cache")
                    this.setState({ USDHEX: 0 })
                }
                debug(`subscribeUpdateUsdHex: ${e.message}. Backing off 30 seconds.`)
                setTimeout(this.subscribeUpdateUsdHex, 30000) // back off 30 seconds
            })
    }

    async componentDidMount() {
        switch (window.location.hostname) {
            case "go.tshare.app": ReactGA.initialize("UA-203521048-1"); break; // usage
            case "hexmob.win": ReactGA.initialize("UA-203562559-1"); break// usage
            case "127.0.0.1":
            case "dev.hexmob.win":
                ReactGA.initialize("UA-203524460-1");
                break; // dev usage
            default: { }
        }

        //debug("ENV: ", import.meta.env)

        const referrer = (uriQuery.get("r") || "").toLowerCase()
        if (uriQuery.has("reset")) { return this.resetApp() }
        if (uriQuery.has("account")) {
            const uriAccounts = uriQuery.getAll("account")
            const accounts = uriAccounts.map(account => { const s = account.split(":"); return { address: s[0], name: s[1] || "" } })
            this.setState({ accounts })
        }

        if (localStorage.getItem("debug")) {
            window._APP = this
            window._E = ethers
            window._w3M = this.web3modal
            window._HEX = HEX
            // window._UNIV2 = UNIV2
            window.debug = debug
        }

        const address = await this.establishWeb3Provider()
        .catch(e => debug(e))


        ////// STOP IF NO WALLET CONNECTION //////
        if (!address || address == "") return debug("No wallet address supplied - STOP")

        if (this.state.chainId === 1) {
            window.contract = new ethers.Contract(HEX.CHAINS[this.state.chainId], HEX.ABI, window.web3signer.getSigner())   // wallet provider
            this.contract = new ethers.Contract(HEX.CHAINS[this.state.chainId], HEX.ABI, this.web3provider) as HEXContract  // INFURA
            // this.univ2contract = new ethers.Contract(UNIV2.CHAINS[this.state.chainId], UNIV2.ABI, this.web3provider)        // INFURA
        } else {
            // drop INFURA for networks not supported
            window.contract = new ethers.Contract(HEX.CHAINS[this.state.chainId], HEX.ABI, this.web3provider.getSigner()) // wallet provider
            this.contract = window.contract;
            // this.univ2contract = new ethers.Contract(UNIV2.CHAINS[this.state.chainId], UNIV2.ABI, window.web3signer)
        }
        if (!this.contract) return debug("ethers.Contract instantiation failed. Caanot continue.")

        this.subscribeProvider(this.walletProvider)

        const [bnBalance, bnAllocatedSupply, bnCurrentDay, _globals] = await (
            Promise.all([
                this.contract.balanceOf(address).catch((e: Error) => debug("balanceOf: addr=[" + address + "] ", e)),
                this.contract.allocatedSupply().catch((e: Error) => debug("allocatedSupply:", e)),
                this.contract.currentDay().catch((e: Error) => debug("currentDay:", e)),
                this.contract.globals().catch((e: Error) => debug("globals:", e))
            ])
                .catch(e => debug("App::componentDidMount:Promise.all(...): ", e))
        ) as [BigNumber, BigNumber, BigNumber, HEXGlobals]

        const currentDay = bnCurrentDay.toNumber()

        // parse globals
        // debug("_GLOBALS: %O", _globals)
        const globals = {
            ...bnPrefixObject(_globals),
            claimStats: decodeClaimStats(_globals.claimStats.toString())
        } as unknown as HEXGlobals
        debug("GLOBALS: %O", globals)

        // adding this to web3 contract for convenience down the road
        this.contract.chainId = this.state.chainId
        window.contract.chainId = this.state.chainId // TODO ugly hack nottificate I
        this.contract.Data = {
            bnAllocatedSupply,
            currentDay,
            globals
        }
        window.contract.Data = this.contract.Data

        this.setState({
            referrer,
            wallet: {
                address,
                bnBalance
            },
            walletConnected: true,
            contractReady: true,
            currentDay
        })
        ReactGA.pageview(window.location.pathname + window.location.search); // will trigger only once per page (re)load

        this.subscribeEvents()
        this.state.chainId === 1 && this.subscribeUpdateUsdHex()
        this.updateETHBalance()
    }

    componentWillUnmount = () => {
        try {
            clearInterval(this.dayInterval)
            clearInterval(this.usdHexInterval)
            this.unsubscribeEvents()
        } catch (e) { }
    }

    resetApp = async () => {
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
            if (provider.disconnect) await provider.disconnect()
            else if (provider.close) await provider.close()
        } catch {
        }
        this.resetApp()
    }

    WalletStatus = () => {
        const { address } = this.state.wallet
        const addressFragment = address && address !== ""
            ? address.slice(0, 6) + "..." + address.slice(-4) : "unknown"
        return (
            <Container id="wallet_status" fluid>
                <Row>
                    <Col><Badge bg={this.state.chainId === 1 ? "success" : "danger"} className="small">{this.state.network.name}</Badge></Col>
                    <Col className="text-muted text-center small">{this.state.currentProvider}</Col>
                    <Col className="text-end">
                        <WhatIsThis tooltip={address}><>
                            <Badge bg="secondary" className="text-info">
                                <CopyToClipboard text={address}><>
                                    {addressFragment}
                                    <FontAwesomeIcon icon={faCopy} /></>
                                </CopyToClipboard>
                            </Badge></>
                        </WhatIsThis>
                    </Col>
                </Row>
            </Container>
        )
    }

    AppContent = () => {
        if (!this.state.walletConnected) { // "connect wallet" button
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
                        openActive={!uriQuery.has("closed")}
                    />
                    {uriQuery.has("tewkens") &&
                        <Tewkenaire parent={this} usdhex={this.state.USDHEX} />
                    }

                    <Lobby parent={this} contract={this.contract} wallet={this.state.wallet} />

                    {this.state.accounts.length > 0 && this.state.accounts.map(acc => {
                        const _wallet: AppT.Wallet = {
                            address: acc.address,
                            bnBalance: ethers.constants.Zero,
                            bnBalanceETH: ethers.constants.Zero
                        }
                        return (
                            <Stakes
                                parent={this}
                                key={`public:${acc.address}`}
                                className="mt-3"
                                publicAddress={acc.address}
                                publicName={acc.name}
                                contract={this.contract} wallet={_wallet} usdhex={this.state.USDHEX}
                            />
                        )
                    })}
                    <Stats parent={this} contract={this.contract} wallet={this.state.wallet} usdhex={this.state.USDHEX} />
                </>
            )
        }
    }

    render() {
        return (
            <>
                <Container id="hexmob_header" fluid>
                    <BrandLogo />
                    <div id="version-day">
                        <h3>{import.meta.env.VITE_VERSION || "v0.0.0A"} <strong className="text-warning">WP</strong></h3>
                        <div>
                            <span className="text-muted small align-baseline me-1">DAY</span>
                            <span className="numeric text-info align-baseline fs-5 fw-bold">{this.state.currentDay ? this.state.currentDay : "---"}</span>
                        </div>
                    </div>
                    <div id="usdhex">
                        <span className="text-muted small me-1">USD</span>
                        <span className="numeric text-success h2">{"$" + (isNaN(this.state.USDHEX) ? "-.--" : format(",.4f")(this.state.USDHEX))}</span>
                        <ProgressBar variant="secondary" now={50} animated={false} ref={r => this.usdProgress = r} />
                    </div>
                </Container>
                <Container id="hexmob_body" fluid className="p-1">
                    {this.state.chainId > 1 &&
                        <Container fluid className="bg-danger text-white text-center">
                            <strong>{this.state.network.description.toUpperCase()}</strong>
                        </Container>
                    }
                    <Container className="p-1">
                        <this.AppContent />
                        {HEX.lobbyIsActive() &&
                            <Container className="p-1 my-3 text-center">
                                <Card.Body as={Button} variant="success" className="w-100"
                                >
                                    <div><img src="/extra-bonus-10.png" alt="extra bonus 10%" /></div>
                                    <div>
                                        Receive an extra <b>10%&nbsp;FREE&nbsp;BONUS&nbsp;HEX</b> just for <b>using&nbsp;this&nbsp;App </b>
                                        to TRANSFORM&nbsp;ETH in the <b>AA&nbsp;Lobby</b>&nbsp;(above)<br />
                                        <small>standard 10% bonus from Dev"s referral addr</small>
                                    </div>
                                    {this.state.referrer !== "" && <div className="small"><em>fwd: {this.state.referrer}</em></div>}
                                </Card.Body>
                            </Container>
                        }
                        {this.state.walletConnected &&
                            <Container>
                                <div className="text-center m-3">
                                    <Button variant="outline-danger" onClick={this.disconnectWallet} >
                                        DISCONNECT WALLET
                                    </Button>
                                </div>
                            </Container>
                        }

                    </Container>

                    <GitHubInfo className="py-3" />

                    {window.metamaskOnline() && <MetamaskUtils className="py-3" />}

                    {this.contract &&
                        <Container className="text-center py-3">
                            <a
                                href={`https://etherscan.io/address/${this.contract.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Badge className="p-2 text-light bg-secondary"><strong>CONTRACT ADDRESS</strong>
                                    <br className="d-md-none" />
                                    <span className="text-info">&nbsp;{this.contract.address}</span>
                                </Badge>
                            </a>
                        </Container>
                    }

                </Container>
                <Container id="hexmob_footer" fluid>
                    {this.state.walletConnected && <this.WalletStatus />}
                </Container>
            </>
        )
    }
}

export default App

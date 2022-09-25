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
import * as AppT from  "./lib/App"
import BrandLogo from "./BrandLogo"
import { WhatIsThis, MetamaskUtils } from "./Widgets"
import CHAINS, { type TChain } from "./chains"
import HEX, { type HEXContract, type HEXGlobals } from "./hex_contract"
import UNIV2 from "./univ2_contract" /* HEX/USDC pair */
import { ethers, BigNumber } from "ethers";
import Web3Modal, { getProviderInfo } from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider"
//import Portis from "@portis/web3";
import { decodeClaimStats, detectTrustWallet, bnPrefixObject } from "./util"
import "./App.scss"
import ReactGA from "react-ga"
import { format } from "d3-format"
import _axios from "axios"
import _debug from "debug"

const axios = _axios.create({
    baseURL: "/",
    timeout: 3000,
    headers: { "Content-Type": "application/json", "Accept": "applicaiton/json"},
})

const uriQuery = new URLSearchParams(window.location.search)
const debug = _debug("App")

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
    univ2Contract?: any
    walletProvider?: any
    web3provider?: any
    usdProgress: Element | null = null
    USDHEX?: Element

    state: AppT.State = { ...INITIAL_STATE }

    constructor(props: AppT.Props) {
        super(props)
        window.metamaskOnline = () => this.state.walletConnected && window.ethereum && window.ethereum.isMetaMask
    }

    subscribeProvider = async (provider: any) => {
        if (!provider.on) {
            debug("WARNING: web3signer.on != f()")
            return
        }

        if (provider.isMetaMask) {
            const ethereum = window.ethereum
            if (ethereum.autoRefreshOnNetworkChange)
                ethereum.autoRefreshOnNetworkChange = false // will be default behavour in new MM api

            ethereum.on("disconnect", () => { debug("RPC disconnected => reset"); this.resetApp() })
            ethereum.on("chainChanged", () => { debug("wallet chainChanged => reset"); this.resetApp() })
            ethereum.on("accountsChanged", (accounts: string[]) => {
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
        } catch(e) { }
    }

    subscribeEvents = () => {
        if (this.state.wallet.address === "") return
        this.contract?.on(this.contract.filters.Transfer(this.state.wallet.address), this.updateHEXBalance)
        this.contract?.on(this.contract.filters.Transfer(null, this.state.wallet.address), this.updateHEXBalance)

        // use Uniswap v2 as USDHEX oracle
        this.univ2Contract.on("Swap", (amount0In: string, amount1In: string, amount0Out: string, amount1Out: string) => {
            try {
                const USDHEX = parseInt(amount1In) !== 0
                    ? Number(parseInt(amount1In) / parseInt(amount0Out) * 100)
                    : Number(parseInt(amount1Out) / parseInt(amount0In) * 100)
                this.setState({ USDHEX })
            } catch(e) {
                debug(`UNIV2:USDHEX Exception %o: amount1In:${amount1In} amount0Out: ${amount0Out}`, e)
            }
        })
    }

    unsubscribeEvents = () => {
        try {
            this.univ2Contract?.removeAllListeners()
            this.contract?.removeAllListeners()
        } catch(e) {}
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

    async selectWeb3ModalWallet(): Promise<Web3Modal> {
        debug("inside selectWeb3ModalWallet()")
        if (this.web3modal) {
            return await this.web3modal.connect() // note: web3modal subscribes to MetaMask deprecated "close" event
        }
        else return Promise.reject("selectWeb3ModalWallet: App.web3modal undefined")
    }

    /* returns address or null */
    async establishWeb3Provider(): Promise<string | null> {
        if (window.ethereum && !window.ethereum.chainId) window.ethereum.chainId = "0x1"

        // Check for non-web3modal injected providers (mobile dApp browsers)
        if (detectTrustWallet()) {                                                  // TrustWallet internal browser (now defunct?)
            debug("Detected TrustWallet")
            const chainId: number = window.web3.currentProvider.chainId
            const network = {
                chainId,
                rpcUrl: CHAINS[chainId].rpcURL
            }
            this.walletProvider = new window.Trust(network)
            this.setState({ currentProvider: "TrustWallet" })
        } else if (window.ethereum?.isImToken === true ) {        // imToken
            debug("Detected imToken wallet")
            this.walletProvider = window.ethereum
            this.setState({ currentProvider: "imToken" })
        } else if (window.ethereum?.isToshi === true && window.ethereum?.isCipher ) { // Coinbase (mobile)
            debug("Detected Coinbase wallet")
            this.walletProvider = window.ethereum
            this.walletProvider.isCoinBase = true
            this.setState({ currentProvider: "CoinBase" })
        } else { // web3modal it is ...
            this.setState({ currentProvider: "web3modal" })
            debug("this.web3modal.cachedProvider: ", this.web3modal?.cachedProvider)
            if (this.web3modal && this.web3modal.cachedProvider !== "" || this.triggerWeb3Modal) {
                this.triggerWeb3Modal = false
                this.walletProvider = await this.selectWeb3ModalWallet().catch(e => Error("selectWeb3ModalWallet() failed: ", e))
                const currentProvider = this.walletProvider ? getProviderInfo(this.walletProvider).name : "---"
                this.setState({ currentProvider })
            }
        }

        // @dev this.walletProvider is our transaction signing provider, such as MetaMask
        if (!this.walletProvider || !this.walletProvider.chainId) return Promise.reject("web3modal: no wallet chossen")

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
                +"If running on iOS v15+, please use Safari and disable "
                +"Apple's buggy [NSURLSession Websocket] 'feature' found at ..."
                +"\nSettings -> Safari -> Advanced -> Experimental Features -> NSURLSession Websocket"
                +"\n\nDoing so will not adversely affect other activities.")
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
            if (window.ethereum.request) { // new way
                debug("accounts[] new method")
                const response = await window.ethereum.request({method: "eth_accounts"})
                accounts = response
            }
            debug("accounts[]: ", accounts)
            address = accounts[0]
        } else if (this.walletProvider.isCoinBase) {        // CoinBase
            debug("Provider is Coinbase")
            await this.walletProvider.enable()
            const accounts = await this.walletProvider.eth.getAccounts()
            address=accounts[0]
        } else if (detectTrustWallet()) {                   // TrustWallet internal browser (since removed "cause Apple sux)
            debug("Provider is TrustWallet (internal browser)")
            this.walletProvider.enable()
            address = this.web3provider.eth.givenProvider.address || "0x7357000000000000000000000000000000000000"
            this.walletProvider.setAddress(address)
        } else if (this.walletProvider.isWalletConnect) {    // Wallet Connect
            debug("web3modal provider is WalletConnect (QR code)")
            address = this.walletProvider.accounts[0]
        } else if (window.web3signer.currentProvider.isPortis) {
            await this.walletProvider.enable()
            const accounts = await this.walletProvider.eth.getAccounts()
            address = accounts[0]
        } else if (window.web3signer.currentProvider.isImToken) { // imToken
            debug("imToken Wallet detected")
            const accounts = await window.ethereum.send("eth_requestAccounts") // EIP1102
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
            default: {}
        }
        //debug("ENV: ", import.meta.env)
        this.web3modal = new Web3Modal({
            cacheProvider: true,                                    // optional
            providerOptions: {                                      // required
               walletconnect: {
                   package: WalletConnectProvider,                  // required
                   options: {
                       infuraId: import.meta.env.VITE_INFURA_ID     // required
                   }
               },
            }
        })
        const referrer = (uriQuery.get("r") || "").toLowerCase()
        if (uriQuery.has("reset")) { return this.resetApp() }
        if (uriQuery.has("account")) {
            const uriAccounts = uriQuery.getAll("account")
            const accounts = uriAccounts.map(account => { const s = account.split(":"); return { address: s[0], name: s[1] || "" }})
            this.setState({ accounts })
        }

        if (localStorage.getItem("debug")) {
            window._APP = this
            window._E = ethers
            window._w3M = this.web3modal
            window._HEX = HEX
            window._UNIV2 = UNIV2
            window.debug = debug
        }

        const address = (await this.establishWeb3Provider()
        .catch(e => { debug(e) })) as (string | null)
        if (!address) return

        if (this.state.chainId === 1) {
            this.subscribeUpdateUsdHex()
            window.contract = new ethers.Contract(HEX.CHAINS[this.state.chainId], HEX.ABI, window.web3signer.getSigner())   // wallet provider
            this.contract = new ethers.Contract(HEX.CHAINS[this.state.chainId], HEX.ABI, this.web3provider) as HEXContract  // INFURA
            this.univ2Contract = new ethers.Contract(UNIV2.CHAINS[this.state.chainId], UNIV2.ABI, this.web3provider)        // INFURA
        } else {
            // drop INFURA for networks not supported
            window.contract = new ethers.Contract(HEX.CHAINS[this.state.chainId], HEX.ABI, this.web3provider.getSigner()) // wallet provider
            this.contract = window.contract;
            this.univ2Contract = new ethers.Contract(UNIV2.CHAINS[this.state.chainId], UNIV2.ABI, window.web3signer)
        }
        if (!this.contract) return debug("ethers.Contract instantiation failed. Caanot continue.")

        this.subscribeProvider(this.walletProvider)

        const [ bnBalance, bnAllocatedSupply, bnCurrentDay, _globals ] = await (
            Promise.all([
                this.contract.balanceOf(address).catch((e: Error) => debug("balanceOf: addr=["+address+"] ", e)),
                this.contract.allocatedSupply().catch((e: Error) => debug("allocatedSupply:", e)),
                this.contract.currentDay().catch((e: Error) => debug("currentDay:", e)),
                this.contract.globals().catch((e: Error) => debug("globals:", e))
            ])
            .catch(e => debug("App::componentDidMount:Promise.all(...): ", e))
        ) as [ BigNumber, BigNumber, BigNumber, HEXGlobals ]

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
        })
        ReactGA.pageview(window.location.pathname + window.location.search); // will trigger only once per page (re)load

        // update UI and contract currentDay every 10 minutes
        this.dayInterval = setInterval(async () => {
            if (!this.state.contractReady || !this.contract) return
            const _bnCurrentDay = await this.contract.currentDay()
            const currentDay = _bnCurrentDay.toNumber()
            this.contract.Data!.currentDay = currentDay
            this.setState({ currentDay })
        }, 10 * 60 * 1000/*ms*/);

        this.subscribeEvents()
        this.updateETHBalance()
    }

    componentWillUnmount = () => {
        try {
            clearInterval(this.dayInterval)
            clearInterval(this.usdHexInterval)
            this.unsubscribeEvents()
        } catch(e) { }
    }

    resetApp = async () => {
        this.web3modal && this.web3modal.clearCachedProvider()
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
            this.web3modal && this.web3modal.clearCachedProvider()
            if (provider.disconnect) await provider.disconnect()
            else if (provider.close) await provider.close()
        } catch {
        }
        this.resetApp()
    }

    WalletStatus = () => {
        const { address } = this.state.wallet
        const addressFragment = address && address !== ""
            ? address.slice(0,6)+"..."+address.slice(-4) : "unknown"
        return (
            <Container id="wallet_status" fluid>
            <Row>
                <Col><Badge bg={this.state.chainId === 1 ? "success" : "danger"} className="small">{this.state.network.name}</Badge></Col>
                <Col className="text-muted text-center small">{this.state.currentProvider}</Col>
                <Col className="text-end">
                    <WhatIsThis tooltip={address}><>
                        <Badge bg="secondary" className="text-info">
                        <CopyToClipboard text={address}><>
                            { addressFragment }
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
                        <h3>{import.meta.env.VITE_VERSION || "v0.0.0A"}</h3>
                        <div>
                            <span className="text-muted small align-baseline me-1">DAY</span>
                            <span className="numeric text-info align-baseline fs-5 fw-bold">{ this.state.currentDay ? this.state.currentDay : "---" }</span>
                        </div>
                    </div>
                    <div id="usdhex">
                        <span className="text-muted small me-1">USD</span>
                        <span className="numeric text-success h2">{ "$" + (isNaN(this.state.USDHEX) ? "-.--" : format(",.4f")(this.state.USDHEX))}</span>
                        <ProgressBar variant="secondary" now={50} animated={false} ref={r => this.usdProgress = r }/>
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
                        { HEX.lobbyIsActive() &&
                            <Container className="p-1 my-3 text-center">
                                <Card.Body as={Button} variant="success" className="w-100"
                                >
                                    <div><img src="/extra-bonus-10.png" alt="extra bonus 10%" /></div>
                                    <div>
                                        Receive an extra <b>10%&nbsp;FREE&nbsp;BONUS&nbsp;HEX</b> just for <b>using&nbsp;this&nbsp;App </b>
                                        to TRANSFORM&nbsp;ETH in the <b>AA&nbsp;Lobby</b>&nbsp;(above)<br/>
                                        <small>standard 10% bonus from Dev"s referral addr</small>
                                    </div>
                                    { this.state.referrer !== "" && <div className="small"><em>fwd: {this.state.referrer}</em></div> }
                                </Card.Body>
                            </Container>
                        }
                        { this.state.chainId === 1 && !detectTrustWallet() && /* TrustWallet won"t follow external links */
                        <>
                            {document.location.hostname.search(/tshare\.app/) < 0 &&
                                <Container className="py-2 my-3">
                                <Card.Body as={Button} variant="info" className="w-100 rounded text-light bg-info-faded border-0"
                                    href="https://changelly.com/?ref_id=1b7z255j4rfbxsyd#buy" target="_blank" rel="noopener noreferrer"
                                >
                                    <div>
                                        <img className="d-inline-block" src="/buy-eth.png" alt="buy ethereum here" style={{ verticalAlign: "middle" }} />
                                        <div className="d-inline-block text-enter" style={{ verticalAlign: "middle", marginLeft: "28px" }}>
                                            <h1>Buy ETH</h1>
                                            (Debit Card)
                                        </div>
                                    </div>
                                </Card.Body>
                            </Container>}
                            <Container className="py-3 my-3">
                                <Card.Body as={Button} className="w-100 rounded text-light bg-dark border-0"
                                    href="https://ethhex.com" target="_blank" rel="noopener noreferrer"
                                >
                                    <img
                                        className="d-inline-block"
                                        src="/swap-eth-hex-96.png" alt="swap HEX for USDC or DAI"
                                        style={{ verticalAlign: "middle", height: "96px" }}
                                    />
                                    <div className="text-end d-inline-block" style={{ verticalAlign: "middle" }}>
                                        <h1>Swap ETH for HEX</h1>
                                    </div>
                                </Card.Body>
                            </Container>
                        </>
                        }
                        { this.state.walletConnected &&
                            <Container>
                                <div className="text-center m-3">
                                    <Button variant="outline-danger" onClick={ this.disconnectWallet } >
                                        DISCONNECT WALLET
                                    </Button>
                                </div>
                            </Container>
                        }

                    </Container>

                    <GitHubInfo className="py-3" />

                    { window.metamaskOnline() && <MetamaskUtils className="py-3" /> }

                    {this.contract &&
                        <Container className="text-center py-3">
                            <a
                                href={`https://etherscan.io/address/${this.contract.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Badge className="p-2 text-light bg-secondary"><strong>CONTRACT ADDRESS</strong>
                                <br className="d-md-none"/>
                                    <span className="text-info">&nbsp;{this.contract.address}</span>
                                </Badge>
                            </a>
                        </Container>
                    }

                </Container>
                <Container id="hexmob_footer" fluid>
                    { this.state.walletConnected && <this.WalletStatus /> }
                </Container>
            </>
        )
    }
}

export default App

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
// import UNIV2 from "./univ2_contract" /* used for HEX/USDC price */
import { ethers, BigNumber } from "ethers"
// import SignClient from "@walletconnect/sign-client"
// import { Web3Modal } from "@web3modal/standalone"
// import { UniversalProvider } from "@walletconnect/universal-provider"
import { EthereumProvider } from "@walletconnect/ethereum-provider"

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
    unlockMessage: "",
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
    injectedEthereum: any = undefined
    web3signer?: any | null = null  // wallet signer provider (window.web3provider used for Infura et al)
    univ2contract?: any = null      // used or not depending on USD proce collection method in use
    currentProvider?: string = "---"
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
                debug("EVENT: accountsChanged %O", accounts)
                this.resetApp()
            })
        }

        provider.on("chainChanged", async (chainId?: number) => {
            this.resetApp()
        })

        provider.on("network", (_?: any, oldNetwork?: string) => { if (oldNetwork) this.resetApp() });

        provider.on("update", this.updateETHBalance)
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

        // When local clock UTC day advances, update UI immediately (in 'red') then get
        // actual contract currentDay every 5 seconds until it matches ('green')
        this.dayInterval = setInterval(async () => {
            const _currentUTCday = new Date().getUTCDay()
            if (_currentUTCday != this.currentUTCday) { // has day advanced?
                this.currentUTCday = _currentUTCday
                if (this.state.currentDay !== 0) this.setState({ currentDay: this.state.currentDay + 1 })
                const intervalTimer = setInterval(async () => {
                    try {
                        this.currentUTCday = _currentUTCday
                        const currentDay = (await this.contract!.currentDay()).toNumber()
                        if (currentDay === this.state.currentDay) {
                            clearInterval(intervalTimer)
                            this.contract!.Data!.currentDay = currentDay
                            this.setState({ currentDay })
                        }
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
            this.univ2contract && this.univ2contract.removeAllListeners()
            this.contract && this.contract.removeAllListeners()
            this.web3signer.removeAllListeners && this.web3signer.removeAllListeners()
        } catch (e) { }
    }

    updateETHBalance = () => {
        const wallet = this.state.wallet
        const { address } = wallet
        if (address.slice(0, 2) !== "0x") return
        window.web3provider.getBalance(address)
            .then((bnBalanceETH: BigNumber) => this.setState({ wallet: { ...wallet, bnBalanceETH } }))
            .catch((e: Error) => debug("updateETHBalance(): ", e))
    }

    updateHEXBalance = () => {
        this.contract?.balanceOf(this.state.wallet.address)
            .then((bnBalance: BigNumber) => this.setState({ wallet: { ...this.state.wallet, bnBalance } }))
            .catch((e: Error) => debug("updateHEXBalance(): ", e))
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

            debug("subscribeUpdateUsdHex(): OK")
    }

    handleConnectWalletButton = async (ethereum: any) => {

        /**
         * NOTE: MetaMask (also Gnosis Safe on Mobile) have not upgraded to use WalletConnect v2, yet
         * MetaMask has broken their stuff regards web3modal, somewhat, leaving us stuck
         * between a rock and a hard place. Below is the temporary workaround that seem to work.
         */

        const walletConnectSessionExists =
            typeof window !== "undefined"
            && typeof window.walletConnect !== 'undefined'
            && typeof window.walletConnect.session !== 'undefined'
            && typeof window.walletConnect.session.topic === 'object'

        let currentProvider = "---"
        let chainId = 0

        // check for and prioritize an existing WalletConnect session
        if (walletConnectSessionExists) {
            debug("Detected existing WalletConnect Session")
            currentProvider = "WalletConnect"
            this.web3signer = window.walletConnect
            chainId = parseInt(this.web3signer.chainId)

        } else {
            /**
             * @dev If both MetaMask and TrustWallet broswer extensions are installed, then both
             * ethereum.isMetaMask and ethereum.isTrust resolve to true. However, if TrustWallet's
             * "Set As Default Wallet" setting is "on" then TrustWallet's .enable() etc have overriden MetaMask's.
             * If TrustWallet's "Set As Default Wallet" setting is "off", then ethereum.isTrust etc are removed
             * from window.ethereum and MetaMask's .enable() etc become the (only) active functions. Accordingly,
             * we consider the presence of ethereum.isTrust to take priority over etherum.isMetaMask whether or
             * not they are both present.
             */

            /**
             * @dev In theory, there can be multiple registered providers. In practice as of 2023-03-22,
             * neither MetaMaksk or TrustWallet actually instantiate an ethereum.providers object
             * Please refer to https://eips.ethereum.org/EIPS/eip-1193 for additonal/difrerent "theory" ;-)
             *
             *    const injectedProviders: any = typeof ethereum.providers ?? null
             *    const isTrustWalletPresent = injectedProviders && injectedProviders.find((e: any) => !!e.isTrust) ?? false
             *    const isMetaMaskPresent = injectedProviders && injectedProviders.find((e: any) => !!e.isMetaMask) ?? false
             */

            /// @dev we try here to adhere to EIP-1193

            // TrustWallet internal browser overrides MetaMask. See above.
            if (
                typeof ethereum === "object" && !!ethereum.isTrust
                && typeof ethereum.address === 'string' // .address is only present if TrustWallet "Set As Deafault Wallet" setting is "on"
            ) {
                debug("Detected TrustWallet (injected)")
                currentProvider = "TrustWallet"
                this.web3signer = ethereum
                chainId = parseInt(this.web3signer.eth_chainId())

            } else if ( // MetaMask (desktop or app's internal browser)
                typeof ethereum === "object" && !!window.ethereum.isMetaMask
                && window.ethereum._state && !!window.ethereum._state.isUnlocked
            ) {
                debug("Detected Metamask (injected)")
                currentProvider = "MetaMask"
                this.web3signer = ethereum
                chainId = parseInt(this.web3signer.chainId)

            } else if ( // MetaMask (desktop or app's internal browser)
                typeof ethereum === "object" && window.ethereum.isLedgerConnect
            ) {
                debug("Detected LedgerLive (injected)")
                currentProvider = "LedgerConnect"
                this.web3signer = ethereum
                chainId = parseInt(this.web3signer.chainId)
            } else { // No existing WalletConnect session or any injected providers found, so use WalletConnect(web3modal)
                debug("Using WalletConnect (No existing WalletConnect session or any injected providers were found.)")
                currentProvider = "WalletConnect"
                this.web3signer = window.walletConnect
                chainId = parseInt(this.web3signer.chainId)
                await this.web3signer.connect()
            }
        }

        const accounts = await this.web3signer
        .request({ method: 'eth_requestAccounts' })
        .catch((error: any) => {
            if (error.code === 4001) {
                debug('Please connect Browser Wallet')
                this.setState({ unlockMessage: ethereum.isTrust ? "Please connect TrustWallet" : "Please connect MetaMask" })
            } else if (error.code === -32002) {
                debug('Please unlock Browser Wallet')
                this.setState({ unlockMessage: "Please unlock Browser Wallet" })
            } else {
                debug(error)
            }
        })
        debug("ACCOUNTS: %O", accounts)

        const network = CHAINS[chainId]
        const address = accounts[0] ?? ""

        if (address === "") {
            return debug("NOT CONNECTED (no wallet address) — STOP")
        }

        const ethersProvider = new ethers.providers.Web3Provider(this.web3signer, "any")
        window.ethersSigner = ethersProvider.getSigner()

        debug("PROVIDER ESTABLISHED: %s — %o", this.currentProvider, this.web3signer)

        if (chainId === 1) {
            window.web3provider = new ethers.providers.InfuraProvider(
                chainId,
                import.meta.env.INFURA_API_KEY
            )
            window.contract = new ethers.Contract(HEX.CHAINS[chainId], HEX.ABI, window.ethersSigner) // wallet provider
            this.contract = new ethers.Contract(HEX.CHAINS[chainId], HEX.ABI, window.web3provider) as HEXContract  // INFURA
            // this.univ2contract = new ethers.Contract(UNIV2.CHAINS[chainId], UNIV2.ABI, window.web3provider)        // INFURA
        } else {
            // drop INFURA for networks not supported
            window.contract = new ethers.Contract(HEX.CHAINS[chainId], HEX.ABI, window.ethersSigner) // wallet provider
            this.contract = window.contract;
            // this.univ2contract = new ethers.Contract(UNIV2.CHAINS[chainId], UNIV2.ABI, window.web3provider)
        }
        if (!this.contract) return debug("ethers.Contract(HEX) instantiation failed.")

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

        ReactGA.pageview(window.location.pathname + window.location.search); // will trigger only once per page (re)load

        this.subscribeProvider(this.web3signer)
        this.subscribeEvents()
        if (chainId === 1) this.subscribeUpdateUsdHex()
        this.updateETHBalance()

        this.setState({
            currentProvider,
            chainId,
            network,
            wallet: {
                address,
                bnBalance
            },
            walletConnected: true,
            contractReady: true,
            currentDay
        })
    }

    async componentDidMount() {

        switch (window.location.hostname) {
            case "go.tshare.app":
                ReactGA.initialize("UA-203521048-1")
                break
            case "hexmob.win":
                ReactGA.initialize("UA-203562559-1")
                break
            case "127.0.0.1":
            case "dev.hexmob.win":
                ReactGA.initialize("UA-203524460-1")
                break
            default: { }
        }

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
            window._HEX = HEX
            // window._UNIV2 = UNIV2
            window.debug = debug
        }

        debug("Initializing WalletConnect")
        window.walletConnect = await EthereumProvider.init({
            projectId: import.meta.env.VITE_WALLET_CONNECT_ID,
            methods: [
                "eth_requestAccounts",
                "eth_signTransaction",
                "eth_sendTransaction",
                "personal_sign",
                "eth_sign",
                "eth_signTypedData",
            ],
            chains: [1],
            events: [
                "chainChanged",
                "accountsChanged",
                "disconnect"
            ],
            showQrModal: false,
        })
        .catch(e => { // allow fail and continue silently
            debug("Error initializing WalletConnect: ", e)
        })

        this.setState({ referrer })

        const ethereum = (
            typeof window !== "undefined"
            && typeof window.ethereum !== "undefined"
        )
        ? window.ethereum
        : undefined // important! don't use null
        this.injectedEthereum = ethereum

        // These hacks are to determine if TrustWallet or MetaMask are present but locked
        let unlockMessage = <></>
        if (ethereum) {
            if (!!ethereum.isTrust) {
                unlockMessage = <>
                    { !!ethereum.isMetaMask && <div className="text-danger">MetaMask detected but Trust Wallet is default</div>}
                    <p className="text-info">
                        Using Trust Wallet
                    </p>
                </>
            } else if (!!ethereum.isMetaMask && ethereum._state) {

                if (ethereum._state.isUnlocked) {
                    unlockMessage =
                    <div className="text-danger">
                        Using Metamask
                    </div>
                 } else {
                    unlockMessage = <>
                        <div className="text-danger">
                            <div>MetaMask detected but locked</div>
                            { typeof window.trustwallet === 'object' && <div>Trust Wallet detected but not default wattet</div> }
                        </div>
                        <p className="text-info">Using Wallet Connect V2</p>
                    </>
                }
            } else if (ethereum.isLedgerConnect) {
                unlockMessage =
                <div className="text-danger">
                    Using LedgerConnect
                </div>
            }

        } else {
            unlockMessage =
            <p className="text-info">
                Wallet Connect V2
            </p>
        }
        this.setState({ unlockMessage })


        if ( // anything is already connected
            typeof window.ethereum === "object" && (
                typeof ethereum._state !== 'undefined' && ethereum._state.accounts.length
                || typeof ethereum.address === 'string' && ethereum.address !== ""
                || typeof window.walletConnect !== 'undefined' && typeof window.walletConnect.session === 'object'
            )
        ) this.handleConnectWalletButton(this.injectedEthereum)

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

    disconnectWallet = async () => {
        this.unsubscribeEvents()
        /**
         * NOTE: Metamask no longer permits a dApp to request (dis)connections
         * for security. WalletConnect still has a disconnect() function.
         * We are currently agnostic and use the function if it's available.
         */
        if (this.web3signer.disconnect) await this.web3signer.disconnect();
        this.resetApp() // Will auto-reconnect if metmask is not locked *sigh*
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
                    <h3>{this.state.unlockMessage}</h3>
                    <Button id="connect_wallet" variant="info" onClick={() => this.handleConnectWalletButton(this.injectedEthereum)} >
                        CONNECT WALLET
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
                            <span className="numeric align-baseline fs-5 fw-bold"><span
                                className={this.state.contractReady && this.contract!.Data!.currentDay === this.state.currentDay ? "text-info" : "text-warning"}
                            >{this.state.currentDay ? this.state.currentDay : "---"}</span>
                            </span>
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

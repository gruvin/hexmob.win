import { useState, useEffect, useContext } from 'react'
import { Web3Button } from '@web3modal/react'
import {
  useNetwork,
  useAccount,
  useDisconnect,
  useContractReads,
  useQuery,
} from 'wagmi'
import { Address } from 'viem'
import { getMainnetUsdHex, getPulseXDaiHex } from './util'
import { HexContext } from './Context'
import { UriAccount } from './lib/App'

import CHAINS from './chains'
import HEX, { HexData } from './hex_contract'
import { GitHubInfo } from "./Widgets"

import BrandLogo from "./BrandLogo"
import Blurb from './Blurb'
import Stakes from './Stakes'
import Tewkenaire from './Tewkenaire'

import CopyToClipboard from 'react-copy-to-clipboard'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons'
import { WhatIsThis, WalletUtils } from "./Widgets"
import ProgressBar from "react-bootstrap/ProgressBar"
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Badge from 'react-bootstrap/Badge'

import './App.scss'
import { format } from 'd3-format'
import _debug from 'debug'
const debug = _debug('app')
const uriQuery = new URLSearchParams(window.location.search)

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

const Header = (props: { usdhex: number }) => {
  const hexData = useContext(HexContext)
  const currentDay = hexData?.currentDay || 0n
  return (<>
    <BrandLogo />
    <div id="version-day">
      <h3>{import.meta.env.VITE_VERSION || "v0.0.0A"} <strong className="text-warning">WP</strong></h3>
      <div>
        <span className="text-muted small align-baseline me-1">DAY</span>
        <span className="numeric align-baseline fs-5 fw-bold">{currentDay ? Number(currentDay + 1n).toString() : "---"}</span>
      </div>
    </div>
    <div id="usdhex">
      <span className="text-muted small me-1">USD</span>
      <span className="numeric text-success h2">{"$" + (isNaN(props.usdhex) ? "-.--" : format(",.4f")(props.usdhex))}</span>
        {/* <ProgressBar variant="secondary" now={50} animated={false} ref={r => this.usdProgress = r} /> */}
    </div>
  </>)
}

const Body = (props: { accounts: UriAccount[], usdhex: number }) => {
  const hexData = useContext(HexContext)

  return (
    <Container>
    {!hexData
      ? <ProgressBar variant="secondary" animated now={60} label="initializing" />
      : <>
        <Stakes openActive={uriQuery.has('closed') ? false : true} usdhex={props.usdhex} />
        {props.accounts.map(account => <Stakes key={account.address} account={account} usdhex={props.usdhex} />)}
        {uriQuery.has("tewkens") && <Tewkenaire usdhex={props.usdhex} /> }
        {/* <Lobby parent={this} contract={this.contract} wallet={this.state.wallet} /> */}
        {/* <Stats parent={this} contract={this.contract} wallet={this.state.wallet} usdhex={this.state.USDHEX} /> */}
      </>
    }
    </Container>
  )
}

const Footer = () => {
  const hexData = useContext(HexContext)
  const { chain } = useNetwork()
  const chainId = chain?.id || 0n
  const networkName = chain?.name || "unknown"

  const address = hexData?.walletAddress || ""
  const addressFragment = address
    ? address.slice(0, 6) + "..." + address.slice(-4)
    : "unknown"
  return (
    <Container id="wallet_status" fluid>
      <Row>
        <Col><Badge bg={chainId !== 1 ? "danger" : "success"} className="small">{networkName}</Badge></Col>
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

function App() {

  /// URI Stuff
  // look for ?account=addr[:label][&...]'s from URI
  let accounts: UriAccount[] = []
  if (uriQuery.has("account")) {
    const uriAccounts = uriQuery.getAll("account")
    accounts = uriAccounts.map(account => {
      const s = account.split(":");
      return { address: s[0] as Address, name: s[1] as string || "" }
    })
  }

  // "state" variables
  const [hexData, setHexData] = useState(undefined as HexData | undefined)
  const [walletAddress, setWalletAddress] = useState(undefined as Address | undefined)
  const [USDHEX, setUSDHEX ] = useState(0.0)

  // const referrer = (uriQuery?.get("r") || "").toLowerCase() // will never be used again (?)
  ///

  const { chain } = useNetwork()
  const chainId = chain ? chain.id : 0
  const networkName = chain ? chain.name : "not connected"

  const hexAddress = HEX.CHAIN_ADDRESSES[chainId]
  const hexContract = { address: hexAddress, abi: HEX.ABI }


  const { address } = useAccount()
  useEffect(() => {
    setWalletAddress(address)
  }, [address])

  useQuery(
    [networkName, 'DaiHex'],
    getPulseXDaiHex, {
      enabled: chainId === 369,
      refetchInterval: 10000,
      retry: 5,
      retryDelay: 5000,
      onSuccess: data => setUSDHEX(data)
    }
  )

  useQuery(
    [networkName, 'UsdHex'],
    getMainnetUsdHex, {
      enabled: chainId == 1,
      refetchInterval: 10000,
      retry: 5,
      retryDelay: 5000,
      onSuccess: data => setUSDHEX(data)
    }
  )

  // start the show when walletAddress appears
  useContractReads({
    enabled: !!walletAddress,
    scopeKey: `HexData:${chainId}`,
    watch: true,
    contracts: [
      { ...hexContract, functionName: 'currentDay', },
      { ...hexContract, functionName: 'balanceOf', args: [walletAddress || "0x0"] },
      { ...hexContract, functionName: 'stakeCount', args: [walletAddress || "0x0"] },
      { ...hexContract, functionName: 'allocatedSupply', },
      { ...hexContract, functionName: 'totalSupply', },
      { ...hexContract, functionName: 'globals', },
    ],
    onError: (e) => debug("MULTICALL ERROR: This error seems to only occur on PulseChain Testnet v4", e),
    onSuccess: data => {
      // debug("HexData: %O", data)
      const _globals = data?.[5].result as readonly [bigint, bigint, number, bigint, number, bigint, number, bigint]
      const _stats = _globals[7] || 0n
      const hexData = {
        chainId,
        contract: {
          address: hexAddress,
          abi: HEX.ABI
        },
        currentDay: data?.[0].result,
        walletAddress,
        hexBalance: data?.[1].result,
        stakeCount: data?.[2].result,
        allocatedSupply: data?.[3].result,
        totalSupply: data?.[4].result,
        globals: {
          lockedHeartsTotal: _globals[0],
          nextStakeSharesTotal: _globals[1],
          shareRate: BigInt(_globals[2]),
          stakePenaltyTotal: _globals[3],
          dailyDataCount: BigInt(_globals[4]),
          stakeSharesTotal: _globals[5],
          latestStakeId: BigInt(_globals[6]),
          claimStats: { // ref: https://etherscan.io/token/0x2b591e99afe9f32eaa6214f7b7629768c40eeb39#code Line 1152
            claimedBtcAddrCount: _stats >> (HEX.SATOSHI_UINT_SIZE * 2n),
            claimedSatoshisTotal: _stats >> HEX.SATOSHI_UINT_SIZE & HEX.SATOSHI_UINT_MASK,
            unclaimedSatoshisTotal: _stats & HEX.SATOSHI_UINT_MASK
          },
        }
      } as HexData
      setHexData(hexData)
    }
  })

  const { disconnect } = useDisconnect()

  const resetApp = () => {
    window.location.reload()
  }

  const handleDisconnect = () => {
    disconnect()
    resetApp()
  }

  return (
    <Container className="m-0 p-0" fluid>
        <HexContext.Provider value={hexData}>
        <Container id="hexmob_header" fluid>
          <Header usdhex={USDHEX} />
        </Container>
        <Container id="hexmob_body" fluid>
            {walletAddress !== undefined
              ? <Body accounts={accounts} usdhex={USDHEX} />
              : <Container fluid className="mt-3 text-center mb-3">
                  <Web3Button icon="hide" />
                  <Blurb />
                </Container>
            }
            {walletAddress !== undefined && <>
              <Container className="text-center py-3">
                <a
                  href={`${CHAINS[chainId].explorerURL.replace(/\/$/, "") + "/address/" + HEX.CHAIN_ADDRESSES[chainId]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  >
                  <Badge className="p-2 text-light bg-secondary"><strong>CONTRACT ADDRESS</strong>
                    <br className="d-md-none" />
                    <span className="text-info">&nbsp;{HEX.CHAIN_ADDRESSES[chainId]}</span>
                  </Badge>
                </a>
              </Container>
              <Container className="text-center">
                <Button onClick={handleDisconnect}>Disconnect</Button>
              </Container>
            </>}
          <GitHubInfo className="py-3" />
          <WalletUtils className="py-3" />
        </Container>

        <Container id="hexmob_footer" fluid>
          <Footer />
        </Container>

      {/*
      <Container id="hexmob_body" fluid className="p-1">
      <div>Total Supply: {formatHex(totalSupply)} </div>
        <div>Allocated Supply: {formatHex(allocatedSupply)} </div>
        <div>ADDR: {walletAddress} </div>
        <div>Coin Balance: {formatEther(balanceData?.value || 0n)} {balanceData?.symbol || "---"}</div>
        <div>HEX BAL: {formatUnits(hexBalance || BigInt(0), 8)}</div>
        <div>STAKE COUNT: {stakeCount?.toString()}</div>
        <div>STAKE LIST: <Stakes /></div>
        </Container>
        <Stats parent={this} contract={this.contract} wallet={this.state.wallet} usdhex={this.state.USDHEX} />

        <Web3NetworkSwitch /> <Web3Button icon="hide"/>
      */}

      </HexContext.Provider>
    </Container>
  )

}

export default App

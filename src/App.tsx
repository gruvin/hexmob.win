import React, { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Web3Button } from "@web3modal/react";
import {
  useNetwork,
  useAccount,
  useDisconnect,
  useContractRead,
  useContractReads,
  useQuery,
} from "wagmi";

import { Address } from "viem";
import { getPulseXDaiHex } from "./util";
import { HexContext } from "./Context";
import { UriAccount } from "./lib/App";

import CHAINS from "./chains";
import HEX, { HexData } from "./hex_contract";
import { GitHubInfo } from "./Widgets";

import BrandLogo from "./BrandLogo";
import Blurb from "./Blurb";
import Stakes from "./Stakes";
import Tewkenaire from "./Tewkenaire";

import CopyToClipboard from "react-copy-to-clipboard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { WalletUtils } from "./Widgets";
import ProgressBar from "react-bootstrap/ProgressBar";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Form from "react-bootstrap/Form";

import "./App.scss";
import { format } from "d3-format";
import _debug from "debug";
const debug = _debug("app");

const uriQuery = new URLSearchParams(window.location.search);

switch (window.location.hostname) {
  case "hexmob.win":
  case "dev.hexmob.win":
    window.hostIsTSA = false;
    window.hostIsHM = true;
    break;

  case "127.0.0.1":
  case "go.tshare.app":
  default:
    window.hostIsTSA = true;
    window.hostIsHM = false;
}

const Header = (props: { usdhex: number }) => {
  const hexData = useContext(HexContext);
  const currentDay = hexData?.currentDay || 0n;
  const { i18n } = useTranslation();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const languageValue = e.target.value;
    i18n.changeLanguage(languageValue);
  };

  return (
    <>
      <BrandLogo />
      {uriQuery.has("wording") && (
        <Form id="language-select">
          <Form.Select onChange={handleLanguageChange}>
            <option value="en_WP">Free Speech</option>
            <option value="en">Original</option>
          </Form.Select>
        </Form>
      )}
      <div id="version-day">
        <h3>
          {import.meta.env.VITE_VERSION || "v0.0.0A"}{" "}
          <strong className="text-warning">WP</strong>
        </h3>
        <div>
          <span className="text-muted small align-baseline me-1">DAY</span>
          <span className="numeric align-baseline fs-5 fw-bold">
            {currentDay ? Number(currentDay + 1n).toString() : "---"}
          </span>
        </div>
      </div>
      <div id="usdhex">
        <span className="text-muted small me-1">USD</span>
        <span className="numeric text-success h2">
          {"$" + (isNaN(props.usdhex) ? "-.--" : format(",.4f")(props.usdhex))}
        </span>
        {/* <ProgressBar variant="secondary" now={50} animated={false} ref={r => this.usdProgress = r} /> */}
      </div>
    </>
  );
};

const Body = (props: { accounts: UriAccount[]; usdhex: number }) => {
  const hexData = useContext(HexContext);

  return (
    <Container>
      {!hexData ? (
        <ProgressBar
          variant="secondary"
          animated
          now={60}
          label="initializing"
        />
      ) : (
        <>
          <Stakes
            openActive={uriQuery.has("closed") ? false : true}
            usdhex={props.usdhex}
          />
          {props.accounts.map((account) => (
            <Stakes
              key={account.address}
              account={account}
              usdhex={props.usdhex}
            />
          ))}
          {uriQuery.has("tewkens") && <Tewkenaire usdhex={props.usdhex} />}
          {/* <Lobby parent={this} contract={this.contract} wallet={this.state.wallet} /> */}
          {/* <Stats parent={this} contract={this.contract} wallet={this.state.wallet} usdhex={this.state.USDHEX} /> */}
        </>
      )}
    </Container>
  );
};

const Footer = () => {
  const [show, setShow] = useState(false);
  const hexData = useContext(HexContext);
  const { chain } = useNetwork();
  const chainId = chain?.id || 0n;
  const networkName = chain?.name || "unknown";

  const address = hexData?.walletAddress || "";
  const addressFragment = address
    ? address.slice(0, 6) + "..." + address.slice(-4)
    : "unknown";

  return (
    <Container id="wallet_status" fluid>
      <Row>
        <Col>
          <Badge bg={chainId !== 1 ? "danger" : "success"} className="small">
            {networkName}
          </Badge>
        </Col>
        <Col className="text-end">
          {show && <Badge bg="info"> copied </Badge>}
          <CopyToClipboard
            text={address}
            onCopy={() => {
              setShow(true);
              setTimeout(() => setShow(false), 2000);
            }}
          >
            <Badge bg="secondary" className="text-info pointer">
              {addressFragment} <FontAwesomeIcon icon={faCopy} />
            </Badge>
          </CopyToClipboard>
        </Col>
      </Row>
    </Container>
  );
};

function App() {
  const { i18n, t } = useTranslation();

  /// URI Stuff
  // look for ?account=addr[:label][&...]'s from URI
  let accounts: UriAccount[] = [];
  if (uriQuery.has("account")) {
    const uriAccounts = uriQuery.getAll("account");
    accounts = uriAccounts.map((account) => {
      const s = account.split(":");
      return { address: s[0] as Address, name: (s[1] as string) || "" };
    });
  }

  switch (uriQuery.get("lang")) {
    case "en":
    case "original":
    case "classic":
    case "0":
      if (i18n.language != "en") i18n.changeLanguage("en");
      break;

    default:
      if (i18n.language != "en_WP") i18n.changeLanguage("en_WP");
  }

  // "state" variables
  const [hexData, setHexData] = useState(undefined as HexData | undefined);
  const [walletAddress, setWalletAddress] = useState(
    undefined as Address | undefined
  );
  const [USDHEX, setUSDHEX] = useState(0.0);

  // const referrer = (uriQuery?.get("r") || "").toLowerCase() // will never be used again (?)
  ///

  const { chain } = useNetwork();
  const chainId = chain ? chain.id : 0;
  const networkName = chain ? chain.name : "not connected";

  const hexAddress = HEX.CHAIN_ADDRESSES[chainId];
  const hexContract = { address: hexAddress, abi: HEX.ABI };

  const { address } = useAccount();
  useEffect(() => {
    setWalletAddress(address);
  }, [address]);

  useQuery([networkName, "DaiHex"], getPulseXDaiHex, {
    enabled: chainId === 369,
    refetchInterval: 10000,
    retry: 5,
    retryDelay: 5000,
    onSuccess: (data) => setUSDHEX(data),
  });

  // Uniswap V2 Pair contract ABI
  const UNISWAP_V2_PAIR_ABI = [
    {
      constant: true,
      inputs: [],
      name: "getReserves",
      outputs: [
        { internalType: "uint112", name: "reserve0", type: "uint112" },
        { internalType: "uint112", name: "reserve1", type: "uint112" },
        { internalType: "uint32", name: "blockTimestampLast", type: "uint32" },
      ],
      payable: false,
      stateMutability: "view",
      type: "function",
    },
    {
      constant: true,
      inputs: [],
      name: "token0",
      outputs: [{ internalType: "address", name: "", type: "address" }],
      payable: false,
      stateMutability: "view",
      type: "function",
    },
    {
      constant: true,
      inputs: [],
      name: "token1",
      outputs: [{ internalType: "address", name: "", type: "address" }],
      payable: false,
      stateMutability: "view",
      type: "function",
    },
  ];

  const { data: price } = useContractRead({
    address: "0xF6DCdce0ac3001B2f67F750bc64ea5beB37B5824", // Uniswap v2 HEX / USDC
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: "getReserves",
    enabled: chainId == 1,
    watch: true,
    cacheTime: 10000, // 10 seconds
    staleTime: 10000, // 10 seconds
    select: (reserves) => {
      const [reserve0, reserve1, _blockTimestampLast] = reserves as [ bigint, bigint, number ]
      const bnPrice = reserve0 > 0 ? (reserve1 * 100000000n) / reserve0 : 0.0
      const price = Number(bnPrice) / 1000000
      debug("HEX USDC: ", price)
      return price
    },
  })

  useEffect(() => {
    setUSDHEX(price || 0.00);
  }, [price]);

  // start the show when walletAddress appears
  // Lo and behold! Hardhat (Viem) appears to come with Multicall3 built in.
  useContractReads({
    enabled: !!walletAddress,
    scopeKey: `HexData:${chainId}`,
    watch: true,
    contracts: [
      { ...hexContract, functionName: "currentDay" },
      {
        ...hexContract,
        functionName: "balanceOf",
        args: [walletAddress ?? "0x0"],
      },
      {
        ...hexContract,
        functionName: "stakeCount",
        args: [walletAddress ?? "0x0"],
      },
      { ...hexContract, functionName: "allocatedSupply" },
      { ...hexContract, functionName: "totalSupply" },
      { ...hexContract, functionName: "globals" },
    ],
    // multicallAddress: (
    //   chainId === 31337
    //     ? "0xEd0810Fa0B29d69b48157Cd8a7527FC7EdCD0d1e"
    //     : "0xcA11bde05977b3631167028862bE2a173976CA11"
    // ),
    onError: (e) =>
      debug(
        "MULTICALL ERROR: Multicall3 contract doesn't exist on PulseChain Testnet v4",
        e
      ),
    onSuccess: (data) => {
      debug("HexData: %O", data);
      const _globals = data?.[5].result as readonly [
        bigint,
        bigint,
        number,
        bigint,
        number,
        bigint,
        number,
        bigint
      ];
      const _stats = _globals[7] || 0n;
      const hexData = {
        chainId,
        contract: {
          address: hexAddress,
          abi: HEX.ABI,
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
          claimStats: {
            // ref: https://etherscan.io/token/0x2b591e99afe9f32eaa6214f7b7629768c40eeb39#code Line 1152
            claimedBtcAddrCount: _stats >> (HEX.SATOSHI_UINT_SIZE * 2n),
            claimedSatoshisTotal:
              (_stats >> HEX.SATOSHI_UINT_SIZE) & HEX.SATOSHI_UINT_MASK,
            unclaimedSatoshisTotal: _stats & HEX.SATOSHI_UINT_MASK,
          },
        },
      } as HexData;
      setHexData(hexData);
    },
  });

  const { disconnect } = useDisconnect();

  const resetApp = () => {
    window.location.reload();
  };

  const handleDisconnect = () => {
    disconnect();
    resetApp();
  };

  const explorerUrl = CHAINS[chainId].explorerURL
    ? `${CHAINS[chainId].explorerURL?.replace(/\/$/, "")}/address/${
        HEX.CHAIN_ADDRESSES[chainId]
      }`
    : undefined;

  return (
    <Container className="m-0 p-0" fluid>
      <HexContext.Provider value={hexData}>
        <Container id="hexmob_header" fluid>
          <Header usdhex={USDHEX} />
        </Container>
        <Container id="hexmob_body" fluid>
          {walletAddress !== undefined ? (
            <Body accounts={accounts} usdhex={USDHEX} />
          ) : (
            <Container fluid className="mt-3 text-center mb-3">
              <Web3Button icon="hide" />
              <Blurb />
            </Container>
          )}
          {walletAddress && explorerUrl && (
            <>
              <Container className="text-center py-3">
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                  <Badge className="p-2 text-light bg-secondary">
                    <strong>{t("CONTRACT ADDRESS")}</strong>
                    <br className="d-md-none" />
                    <span className="text-info">
                      &nbsp;{HEX.CHAIN_ADDRESSES[chainId]}
                    </span>
                  </Badge>
                </a>
              </Container>
              <Container className="text-center">
                <Button onClick={handleDisconnect}>{t("Disconnect")}</Button>
              </Container>
            </>
          )}
          <GitHubInfo className="py-3" />
          <WalletUtils className="py-3" />
        </Container>
        <Container id="hexmob_footer" fluid>
          <Footer />
        </Container>
      </HexContext.Provider>
    </Container>
  );
}

export default App;

import React, { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { useChainId, useAccount, useReadContract, useReadContracts } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

import { WalletUtils } from "./Widgets";
import ProgressBar from "react-bootstrap/ProgressBar";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
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
  case "localhost":
  case "go.tshare.app":
  default:
    window.hostIsTSA = true;
    window.hostIsHM = false;
}

const Header = (props: {
  usdhex: number;
  ethPrice: number;
  pulsePrice: number;
  headerPriceSource: "ethereum" | "pulsechain";
  onTogglePrice: () => void;
}) => {
  const hexData = useContext(HexContext);
  const currentDay = hexData?.currentDay || 0n;
  const { i18n } = useTranslation();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const languageValue = e.target.value;
    i18n.changeLanguage(languageValue);
  };

  const headerDisplayPrice = props.headerPriceSource === "ethereum" ? props.ethPrice : props.pulsePrice;

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
          {import.meta.env.VITE_VERSION || "v0.0.0A"} <strong className="text-warning">WP</strong>
        </h3>
        <div>
          <span className="text-muted small align-baseline me-1">DAY</span>
          <span className="numeric align-baseline fs-5 fw-bold">
            {currentDay ? Number(currentDay + 1n).toString() : "---"}
          </span>
        </div>
      </div>
      <div id="usdhex">
        <span className="text-muted small me-1">{props.headerPriceSource === "ethereum" ? "USDC" : "DAI"}</span>
        <span
          className="numeric text-success h2"
          onClick={props.onTogglePrice}
          style={{ cursor: "pointer", userSelect: "none", display: "inline-block" }}
          title={`Click to toggle network price source`}
        >
          {"$" + (isNaN(headerDisplayPrice) ? "-.--" : format(",.4f")(headerDisplayPrice))}
        </span>
        <img
          src={props.headerPriceSource === "ethereum" ? "/ethereum.png" : "/pulsechain.png"}
          alt={props.headerPriceSource}
          style={{ height: "20.8px", marginLeft: "8px", verticalAlign: "top", display: "inline-block" }}
        />
      </div>
    </>
  );
};

const Body = (props: { accounts: UriAccount[]; usdhex: number }) => {
  const hexData = useContext(HexContext);

  return (
    <Container>
      {!hexData ? (
        <ProgressBar variant="secondary" animated now={60} label="initializing" />
      ) : (
        <>
          <Stakes openActive={uriQuery.has("closed") ? false : true} usdhex={props.usdhex} />
          {props.accounts.map((account) => (
            <Stakes key={account.address} account={account} usdhex={props.usdhex} />
          ))}
          {/* <Lobby parent={this} contract={this.contract} wallet={this.state.wallet} /> */}
          {/* <Stats parent={this} contract={this.contract} wallet={this.state.wallet} usdhex={this.state.USDHEX} /> */}
        </>
      )}
    </Container>
  );
};

const Footer = () => {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  debug(chainId);

  const currentChain = isConnected ? chainId : 0;

  const currentName = CHAINS[currentChain].name;
  const currentAvatar = CHAINS[currentChain].avatar;

  return (
    <Container id="wallet_status" fluid>
      <Row className="align-items-center justify-content-center">
        <Col xs="auto">{isConnected ? <appkit-account-button /> : <appkit-button />}</Col>
        <Col xs="auto" className="text-info small ms-3">
          {currentAvatar ? (
            <img src={currentAvatar} alt={currentName} title={currentName} style={{ height: "32px" }} />
          ) : (
            <span>{currentName}</span>
          )}
        </Col>
      </Row>
    </Container>
  );
};

function App() {
  const { i18n, t } = useTranslation();

  // ============================================================================
  // Parse URL Query Parameters
  // ============================================================================

  // Parse ?account=addr[:label][&...] query parameters for multi-account view
  let accounts: UriAccount[] = [];
  if (uriQuery.has("account")) {
    const uriAccounts = uriQuery.getAll("account");
    accounts = uriAccounts.map((account) => {
      const s = account.split(":");
      return { address: s[0] as Address, name: (s[1] as string) || "" };
    });
  }

  // Set language from ?lang query parameter (defaults to Free Speech "mining" variant)
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

  // ============================================================================

  // "state" variables
  const [hexData, setHexData] = useState(undefined as HexData | undefined);
  const [walletAddress, setWalletAddress] = useState(undefined as Address | undefined);
  const [USDHEX, setUSDHEX] = useState(0.0);
  const [ethPrice, setEthPrice] = useState(0.0);
  const [pulsePrice, setPulsePrice] = useState(0.0);
  // Separate state for header price display toggle (independent of global app price)
  const [headerPriceSource, setHeaderPriceSource] = useState<"ethereum" | "pulsechain">("pulsechain");

  const handleTogglePrice = () => {
    // Only toggle the header display if both prices are available
    if (ethPrice > 0 && pulsePrice > 0) {
      if (headerPriceSource === "ethereum") {
        setHeaderPriceSource("pulsechain");
      } else {
        setHeaderPriceSource("ethereum");
      }
    }
  };

  // const referrer = (uriQuery?.get("r") || "").toLowerCase() // will never be used again (?)
  ///

  const chainId = useChainId();
  const queryClient = useQueryClient();

  const hexAddress = HEX.CHAIN_ADDRESSES[chainId as keyof typeof HEX.CHAIN_ADDRESSES];
  const hexContract = hexAddress ? { address: hexAddress, abi: HEX.ABI } : (undefined as any);

  const { address, isConnected: accountIsConnected } = useAccount();
  useEffect(() => {
    setWalletAddress(address);
  }, [address]);

  // When wallet connects, switch price to the connected network
  useEffect(() => {
    if (accountIsConnected) {
      // If connected to Ethereum, use Ethereum price; otherwise use Pulsechain
      if (chainId === 1 && ethPrice > 0) {
        setUSDHEX(ethPrice);
      } else if (pulsePrice > 0) {
        setUSDHEX(pulsePrice);
      }
    } else {
      // When not connected, default to Pulsechain
      if (pulsePrice > 0) {
        setUSDHEX(pulsePrice);
      }
    }
  }, [accountIsConnected, chainId, ethPrice, pulsePrice]);

  // When chain changes, clear derived HEX data to force a fresh load on new chain
  useEffect(() => {
    setHexData(undefined);
    // Invalidate all queries so fresh data is fetched for the new chain
    queryClient.invalidateQueries();
  }, [chainId]);

  useQuery({
    queryKey: ["pulsechain", "DaiHex"],
    queryFn: getPulseXDaiHex,
    refetchInterval: 10000,
    retry: 5,
    retryDelay: 5000,
  });

  // Always fetch Pulsechain price independently
  useEffect(() => {
    getPulseXDaiHex()
      .then((data: any) => {
        setPulsePrice(data);
      })
      .catch(() => {});

    // Set up interval to refresh
    const interval = setInterval(() => {
      getPulseXDaiHex()
        .then((data: any) => setPulsePrice(data))
        .catch(() => {});
    }, 10000);

    return () => clearInterval(interval);
  }, []);

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

  const { data: price } = useReadContract({
    address: "0xF6DCdce0ac3001B2f67F750bc64ea5beB37B5824", // Uniswap v2 HEX / USDC
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: "getReserves",
    chainId: 1, // Always read from Ethereum mainnet
    query: {
      enabled: true, // Always enabled to fetch Ethereum price
      refetchInterval: 10000, // 10 seconds
    },
  });

  useEffect(() => {
    if (price) {
      const [reserve0, reserve1, _blockTimestampLast] = price as [bigint, bigint, number];
      const bnPrice = reserve0 > 0 ? (reserve1 * 100000000n) / reserve0 : 0n;
      const calculatedPrice = Number(bnPrice) / 1000000;
      debug("HEX USDC: ", calculatedPrice);
      setEthPrice(calculatedPrice);
    }
  }, [price]);

  // Start the show when walletAddress appears
  // Uses Viem's built-in Multicall3. Nice.
  const { data: contractsData } = useReadContracts({
    contracts: hexContract
      ? [
          { ...hexContract, chainId, functionName: "currentDay" },
          {
            ...hexContract,
            chainId,
            functionName: "balanceOf",
            args: [walletAddress ?? "0x0000000000000000000000000000000000000000"],
          },
          {
            ...hexContract,
            chainId,
            functionName: "stakeCount",
            args: [walletAddress ?? "0x0000000000000000000000000000000000000000"],
          },
          { ...hexContract, chainId, functionName: "allocatedSupply" },
          { ...hexContract, chainId, functionName: "totalSupply" },
          { ...hexContract, chainId, functionName: "globals" },
        ]
      : [],
    query: {
      // Enable reads even without a connected wallet to refresh UI on chain changes
      enabled: !!hexContract,
      refetchInterval: 10000,
    },
  });

  useEffect(() => {
    if (!contractsData || !hexAddress) return;
    // Ensure all expected results exist before accessing by index
    const results = contractsData.map((c) => c?.result).filter((r) => r !== undefined);
    if (results.length < 6) return;

    try {
      debug("HexData: %O", contractsData);
      const globalsEntry = contractsData?.[5]?.result as
        | readonly [bigint, bigint, number, bigint, number, bigint, number, bigint]
        | undefined;
      if (!globalsEntry) return;

      const _globals = globalsEntry;
      const _stats = (_globals?.[7] as bigint) ?? 0n;
      const next: HexData = {
        chainId,
        contract: {
          address: hexAddress,
          abi: HEX.ABI,
        },
        currentDay: (contractsData?.[0]?.result as bigint) ?? 0n,
        walletAddress,
        hexBalance: (contractsData?.[1]?.result as bigint) ?? 0n,
        stakeCount: (contractsData?.[2]?.result as bigint) ?? 0n,
        allocatedSupply: (contractsData?.[3]?.result as bigint) ?? 0n,
        totalSupply: (contractsData?.[4]?.result as bigint) ?? 0n,
        globals: {
          lockedHeartsTotal: _globals[0],
          nextStakeSharesTotal: _globals[1],
          shareRate: BigInt(_globals[2] || 0),
          stakePenaltyTotal: _globals[3],
          dailyDataCount: BigInt(_globals[4] || 0),
          stakeSharesTotal: _globals[5],
          latestStakeId: BigInt(_globals[6] || 0),
          claimStats: {
            claimedBtcAddrCount: _stats >> (HEX.SATOSHI_UINT_SIZE * 2n),
            claimedSatoshisTotal: (_stats >> HEX.SATOSHI_UINT_SIZE) & HEX.SATOSHI_UINT_MASK,
            unclaimedSatoshisTotal: _stats & HEX.SATOSHI_UINT_MASK,
          },
        },
      };
      setHexData(next);
    } catch (err) {
      debug("Failed to parse HEX globals: %O", { error: err, contractsData });
    }
  }, [contractsData, chainId, hexAddress, walletAddress]);

  const explorerUrl =
    CHAINS[chainId]?.explorerURL && HEX.CHAIN_ADDRESSES[chainId]
      ? `${(CHAINS[chainId]?.explorerURL || "").replace(/\/$/, "")}/address/${HEX.CHAIN_ADDRESSES[chainId]}`
      : undefined;

  return (
    <Container className="m-0 p-0" fluid>
      {/* Re-mount downstream consumers when chain changes to ensure fresh reads */}
      <HexContext.Provider key={`chain-${chainId}`} value={hexData}>
        <Container id="hexmob_header" fluid>
          <Header
            usdhex={USDHEX}
            ethPrice={ethPrice}
            pulsePrice={pulsePrice}
            headerPriceSource={headerPriceSource}
            onTogglePrice={handleTogglePrice}
          />
        </Container>
        <Container id="hexmob_body" fluid>
          {accountIsConnected && walletAddress ? (
            <Body accounts={accounts} usdhex={USDHEX} />
          ) : (
            <Container fluid className="mt-3 text-center mb-3">
              <Blurb />
              <div className="mt-3">
                <p className="text-muted">Connect your wallet using the button in the status bar below</p>
              </div>
            </Container>
          )}
          {accountIsConnected && walletAddress && explorerUrl && (
            <>
              <Container className="text-center py-3">
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                  <Badge className="p-2 text-light bg-secondary">
                    <strong>{t("CONTRACT ADDRESS")}</strong>
                    <br className="d-md-none" />
                    <span className="text-info">&nbsp;{HEX.CHAIN_ADDRESSES[chainId]}</span>
                  </Badge>
                </a>
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

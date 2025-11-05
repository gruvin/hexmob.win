import React, { useContext, useState, PropsWithChildren } from 'react'
import { useTranslation } from "react-i18next"
import Container, { ContainerProps } from 'react-bootstrap/Container'
import Button from 'react-bootstrap/Button'
import OverlayTrigger, { OverlayTriggerProps } from 'react-bootstrap/OverlayTrigger'
import Tooltip from 'react-bootstrap/Tooltip'
import Badge from 'react-bootstrap/Badge'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy, faExclamation, faFrown, faHourglass, faSmileWink, faWalkieTalkie } from '@fortawesome/free-solid-svg-icons'
import { CopyToClipboard } from 'react-copy-to-clipboard'
import HEX from './hex_contract.js'
import { HexContext } from './Context'
import CHAINS from './chains'
import { cryptoFormat, compactHexString } from './util.js'
import {
    useWriteContract,
    useWaitForTransactionReceipt
} from 'wagmi'

import _debug from 'debug'
const debug = _debug('Widgets')

interface CryptoValProps {
    value: number | bigint | string
    currency?: string
    showUnit?: boolean
    symbol?: React.ReactElement
    wholeNumber?: boolean
    className?: string
}
export const CryptoVal = (props: CryptoValProps) => {

    const { value, currency, showUnit, wholeNumber } = props
    if (value === '---') return (<>---</>)
    if (isNaN(Number(value))) return <>NaN</>

    const { valueString: _s, unit } = cryptoFormat(value, currency || "")
    const sign = _s.replace(/([−-]?)(.*)/, "$1")
    const s = _s.replace(/[−-]?(.*)/, "$1")

    // mute fractional part (including the period)
    const r = s.match(/^(.*)(\.\d+)(.*)$/)
    if (r && r.length > 1)
        return <>
                <span className={"numeric" + (props.className ? " "+props.className : "")} >
                {sign}{props.symbol || <></>}{r[1]}
                {!wholeNumber &&
                    <span style={{ opacity: "0.5" }}>{r[2]}</span>
                }
                {r[3] && r[3]}
            </span>
            {showUnit && <span className="unit">&nbsp;{unit}</span>}
        </>
    else
        return <><span className="numeric">{sign}{props.symbol || <></>}{s}</span>{showUnit && <span className="unit">&nbsp;{unit}</span> }</>
}

type WhatIsThisProps = PropsWithChildren<Omit<OverlayTriggerProps, "target" | "overlay"> | "showPill"> & {
    tooltip: string | React.ReactNode
    showPill?: boolean
    placement?: OverlayTriggerProps['placement']
}
export const WhatIsThis = (props: WhatIsThisProps, {...others}) => {
    const { tooltip, showPill, children, placement } = props

    return (
        <OverlayTrigger
            // rootClose={true}
            placement={placement ? placement : "auto"} flip
            delay={{ show: 200, hide: 400 }}
            overlay={<Tooltip {...others}>{tooltip}</Tooltip>}
        >
            <span>
                {children}
                {showPill && <sup><Badge pill className="ms-1 bg-info">?</Badge></sup>}
            </span>
        </OverlayTrigger>
    )
}

export const BurgerHeading = (props: React.PropsWithChildren<{ className?: string }>) => {
    return (
        <div className={`burger-heading ${props.className}`}>
            <img src="/burger.png" alt="menu" />
            <span>{props.children}</span>
        </div>
    )
}

export const StakeStartButton = (props: React.PropsWithChildren<{
    stakedHearts: bigint,
    stakedDays: bigint,
    className?: string,
    rejectionCallback?: () => void,
    confirmationCallback?: () => void
}>) => {
    const { t } = useTranslation()
    const hexData = useContext(HexContext)
    const chainId = hexData?.chainId || 0
    const explorerUrl = (CHAINS[chainId]?.explorerURL || "").replace(/\/$/, "") // remove trailing / for consistency
    // const hexBalance = hexData?.hexBalance || 0n // Commented out as it's not used
    // const { stakedHearts, stakedDays } = props // Commented out as they're not used

    // In wagmi v2, we use useWriteContract directly without preparation
    const { 
        data: hash, 
        isPending: isLoading, 
        isSuccess, 
        isError, 
        reset, 
        writeContract: write 
    } = useWriteContract()
    
    const { data: txReceipt } = useWaitForTransactionReceipt({
        hash
    })

    const handleWrite = () => {
        write({
            address: HEX.CHAIN_ADDRESSES[chainId],
            abi: HEX.ABI,
            functionName: "stakeStart",
            args: [props.stakedHearts, props.stakedDays]
        })
    }

    const [confirmedState, setConfirmedState] = useState(false)
    const [copied, setCopied] = useState(false)

    React.useEffect(() => {
        if (txReceipt?.status === "success") {
            setConfirmedState(true)
            props?.confirmationCallback && props.confirmationCallback.apply(this)
        }
    }, [txReceipt])

    let buttonContent = props.children ? props.children : <>{t("START STAKE")}</>
    let txHash = <></>
    if (!chainId) {
        buttonContent = <><FontAwesomeIcon icon={faExclamation} /> {buttonContent}</>
    } else {
        if (confirmedState) {
            buttonContent = <><FontAwesomeIcon icon={faSmileWink} />&nbsp;{t("confirmed")}</>
            setTimeout(() => {
                reset()
                setConfirmedState(false)
            }, 3000)
        } else if (isLoading) {
            buttonContent = <><FontAwesomeIcon icon={faWalkieTalkie} />&nbsp;{t("requesting")}</>
        } else if (isError) {
            debug("StartStakeButton::write error: ", hash)
            buttonContent = <><FontAwesomeIcon icon={faFrown} />&nbsp;{t("rejected")}</>
            setTimeout(() => {
                reset()
                if (typeof props.rejectionCallback === 'function') props.rejectionCallback()
            }, 3000)
        } else if (isSuccess) {
            buttonContent = <><FontAwesomeIcon icon={faHourglass} />&nbsp;{t("confirming")}</>
            txHash = <>
                <CopyToClipboard text={hash || ""}
                    onCopy={() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 3000)
                    }
                }>
                    <span style={{cursor: "pointer"}}>{copied ? <>{t("COPIED")} </> : <>&nbsp;&nbsp;<FontAwesomeIcon icon={faCopy} />&nbsp;&nbsp;&nbsp;</>}</span>
                </CopyToClipboard>
                <a
                    className="txhash-link"
                    href={explorerUrl+"/tx/"+(hash || "0x")}
                >{compactHexString(hash || "0x")}</a>
            </>
        }
    }
    return (
        <div className="btn-stake-start">
            <Button className={props.className} disabled={!write || !chainId} onClick={() => handleWrite()}>
                {buttonContent}
            </Button>
            <div>{txHash}</div>
        </div>
    )
}

export const StakeEndButton = (
    props: React.PropsWithChildren<{
        stakeIndex: bigint,
        stakeId: bigint,
        className?: string,
        variant?: string,
        rejectionCallback?: () => void,
        confirmationCallback?: () => void,
}>) => {
    const { t } = useTranslation()
    const hexData = useContext(HexContext)
    const chainId = hexData?.chainId || 0
    const explorerUrl = (CHAINS[chainId]?.explorerURL || "").replace(/\/$/, "") // remove trailing / for consistency
    
    // In wagmi v2, we use useWriteContract directly
    const { 
        data: hash, 
        isPending: isLoading, 
        isSuccess, 
        isError, 
        reset, 
        writeContract: write 
    } = useWriteContract()
    
    const { data: txReceipt } = useWaitForTransactionReceipt({
        hash
    })

    const handleWrite = () => {
        write({
            address: HEX.CHAIN_ADDRESSES[chainId],
            abi: HEX.ABI,
            functionName: "stakeEnd",
            args: [props.stakeIndex, Number(props.stakeId)]
        })
    }

    const [confirmedState, setConfirmedState] = useState(false)
    const [copied, setCopied] = useState(false)

    React.useEffect(() => {
        if (txReceipt?.status === "success") {
            setConfirmedState(true)
            props?.confirmationCallback && props.confirmationCallback.apply(this)
        }
    }, [txReceipt])

    let buttonContent = props.children ? props.children : <>{t("endStake")}</>
    let txHash = <></>
    if (!chainId) {
        buttonContent = <><FontAwesomeIcon icon={faExclamation} /> {buttonContent}</>
    } else {
        if (confirmedState) {
            buttonContent = <><FontAwesomeIcon icon={faSmileWink} />&nbsp;{t("confirmed")}</>
            setTimeout(() => {
                reset()
                setConfirmedState(false)
            }, 3000)
        } else if (isLoading) {
            buttonContent = <><FontAwesomeIcon icon={faWalkieTalkie} />&nbsp;{t("requesting")}</>
        } else if (isError) {
            debug("StartEndButon::write error: ", hash)
            buttonContent = <><FontAwesomeIcon icon={faFrown} />&nbsp;{t("rejected")}</>
            setTimeout(() => {
                reset()
                if (typeof props.rejectionCallback === 'function') props.rejectionCallback()
            }, 3000)
        } else if (isSuccess) {
            buttonContent = <><FontAwesomeIcon icon={faHourglass} />&nbsp;{t("confirming")}</>
            txHash = <>
                <CopyToClipboard text={hash || ""}
                    onCopy={() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 3000)
                    }
                }>
                    <span style={{cursor: "pointer"}}>{copied ? <>{t("COPIED")} </> : <>&nbsp;&nbsp;<FontAwesomeIcon icon={faCopy} />&nbsp;&nbsp;&nbsp;</>}</span>
                </CopyToClipboard>
                <a
                    className="txhash-link"
                    href={explorerUrl+"/tx/"+(hash || "0x")}
                >{compactHexString(hash || "0x")}</a>
            </>
        }
    }
    return (
        <div className="btn-stake-start">
            <Button
                variant={props.variant || "primary"}
                className={props.className || "exitbtn"}
                disabled={!write || !chainId}
                onClick={() => handleWrite()}
            >
                {buttonContent}
            </Button>
            {write === undefined && <><br/><Badge bg="danger">{t("gas error ?")}</Badge></>}
            <div>{txHash}&nbsp;</div>
        </div>
    )
}

// type Donatificator = {
//     walletConnected: boolean
// }
// export function Donaticator(props: Donatificator) {
//     const [show, setShow] = useState(false);
//     const [donateEnabled, setDonateEnabled] = useState(false);

//     const [amount, setAmount] = useState("");
//     const target = useRef(null) as React.RefObject<HTMLInputElement>

//     const donationAddress = "0x920b96701676cdAC9e2dB0b7c2979FF2577A0FA9"

//     const handleDonate = async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
//         e.preventDefault()
//         if (isNaN(parseInt(amount))) return false
//         const tx = await window.contract.transfer(donationAddress, ethers.utils.parseUnits(amount, HEX.DECIMALS))
//         // TODO: say thanks (donations were disabled some time back though)
//     }

//     const handleDonationAmount = (e: React.FocusEvent<HTMLInputElement>)  => {
//         e.preventDefault()
//         setAmount((parseInt(e.target.value) || 0).toString())
//     }

//     const showCopied = (text: string, result: boolean): void => {
//         setShow(true)
//         setTimeout(() => setShow(false), 3000)
//     }

//     return (
//         <Container className="pt-2 mt-3">
//             <Card.Body className="rounded text-center text-light pb-3 mb-3">
//                 <img className="d-inline-block" src="/donate.toString().png" alt="donate to HEXmob" style={{ verticalAlign: "middle" }} />
//                 <form>
//                     <h5 className="m-0">please support <strong>HEX<sup>mob</sup></strong></h5>
//                     <div style={{ width: "20rem", margin: "auto" }}>
//                         <CopyToClipboard text={donationAddress} onCopy={showCopied}>
//                         <input
//                             style={{ display: "inline-block" }}
//                             name="addr"
//                             type="text"
//                             readOnly={true}
//                             ref={target}
//                             title="copy to clipboard"
//                             className="donate_addr w-100 text-center btn btn-dark py-0"
//                             value={donationAddress}
//                         />
//                         </CopyToClipboard>
//                     </div>
//                     { props.walletConnected &&
//                     <>
//                         <InputGroup style={{ maxWidth: "300px", margin: "auto" }}>
//                             <Form.Control
//                                 as="input"
//                                 name="amount"
//                                 type="number"
//                                 placeholder="HEX amount"
//                                 htmlSize={12}
//                                 ref={target}
//                                 onBlur={ handleDonationAmount }
//                                 onChange={() => { setDonateEnabled(Boolean(target.current?.value.length)) }}
//                             />
//                             <InputGroup className="">
//                                 <Button
//                                     variant="success" size="sm"
//                                     value="donate"
//                                     disabled={!donateEnabled}
//                                     onClick={ handleDonate }
//                                 >
//                                     DONATE NOW
//                                 </Button>
//                             </InputGroup>
//                         </InputGroup>
//                         <div className="mt-3">{/*#7*/}
//                             <Button
//                                 variant="info" size="sm" className="text-dark"
//                                 onClick={(e) => {
//                                     e.preventDefault();
//                                     window.open(`https://etherscan.io/address/${donationAddress}`)}
//                                 }
//                             >
//                                 view donations on etherscan.io
//                             </Button>
//                         </div>
//                     </>
//                     }
//                 </form>
//             </Card.Body>
//             <Overlay target={target.current} show={show} placement="top">
//                 <Tooltip>
//                     address copied to clipboard
//                 </Tooltip>
//             </Overlay>
//         </Container>
//     )
// }


export const GitHubInfo = (props: PropsWithChildren<ContainerProps>): React.ReactElement => {
    const { className, } = props
    return (
        <Container {...props} className={"text-light text-center " + (className || "")}>
            <strong>Open Source</strong> <span className="text-muted">GPLv3</span><br />
            <a href="https://github.com/gruvin/hexmob.win" target="_blank" rel="noopener noreferrer">GitHub</a>
        </Container>
    )
}

export const WalletUtils = (props: React.PropsWithChildren<ContainerProps>): React.ReactElement => {
    if (!window.ethereum || !window.ethereum?._metamask) return <></>

    const addHEXtoken = async () => {
        const tokenAddress = "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39"
        const tokenSymbol = "HEX"
        const tokenDecimals = 8
        const tokenImage = "https://hex.com/downloads/logo/HEXagon.png"

        try {
            // wasAdded is a boolean. Like any RPC method, an error may be thrown.
            await (window.ethereum as any)?.request({
                method: "wallet_watchAsset",
                params: {
                    type: "ERC20", // Initially only supports ERC20, but eventually more!
                    options: {
                        address: tokenAddress, // The address that the token is at.
                        symbol: tokenSymbol, // A ticker symbol or shorthand, up to 5 chars.
                        decimals: tokenDecimals, // The number of decimals in the token
                        image: tokenImage, // A string url of the token logo
                    },
                },
            })
        } catch (error) {
            debug(error)
        }
    }

    const addPulseChain = async () => {
        await (window.ethereum as any)?.request({
            method: "wallet_addEthereumChain",
            params: [{
                chainId: "0x"+Number(369).toString(16),
                chainName: "Pulsechain",
                nativeCurrency: {
                    name: "Pulse",
                    symbol: "PLS",
                    decimals: 18
                },
                rpcUrls: ["https://rpc.pulsechain.com/"],
                blockExplorerUrls: ["https://otter.pulsechain.com/"],
                iconUrls: [] // ignored
            }]
        })
    }

    return (
        <Container {...props}>
            <Row>
                <Col className="col-12 text-light text-center mb-1 ">
                    <h4>Metamask Helpers</h4>
                </Col>
            </Row>
            <Row>
                <Col className="text-end">
                    <Button onClick={addHEXtoken}>Add HEX Token</Button>
                </Col>
                <Col className="text-start">
                    <Button onClick={addPulseChain}>Add Pulsechain</Button>
                </Col>
            </Row>
        </Container>
    )
}

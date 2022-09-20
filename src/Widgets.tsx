import React, { ReactElement, ReactNode, useRef, useState } from 'react'
import Container from 'react-bootstrap/Container'
import Card from 'react-bootstrap/Card'
import Button from 'react-bootstrap/Button'
import InputGroup from 'react-bootstrap/InputGroup'
import Spinner from 'react-bootstrap/Spinner'
import Overlay from 'react-bootstrap/Overlay'
import OverlayTrigger from 'react-bootstrap/OverlayTrigger'
import Tooltip from 'react-bootstrap/Tooltip'
import Badge from 'react-bootstrap/Badge'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import { ethers, BigNumber } from 'ethers'
import { EventEmitter } from 'events'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons'
import { CopyToClipboard } from 'react-copy-to-clipboard'
import { OverlayProps } from '@restart/ui/Overlay';
import { cryptoFormat } from './util.js'
import CHAINS from "./chains"
import HEX, { type HEXContract } from './hex_contract'
import { TransactionReceipt, TransactionResponse } from '@ethersproject/abstract-provider'

import _debug from 'debug'
const debug = _debug('Widgets')

interface CryptoValProps {
    value: BigNumber | number | string
    currency?: string
    showUnit?: boolean
    wholeNumber?: boolean
    className?: string
}
export const CryptoVal = (props: CryptoValProps) => {
    const { value, currency, showUnit, wholeNumber } = props
    if (value === '---') return ( <>---</> )
    if (isNaN(parseFloat(value as string))) return ( <>NaN</> )

    const { valueString:s, unit } = cryptoFormat(value, currency || "")

    // mute fractional part (including the period)
    const r = s.match(/^(.*)(\.\d+)(.*)$/)
    if (r && r.length > 1)
        return (
            <span className={ props.className } >
                { r[1] }
            { !wholeNumber &&
                <span style={{ opacity: "0.5" }}>
                    { r[2] }
                </span>
            }
                { r[3] && r[3] }
            { showUnit && <span className="unit">&nbsp;{unit}</span>}
            </span>
        )
    else
        return ( <span className="numeric">{s}{ showUnit && <span className="unit">&nbsp;{unit}</span> }</span> )
}

type WhatIsThisProps = OverlayProps & {
    tooltip: string
    showPill: boolean
}
export const WhatIsThis: React.FC<any> = (props: WhatIsThisProps) => {
    const [show, setShow] = useState(false)
    const target = useRef(null)
    const { showPill, tooltip, children, ...others } = props

    const _overlay = () => <Overlay
        target={target.current}
        show={show}
        onHide={() => setShow(false)}
    ><Tooltip {...others}>{tooltip}</Tooltip></Overlay>

    return (
        <>
            <div ref={target} style={{ display: "inline-block", cursor: "pointer" }}  onClick={()=>setShow(!show)}>
            <OverlayTrigger
                rootClose={true}
                placement={props.placement || "auto"} flip
                delay={{ show: 200, hide: 400 }}
                overlay={_overlay}
            >
                <>
                    { children }
                    { showPill && <sup><Badge pill className="ms-1 bg-info">?</Badge></sup> }
                </>
            </OverlayTrigger>
            </div>
        </>
    )
}

type BurgerHeadingProps = React.PropsWithChildren & {
    className?: string
}
export const BurgerHeading = (props: BurgerHeadingProps) => {
    return (
        <div className={`burger-heading ${props.className}`}>
            <img src="/burger.png" />
            <span>{props.children}</span>
        </div>
    )
}

// eslint-disable-next-line
const sim = function(params: any[]) {
    return {
        send: function(options: any) {
            var ee = new EventEmitter();
            const delay = 1000
            var count = 0
            setTimeout(() => {
                ee.emit('transactionHash', '0x5928acffbb00f86e055a3fb0ae85c87fefa86f0a72cdecca1fd6e4676460b206')
                setInterval(() => (++ count < 4) && ee.emit('confirmation', count, '#simulated_recipt#'), delay*2)
            }, delay)
            setTimeout(() => ee.emit('receipt', '#simulated_receipt# !!!=> '+JSON.stringify({ params, options})), delay * 10 )
            setTimeout(() => ee.emit('error', '#simulated_receipt#'), delay * 12.5)
            return ee;
        }
    }
}

type VoodooProps = React.PropsWithChildren & {
    contract: HEXContract
    method: string
    params: any
    overrides?: any
    inputValid?: boolean
    simulate?: boolean
    confirmationCallback?: Function
    rejectionCallback?: Function
    clickCallback?: Function
    className?: string
    style?: any
}
type VoodooState = {
    data: string | boolean | undefined
    wait: boolean
    hash: string | null
}
export class VoodooButton extends React.Component<VoodooProps, VoodooState> {

    isVoodooButton = true
    state: VoodooState

    constructor(props: VoodooProps) {
        super(props)
        this.state = {
            data: false,
            wait: false,
            hash: null,
        }
    }

    stringifyWithFunctions(object: {}): string {
        return JSON.stringify(object, (key, val) => {
            if (typeof val === 'function')
                return '[Function: '+key+']'
            else if (typeof val === 'object')
                return '[Object: '+key+']'
            else return val;
        })
    }

    componentDidMount = () => {
    }

    render() {
        const {
            contract,
            method,
            params,
            overrides,
            inputValid,
            simulate,
            confirmationCallback,
            rejectionCallback,
            clickCallback,
        } = this.props

        const dataValid = (typeof inputValid === 'undefined') ? true : inputValid

        // const explorerkURL = .replace(/\/+$/, "")
        const handleClick = async (contract: HEXContract, method: string, params: any[], overrides: {}, e: React.MouseEvent<HTMLButtonElement> ) => {
            e.preventDefault()
            e.stopPropagation()
            if (!dataValid || wait) return

            this.setState({
                wait: true,
                data: "requesting"
            })

            const func = simulate ? sim : contract[method]

            if (window.web3 && window.web3.currentProvider && window.web3.currentProvider.isTrust) {
                debug('Sending via TrustWallet provider')
                // TrustWallet [internal browser] returns immediately, with nothing and
                // never again :/ (See XXX notes in App.js)
                func(...params, {...overrides} )
                setTimeout(async ()=>{
                    this.setState({
                        data: "REQUESTED",
                        hash: "see wallet log"
                    })
                    setTimeout(async ()=>{
                        this.setState({ wait: false, data: false, hash: null})
                        confirmationCallback && confirmationCallback.apply(this)
                        rejectionCallback && rejectionCallback.apply(this)
                    }, 18008)
                }, 2000)
                return false // that's all folks
            }

            debug("contract.%s(%o, {%o}", method, params, overrides)

            func(...params, {...overrides} )
                .then((tx: TransactionResponse) => {
                    debug(`${method}::transactionHash: `, tx.hash)
                    this.setState({
                        hash: tx.hash,
                        data: 'confirming'
                    })
                    tx.wait().then((receipt: TransactionReceipt) => {
                        debug(`${method}::receipt: %O`, receipt)
                        if (this.state.wait) {
                            this.setState({
                                wait: false,
                                data: false,
                                hash: null
                            }, () => {
                               confirmationCallback && confirmationCallback.apply(this)
                            })
                        }
                        this.setState({ data: receipt.confirmations.toString() })
                    })
                    .catch( async (err: any) => {
                        debug(`${method}.wait()::error: `, err.reason, err.receipt)
                        this.setState({ data: 'rejected', wait: true })
                        setTimeout(() => {
                            this.setState({ wait: false, data: false, hash: null })
                            typeof rejectionCallback === 'function' && rejectionCallback.apply(this)
                        }, 2000)
                    })
                })
                .catch( async (err: any) => {
                    debug(`${method}::error: `, err.reason)
                    this.setState({ data: 'rejected', wait: true })
                    setTimeout(() => {
                        this.setState({ wait: false, data: false, hash: null })
                        typeof rejectionCallback === 'function' && rejectionCallback.apply(this)
                    }, 2000)
                })
            return false
        }

        const { data, wait, hash } = this.state as VoodooState
        let _RESPONSE: React.ReactNode
        let hashUI: string = ""
        let _color = ""

        if (!wait ) { _RESPONSE = this.props.children; _color = "" }
        else if (typeof data === 'string') {
            if (!isNaN(parseInt(data))) {
                _RESPONSE = (<><span style={{fontSize: "0.9em"}}>CONFIRMED</span><sup>{data}</sup></>);
                _color = "text-success"
            } else {
                _RESPONSE = <>{data}</>;
                _color = (data !== 'rejected') ? "text-info" : "text-danger"
            }
        }

        const _className = (this.props.className || "") + _color

        if (typeof hash === 'string') {
            if (typeof data === 'string' && data === 'REQUESTED')
                hashUI =  hash
            else
                hashUI = hash.slice(0,6)+'....'+hash.slice(-6)
        }

        const { explorerURL } = CHAINS[window.web3signer._network.chainId]
        const txLinkUI = (typeof hash === 'object') ? "" : explorerURL.replace(RegExp("/+$"), `/${hash}`)

        return (
            <div style={{ display: "inline-block" }} onClick={(e) => e.stopPropagation()} >
                    <Button
                        style={this.props.style}
                        className={_className}
                        disabled={!dataValid}
                        onClick={(e) => handleClick(contract, method, params, overrides, e)}
                    >
                    { wait && <>
                        <Spinner
                            as="span"
                            variant="light"
                            animation="border"
                            size="sm"
                            role="status"
                        />{' '}</>
                    }
                        <span className={_className}>{_RESPONSE}</span>
                    </Button>
                { hash &&
                    <div className="text-info small mt-2">TX Hash:
                        <a href={txLinkUI} target="_blank" rel="noopener noreferrer">{hashUI}</a>{' '}
                        <CopyToClipboard text={txLinkUI}>
                            <FontAwesomeIcon icon={faCopy} />
                        </CopyToClipboard>
                    </div>
                }
            </div>
        )
    }
}

type Donatificator = {
    walletConnected: boolean
}
export function Donaticator(props: Donatificator) {
    const [show, setShow] = useState(false);
    const [donateEnabled, setDonateEnabled] = useState(false);

    const [amount, setAmount] = useState("");
    const target = useRef(null) as React.RefObject<HTMLInputElement>

    const donationAddress = "0x920b96701676cdAC9e2dB0b7c2979FF2577A0FA9"

    const handleDonate = async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        e.preventDefault()
        if (isNaN(parseInt(amount))) return false
        const tx = await window.contract.transfer(donationAddress, ethers.utils.parseUnits(amount, HEX.DECIMALS))
        // TODO: say thanks (donations were disabled some time back though)
    }

    const handleDonationAmount = (e: React.FocusEvent<HTMLInputElement>)  => {
        e.preventDefault()
        setAmount((parseInt(e.target.value) || 0).toString())
    }

    const showCopied = (text: string, result: boolean): void => {
        setShow(true)
        setTimeout(() => setShow(false), 3000)
    }

    return (
        <Container className="pt-2 mt-3">
            <Card.Body className="rounded text-center text-light pb-3 mb-3">
                <img className="d-inline-block" src="/donate.toString().png" alt="donate to HEXmob" style={{ verticalAlign: "middle" }} />
                <form>
                    <h5 className="m-0">please support <strong>HEX<sup>mob</sup></strong></h5>
                    <div style={{ width: "20rem", margin: "auto" }}>
                        <CopyToClipboard text={donationAddress} onCopy={showCopied}>
                        <input
                            style={{ display: "inline-block" }}
                            name="addr"
                            type="text"
                            readOnly={true}
                            ref={target}
                            title="copy to clipboard"
                            className="donate_addr w-100 text-center btn btn-dark py-0"
                            value={donationAddress}
                        />
                        </CopyToClipboard>
                    </div>
                    { props.walletConnected &&
                    <>
                        <InputGroup style={{ maxWidth: "300px", margin: "auto" }}>
                            <Form.Control
                                as="input"
                                name="amount"
                                type="number"
                                placeholder="HEX amount"
                                htmlSize={12}
                                ref={target}
                                onBlur={ handleDonationAmount }
                                onChange={() => { setDonateEnabled(Boolean(target.current?.value.length)) }}
                            />
                            <InputGroup className="">
                                <Button
                                    variant="success" size="sm"
                                    value="donate"
                                    disabled={!donateEnabled}
                                    onClick={ handleDonate }
                                >
                                    DONATE NOW
                                </Button>
                            </InputGroup>
                        </InputGroup>
                        <div className="mt-3">{/*#7*/}
                            <Button
                                variant="info" size="sm" className="text-dark"
                                onClick={(e) => {
                                    e.preventDefault();
                                    window.open(`https://etherscan.io/address/${donationAddress}`)}
                                }
                            >
                                view donations on etherscan.io
                            </Button>
                        </div>
                    </>
                    }
                </form>
            </Card.Body>
            <Overlay target={target.current} show={show} placement="top">
                <Tooltip>
                    address copied to clipboard
                </Tooltip>
            </Overlay>
        </Container>
    )
}

export const GitHubInfo = (props: { className?: string }) => {
    const { className, ...otherProps } = props
    return (
        <Container className={"text-light text-center " + (className || "")} {...otherProps}>
            <strong>Open Source</strong> <span className="text-muted">GPLv3</span><br/>
            <a href="https://github.com/gruvin/hexmob.win" target="_blank" rel="noopener noreferrer">GitHub</a>
        </Container>
    )
}

export function MetamaskUtils(props: any) {
    const addHEXtoken = async () => {
        const tokenAddress = "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39"
        const tokenSymbol = "HEX"
        const tokenDecimals = 8
        const tokenImage = "https://ethhex.com/static/media/hex-icon.92333d74.png"

        try {
          // wasAdded is a boolean. Like any RPC method, an error may be thrown.
          const wasAdded = await window.ethereum.request({
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

          if (wasAdded) {
            console.log("Thanks for your interest!")
          } else {
            console.log("Your loss!")
          }
        } catch (error) {
          console.log(error)
        }
    }

    const addPulseChain = async () => {
        await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
                chainId: "0x3AD",
                chainName: "Pulse Chain Testnet",
                nativeCurrency: {
                    name: "Test PLS",
                    symbol: "tPLS",
                    decimals: 18
                },
                rpcUrls: [ "https://rpc.v2b.testnet.pulsechain.com/" ],
                blockExplorerUrls: [ "https://scan.v2b.testnet.pulsechain.com/" ],
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
                    <Button size="sm" onClick={addHEXtoken}>Add HEX Token</Button>
                </Col>
                <Col className="text-start">
                    <Button size="sm" onClick={addPulseChain}>Add Pulse Testnet</Button>
                </Col>
            </Row>
        </Container>
    )
}


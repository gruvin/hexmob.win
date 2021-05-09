import React, { useRef, useState } from 'react'
import { 
    Container,
    Card,
    Button,
    ButtonGroup,
    Spinner,
    Overlay,
    Tooltip,
    Badge,
    Row,
    Col
} from 'react-bootstrap'
import { BigNumber } from 'bignumber.js'
import { EventEmitter } from 'events'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons'
import { CopyToClipboard } from 'react-copy-to-clipboard'
import { cryptoFormat } from './util.js'

const debug = require('debug')('Widgets')

export const CryptoVal = (props) => {
    if (props.value === '---') return ( <>---</> )
    let v = new BigNumber(props.value) 
    if (isNaN(v)) return ( <>NaN</> )
    
    const { valueString:s, unit } = cryptoFormat(v, props.currency)
    const showUnit = props.showUnit || false

    // mute fractional part (including the period)
    const r = s.match(/^(.*)(\.\d+)(.*)$/) 
    if (r && r.length > 1)
        return ( 
            <div className={ "numeric "+props.className } >
                { r[1] } 
                <span style={{ opacity: "0.5" }}>
                    { r[2] }
                </span>
                { r[3] && r[3] }
            { showUnit && <>&nbsp;{unit}</> }
            </div>
        ) 
    else 
        return ( <div className="numeric">{s}{ showUnit && <>&nbsp;{unit}</> }</div> )
}

export const WhatIsThis = (props) => {
    const [show, setShow] = useState(false)
    const target = useRef(null)
    return (
        <>
            <span ref={target} style={{ cursor: "pointer" }} onClick={()=>setShow(!show)}>
                { props.children }
                { (props.showPill) && <sup><Badge variant="info" pill>?</Badge></sup> }
            </span>
            <Overlay 
                target={target.current} show={show}
                rootClose={true} onHide={() => setShow(false)}
                placement={props.placement || "auto"} flip
                delay={{ show: 200, hide: 400 }}
            >
                <Tooltip {...props}>
                    {props.tooltip}
                </Tooltip>
            </Overlay>
        </>
    )
}

export const BurgerHeading = (props) => {
    return (
        <div className="burger-heading">
            <img src="/hex-burger.png" alt="" />
            <span>{props.children}</span>
        </div>
    )
}

// eslint-disable-next-line
const sim = function(params) {
    return {
        send: function(options) {
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

export class VoodooButton extends React.Component {
    constructor(props) {
        super(props) 
        this.isVoodooButton = true
        this.state = {
            data: false,
            wait: false,
            hash: null,
        }
    }

    stringifyWithFunctions(object) {
        return JSON.stringify(object, (key, val) => {
            if (typeof val === 'function') 
                return '[Function: '+key+']'
            else if (typeof val === 'object')
                return '[Object: '+key+']'
            
            return val;
        });
    };

    componentDidMount = () => {
    }

    render() {
        const { 
            contract,
            method,
            params,
            options,
            inputValid,
            simulate,
            confirmationCallback,
            rejectionCallback,
            callbackArgs,
            ...other 
        } = this.props

        const dataValid = (typeof inputValid === 'undefined') ? true : inputValid

        const handleClick = async (contract, method, params, options, e ) => {
            e.preventDefault()
            e.stopPropagation()
            if (!dataValid || wait) return

            await this.setState({
                wait: true,
                data: 'requesting'
            })

            const func = simulate ? sim : contract.methods[method]
            if (window.web3 && window.web3.currentProvider && window.web3.currentProvider.isTrust) {
                debug('Sending via TrustWallet provider')
                // TrustWallet [internal browser] returns immediately, with nothing and 
                // never again :/ (See XXX notes in App.js)
                func(...params).send(options)
                setTimeout(async ()=>{
                    await this.setState({
                        data: "REQUESTED",
                        hash: "see wallet's log"
                    })
                    setTimeout(async ()=>{
                        await this.setState({ wait: false, data: false, hash: null})
                        typeof confirmationCallback === 'function' && confirmationCallback.apply(this, callbackArgs)
                        typeof rejectionCallback === 'function' && rejectionCallback.apply(this, callbackArgs)
                    }, 18008)
                }, 2000)
                return false // that's all folks
            }

            debug("contract.methods.%s(%o).send(%o)", method, params, options)
            
            func(...params).send(options)
                .once('transactionHash', (hash) => {
                    debug(`${method}::transactionHash: `, hash)
                    this.setState({ 
                        hash, 
                        data: 'confirming' 
                    })
                })
                .on('confirmation', (confirmationNumber, receipt) => {
                    debug(`${method}::confirmationNumber: %s, receipt: %O`, confirmationNumber, receipt)
                    if (this.state.wait) {
                        this.setState({
                            wait: false,
                            data: false,
                            hash: null
                        }, () => {
                            typeof confirmationCallback === 'function' && confirmationCallback.apply(this, callbackArgs)
                        })
                    }
                    this.setState({ data: confirmationNumber+1 })
                })
                .once('receipt', (receipt) => {
                    debug(`${method}::receipt: %O`, receipt)
                })
                .on('error', async (err, receipt) => { // eg. rejected or out of gas
                    debug(`${method}::error: `, err, receipt)
                    await this.setState({ data: 'rejected', wait: true })
                    setTimeout(() => {
                        this.setState({ wait: false, data: false, hash: null})
                        typeof rejectionCallback === 'function' && rejectionCallback.apply(this, callbackArgs)
                    }, 2000)
                })
                .catch( async (err, receipt) => {
                    debug(`${method}::error: `, err, receipt)
                    await this.setState({ data: 'rejected', wait: true })
                    setTimeout(() => {
                        this.setState({ wait: false, data: false, hash: null })
                        typeof rejectionCallback === 'function' && rejectionCallback.apply(this, callbackArgs)
                    }, 2000) 
                })
            return false
        }

        const { data, wait, hash } = this.state
        let _RESPONSE, _color, hashUI
        if (!wait ) { _RESPONSE = this.props.children; _color = '' }
        else if (!isNaN(parseInt(data))) { _RESPONSE = (<><span style={{fontSize: '0.9em'}}>CONFIRMED</span><sup>{data}</sup></>); _color = 'text-success' }
        else { _RESPONSE = data; _color = (_RESPONSE !== 'rejected') ? 'text-info' : 'text-danger' } 
        const _className = (other.className || '') + ` ${_color}`
        if (hash) hashUI = data === 'REQUESTED' 
            ? hash 
            : hash.slice(0,6)+'....'+hash.slice(-6)

        return (
            <div style={{ display: "inline-block" }} onClick={(e) => e.stopPropagation()} >
                    <Button {...other}
                        variant={other.variant}
                        className={_className}
                        disabled={!dataValid}
                        onClick={(e) => handleClick(contract, method, params, options, e)}
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
                    <div className="text-info small mt-2">TX Hash: <a href={'https://etherscan.io/tx/'+hash} 
                        target="_blank" rel="noopener noreferrer">{hashUI}</a>{' '}
                        <CopyToClipboard text={hash}>
                            <FontAwesomeIcon icon={faCopy} />
                        </CopyToClipboard>
                    </div>
                }
            </div>
        )
    }
}

export function Donaticator(props) {
    const [show, setShow] = useState(false);
    const [amount, setAmount] = useState("");
    const target = useRef(null);

    const handleDonate = async (e) => {
        e.preventDefault()


        if (isNaN(parseInt(amount))) return false

        const method = "transfer"
        const func = window.contract.methods[method]

        await func( "0x920b96701676cdAC9e2dB0b7c2979FF2577A0FA9", new BigNumber(amount).times(1e8).toString())
            .send({ from: props.fromAddress })
            .once('transactionHash', (hash) => debug(`${method}::txHash=${hash}`)) 
            .on('error', (err, receipt) => { // eg. rejected or out of gas
                debug(`${method}::error: `, err, receipt)
            })
            .catch((err, receipt) => {
                debug(`${method}::error: `, err, receipt)
            })
    }

    const handleDonationAmount = (e)  => {
        e.preventDefault()
        setAmount(parseInt(e.target.value) || "")
    }

    const copyDonationAddress = (e) => {
        e.preventDefault()
        const addr = document.querySelector("input.donate_addr")
        addr.select()
        document.execCommand("copy")
        document.getSelection().removeAllRanges()
        addr.blur()
        setShow(true)
        setTimeout(() => setShow(false), 1000)
    }

    return (
        <Container className="pt-2 mt-3">
            <Card.Body className="rounded text-center text-light pb-3 mb-3">
                <img className="d-inline-block" src="/donate_hex.png" alt="donate to HEXmob" style={{ verticalAlign: "middle" }} />
                <form>
                    <h5 className="m-0">please support <strong>HEX<sup>mob</sup></strong></h5>
                    <div style={{ width: "20rem", margin: "auto" }}>
                        <input
                            style={{ display: "inline-block" }}
                            name="addr"
                            type="text"
                            readOnly={true}
                            ref={target}
                            title="copy to clipboard"
                            className="donate_addr w-100 text-center btn btn-dark" 
                            value="0x920b96701676cdAC9e2dB0b7c2979FF2577A0FA9"
                            onClick={ copyDonationAddress }
                        />
                    </div>
                    { props.walletConnected && 
                    <>
                        <ButtonGroup>
                        <input
                            name="amount"
                            type="number"
                            placeholder="HEX amount" 
                            size={12} 
                            onBlur={ handleDonationAmount } 
                        />
                        <Button 
                            variant="success" size="sm"
                            value="donate"
                            onClick={ handleDonate }
                        >
                            donate
                        </Button>
                        </ButtonGroup>
                        <div className="mt-3">{/*#7*/}
                            <Button 
                                variant="info" size="sm" className="text-dark"
                                onClick={(e) => {
                                    e.preventDefault(); 
                                    window.open("https://etherscan.io/address/0x920b96701676cdAC9e2dB0b7c2979FF2577A0FA9")}
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

export const GitHubInfo = (props) => {
    return (
        <Container className="text-light text-center">
            <strong>Open Source</strong> <span className="text-muted">GPLv3</span><br/>
            <a href="https://github.com/gruvin/hexmob.win" target="_blank" rel="noopener noreferrer">GitHub</a>
        </Container>
    )
}

export function MetamaskUtils(props) {
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
        return false
        await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
                chainId: "0x38", // A 0x-prefixed hexadecimal string
                chainName: "BSC",
                nativeCurrency: {
                    name: "Pulse Chain [placeholder]",
                    symbol: "BNB", // 2-6 characters long
                    decimals: 18
                },
                rpcUrls: [ "https://bsc-dataseed.binance.org/" ],
                blockExplorerUrls: [ "https://bscscan.com" ],
                iconUrls: [] // Currently ignored.
            }]
        })
    }

    return (
        <Container className="text-light text-center pt-2 m-3">
            <Row className="mb-3">
                <Col className="col-12">
                    <h4>Metamask Helpers</h4>
                </Col>
                <Col className="text-right">
                    <Button size="small" className="" onClick={addHEXtoken}>Add HEX Token</Button>
                </Col>
                <Col className="text-left">
                    <Button size="small" onClick={addPulseChain}>Add Pulse Mainnet</Button>
                </Col>
            </Row>
        </Container>
    )
}


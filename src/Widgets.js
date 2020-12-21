import React, { useRef, useState } from 'react'
import { 
    Container,
    Card,
    Button,
    Spinner,
    Overlay,
    Tooltip,
    Badge
} from 'react-bootstrap'
import './App.scss'
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
    
    let { valueString:s, unit } = cryptoFormat(v, props.currency)

    // mute fractional part (including the period)
    const r = s.match(/^(.*)(\.\d+)(.*)$/) 
    if (r && r.length > 1)
        return ( 
            <div className="numeric" {...props}>
                { r[1] } 
                <span style={{ opacity: "0.5" }}>
                    { r[2] }
                </span>
                { r[3] && r[3] }
            { props.showUnit && <>&nbsp;{unit}</> }
            </div>
        ) 
    else 
        return ( <div className="numeric">{s}{ props.showUnit && <>&nbsp;{unit}</> }</div> )
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
        const { contract, method, params, options, inputValid, simulate, confirmationCallback, callbackArgs, ...other } = this.props
        const dataValid = (typeof inputValid === 'undefined') ? true : inputValid

        const handleClick = async (contract, method, params, options, e ) => {
            e.preventDefault()
            e.stopPropagation()
            if (!dataValid || wait) return

            await this.setState({
                wait: true,
                data: 'sending'
            })

            const func = simulate ? sim : contract.methods[method]
            if (window.web3 && window.web3.currentProvider && window.web3.currentProvider.isTrust) {
                debug('Sending via TrustWallet provider')
                // TrustWallet [internal browser] returns immediately, with nothing and 
                // never again :/ (See XXX notes in App.js)
                func(...params).send(options)
                setTimeout(async ()=>{
                    await this.setState({
                        data: 'REQUESTED',
                        hash: 'see Wallet log'
                    })
                    setTimeout(async ()=>{
                        await this.setState({ wait: false, data: false, hash: null})
                        typeof confirmationCallback === 'function' && confirmationCallback()
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
                            if (typeof confirmationCallback === 'function') confirmationCallback.apply(this, callbackArgs)
                        })
                    }
                    this.setState({ data: confirmationNumber+1 })
                })
                .once('receipt', (receipt) => {
                    debug(`${method}::receipt: %O`, receipt)
                })
                .on('error', async (err, receipt) => { // eg. rejected or out of gas
                    debug(`${method}::error: `, err, receipt)
                    await this.setState({ 
                        data: 'rejected',
                        wait: false
                    })
                    setTimeout(() => {
                        this.setState({ wait: false, data: false, hash: null})
                    }, 3000)
                })
                .catch( async (err, receipt) => {
                    debug(`${method}::error: `, err, receipt)
                    await this.setState({ 
                        data: 'rejected',
                        wait: false
                    })
                    setTimeout(() => this.setState({ 
                        wait: false, data: false, hash: null
                    }), 3000) 
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

        await func( "0xD30542151ea34007c4c4ba9d653f4DC4707ad2d2", new BigNumber(amount).times(1e8).toString())
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
                            name="addr"
                            type="text"
                            readonly="true"
                            ref={target}
                            className="donate_addr w-100 text-center btn btn-dark" 
                            title="copy to clipboard"
                            value="0xD30542151ea34007c4c4ba9d653f4DC4707ad2d2"
                            onClick={ copyDonationAddress }
                        />
                    </div>
                    { props.walletConnected && 
                    <>
                        <input
                            name="amount"
                            type="number"
                            placeholder="HEX amount" 
                            size={12} 
                            onBlur={ handleDonationAmount } 
                        />
                        <Button 
                            variant="success" className="ml-1 py-1"
                            value="donate"
                            onClick={ handleDonate }
                        >
                            donate now
                        </Button>
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

import React from 'react'
import { 
    Button,
    Spinner,
    OverlayTrigger,
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
debug('loading')

export const CryptoVal = (props) => {
    if (props.value === '---') return ( <>---</> )
    let v = new BigNumber(props.value) 
    if (isNaN(v)) return ( <>NaN</> )
    
    const { valueString:s, unit } = cryptoFormat(v, props.currency)

    // mute fractional part (including the period)
    const r = s.match(/^(.*)(\.\d+)(.*)$/) 
    if (r && r.length > 1)
        return ( 
            <div className="numeric">
                { r[1] } 
                <span style={{ opacity: "0.5" }}>
                    { r[2] }
                </span>
                { r[3] && r[3] }
                { props.showUnit && unit }
            </div>
        ) 
        else 
            return ( <div className="numeric">{s}{ props.showUnit && unit}</div> )
}

export const WhatIsThis = (props) => {
    return (
        <OverlayTrigger
            show={true}
            placement={props.placement || "auto"}
            overlay={
                <Tooltip>
                    {props.children}
                </Tooltip>
            }
        >
            <sup><Badge variant="info" pill>?</Badge></sup>
        </OverlayTrigger>
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
        const { contract, method, params, options, inputValid, simulate, confirmationCallback, ...other } = this.props
        const dataValid = (typeof inputValid === 'undefined') ? true : inputValid

        const handleClick = async (contract, method, params, options, e ) => {
            e.preventDefault()
            e.stopPropagation()
            if (!dataValid) return

            await this.setState({
                wait: true,
                data: 'sending'
            })

            const func = simulate ? sim : contract.methods[method]
            debug('CONTRACT SEND: %s(%O).send(%O)', method, params, options)
            if (window.web3 && window.web3.currentProvider && window.web3.currentProvider.isTrust) {
                debug('Sending via TrustWallet provider')
                // TrustWallet returns immediately, with nothing and 
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
            func(...params).send(options)
                .once('transactionHash', (hash) => {
                    debug('endStake::transactionHash: ', hash)
                    this.setState({ 
                        hash, 
                        data: 'confirming' 
                    })
                })
                .on('confirmation', (confirmationNumber, receipt) => {
                    debug('endStake::confirmationNumber: %s, receipt: %O', confirmationNumber, receipt)
                    if (typeof confirmationCallback === 'function') {
                        this.setState({
                            wait: false,
                            data: false,
                            hash: null
                        }, confirmationCallback)
                    } else {
                        this.setState({ data: confirmationNumber })
                    }
                })
                .once('receipt', (receipt) => {
                    debug('endStake::receipt: %O', receipt)
                })
                .once('error', async (err, receipt) => { // eg. rejected or out of gas
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
        if (data === false) { _RESPONSE = this.props.children; _color = '' }
        else if (parseInt(data)) { _RESPONSE = (<><span style={{fontSize: '0.9em'}}>CONFIRMED</span><sup>{data}</sup></>); _color = 'text-success' }
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

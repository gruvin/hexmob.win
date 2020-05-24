import React from 'react'
import { 
    Button,
    Spinner,
    OverlayTrigger,
    Tooltip,
    Badge
} from 'react-bootstrap'
import './Stakes.scss'
import { BigNumber } from 'bignumber.js'
import { format } from 'd3-format' // gives us Intl for free
import { EventEmitter } from 'events'
const debug = require('debug')('Widgets')

export const CryptoVal = (props) => {
    let v = new BigNumber(props.value) 
    if (isNaN(v)) return ( <>NaN</> )

    let unit = ' HEX'
    let s
    switch (props.currency) {
        case 'ETH':
            unit = ' ETH'
            if (v.isZero())         s = '0.000'
            else if (v.lt( 1e3))    { unit = ' wei'; s = format(',')(v) }
            else if (v.lt( 1e6))    { unit = ' wei'; s = format(',.0f')(v) }
            else if (v.lt( 1e9))    { unit = ' Gwei'; s = format(',.3f')(v.div( 1e09).toFixed(3, 1)) }
            else if (v.lt(1e12))    { unit = ' Gwei'; s = format(',.0f')(v.div( 1e09).toFixed(0, 1)) }
            else if (v.lt(1e15))    s = format(',.3f')(v.div( 1e12).toFixed(3, 1))+'μ'
            else if (v.lt(1e18))    s = format(',.3f')(v.div( 1e15).toFixed(3, 1))+'m'
            else if (v.lt(1e21))    s = format(',.3f')(v.div( 1e18).toFixed(3, 1))
            else if (v.lt(1e24))    s = format(',.0f')(v.div( 1e18).toFixed(0, 1))
            else if (v.lt(1e27))    s = format(',.3f')(v.div( 1e21).toFixed(3, 1))+'M'
            else                    s = format(',.0f')(v.div( 1e21).toFixed(0, 1))+'M'
            break
        default:
            if (v.isZero())         s = '0.000'
            else if (v.lt(1e5))     { unit = ' Hearts'; s = format(',')(v) }
            else if (v.lt(1e11))    s = format(',')(v.div( 1e08).toFixed(3, 1))
            else if (v.lt(1e14))    s = format(',')(v.div( 1e08).toFixed(0, 1))
            else if (v.lt(1e17))    s = format(',.3f')(v.div( 1e14).toFixed(3, 1))+'M'
            else if (v.lt(1e20))    s = format(',.3f')(v.div( 1e17).toFixed(3, 1))+'B'
            else if (v.lt(1e23))    s = format(',.3f')(v.div( 1e20).toFixed(3, 1))+'T'
            else                    s = format(',.0f')(v.div( 1e20).toFixed(0, 1))+'T'
    }

    // fade fractional part (including the period)
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
        const { contract, method, params, from, simulate, confirmationCallback, ...other } = this.props
        const dataValid = this.props.hasOwnProperty('dataValid') ? this.props.dataValid : true

        const handleClick = async (contract, method, params, from, e ) => {
            e.preventDefault()

            await this.setState({
                wait: true,
                data: 'sending'
            })

            const func = simulate ? sim : contract.methods[method]
            if (window.web3.currentProvider.isTrust) {
                // TrustWallet returns immediately, with nothing and 
                // never again :/ (See XXX notes in App.js)
                func(...params).send({from: from })
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
                return // that's all folks
            }
            func(...params).send({from: from })
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
                    debug('endStake::error: ', receipt)
                    await this.setState({ 
                        data: 'rejected',
                        wait: false
                    })
                    setTimeout(() => {
                        this.setState({ wait: false, data: false, hash: null})
                    }, 3000)
                })
                .catch( async (err, receipt) => {
                    debug('endStake::error: ', receipt)
                    await this.setState({ 
                        data: 'rejected',
                        wait: false
                    })
                    setTimeout(() => this.setState({ 
                        wait: false, data: false, hash: null
                    }), 3000) 
                })
        }

        const { data, wait, hash } = this.state
        let _RESPONSE, _color, hashUI
        if (data === false) { _RESPONSE = this.props.children; _color = '' }
        else if (parseInt(data)) { _RESPONSE = (<><span style={{fontSize: '0.9em'}}>CONFIRMED</span><sup>{data}</sup></>); _color = 'text-success' }
        else { _RESPONSE = data; _color = (_RESPONSE !== 'rejected') ? 'text-info' : 'text-danger' } 
        if (hash) hashUI = data === 'REQUESTED' ? hash : hash.slice(0,6)+'....'+hash.slice(-6) 
        const _className = `${other.className} ${_color}` || ''

        return (
            <>
                <Button {...other}
                    variant={other.variant}
                    className={_className}
                    disabled={!dataValid}
                    onClick={!wait ? (e) => handleClick(contract, method, params, from, e) : null}
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
                { hash && <div className="text-info small mt-2">TX Hash: <a href={'https://etherscan.io/tx/'+hash} 
                    target="_blank" rel="noopener noreferrer">{hashUI}</a></div>
                }
            </>
        )
    }
}

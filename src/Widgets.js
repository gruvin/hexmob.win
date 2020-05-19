import React, { useState } from 'react'
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

export const HexNum = (props) => {
    let v = new BigNumber(props.value) 
    if (isNaN(v)) return ( <>NaN</> )

    let unit = ' HEX'
    let s
    if (v.isZero())         s = '0.000'
    else if (v.lt(1e5))     { unit = ' Hearts'; s = format(',')(v) }
    else if (v.lt(1e11))    s = format(',')(v.div( 1e08).toFixed(3, 1))
    else if (v.lt(1e14))    s = format(',')(v.div( 1e08).toFixed(0, 1))
    else if (v.lt(1e17))    s = format(',.3f')(v.div( 1e14).toFixed(3, 1))+'M'
    else if (v.lt(1e20))    s = format(',.3f')(v.div( 1e17).toFixed(3, 1))+'B'
    else if (v.lt(1e23))    s = format(',.3f')(v.div( 1e20).toFixed(3, 1))+'T'
    else                    s = format(',.0f')(v.div( 1e20).toFixed(0, 1))+'T'

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
        <div className="burger" style={{ display: "inline-block" }}>
            <img src="/hex-burger.png" alt="" style={{ height: "1.4em", display: "inline-block", verticalAlign: "middle", margin: "0 6px 0 0" }} />
            <span style={{ verticalAlign: "middle", fontSize: "1.4em" }}>{props.children}</span>
        </div>
    )
}

// eslint-disable-next-line
const sim = function(p0, p1) {
    return {
        send: function(options) {
            var ee = new EventEmitter();
            const delay = 1000
            var count = 0
            setTimeout(() => {
                ee.emit('transactionHash', '0x5928acffbb00f86e055a3fb0ae85c87fefa86f0a72cdecca1fd6e4676460b206')
                setInterval(() => (++ count < 4) && ee.emit('confirmation', count, '#simulated_recipt#'), delay*2)
            }, delay)
            setTimeout(() => ee.emit('receipt', '#simulated_receipt# !!!=> '+JSON.stringify([p0, p1, options])), delay * 10 )
            setTimeout(() => ee.emit('error', '#simulated_receipt#'), delay * 12.5)
            return ee;
        }
    }
}

export const VoodooButton = (props) => {
    const { contract, method, params, from, simulate, ...other } = props
    const [data, setData] = useState(false);
    const [wait, setWait] = useState(false);
    const [hash, setHash] = useState(null);

    const handleClick = (contract, method, params, from, e ) => {
        e.preventDefault()

        setWait(true)
        setData('sending')
        const func = simulate ? sim : contract.methods[method]
        const [ p0, p1 ] = params
        func(p0, p1).send({from: from })
            .once('transactionHash', (hash) => {
                debug('endStake::transactionHash: ', hash)
                setHash(hash)
                setData('accepted')
            })
            .on('confirmation', (confirmationNumber, receipt) => {
                debug('endStake::confirmationNumber: %s, receipt: %O', confirmationNumber, receipt)
                setWait(false)
                setData(confirmationNumber)
            })
            .once('receipt', (receipt) => {
                debug('endStake::receipt: %O', receipt)
            })
            .once('error', (receipt) => { // eg. rejected or out of gas
                debug('endStake::error: ', receipt)
                setData('rejected')
                setWait(false)
            })
    }

    let response, variant, hashUI
    if (data === false) { response = props.children; variant = "primary" }
    else if (parseInt(data)) { response = (<><span style={{fontSize: "0.9em"}}>CONFIRMED</span><sup>{data}</sup></>); variant = "success" }
    else { response = data; variant = (response !== 'rejected') ? "info" : "danger" } 
    if (hash) hashUI = hash.slice(0,6)+'....'+hash.slice(-6) 

    return (
        <>
        <Button {...other}
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
        <span className={'text-'+variant}>{response}</span>
        </Button>
        { hash && <div className="text-info small">TX Hash: <a href={'https://etherscan.io/tx/'+hash} 
            target="_blank" rel="noopener noreferrer">{hashUI}</a></div>
        }
        </>
    );

}

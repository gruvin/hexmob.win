import React from 'react'
import { 
    OverlayTrigger,
    Tooltip,
    Badge
} from 'react-bootstrap'
import './Stakes.scss'
import { BigNumber } from 'bignumber.js'
import { format } from 'd3-format' // gives us Intl for free

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

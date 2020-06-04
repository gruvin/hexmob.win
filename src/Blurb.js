import React from 'react'
import { 
    Container,
    Row,
    Col,
    Image
} from 'react-bootstrap'

const Blurb = () => {
    return (
        <Container fluid id="mobile_devices" className="bg-light text-dark rounded p-3 my-3 overflow-hidden text-left">
            <Container fluid className="my-3" id="mobile_trust_wallet">
                <Row>
                    <Col className="text-center">
                        <h3 className="text-muted">HEX<sup>mob.win</sup></h3>
                        <h2>“a mobile friendly <a href="https://go.hex.win?r=0xd30542151ea34007c4c4ba9d653f4dc4707ad2d2">go.hex.win</a>”</h2>
                        <p className="text-muted">independent community project</p>
                        <p className="m-0"><small><small>COMPATIBLE WALLETS INCLUDE ...</small></small></p>
                        <p>
                            <Image src="/mm-wordmark.svg" alt="Metamask" height={96} /><br />
                            for <strong>PCs and Notebooks</strong>
                        </p>
                    </Col>
                </Row>
                <Row className="h-100">
                    <Col xs={12} sm={5} className="text-right">
                    <img className="d-none d-sm-inline-block"
                        style={{ maxWidth: "90%", maxHeight: "460px" }}
                        alt="TrustWallet on iPhone11"
                        src="/trustwallet-iphone11.png"
                    />
                    <Image className="d-block d-sm-none"
                        style={{ maxWidth: "100%" }}
                        alt="TrustWallet on iPhone11"
                        src="/trustwallet-iphone11-cropped.png"
                    />
                    </Col>
                    <Col xs={12} sm={7} className="py-3 text-center text-sm-left m-auto allign-middle">
                        <p>
                            <Image src="/imToken-logo.png" alt="imToken Wallet" with={217} height={40} />
                        </p>
                        <p>
                            for <strong>Mobile Devices</strong>
                        </p>
                        <p>
                            imToken is a world-renowned mobile light wallet for
                            digital asset management.
                        </p>
                        <p><a href="https://token.im">Click here to learn more</a></p>
                    </Col>
                </Row>
            </Container>
            <Container>
                <hr/>
            </Container>
            <Container fluid className="my-3" id="mobile_wallet_connect">
                <Row className="h-100">
                    <Col>
                        <h2 className="text-center text-sm-left"><img width={120} src="/walletconnect.svg" alt="" /> WalletConnect</h2>
                        <blockquote className="blockquote">
                            <p className="mb-0">Opening up a whole world of Dapps that were once only available to Metamask.</p>
                            <footer className="blockquote-footer">What is WalletConnect? 
                                <cite title="walletconnect.org">
                                    <a href="walletconnect.org">walletconnect.org</a>
                                </cite>
                            </footer>
                        </blockquote>
                        <p>
                            WalletConnect is integrated into many popular mobie
                            wallets including 
                            {' ' }<a href="https://trustwallet.com">TrustWallet</a>, 
                            {' ' }<a href="https://mobile.metamask.io">Metamask</a>,
                            {' ' }<a href="https://www.argent.xyz">Argent</a>,
                            {' ' }<a href="https://atomicwallet.io">Atomic</a>,
                            {' ' }<a href="https://authereum.org/">Authereum</a>
                            {' ' }and more.
                        </p>
                        <hr/>
                    </Col>
                </Row>
                <Row>
                    <Col>
                        <h5>To use WalletConnect on the <em><strong>same device</strong></em> ...</h5>
                        <ol>
                            <li>take a screenshot of the QR code</li>
                            <li>point WalletConnect wallet to that image</li>
                        </ol>
                    </Col>
                    <Col xs={12} sm={3} className="text-center">
                        <img style={{ maxWidth: "90%", maxHeight: "300px" }} src="/wc-qr-example.png" alt="QR code example" />
                    </Col>
                </Row>
            </Container>
        </Container>
    )
}

export default Blurb

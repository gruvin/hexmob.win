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
                        <h1>HEX<sup>mob.win</sup></h1>
                        <h2>“a mobile friendly <a href="https://go.hex.win?r=0xd30542151ea34007c4c4ba9d653f4dc4707ad2d2">go.hex.win</a>”</h2>
                        <h4>independent community dev project</h4>
                        <p><small><small>COMPATIBLE WALLETS INCLUDE ...</small></small></p>
                        <p>
                            <Image src="/mm-wordmark.svg" alt="Metamask" height={96} /><em>on</em> <strong>Desktops</strong>
                        </p>
                        <p>
                            <Image src="/trustwallet-logo.png" alt="Trust Wallet" height={64} /><em> on </em><strong>Mobile</strong>
                            </p>
                        <p>
                            HEX<sup>mob.win</sup> runs mobile dApp browsers. We recommend  TokenIm.
                        </p>
                    </Col>
                </Row>
                <Row className="h-100">
                    <Col xs={12} sm={5}>
                    <img className="d-none d-sm-block"
                        style={{ maxWidth: "90%" }}
                        alt="TrustWallet on iPhone11"
                        src="/trustwallet-iphone11.png"
                    />
                    <img className="d-block d-sm-none"
                        style={{ maxWidth: "100%" }}
                        alt="TrustWallet on iPhone11"
                        src="/trustwallet-iphone11-cropped.png"
                    />
                    </Col>
                    <Col xs={12} sm={7} className="py-3 text-center text-sm-left m-auto allign-middle">
                        <h3>Get&nbsp;Trust&nbsp;Wallet</h3>
                        <div>
                            <div className="m-3 d-inline-block">
                                <a href="https://apps.apple.com/app/trust-ethereum-wallet/id1288339409">
                                    <Image src="/dltw-appstore.png" height={56} alt="Download on the App Store" />
                                </a>
                            </div>
                            <div className="m-3 d-inline-block">
                                <a href="https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp">
                                    <Image src="/dltw-googleplay.png" height={56} alt="Get it at Google Play" />
                                </a>
                            </div>
                            <div className="m-3 d-inline-block">
                                <a href="https://trustwallet.com/dl/apk">
                                    <Image src="/dltw-android.png" height={56} alt="Download for Android ARK" />
                                </a>
                            </div>
                        </div>
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
                        <blockquote class="blockquote">
                            <p class="mb-0">Opening up a whole world of Dapps that were once only available to Metamask.</p>
                            <footer class="blockquote-footer">What is WalletConnect? 
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

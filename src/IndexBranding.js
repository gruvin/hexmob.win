import React from 'react';
import { Helmet } from 'react-helmet';

const IndexBranding = () => {
    // https://www.favicon-generator.org/

    return (window.location.hostname === "go.tshare.app") ? <Helmet>
        <title>HEX Stakes UI — TShare.App</title>
        <meta name="description" content="TShare.app's alternative go.hex.com UI designed for Mobile" />
       
        <link rel="apple-touch-icon" sizes="57x57" href="/tsa/apple-icon-57x57.png" />
        <link rel="apple-touch-icon" sizes="60x60" href="/tsa/apple-icon-60x60.png" />
        <link rel="apple-touch-icon" sizes="72x72" href="/tsa/apple-icon-72x72.png" />
        <link rel="apple-touch-icon" sizes="76x76" href="/tsa/apple-icon-76x76.png" />
        <link rel="apple-touch-icon" sizes="114x114" href="/tsa/apple-icon-114x114.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/tsa/apple-icon-120x120.png" />
        <link rel="apple-touch-icon" sizes="144x144" href="/tsa/apple-icon-144x144.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/tsa/apple-icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/tsa/apple-icon-180x180.png" />

        <link rel="icon" type="image/png" sizes="192x192" href="/tsa/android-icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/tsa/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="96x96" href="/tsa/favicon-96x96.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/tsa/favicon-16x16.png" />
        <link rel="manifest" href="/tsa/manifest.json" />

        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="msapplication-TileImage" content="/tsa/ms-icon-144x144.png" />
        <meta name="theme-color" content="#ffffff" />

        <meta name="twitter:image:src" content="https://go.tshare.app/tsa/og-image-01.png" />
        <meta name="twitter:site" content="@tshareapp" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="go.TShare.App — Join the Staker Class™" />
        <meta name="twitter:description" content="The only truly decetralized, high yield, interest bearing crypto asset — HEX.COM for details" />

        <meta property="og:image" content="https://go.tshare.app/tsa/og-image-01.png" />
        <meta property="og:site_name" content="go.hare.app" />
        <meta property="og:type" content="object" />
        <meta property="og:title" content="Truly Decentralized Interest Bearing Asset" />
        <meta property="og:url" content="https://go.tshare.app" />
        <meta property="og:description" content="The only truly decetralized, high yield, interest bearing crypto asset — HEX.COM for details" />

    </Helmet> : <Helmet>

        <title>HEXmob™ Staker™</title>
        <meta name="description" content="TShare.app's alternative go.hex.com UI designed for Mobile" />

        <link rel="apple-touch-icon" sizes="57x57" href="/hexmob/apple-icon-57x57.png" />
        <link rel="apple-touch-icon" sizes="60x60" href="/hexmob/apple-icon-60x60.png" />
        <link rel="apple-touch-icon" sizes="72x72" href="/hexmob/apple-icon-72x72.png" />
        <link rel="apple-touch-icon" sizes="76x76" href="/hexmob/apple-icon-76x76.png" />
        <link rel="apple-touch-icon" sizes="114x114" href="/hexmob/apple-icon-114x114.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/hexmob/apple-icon-120x120.png" />
        <link rel="apple-touch-icon" sizes="144x144" href="/hexmob/apple-icon-144x144.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/hexmob/apple-icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/hexmob/apple-icon-180x180.png" />

        <link rel="icon" type="image/png" sizes="192x192"  href="/hexmob/android-icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/hexmob/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="96x96" href="/hexmob/favicon-96x96.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/hexmob/favicon-16x16.png" />
        <link rel="manifest" href="/hexmob/manifest.json" />

        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="msapplication-TileImage" content="/hexmob/ms-icon-144x144.png" />
        <meta name="theme-color" content="#ffffff" />

        <meta name="twitter:image:src" content="https://hexmob.win/hexmob/og-image-12.png" />
        <meta name="twitter:site" content="@hexmobwin" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="HEXmob.win — BUILD WEALTH — Join the Staker Class™" />
        <meta name="twitter:description" content="Join the Staker Class™ — Sustainable Trustless Wealth for the Crypto Wise" />

        <meta property="og:image" content="https://hexmob.win/hexmob/og-image-13.png" />
        <meta property="og:site_name" content="HEXmob.win" />
        <meta property="og:type" content="object" />
        <meta property="og:title" content="Join the Staker Class™ — Sustainable Trustless Wealth for the Crypto Wise" />
        <meta property="og:url" content="https://hexmob.win" />
        <meta property="og:description" content="The only truly decetralized, interest bearing crypto asset — HEX.COM for details" />
        
        <meta name="theme-color" content="#aa66dd" />
    </Helmet>
}

export default IndexBranding
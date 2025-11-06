const branding = () => {
    if (window.hostIsHM) {
        // HEXMOB.win branding
        return (
            <div id="branding">
                <h1 id="header_logo">HEX<sup className="text-muted small">mob.win</sup></h1>
            </div>
        )
    } else {
        // go.tshare.app branding
        return (
            <div id="branding" style={{ display: 'flex', alignItems: 'center', gap: '0.2em' }}>
                <h1 id="header_logo">GO</h1>
                <div className="text-muted small" style={{ textAlign: 'right', lineHeight: '0.8em' }}>
                    .tshare<br/>.app
                </div>
            </div>
        )
    }
}
export default branding
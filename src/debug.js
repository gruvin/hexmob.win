const createDebug = require('debug')

const debug_panel = (...args) => {
    let output
    try {
        output = JSON.stringify(args).slice(1,-1)
    } catch(e) { output=`"${args[0]} [msg contains circular object]"` }
    const el = document.getElementById('HM_DEBUG')
    if (el) el.innerText += output+"\n"
}

module.exports = (namespace) => {
    const stdDebug = createDebug(namespace)
    const monoDebug = createDebug(namespace)
    monoDebug.useColors = false
    monoDebug.log = debug_panel
    
    return function(...args) {
        stdDebug.call(null, ...args)
        monoDebug.call(null, ...args)
    }
}
 


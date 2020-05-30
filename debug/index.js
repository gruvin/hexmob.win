var http = require('http');

http.createServer(function (req, res) {
    const s = decodeURI(req.url.slice(1))
    try {
        const d = JSON.parse(s);
        console.log(d);
    } catch(e) {console.log(s)}
    res.end();
}).listen(8080);



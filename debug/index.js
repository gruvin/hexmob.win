var http = require('http');

http.createServer(function (req, res) {
    try {
        const d = JSON.parse(decodeURI(req.url.slice(1)));
        d && console.log(d);
    } catch(e) {}
    res.end();
}).listen(8080);



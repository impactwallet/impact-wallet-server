/* eslint-disable */
var http = require('http');
var httpProxy = require('http-proxy');
var fs = require('fs');

var proxy = httpProxy.createProxyServer({ ws: true });

const options = {
  key: fs.readFileSync('/Users/antonpash/development/impact_wallet/server/server.key'),
  cert: fs.readFileSync('/Users/antonpash/development/impact_wallet/server/server.cert'),
};

const server = http.createServer(options, function (req, res) {
  const port = req.url.startsWith('/api') ? 9898 : 10001;
  req.url = req.url.replace(/^\/api/, '');
  proxy.web(req, res, { target: `http://0.0.0.0:${port}` });
});

server.on('upgrade', function (req, socket, head) {
  proxy.ws(req, socket, head, { target: 'ws://0.0.0.0:10001' });
});

server.listen(10000);
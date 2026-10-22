'use strict';

const http = require('http');
const net = require('net');
const dns = require('dns');
const { WebSocket, WebSocketServer, createWebSocketStream } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_RELAY_PATH = String(process.env.PUBLIC_RELAY_PATH || '').trim();
const ORIGIN_CONNECT_HOST = String(process.env.ORIGIN_CONNECT_HOST || '').trim();
const ORIGIN_PORT = Number(process.env.ORIGIN_PORT || 443);
const ORIGIN_SERVERNAME = String(process.env.ORIGIN_SERVERNAME || '').trim();
const ORIGIN_PATH = String(process.env.ORIGIN_PATH || '').trim();
const ORIGIN_CA_PEM_B64 = String(process.env.ORIGIN_CA_PEM_B64 || '').trim();
const BUILD = 'parspack-direct-v1.2';
const MAX_WS = 1024 * 1024;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function validPath(value) {
  return value.startsWith('/') && value.length > 8 && !value.includes('?') && !value.includes('#');
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) fail('invalid PORT');
if (!validPath(PUBLIC_RELAY_PATH)) fail('PUBLIC_RELAY_PATH is required');
if (!ORIGIN_CONNECT_HOST || ORIGIN_CONNECT_HOST.length < 3) fail('ORIGIN_CONNECT_HOST is required');
if (!Number.isInteger(ORIGIN_PORT) || ORIGIN_PORT < 1 || ORIGIN_PORT > 65535) fail('invalid ORIGIN_PORT');
if (!ORIGIN_SERVERNAME || ORIGIN_SERVERNAME.length < 8) fail('ORIGIN_SERVERNAME is required');
if (!validPath(ORIGIN_PATH)) fail('ORIGIN_PATH is required');
if (!ORIGIN_CA_PEM_B64) fail('ORIGIN_CA_PEM_B64 is required');

let ORIGIN_CA;
try {
  ORIGIN_CA = Buffer.from(ORIGIN_CA_PEM_B64, 'base64').toString('utf8');
  if (!ORIGIN_CA.includes('BEGIN CERTIFICATE')) throw new Error('bad ca');
} catch {
  fail('ORIGIN_CA_PEM_B64 is invalid');
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const body = Buffer.from(JSON.stringify({
      ok: true,
      build: BUILD,
      relayConfigured: true,
      originTlsPinned: true
    }));
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': String(body.length),
      'cache-control': 'no-store'
    });
    return res.end(body);
  }

  res.writeHead(404, {
    'content-length': '0',
    'cache-control': 'no-store'
  });
  res.end();
});

const relayWss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
  clientTracking: false,
  maxPayload: MAX_WS
});

function tune(socket) {
  try { socket.setNoDelay(true); } catch {}
  try { socket.setKeepAlive(true, 30000); } catch {}
}

function reject(socket, status = '404 Not Found') {
  try {
    socket.end(
      'HTTP/1.1 ' + status + '\r\n' +
      'Connection: close\r\n' +
      'Content-Length: 0\r\n\r\n'
    );
  } catch {
    try { socket.destroy(); } catch {}
  }
}

function bridge(clientStream, backendStream, closeAll) {
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    closeAll();
  };

  clientStream.on('error', closeOnce);
  backendStream.on('error', closeOnce);
  clientStream.once('close', closeOnce);
  backendStream.once('close', () => {
    if (!backendStream.readableEnded) closeOnce();
  });

  clientStream.pipe(backendStream);
  backendStream.pipe(clientStream);
}

function openBackend() {
  const authority = ORIGIN_PORT === 443
    ? ORIGIN_SERVERNAME
    : ORIGIN_SERVERNAME + ':' + ORIGIN_PORT;

  return new WebSocket('wss://' + authority + ORIGIN_PATH, {
    perMessageDeflate: false,
    handshakeTimeout: 15000,
    maxPayload: MAX_WS,
    servername: ORIGIN_SERVERNAME,
    rejectUnauthorized: true,
    ca: ORIGIN_CA,
    lookup: (_hostname, options, callback) => {
      const family = net.isIP(ORIGIN_CONNECT_HOST);
      if (family) return callback(null, ORIGIN_CONNECT_HOST, family);
      dns.lookup(ORIGIN_CONNECT_HOST, { family: options && options.family ? options.family : 0 }, callback);
    }
  });
}

server.on('upgrade', (req, socket, head) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://relay.local').pathname;
  } catch {
    return socket.destroy();
  }

  if (pathname !== PUBLIC_RELAY_PATH) return reject(socket);

  let client;
  let clientStream;
  let backendStream;
  let closed = false;
  const backend = openBackend();

  const closeAll = () => {
    if (closed) return;
    closed = true;
    try { clientStream && clientStream.destroy(); } catch {}
    try { backendStream && backendStream.destroy(); } catch {}
    try { client && client.terminate(); } catch {}
    try { backend.terminate(); } catch {}
    try { if (!client) socket.destroy(); } catch {}
  };

  backend.once('open', () => {
    try { tune(backend._socket); } catch {}

    try {
      relayWss.handleUpgrade(req, socket, head, (ws) => {
        client = ws;
        try { tune(ws._socket); } catch {}

        clientStream = createWebSocketStream(ws, {
          encoding: null,
          highWaterMark: 1024 * 1024
        });
        backendStream = createWebSocketStream(backend, {
          encoding: null,
          highWaterMark: 1024 * 1024
        });

        bridge(clientStream, backendStream, closeAll);
      });
    } catch {
      closeAll();
    }
  });

  backend.once('error', () => {
    if (!client) reject(socket, '502 Bad Gateway');
    closeAll();
  });

  socket.once('error', closeAll);
  socket.once('close', () => {
    if (!client) closeAll();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(BUILD + ' listening on port ' + PORT);
});

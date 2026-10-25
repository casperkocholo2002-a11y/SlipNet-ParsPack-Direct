'use strict';

const http = require('http');
const { WebSocket, WebSocketServer, createWebSocketStream } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_RELAY_PATH = String(
  process.env.PUBLIC_RELAY_PATH ||
  '/p/92943149c56048dda2b2123e591f9e7de9d79ae7d0d086db'
).trim();

const ECH_RELAY_HOST = String(process.env.ECH_RELAY_HOST || '').trim();
const ECH_RELAY_PATH = String(
  process.env.ECH_RELAY_PATH ||
  '/p/92943149c56048dda2b2123e591f9e7de9d79ae7d0d086db'
).trim();

const BUILD = 'parspack-route1-ech-ingress-v1';
const MAX_WS = 1024 * 1024;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function validPath(value) {
  return value.startsWith('/') &&
    value.length > 8 &&
    !value.includes('?') &&
    !value.includes('#');
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) fail('invalid PORT');
if (!validPath(PUBLIC_RELAY_PATH)) fail('PUBLIC_RELAY_PATH is required');
if (!ECH_RELAY_HOST || ECH_RELAY_HOST.includes('/') || ECH_RELAY_HOST.includes('://')) {
  fail('ECH_RELAY_HOST is required as a bare hostname');
}
if (!validPath(ECH_RELAY_PATH)) fail('ECH_RELAY_PATH is required');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const body = Buffer.from(JSON.stringify({
      ok: true,
      build: BUILD,
      mode: 'stable-ingress-to-ech-relay',
      ech_required: true
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

server.on('upgrade', (req, socket, head) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://relay.local').pathname;
  } catch {
    return socket.destroy();
  }

  if (pathname !== PUBLIC_RELAY_PATH) return reject(socket);

  const upstream = new WebSocket(
    'wss://' + ECH_RELAY_HOST + ECH_RELAY_PATH,
    {
      perMessageDeflate: false,
      handshakeTimeout: 15000,
      maxPayload: MAX_WS
    }
  );

  let client;
  let clientStream;
  let upstreamStream;
  let closed = false;

  const closeAll = () => {
    if (closed) return;
    closed = true;
    try { clientStream && clientStream.destroy(); } catch {}
    try { upstreamStream && upstreamStream.destroy(); } catch {}
    try { client && client.terminate(); } catch {}
    try { upstream.terminate(); } catch {}
    try { if (!client) socket.destroy(); } catch {}
  };

  upstream.once('open', () => {
    try { tune(upstream._socket); } catch {}

    try {
      relayWss.handleUpgrade(req, socket, head, (ws) => {
        client = ws;
        try { tune(ws._socket); } catch {}

        clientStream = createWebSocketStream(ws, {
          encoding: null,
          highWaterMark: 1024 * 1024
        });

        upstreamStream = createWebSocketStream(upstream, {
          encoding: null,
          highWaterMark: 1024 * 1024
        });

        clientStream.on('error', closeAll);
        upstreamStream.on('error', closeAll);
        clientStream.once('close', closeAll);
        upstreamStream.once('close', closeAll);

        clientStream.pipe(upstreamStream);
        upstreamStream.pipe(clientStream);
      });
    } catch {
      closeAll();
    }
  });

  upstream.once('error', () => {
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

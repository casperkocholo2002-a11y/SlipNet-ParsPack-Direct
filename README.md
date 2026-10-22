# SlipNet ParsPack Direct

Minimal fixed-destination WebSocket relay for the independent ParsPack Direct path.

## Design

Client -> ParsPack app -> fixed hidden origin -> dedicated foreign inbound -> Internet

The client never receives the foreign server IP, hidden origin name, backend path, or private CA.

## Required environment variables

- `PORT` - supplied by ParsPack, normally `3000`
- `PUBLIC_RELAY_PATH` - public WebSocket path used by the client
- `ORIGIN_CONNECT_HOST` - private backend connect IP
- `ORIGIN_PORT` - dedicated backend TLS port
- `ORIGIN_SERVERNAME` - private TLS/SNI name; it does not need public DNS
- `ORIGIN_PATH` - private backend WebSocket path
- `ORIGIN_CA_PEM_B64` - base64-encoded private CA/certificate used to authenticate the backend

No live values belong in this repository.

## Endpoints

- `GET /health` - returns only build/health state
- WebSocket upgrade is accepted only on the configured `PUBLIC_RELAY_PATH`
- all other HTTP paths return 404

## Security properties

- fixed destination only
- direct IP connection with strict TLS name validation
- pinned private CA/certificate
- hidden origin name does not require public DNS
- no arbitrary target selection
- no origin IP, hostname, UUID, key, or secret committed to Git
- public relay path and backend path are independently configurable

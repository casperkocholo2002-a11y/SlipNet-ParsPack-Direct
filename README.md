# SlipNet ParsPack Direct

Minimal fixed-destination WebSocket relay for the independent ParsPack Direct path.

## Design

Client -> ParsPack app -> fixed hidden origin -> dedicated foreign inbound -> Internet

The client never receives the foreign server IP, hidden origin hostname, or backend path.

## Required environment variables

- `PORT` - supplied by ParsPack, normally `3000`
- `PUBLIC_RELAY_PATH` - public WebSocket path used by the client
- `ORIGIN_CONNECT_HOST` - private backend connect address
- `ORIGIN_PORT` - backend TLS port, normally `443`
- `ORIGIN_SERVERNAME` - TLS/SNI name of the hidden origin
- `ORIGIN_PATH` - private backend WebSocket path

No live values belong in this repository.

## Endpoints

- `GET /health` - returns only build/health state
- WebSocket upgrade is accepted only on the configured `PUBLIC_RELAY_PATH`
- all other HTTP paths return 404

## Security properties

- fixed destination only
- strict TLS certificate validation
- no arbitrary target selection
- no origin IP, hostname, UUID, key, or secret committed to Git
- public relay path and backend path are independently configurable

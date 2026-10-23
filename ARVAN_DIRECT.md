# SlipNet Arvan Direct

This repository's relay implementation is provider-agnostic. The same fixed-destination WebSocket relay used for ParsPack Direct is the approved basis for Arvan Direct.

## Path

Client -> Arvan public domain -> Arvan relay -> hidden foreign origin -> dedicated VLESS inbound -> Internet

The national server 95 is not part of this route.

## Isolation

Arvan Direct must use:
- its own public domain/root failure domain,
- its own PUBLIC_RELAY_PATH,
- its own hidden backend path on the foreign server,
- its own dedicated Xray inbound tag.

It must not share the ParsPack public domain or backend path.

## Relay

Deploy the existing root `server.js` and `package.json` unchanged unless an Arvan platform constraint is proven by a field test.

Required environment variables:

- `PORT`
- `PUBLIC_RELAY_PATH`
- `ORIGIN_CONNECT_HOST`
- `ORIGIN_PORT`
- `ORIGIN_SERVERNAME`
- `ORIGIN_PATH`
- `ORIGIN_TLS_MODE`
- `ORIGIN_CA_PEM_B64` when pinned TLS is used

No origin IP, hidden origin hostname, private CA, or backend path belongs in the Android profile.

## Public client profile

The client only receives:
- Arvan public hostname,
- port 443,
- Arvan public relay path.

The public hostname is used as the client connect target and TLS SNI.

## Foreign server

The foreign server must expose a new hidden backend route that terminates at a dedicated loopback-only Xray inbound, for example a tag such as:

`vless-arvan-direct`

The exact port and hidden backend path are production secrets and are intentionally not committed here.

## User authority

The monitor is the authority for route membership:
- enabling Arvan Direct for a user adds that user's current VLESS UUID/email to the Arvan Direct inbound;
- disabling it removes that membership;
- global disable removes all managed users from that inbound while preserving assignments;
- Reset Device synchronizes the new UUID into every enabled Direct inbound.

## Release order

1. Back up live Xray/Caddy configuration on the foreign server.
2. Create the dedicated Arvan Direct inbound without changing the existing production inbound.
3. Create the hidden backend route.
4. Deploy this relay to Arvan with secrets only in platform environment variables.
5. Bind the new Arvan public domain.
6. Verify `/health`.
7. Verify WebSocket relay with a single test user.
8. Add the real public host/path/inbound tag to the monitor's `direct-routes.json` with the route initially disabled.
9. Enable for one test user and perform end-to-end traffic validation.
10. Only then enable for selected users.

No production route is replaced during this rollout.

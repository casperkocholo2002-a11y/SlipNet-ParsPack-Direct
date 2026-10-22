export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    const publicPath = String(env.PUBLIC_PATH || "");
    const upstreamHost = String(env.UPSTREAM_HOST || "");
    const upstreamPath = String(env.UPSTREAM_PATH || "");

    if (!publicPath || !upstreamHost || !upstreamPath) {
      return new Response(null, { status: 503 });
    }

    if (url.pathname !== publicPath) {
      return new Response(null, { status: 404 });
    }

    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
      return new Response(null, { status: 404 });
    }

    const upstream = new URL("https://" + upstreamHost + upstreamPath);
    const headers = new Headers(request.headers);
    headers.set("host", upstreamHost);

    return fetch(upstream, {
      method: request.method,
      headers
    });
  }
};

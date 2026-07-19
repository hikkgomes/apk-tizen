#!/usr/bin/env python3
"""LAN-only HLS proxy for streams that require an upstream Referer header."""

from __future__ import annotations

import argparse
import hmac
import ipaddress
import os
import re
import socket
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


URI_ATTRIBUTE = re.compile(r'URI=(?P<quote>["\'])(?P<uri>.*?)(?P=quote)')
HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}
PASSTHROUGH_HEADERS = {
    "accept-ranges",
    "cache-control",
    "content-disposition",
    "content-range",
    "content-type",
    "etag",
    "expires",
    "last-modified",
}


def validate_upstream_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only complete HTTP(S) stream URLs are accepted")

    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as error:
        raise ValueError("The upstream stream host could not be resolved") from error

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0].split("%", 1)[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            raise ValueError("Private and reserved upstream addresses are blocked")
    return value


class SafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        validate_upstream_url(new_url)
        redirected = super().redirect_request(request, file_pointer, code, message, headers, new_url)
        if redirected is not None:
            for header in ("Referer", "User-Agent", "Origin", "Accept-Encoding", "Range"):
                value = request.get_header(header)
                if value:
                    redirected.add_header(header, value)
        return redirected


UPSTREAM_OPENER = build_opener(SafeRedirectHandler())


def proxy_url(proxy_origin: str, token: str, upstream: str, referer: str, user_agent: str, cookie: str = "", origin: str = "") -> str:
    query = {
        "token": token,
        "url": upstream,
        "referer": referer,
    }
    if user_agent:
        query["user_agent"] = user_agent
    if cookie:
        query["cookie"] = cookie
    if origin:
        query["origin"] = origin
    return proxy_origin.rstrip("/") + "/hls?" + urlencode(query)


def rewrite_playlist(body: bytes, final_url: str, proxy_origin: str, token: str, referer: str, user_agent: str, cookie: str = "", origin: str = "") -> bytes:
    text = body.decode("utf-8-sig", errors="replace")

    def wrap(uri: str) -> str:
        uri = uri.strip()
        if not uri or urlparse(uri).scheme not in {"", "http", "https"}:
            return uri
        return proxy_url(proxy_origin, token, urljoin(final_url, uri), referer, user_agent, cookie, origin)

    rewritten = []
    for line in text.splitlines():
        if line.startswith("#"):
            line = URI_ATTRIBUTE.sub(
                lambda match: "URI=" + match.group("quote") + wrap(match.group("uri")) + match.group("quote"),
                line,
            )
        elif line.strip():
            line = wrap(line)
        rewritten.append(line)
    return ("\n".join(rewritten) + "\n").encode("utf-8")


def parse_networks(value: str) -> tuple[ipaddress._BaseNetwork, ...]:
    return tuple(ipaddress.ip_network(item.strip()) for item in value.split(",") if item.strip())


class ProxyServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, handler, token: str, allowed_networks, timeout: float):
        super().__init__(address, handler)
        self.token = token
        self.allowed_networks = allowed_networks
        self.upstream_timeout = timeout


class ProxyHandler(BaseHTTPRequestHandler):
    server_version = "SportzXHLSProxy/1.0"

    def log_message(self, fmt, *args):
        # Never log query strings because they contain the access token.
        safe_path = urlparse(self.path).path
        print(f'{self.client_address[0]} - {self.command} {safe_path} - {fmt % args}', flush=True)

    def _send_error(self, status: int, message: str):
        payload = (message + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _client_allowed(self) -> bool:
        try:
            client_ip = ipaddress.ip_address(self.client_address[0].split("%", 1)[0])
        except ValueError:
            return False
        return any(client_ip in network for network in self.server.allowed_networks)

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range")
        self.end_headers()

    def do_HEAD(self):
        self._proxy()

    def do_GET(self):
        self._proxy()

    def _proxy(self):
        parsed_request = urlparse(self.path)
        if parsed_request.path != "/hls":
            self._send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        if not self._client_allowed():
            self._send_error(HTTPStatus.FORBIDDEN, "Client is outside the allowed network")
            return

        query = parse_qs(parsed_request.query, keep_blank_values=True)
        supplied_token = query.get("token", [""])[0]
        if not hmac.compare_digest(supplied_token, self.server.token):
            self._send_error(HTTPStatus.FORBIDDEN, "Invalid proxy token")
            return

        upstream_url = query.get("url", [""])[0]
        referer = query.get("referer", [""])[0]
        user_agent = query.get("user_agent", [""])[0] or "Mozilla/5.0 (SmartTV; Tizen)"
        cookie = query.get("cookie", [""])[0]
        origin = query.get("origin", [""])[0]
        try:
            validate_upstream_url(upstream_url)
        except ValueError as error:
            self._send_error(HTTPStatus.BAD_REQUEST, str(error))
            return

        headers = {
            "Accept": "*/*",
            "Accept-Encoding": "identity",
            "User-Agent": user_agent,
        }
        if referer:
            headers["Referer"] = referer
        if cookie:
            headers["Cookie"] = cookie
        if origin:
            headers["Origin"] = origin
        incoming_range = self.headers.get("Range")
        if incoming_range:
            headers["Range"] = incoming_range

        request = Request(upstream_url, headers=headers, method=self.command)
        try:
            response = UPSTREAM_OPENER.open(request, timeout=self.server.upstream_timeout)
        except HTTPError as error:
            response = error
        except (URLError, TimeoutError, OSError) as error:
            self._send_error(HTTPStatus.BAD_GATEWAY, "Upstream request failed: " + str(error.reason if isinstance(error, URLError) else error))
            return

        try:
            final_url = response.geturl()
            try:
                validate_upstream_url(final_url)
            except ValueError as error:
                self._send_error(HTTPStatus.BAD_GATEWAY, str(error))
                return

            status = getattr(response, "status", response.getcode())
            content_type = response.headers.get("Content-Type", "application/octet-stream")
            is_playlist = "mpegurl" in content_type.lower() or urlparse(final_url).path.lower().endswith(".m3u8")
            body = None
            if self.command != "HEAD" and is_playlist and 200 <= status < 300:
                body = response.read(8 * 1024 * 1024 + 1)
                if len(body) > 8 * 1024 * 1024:
                    self._send_error(HTTPStatus.BAD_GATEWAY, "Upstream playlist is too large")
                    return
                proxy_origin = "http://" + self.headers.get("Host", f"{self.server.server_address[0]}:{self.server.server_address[1]}")
                body = rewrite_playlist(body, final_url, proxy_origin, self.server.token, referer, user_agent, cookie, origin)

            self.send_response(status)
            for name, value in response.headers.items():
                lower = name.lower()
                if lower in HOP_BY_HOP_HEADERS or lower == "content-length":
                    continue
                if lower in PASSTHROUGH_HEADERS:
                    self.send_header(name, value)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("X-Content-Type-Options", "nosniff")
            if body is not None:
                self.send_header("Content-Type", "application/vnd.apple.mpegurl")
                self.send_header("Content-Length", str(len(body)))
            elif self.command == "HEAD" and response.headers.get("Content-Length"):
                self.send_header("Content-Length", response.headers["Content-Length"])
            self.end_headers()

            if self.command == "HEAD":
                return
            if body is not None:
                self.wfile.write(body)
                return
            while True:
                chunk = response.read(128 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            response.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8099)
    args = parser.parse_args()

    token = os.environ.get("SPORTSZX_PROXY_TOKEN", "")
    if len(token) < 24:
        raise SystemExit("SPORTSZX_PROXY_TOKEN must contain at least 24 characters")
    networks = parse_networks(os.environ.get("SPORTSZX_ALLOWED_NETWORKS", "192.168.1.0/24,127.0.0.0/8"))
    timeout = float(os.environ.get("SPORTSZX_UPSTREAM_TIMEOUT", "15"))
    server = ProxyServer((args.bind, args.port), ProxyHandler, token, networks, timeout)
    print(f"SportzX HLS proxy listening on {args.bind}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

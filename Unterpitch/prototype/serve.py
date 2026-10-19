"""Local dev server for the prototype.

Sends cross-origin isolation headers so the WASM speech model can use multiple threads (much faster).
Binds to 127.0.0.1 only.
"""
import http.server
import socketserver
import webbrowser

PORT = 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        url = f"http://127.0.0.1:{PORT}/"
        print(f"Rehearsal Coach prototype running at {url}  (Ctrl+C to stop)")
        webbrowser.open(url)
        httpd.serve_forever()

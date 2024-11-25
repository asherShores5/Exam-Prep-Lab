from http.server import HTTPServer, SimpleHTTPRequestHandler
import socketserver

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        SimpleHTTPRequestHandler.end_headers(self)

if __name__ == '__main__':
    PORT = 8080
    with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"Serving at port {PORT}")
        httpd.serve_forever()
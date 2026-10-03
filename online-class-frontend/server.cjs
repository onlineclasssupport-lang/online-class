const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

const root = path.resolve(__dirname, 'dist');
const port = Number(process.env.PORT) || 3000;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Text-based types are worth compressing; images/fonts (png, jpg, woff2...) are already compressed.
const compressibleTypes = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.ico']);

// Compressed copies are kept in memory (keyed by file + mtime + encoding) so each asset is
// compressed once, not on every request. The dist folder is small, so this stays tiny.
const compressedCache = new Map();
const MAX_CACHE_ENTRIES = 200;

function pickEncoding(acceptEncoding) {
  const value = String(acceptEncoding || '');
  if (/\bbr\b/.test(value)) return 'br';
  if (/\bgzip\b/.test(value)) return 'gzip';
  return null;
}

function compress(encoding, buffer) {
  if (encoding === 'br') {
    return zlib.brotliCompressSync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length,
      },
    });
  }
  return zlib.gzipSync(buffer, { level: 9 });
}

function cacheControlFor(filePath) {
  // Vite emits content-hashed files under /assets — they never change, so cache them for a year.
  if (filePath.startsWith(path.join(root, 'assets') + path.sep)) {
    return 'public, max-age=31536000, immutable';
  }
  // index.html and other root files must always be revalidated so new deploys show up immediately.
  return 'public, max-age=0, must-revalidate';
}

function sendFile(res, filePath, statusCode = 200) {
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const etag = `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': cacheControlFor(filePath),
      ETag: etag,
      'Last-Modified': stats.mtime.toUTCString(),
      Vary: 'Accept-Encoding',
    };

    // Conditional request: browser already has this exact version, skip the body entirely.
    if (statusCode === 200 && res.req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }

    const encoding = compressibleTypes.has(ext) ? pickEncoding(res.req.headers['accept-encoding']) : null;

    if (!encoding) {
      res.writeHead(statusCode, { ...headers, 'Content-Length': stats.size });
      if (res.req.method === 'HEAD') return res.end();

      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end('Internal server error');
      });
      return stream.pipe(res);
    }

    const cacheKey = `${filePath}|${stats.mtimeMs}|${encoding}`;
    const respond = (body) => {
      res.writeHead(statusCode, { ...headers, 'Content-Encoding': encoding, 'Content-Length': body.length });
      if (res.req.method === 'HEAD') return res.end();
      return res.end(body);
    };

    const cached = compressedCache.get(cacheKey);
    if (cached) return respond(cached);

    fs.readFile(filePath, (readError, buffer) => {
      if (readError) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Internal server error');
      }
      let body;
      try {
        body = compress(encoding, buffer);
      } catch (compressError) {
        console.error('Compression error:', compressError);
        res.writeHead(statusCode, { ...headers, 'Content-Length': buffer.length });
        return res.req.method === 'HEAD' ? res.end() : res.end(buffer);
      }
      if (compressedCache.size >= MAX_CACHE_ENTRIES) {
        compressedCache.delete(compressedCache.keys().next().value);
      }
      compressedCache.set(cacheKey, body);
      return respond(body);
    });
  });
}

const server = http.createServer((req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end('Method not allowed');
    }

    const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const requestedPath = rawPath === '/' ? '/index.html' : rawPath;
    const normalized = path.normalize(requestedPath).replace(/^([/\\])+/, '');
    let filePath = path.resolve(root, normalized);

    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }

    fs.stat(filePath, (error, stats) => {
      if (!error && stats.isFile()) {
        return sendFile(res, filePath);
      }

      // React Router client-side routes should resolve to index.html.
      // Asset-looking paths that do not exist should remain 404.
      if (!path.extname(normalized)) {
        filePath = path.join(root, 'index.html');
        return sendFile(res, filePath);
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    });
  } catch (error) {
    console.error('Request error:', error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal server error');
  }
});

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Frontend listening on 0.0.0.0:${port}`);
});

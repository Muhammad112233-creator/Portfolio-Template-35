const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.md': 'text/markdown; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  // Allow all origins for preview
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle mock API chat if requested
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const q = (data.message || '').toLowerCase();
        let reply = "I focus on building digital instruments where interface physics, tactile latency, and cognitive ergonomics align seamlessly with human intent.";
        if (q.includes("availability") || q.includes("available") || q.includes("hire") || q.includes("contract")) {
          reply = "I am currently open to select advisory roles, design leadership engagements, and design systems contracts. Feel free to ping me via the message uplink window!";
        } else if (q.includes("rate") || q.includes("cost") || q.includes("pricing")) {
          reply = "My rates depend on project scope: strategic advisory is retained monthly, while zero-to-one design sprints are quoted per milestone.";
        } else if (q.includes("tool") || q.includes("stack") || q.includes("figma")) {
          reply = "My primary instruments revolve around Figma (variables, tokens), ProtoPie/Principle for motion physics, Blender for spatial hardware studies, and modern WebGL/CSS for runtime fidelity.";
        } else if (q.includes("book")) {
          reply = "My book, 'The Architecture of Feedback: Designing Tactile Software in an Ambient World', explores latency, spring kinematics, and glanceable displays. Check the preview in the book window!";
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        const words = reply.split(' ');
        let idx = 0;
        const interval = setInterval(() => {
          if (idx < words.length) {
            res.write(`data: ${JSON.stringify({ response: (idx > 0 ? ' ' : '') + words[idx] })}\n\n`);
            idx++;
          } else {
            res.write('data: [DONE]\n\n');
            clearInterval(interval);
            res.end();
          }
        }, 30);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      }
    });
    return;
  }

  // Normalize URL
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Map route to local file
  let filePath = path.join(ROOT, pathname);

  fs.stat(filePath, (err, stats) => {
    // If exact file found and is file
    if (!err && stats.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // If directory, try index.html
    if (!err && stats.isDirectory()) {
      const indexFile = path.join(filePath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        fs.createReadStream(indexFile).pipe(res);
        return;
      }
    }

    // SPA fallback: routes like /work, /work/aura, etc. fallback to index.html
    if (!path.extname(pathname) || pathname.startsWith('/work')) {
      const mainHtml = path.join(ROOT, 'index.html');
      if (fs.existsSync(mainHtml)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        fs.createReadStream(mainHtml).pipe(res);
        return;
      }
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Portfolio server running on http://0.0.0.0:${PORT}`);
});

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

// Isolate test database
const testDbPath = path.join(__dirname, 'test_api_arena.db');
process.env.DATABASE_PATH = testDbPath;

const { server, app } = require('../server');

let testPort;
let baseUrl;

describe('REST API & Static Hosting (server.js)', () => {
  before(async () => {
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        testPort = server.address().port;
        baseUrl = `http://127.0.0.1:${testPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => {
      server.close(() => {
        try {
          if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        } catch (e) {}
        resolve();
      });
    });
  });

  function get(urlPath) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${urlPath}`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      }).on('error', reject);
    });
  }

  test('GET /api/network-info returns network addresses and valid QR code data URL', async () => {
    const res = await get('/api/network-info');
    assert.strictEqual(res.status, 200);
    const data = JSON.parse(res.body);

    assert.ok(data.status === 'online' || data.status === 'fallback');
    assert.ok(typeof data.localIp === 'string' && data.localIp.length > 0);
    assert.ok(typeof data.lanUrl === 'string');
    assert.ok(data.qrCodeDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(Array.isArray(data.allIps));
  });

  test('GET /api/leaderboard returns JSON array of player rankings', async () => {
    const res = await get('/api/leaderboard');
    assert.strictEqual(res.status, 200);
    const data = JSON.parse(res.body);
    assert.ok(Array.isArray(data));
  });

  test('GET /api/recent-matches returns JSON array of recent matches', async () => {
    const res = await get('/api/recent-matches');
    assert.strictEqual(res.status, 200);
    const data = JSON.parse(res.body);
    assert.ok(Array.isArray(data));
  });

  test('GET / serves index.html with NEO-TIC ARENA branding', async () => {
    const res = await get('/');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.body.includes('NEO-TIC'));
    assert.ok(res.body.includes('ARENA'));
    assert.ok(res.body.includes('screen-register'));
  });

  test('GET /css/style.css serves style stylesheet with cyberpunk theme', async () => {
    const res = await get('/css/style.css');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/css'));
    assert.ok(res.body.includes('--neon-cyan') || res.body.includes('--bg-void'));
  });

  test('GET /js/app.js serves client application code', async () => {
    const res = await get('/js/app.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('application/javascript') || res.headers['content-type'].includes('text/javascript'));
    assert.ok(res.body.includes('NEO-TIC'));
  });
});

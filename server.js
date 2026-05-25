const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { ProxyAgent, setGlobalDispatcher } = require('undici');
const config = require('./config');

setupOutboundProxy();

const app = express();
app.disable('x-powered-by');

function setupOutboundProxy() {
  const proxyUrl = resolveProxyUrl(config.proxy);
  if (!proxyUrl) {
    console.log('[Proxy] disabled');
    return;
  }

  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log(`[Proxy] Node fetch -> ${maskProxyUrl(proxyUrl)}`);
  } catch (err) {
    console.error(`[Proxy] setup failed: ${err.message}`);
  }
}

function resolveProxyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'none' || raw.toLowerCase() === 'direct') return '';
  if (raw.toLowerCase() !== 'auto') return normalizeProxyUrl(raw);
  return normalizeProxyUrl(readWindowsProxyServer());
}

function normalizeProxyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const first = raw.split(';')[0].replace(/^(https?|socks)=/i, '').trim();
  if (!first) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(first) ? first : `http://${first}`;
}

function readWindowsProxyServer() {
  if (process.platform !== 'win32') return '';
  try {
    const output = execFileSync('reg', [
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '/v',
      'ProxyServer',
    ], { encoding: 'utf8', windowsHide: true });
    const match = output.match(/ProxyServer\s+REG_SZ\s+(.+)/i);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

function maskProxyUrl(value) {
  return String(value).replace(/:\/\/([^:@/]+):([^@/]+)@/, '://$1:***@');
}

function basicAuthEnabled() {
  return Boolean(config.basicAuth?.username && config.basicAuth?.password);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requestBasicAuth(res) {
  res.setHeader('WWW-Authenticate', 'Basic realm="ChatGPT Session Forge", charset="UTF-8"');
  return res.status(401).send('Authentication required');
}

function basicAuth(req, res, next) {
  if (!basicAuthEnabled()) return next();

  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return requestBasicAuth(res);

  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return requestBasicAuth(res);
  }

  const sep = decoded.indexOf(':');
  const username = sep >= 0 ? decoded.slice(0, sep) : '';
  const password = sep >= 0 ? decoded.slice(sep + 1) : '';

  if (
    safeEqual(username, config.basicAuth.username) &&
    safeEqual(password, config.basicAuth.password)
  ) {
    return next();
  }

  return requestBasicAuth(res);
}

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return '';
  }
}

function firstHeaderValue(value) {
  return String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim();
}

function requestHosts(req) {
  return [
    firstHeaderValue(req.headers['x-forwarded-host']),
    firstHeaderValue(req.headers.host),
  ]
    .map(value => value.toLowerCase())
    .filter(Boolean);
}

function trustedOrigins() {
  return new Set((config.security?.trustedOrigins || [])
    .map(normalizeOrigin)
    .filter(Boolean));
}

function isAllowedBrowserOrigin(req, value) {
  const origin = normalizeOrigin(value);
  if (!origin) return false;

  const explicit = trustedOrigins();
  if (explicit.has(origin)) return true;

  const originUrl = new URL(origin);
  return requestHosts(req).includes(originUrl.host.toLowerCase());
}

function rejectCrossSite(req, res, reason) {
  console.warn(`[CSRF] blocked ${req.method} ${req.originalUrl}: ${reason}`);
  return res.status(403).json({
    success: false,
    error: 'CSRF origin check failed',
  });
}

function csrfOriginGuard(req, res, next) {
  if (!config.security?.csrfOriginCheck) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const fetchSite = String(req.headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
    return rejectCrossSite(req, res, `sec-fetch-site=${fetchSite}`);
  }

  const origin = firstHeaderValue(req.headers.origin);
  if (origin) {
    return isAllowedBrowserOrigin(req, origin)
      ? next()
      : rejectCrossSite(req, res, `origin=${origin}`);
  }

  const referer = firstHeaderValue(req.headers.referer);
  if (referer) {
    return isAllowedBrowserOrigin(req, referer)
      ? next()
      : rejectCrossSite(req, res, `referer=${referer}`);
  }

  // Non-browser clients often omit Origin/Referer. Browser cross-site POSTs send Origin.
  return next();
}

// ==================== 中间件 ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', time: new Date().toISOString() });
});

app.use(csrfOriginGuard);
app.use(basicAuth);

// 静态文件
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

// ==================== 确保数据目录存在 ====================
const dataFile = path.resolve(__dirname, config.dataFile);
const dataDir = path.dirname(dataFile);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, '[]', 'utf-8');
}

// ==================== SSE 连接管理 ====================
const sseClients = new Set();
const recentEvents = [];
const sseEventRunId = Date.now().toString(36);
let sseEventSeq = 0;

function rememberEvent(data) {
  recentEvents.push(data);
  if (recentEvents.length > 80) recentEvents.shift();
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('data: {"type":"connected"}\n\n');

  sseClients.add(res);
  console.log(`[SSE] connected clients=${sseClients.size}`);
  req.on('close', () => {
    sseClients.delete(res);
    console.log(`[SSE] disconnected clients=${sseClients.size}`);
  });
});

function broadcast(data) {
  const eventData = {
    ...data,
    eventId: `${sseEventRunId}-${++sseEventSeq}`,
    time: new Date().toISOString(),
  };
  rememberEvent(eventData);
  const msg = `data: ${JSON.stringify(eventData)}\n\n`;
  console.log(`[SSE] broadcast ${eventData.type || ''}${eventData.status ? `:${eventData.status}` : ''} clients=${sseClients.size}`);
  for (const client of sseClients) {
    client.write(msg);
  }
}

app.get('/api/events/status', (req, res) => {
  res.json({
    success: true,
    clients: sseClients.size,
    recentEvents,
  });
});

// 将 broadcast 挂到 app 上，让路由可以使用
app.set('broadcast', broadcast);

// ==================== 加载路由 ====================
app.use('/api', require('./routes/accounts'));
app.use('/api', require('./routes/mail'));
app.use('/api', require('./routes/chatgpt'));
app.use('/api', require('./routes/convert'));
app.use('/api', require('./routes/warehouse'));

// ==================== 错误处理 ====================
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    success: false,
    error: err.message || '服务器内部错误',
  });
});

// ==================== 启动服务 ====================
app.listen(config.port, config.host, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   ChatGPT 自动登录凭证管理系统          ║');
  console.log('║                                          ║');
  console.log(`║   🌐 http://${config.host}:${config.port}              ║`);
  console.log('║                                          ║');
  console.log('║   功能：                                 ║');
  console.log('║   📬 Outlook 双协议取件                  ║');
  console.log('║   🤖 ChatGPT 自动登录                   ║');
  console.log('║   🔄 Session → CPA / sub2api 转换       ║');
  console.log('║   📦 CPA 401 自动仓管                  ║');
  console.log(`║   🔐 Basic Auth ${basicAuthEnabled() ? 'enabled ' : 'disabled'}              ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

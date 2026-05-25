function readIntEnv(name, fallback, min, max) {
  const value = parseInt(process.env[name], 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function readBoolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function readListEnv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * 应用配置
 */
module.exports = {
  // 服务器监听地址。Docker 镜像里通过 HOST=0.0.0.0 暴露到容器网络。
  host: process.env.HOST || '127.0.0.1',

  // 服务器端口
  port: readIntEnv('PORT', 3000, 1, 65535),

  // 数据文件路径。Docker 部署时建议挂载 /app/data。
  dataFile: process.env.DATA_FILE || './data/accounts.json',

  // 可选 Basic Auth。服务器部署建议配置，避免凭证管理界面裸露。
  basicAuth: {
    username: process.env.BASIC_AUTH_USERNAME || '',
    password: process.env.BASIC_AUTH_PASSWORD || '',
  },

  security: {
    csrfOriginCheck: readBoolEnv('CSRF_ORIGIN_CHECK', true),
    trustedOrigins: readListEnv('TRUSTED_ORIGINS'),
  },

  // 并发控制
  concurrency: readIntEnv('CONCURRENCY', 8, 1, 20),

  // IMAP 配置
  imap: {
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    timeout: 30000,
  },

  // Graph API 配置
  graph: {
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    apiBase: 'https://graph.microsoft.com/v1.0',
    scope: 'https://graph.microsoft.com/.default offline_access',
  },

  // ChatGPT 协议登录配置
  chatgpt: {
    sessionUrl: 'https://chatgpt.com/api/auth/session',
    timeout: 120000, // 登录超时 2 分钟
    codeCheckInterval: 5000, // 验证码检查间隔 5 秒（协议更快，给邮件到达时间）
    codeCheckMaxRetries: 20, // 最多检查 20 次
  },

  // Node 后端出站代理。留空时自动读取 Windows 当前用户代理。
  proxy: process.env.OUTBOUND_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || 'auto',
};

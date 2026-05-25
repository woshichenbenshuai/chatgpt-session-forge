/**
 * Codex-Manager 对接服务
 * 通过 Codex-Manager Web/Service 的 /api/rpc 调用 account/import。
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const converter = require('./converter-service');

const DATA_FILE = path.resolve(__dirname, '..', config.dataFile);
const DEFAULT_CODEX_MANAGER_BASE_URL = 'http://localhost:17000';

function readAccounts() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
  } catch {
    return [];
  }
}

function normalizeRpcUrl(baseUrl = DEFAULT_CODEX_MANAGER_BASE_URL) {
  const raw = String(baseUrl || DEFAULT_CODEX_MANAGER_BASE_URL).trim().replace(/\/+$/, '');
  if (!raw) return `${DEFAULT_CODEX_MANAGER_BASE_URL}/api/rpc`;
  if (/\/(?:api\/)?rpc$/i.test(raw)) return raw;
  return `${raw}/api/rpc`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeImportLimit(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return Math.max(1, Math.min(1000, parseInt(value, 10) || fallback));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEnabledOption(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function dedupeKey(row) {
  const accountId = String(row.item.accountId || row.item.chatgpt_account_id || row.candidate.accountId || '').trim();
  if (accountId) return `account:${accountId}`;
  const email = normalizeEmail(row.item.email || row.candidate.email);
  if (email) return `email:${email}`;
  return `local:${row.account.id}`;
}

function selectedRows({ accountIds, maxItems } = {}) {
  const idSet = Array.isArray(accountIds) && accountIds.length > 0
    ? new Set(accountIds.map(String))
    : null;
  const limit = normalizeImportLimit(maxItems, 1000);
  return readAccounts()
    .filter(account => (!idSet || idSet.has(account.id)) && account.status === 'success' && account.session)
    .slice(0, limit)
    .map(account => ({ account, session: account.session }));
}

function summarizeCandidate(account, session) {
  const info = converter.extractSessionInfo(session);
  return {
    id: account.id,
    email: info.email || account.email || '',
    accountId: info.accountId || '',
    userId: info.userId || '',
    planType: info.planType || '',
    expiresAt: info.expiresAt || '',
    hasAccessToken: Boolean(info.accessToken),
    hasSessionToken: Boolean(info.sessionToken),
    status: info.accessToken ? 'ready' : 'invalid',
    message: info.accessToken ? '可导入' : '缺少 accessToken',
  };
}

function scanSuccessfulSessions(options = {}) {
  const all = readAccounts();
  const successful = all.filter(account => account.status === 'success' && account.session);
  const rows = selectedRows(options);
  const candidates = rows.map(({ account, session }) => summarizeCandidate(account, session));
  return {
    totalAccounts: all.length,
    successful: successful.length,
    candidates,
    ready: candidates.filter(item => item.hasAccessToken).length,
    invalid: candidates.filter(item => !item.hasAccessToken).length,
  };
}

function toCodexManagerImportItem(account, session) {
  const info = converter.extractSessionInfo(session);
  const idToken = converter.toCockpit([info])[0]?.id_token || info.idToken || '';
  const email = info.email || account.email || '';
  const accountId = info.accountId || session.accountId || session.account_id || '';

  return {
    accessToken: info.accessToken,
    idToken,
    refreshToken: '',
    accountId,
    chatgpt_account_id: accountId,
    email,
    label: email || account.email || account.id,
    groupName: 'chatgpt-session-forge',
    meta: {
      label: email || account.email || account.id,
      groupName: 'chatgpt-session-forge',
      note: 'Imported from chatgpt-session-forge',
      chatgpt_account_id: accountId,
    },
  };
}

class CodexManagerRpcClient {
  constructor({ baseUrl, rpcToken, webPassword, webUsername }) {
    this.rpcUrl = normalizeRpcUrl(baseUrl);
    this.rpcToken = String(rpcToken || '').trim();
    this.webPassword = String(webPassword || '').trim();
    this.webUsername = String(webUsername || '').trim();
    this.cookie = '';
  }

  shouldUseWebLogin() {
    try {
      return new URL(this.rpcUrl).pathname.toLowerCase() === '/api/rpc';
    } catch {
      return false;
    }
  }

  webLoginUrl() {
    const url = new URL(this.rpcUrl);
    return `${url.origin}/__login`;
  }

  async ensureWebLogin() {
    if (!this.shouldUseWebLogin() || !this.webPassword) return;

    const body = new URLSearchParams();
    if (this.webUsername) body.set('username', this.webUsername);
    body.set('password', this.webPassword);

    const response = await fetch(this.webLoginUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'manual',
    });

    const setCookies = response.headers.getSetCookie?.() || splitSetCookie(response.headers.get('set-cookie'));
    const cookie = setCookies
      .map(raw => String(raw).split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    if (!response.ok || !cookie.includes('codexmanager_web_auth=')) {
      const text = await response.text().catch(() => '');
      const errorHint = response.status === 401 ? 'Web 密码错误' : `HTTP ${response.status}`;
      throw new Error(`Codex-Manager Web 登录失败: ${errorHint}${text ? ` - ${text.slice(0, 120)}` : ''}`);
    }

    this.cookie = cookie;
  }

  async call(method, params = {}) {
    if (!this.rpcToken) throw new Error('缺少 Codex-Manager RPC Token');
    await this.ensureWebLogin();

    const headers = {
      'Content-Type': 'application/json',
      'X-CodexManager-Rpc-Token': this.rpcToken,
    };
    if (this.cookie) headers.Cookie = this.cookie;

    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: Date.now(),
        method,
        params,
      }),
    });

    const text = await response.text();
    const data = safeJsonParse(text);
    if (!response.ok) {
      const message = data?.error?.message || data?.result?.error || text || `HTTP ${response.status}`;
      if (response.status === 401 && String(message).includes('web_auth_required')) {
        throw new Error('Codex-Manager Web 已启用访问密码，请填写 Web 密码，或改填 service 端 /rpc 地址');
      }
      const error = new Error(`Codex-Manager RPC 请求失败: HTTP ${response.status} - ${message}`);
      error.status = response.status;
      error.body = data || text;
      throw error;
    }

    if (data?.error) {
      throw new Error(`Codex-Manager RPC 错误: ${data.error.message || JSON.stringify(data.error)}`);
    }
    if (data?.result?.error) {
      throw new Error(`Codex-Manager 导入失败: ${data.result.error}`);
    }

    return data?.result ?? data;
  }

  importAccounts(items) {
    return this.call('account/import', {
      contents: [JSON.stringify(items)],
    });
  }

  listAccounts() {
    return this.call('account/list', {
      page: 1,
      pageSize: 1,
    });
  }

  listAllAccounts() {
    return this.call('account/list', {});
  }
}

function splitSetCookie(raw) {
  if (!raw) return [];
  return String(raw).split(/,(?=[^;,]+=)/g);
}

function extractAccountItems(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.accounts)) return result.accounts;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function collectAccountEmails(result) {
  return new Set(extractAccountItems(result)
    .flatMap(account => [
      account.email,
      account.label,
      account.name,
      account.meta?.email,
      account.meta?.label,
      account.profile?.email,
    ])
    .map(normalizeEmail)
    .filter(Boolean));
}

async function importSuccessfulSessions(options = {}) {
  const rows = selectedRows(options);
  const candidates = rows.map(({ account, session }) => summarizeCandidate(account, session));
  if (rows.length === 0) {
    return {
      total: 0,
      imported: 0,
      candidates: [],
      rows: [],
      result: null,
      message: '没有已登录成功的账号可导入',
    };
  }

  const importableRows = rows
    .map(({ account, session }, index) => ({
      index,
      account,
      item: toCodexManagerImportItem(account, session),
      candidate: candidates[index],
    }))
    .filter(row => row.item.accessToken);
  if (importableRows.length === 0) {
    return {
      total: rows.length,
      imported: 0,
      candidates,
      rows: candidates.map(candidate => ({
        ...candidate,
        action: 'skipped',
        ok: false,
        message: candidate.message,
      })),
      result: null,
      message: '已登录账号缺少 accessToken',
    };
  }

  const client = new CodexManagerRpcClient(options);
  const rowOutcomes = new Map();
  const seenKeys = new Set();
  let dedupedLocal = 0;
  let importRows = [];

  for (const row of importableRows) {
    const key = dedupeKey(row);
    if (seenKeys.has(key)) {
      dedupedLocal += 1;
      rowOutcomes.set(row.index, {
        action: 'deduped_local',
        ok: true,
        message: '本地候选重复，已跳过',
      });
      continue;
    }
    seenKeys.add(key);
    importRows.push(row);
  }

  let skippedExisting = 0;
  if (isEnabledOption(options.skipExistingByEmail, true)) {
    const existingEmails = collectAccountEmails(await client.listAllAccounts());
    importRows = importRows.filter(row => {
      const email = normalizeEmail(row.item.email || row.candidate.email);
      if (!email || !existingEmails.has(email)) return true;

      skippedExisting += 1;
      rowOutcomes.set(row.index, {
        action: 'skipped_existing',
        ok: true,
        message: 'Codex-Manager 已存在同邮箱账号',
      });
      return false;
    });
  }

  if (importRows.length === 0) {
    return {
      total: rows.length,
      imported: 0,
      skippedExisting,
      dedupedLocal,
      candidates,
      rows: candidates.map((candidate, index) => ({
        ...candidate,
        ...(rowOutcomes.get(index) || {
          action: candidate.hasAccessToken ? 'skipped' : 'skipped',
          ok: !candidate.hasAccessToken ? false : true,
          message: candidate.hasAccessToken ? '没有需要提交的账号' : candidate.message,
        }),
      })),
      result: null,
      message: skippedExisting || dedupedLocal
        ? `没有新账号需要导入，已跳过 ${skippedExisting + dedupedLocal} 个重复账号`
        : '没有可导入账号',
    };
  }

  const result = await client.importAccounts(importRows.map(row => row.item));
  const errors = new Map((result.errors || []).map(error => [Number(error.index), error.message || '导入失败']));
  const rowsResult = candidates.map((candidate, index) => {
    const existingOutcome = rowOutcomes.get(index);
    if (existingOutcome) {
      return {
        ...candidate,
        ...existingOutcome,
      };
    }
    if (!candidate.hasAccessToken) {
      return {
        ...candidate,
        action: 'skipped',
        ok: false,
        message: candidate.message,
      };
    }
    const importIndex = importRows.findIndex(row => row.index === index) + 1;
    if (importIndex < 1) {
      return {
        ...candidate,
        action: 'skipped',
        ok: true,
        message: '没有提交到 Codex-Manager',
      };
    }
    const error = errors.get(importIndex);
    return {
      ...candidate,
      action: error ? 'failed' : 'imported',
      ok: !error,
      message: error || '已提交到 Codex-Manager',
    };
  });

  return {
    total: rows.length,
    imported: importRows.length,
    skippedExisting,
    dedupedLocal,
    candidates,
    rows: rowsResult,
    result,
  };
}

async function checkConnection(options = {}) {
  const client = new CodexManagerRpcClient(options);
  const result = await client.listAccounts();
  return {
    ok: true,
    rpcUrl: client.rpcUrl,
    accountTotal: result.total ?? 0,
    result,
  };
}

module.exports = {
  CodexManagerRpcClient,
  checkConnection,
  importSuccessfulSessions,
  normalizeRpcUrl,
  scanSuccessfulSessions,
  toCodexManagerImportItem,
};

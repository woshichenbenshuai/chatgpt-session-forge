/**
 * CPA 仓管前端
 * 扫描 401 凭证，并触发后端自动重登换货。
 */

let _warehouseRows = [];
let _warehouseAutoTimer = null;
let _warehouseBusy = false;
let _codexManagerRows = [];
let _codexManagerAutoTimer = null;
let _codexManagerBusy = false;
const CPA_WAREHOUSE_SETTINGS_KEY = 'cpaWarehouseSettings';
const CODEX_MANAGER_SETTINGS_KEY = 'codexManagerWarehouseSettings';
const WAREHOUSE_LOGGABLE_LOGIN_STATUSES = new Set([
  'login_start',
  'identifier',
  'password',
  'waiting_code',
  'verify_code',
  'session',
]);

function getCpaWarehousePayload() {
  return {
    baseUrl: document.getElementById('cpaBaseUrl').value.trim(),
    managementKey: document.getElementById('cpaManagementKey').value.trim(),
    maxItems: parseInt(document.getElementById('cpaMaxItems').value, 10) || 20,
  };
}

function getCodexManagerPayload() {
  return {
    baseUrl: document.getElementById('codexManagerBaseUrl').value.trim(),
    rpcToken: document.getElementById('codexManagerRpcToken').value.trim(),
    webPassword: document.getElementById('codexManagerWebPassword').value.trim(),
    webUsername: document.getElementById('codexManagerWebUsername').value.trim(),
    maxItems: parseInt(document.getElementById('codexManagerMaxItems').value, 10) || 1000,
    skipExistingByEmail: document.getElementById('codexManagerSkipExisting')?.checked !== false,
  };
}

function loadCpaWarehouseSettings() {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(CPA_WAREHOUSE_SETTINGS_KEY) || '{}');
  } catch {
    settings = {};
  }

  if (settings.baseUrl) document.getElementById('cpaBaseUrl').value = settings.baseUrl;
  if (settings.managementKey) document.getElementById('cpaManagementKey').value = settings.managementKey;
  if (settings.maxItems) document.getElementById('cpaMaxItems').value = settings.maxItems;
  if (settings.autoInterval) document.getElementById('cpaAutoInterval').value = settings.autoInterval;
  document.getElementById('cpaAutoToggle').checked = Boolean(settings.autoEnabled);
}

function loadCodexManagerSettings() {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(CODEX_MANAGER_SETTINGS_KEY) || '{}');
  } catch {
    settings = {};
  }

  if (settings.baseUrl) document.getElementById('codexManagerBaseUrl').value = settings.baseUrl;
  if (settings.rpcToken) document.getElementById('codexManagerRpcToken').value = settings.rpcToken;
  if (settings.webPassword) document.getElementById('codexManagerWebPassword').value = settings.webPassword;
  if (settings.webUsername) document.getElementById('codexManagerWebUsername').value = settings.webUsername;
  if (settings.maxItems) document.getElementById('codexManagerMaxItems').value = settings.maxItems;
  if (settings.autoInterval) document.getElementById('codexManagerAutoInterval').value = settings.autoInterval;
  document.getElementById('codexManagerSkipExisting').checked = settings.skipExistingByEmail !== false;
  document.getElementById('codexManagerAutoToggle').checked = Boolean(settings.autoEnabled);
}

function saveCpaWarehouseSettings() {
  const settings = {
    baseUrl: document.getElementById('cpaBaseUrl')?.value.trim() || '',
    managementKey: document.getElementById('cpaManagementKey')?.value.trim() || '',
    maxItems: document.getElementById('cpaMaxItems')?.value || '20',
    autoEnabled: Boolean(document.getElementById('cpaAutoToggle')?.checked),
    autoInterval: document.getElementById('cpaAutoInterval')?.value || '5',
  };
  localStorage.setItem(CPA_WAREHOUSE_SETTINGS_KEY, JSON.stringify(settings));
}

function saveCodexManagerSettings() {
  const settings = {
    baseUrl: document.getElementById('codexManagerBaseUrl')?.value.trim() || '',
    rpcToken: document.getElementById('codexManagerRpcToken')?.value.trim() || '',
    webPassword: document.getElementById('codexManagerWebPassword')?.value.trim() || '',
    webUsername: document.getElementById('codexManagerWebUsername')?.value.trim() || '',
    maxItems: document.getElementById('codexManagerMaxItems')?.value || '1000',
    skipExistingByEmail: document.getElementById('codexManagerSkipExisting')?.checked !== false,
    autoEnabled: Boolean(document.getElementById('codexManagerAutoToggle')?.checked),
    autoInterval: document.getElementById('codexManagerAutoInterval')?.value || '10',
  };
  localStorage.setItem(CODEX_MANAGER_SETTINGS_KEY, JSON.stringify(settings));
}

function validateCpaWarehousePayload(payload) {
  if (!payload.baseUrl) {
    showToast('请填写 CPA 地址', 'warning');
    return false;
  }
  if (!payload.managementKey) {
    showToast('请填写 CPA 管理密钥', 'warning');
    return false;
  }
  return true;
}

function validateCodexManagerPayload(payload) {
  if (!payload.baseUrl) {
    showToast('请填写 Codex-Manager 地址', 'warning');
    return false;
  }
  if (!payload.rpcToken) {
    showToast('请填写 Codex-Manager RPC Token', 'warning');
    return false;
  }
  return true;
}

function getCpaAutoIntervalMs() {
  const minutes = parseInt(document.getElementById('cpaAutoInterval')?.value, 10) || 5;
  return Math.max(1, Math.min(1440, minutes)) * 60 * 1000;
}

function isCpaAutoEnabled() {
  return Boolean(document.getElementById('cpaAutoToggle')?.checked);
}

function getCodexManagerAutoIntervalMs() {
  const minutes = parseInt(document.getElementById('codexManagerAutoInterval')?.value, 10) || 10;
  return Math.max(1, Math.min(1440, minutes)) * 60 * 1000;
}

function isCodexManagerAutoEnabled() {
  return Boolean(document.getElementById('codexManagerAutoToggle')?.checked);
}

function setWarehouseConnectionState(state, text) {
  const pill = document.getElementById('cpaConnectionStatus');
  const label = document.getElementById('cpaConnectionText');
  if (!pill || !label) return;
  pill.className = `warehouse-status-pill ${state || 'idle'}`;
  label.textContent = text || '未连接';
}

function setCodexManagerState(state, text) {
  const pill = document.getElementById('codexManagerStatus');
  const label = document.getElementById('codexManagerStatusText');
  if (!pill || !label) return;
  pill.className = `warehouse-status-pill ${state || 'idle'}`;
  label.textContent = text || '未连接';
}

function addCodexManagerLog(message, type = 'info') {
  const logList = document.getElementById('codexManagerLogList');
  if (!logList) return;

  const now = new Date();
  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-type ${type}">${type.toUpperCase()}</span>
    <span class="log-message">${escapeHtml(message)}</span>
  `;
  logList.prepend(entry);
  while (logList.children.length > 200) logList.removeChild(logList.lastChild);
}

function updateCodexManagerStats(summary = {}) {
  document.getElementById('cmStatLocalSuccess').textContent = summary.successful ?? summary.total ?? 0;
  document.getElementById('cmStatReady').textContent = summary.ready ?? summary.imported ?? 0;
  document.getElementById('cmStatImported').textContent = summary.imported ?? summary.created ?? 0;
  document.getElementById('cmStatFailed').textContent = summary.failed ?? summary.invalid ?? 0;
}

function formatCodexManagerAction(action) {
  const labels = {
    ready: '可导入',
    invalid: '无效',
    imported: '已导入',
    failed: '导入失败',
    skipped: '已跳过',
    skipped_existing: '已存在跳过',
    deduped_local: '本地重复跳过',
  };
  return labels[action] || action || '-';
}

function renderCodexManagerRows(rows) {
  const tbody = document.getElementById('codexManagerTableBody');
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state" style="padding:40px 20px"><p>没有可导入的成功账号</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const message = row.message || '-';
    const action = formatCodexManagerAction(row.action || row.status || 'ready');
    const okClass = row.ok === true ? 'warehouse-ok' : row.ok === false ? 'warehouse-bad' : '';
    return `<tr>
      <td title="${escapeAttr(row.email || '')}">${escapeHtml(row.email || '-')}</td>
      <td title="${escapeAttr(row.accountId || '')}">${escapeHtml(row.accountId || '-')}</td>
      <td>${escapeHtml(row.planType || '-')}</td>
      <td class="${okClass}" title="${escapeAttr(message)}">${escapeHtml(action)} · ${escapeHtml(message)}</td>
    </tr>`;
  }).join('');
}

async function checkCodexManagerConnection() {
  saveCodexManagerSettings();
  const payload = getCodexManagerPayload();
  if (!validateCodexManagerPayload(payload)) return;

  const btn = document.getElementById('btnCodexManagerCheck');
  setButtonLoading(btn, true);
  setCodexManagerState('running', '连接中');
  try {
    const res = await fetch('/api/warehouse/codex-manager/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '连接失败');

    setCodexManagerState('connected', `已连接 · ${data.accountTotal || 0} 个账号`);
    addCodexManagerLog(`连接成功: ${data.rpcUrl || payload.baseUrl}，Codex-Manager 当前账号 ${data.accountTotal || 0} 个`, 'success');
    showToast('Codex-Manager 连接成功', 'success');
  } catch (err) {
    setCodexManagerState('error', '连接失败');
    addCodexManagerLog('连接失败: ' + err.message, 'error');
    showToast('Codex-Manager 连接失败: ' + err.message, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function scanCodexManagerCandidates(options = {}) {
  saveCodexManagerSettings();
  const payload = getCodexManagerPayload();

  const btn = document.getElementById('btnCodexManagerScan');
  if (!options.silent) setButtonLoading(btn, true);
  setCodexManagerState('running', options.auto ? '自动扫描中' : '扫描中');
  try {
    const res = await fetch('/api/warehouse/codex-manager/scan-success', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '扫描失败');

    _codexManagerRows = data.candidates || [];
    renderCodexManagerRows(_codexManagerRows);
    updateCodexManagerStats(data);
    addCodexManagerLog(`扫描完成: 本地成功 ${data.successful || 0} 个，可导入 ${data.ready || 0} 个，无效 ${data.invalid || 0} 个`, data.ready ? 'success' : 'warning');
    setCodexManagerState('connected', `候选 ${data.ready || 0}`);
    if (!options.silent) showToast(`发现 ${data.ready || 0} 个可导入账号`, data.ready ? 'success' : 'warning');
    return data;
  } catch (err) {
    setCodexManagerState('error', '扫描失败');
    addCodexManagerLog('扫描失败: ' + err.message, 'error');
    if (!options.silent) showToast('Codex-Manager 扫描失败: ' + err.message, 'error');
    return null;
  } finally {
    if (!options.silent) setButtonLoading(btn, false);
  }
}

async function importCodexManagerSuccessAccounts(options = {}) {
  saveCodexManagerSettings();
  const payload = getCodexManagerPayload();
  if (!validateCodexManagerPayload(payload)) return;
  if (_codexManagerBusy) {
    if (!options.silent) showToast('Codex-Manager 导入正在处理中', 'warning');
    return;
  }

  const btn = document.getElementById('btnCodexManagerImport');
  _codexManagerBusy = true;
  if (!options.silent) setButtonLoading(btn, true);
  setCodexManagerState('running', options.auto ? '自动导入中' : '导入中');
  try {
    const res = await fetch('/api/warehouse/codex-manager/import-success', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '导入失败');

    const result = data.result || {};
    const created = result.created ?? 0;
    const updated = result.updated ?? 0;
    const failed = result.failed ?? 0;
    const imported = data.imported ?? 0;
    const skipped = (data.skippedExisting ?? 0) + (data.dedupedLocal ?? 0);
    _codexManagerRows = data.rows || data.candidates || [];
    renderCodexManagerRows(_codexManagerRows);
    updateCodexManagerStats({
      total: data.total || 0,
      ready: imported,
      imported: created + updated,
      failed,
    });
    const message = imported > 0
      ? `Codex-Manager 导入完成: 新增 ${created}，更新 ${updated}，跳过 ${skipped}，失败 ${failed}`
      : (data.message || '没有可导入账号');
    addCodexManagerLog(message, failed ? 'warning' : 'success');
    if (!options.silent) showToast(message, failed ? 'warning' : 'success');
    setCodexManagerState(failed ? 'error' : 'connected', failed ? `失败 ${failed}` : `已导入 ${imported}`);
  } catch (err) {
    if (!options.silent) showToast('Codex-Manager 导入失败: ' + err.message, 'error');
    addCodexManagerLog('导入失败: ' + err.message, 'error');
    setCodexManagerState('error', '导入失败');
  } finally {
    _codexManagerBusy = false;
    if (!options.silent) setButtonLoading(btn, false);
  }
}

async function scanCpa401() {
  saveCpaWarehouseSettings();
  const payload = getCpaWarehousePayload();
  if (!validateCpaWarehousePayload(payload)) return;

  const btn = document.getElementById('btnCpaScan401');
  setButtonLoading(btn, true);
  setWarehouseConnectionState('running', '连接中');
  try {
    const res = await fetch('/api/warehouse/cpa/scan-401', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '扫描失败');

    _warehouseRows = data.candidates || [];
    renderWarehouseRows(_warehouseRows);
    updateWarehouseStats({
      total: data.total,
      candidates: _warehouseRows.length,
      uploaded: 0,
      deleted: 0,
    });
    addWarehouseLog(`扫描完成: 共 ${data.total} 个凭证，发现 ${_warehouseRows.length} 个 401`, _warehouseRows.length ? 'warning' : 'success');
    showToast(`发现 ${_warehouseRows.length} 个 401 凭证`, _warehouseRows.length ? 'warning' : 'success');
    setWarehouseConnectionState('connected', _warehouseRows.length ? `已连接 · ${_warehouseRows.length} 个 401` : '已连接');
  } catch (err) {
    showToast('扫描失败: ' + err.message, 'error');
    addWarehouseLog('扫描失败: ' + err.message, 'error');
    setWarehouseConnectionState('error', '连接失败');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function repairCpa401(options = {}) {
  saveCpaWarehouseSettings();
  const payload = getCpaWarehousePayload();
  if (!validateCpaWarehousePayload(payload)) return;
  if (_warehouseBusy) {
    if (!options.silent) showToast('CPA 仓管正在处理中', 'warning');
    return;
  }

  const btn = document.getElementById('btnCpaRepair401');
  _warehouseBusy = true;
  if (!options.silent) setButtonLoading(btn, true);
  setWarehouseConnectionState('running', options.auto ? '自动运行中' : '连接中');
  try {
    const res = await fetch('/api/warehouse/cpa/repair-401', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '修复失败');

    _warehouseRows = data.results || [];
    renderWarehouseRows(_warehouseRows);
    updateWarehouseStats(data.summary || {});
    const summary = data.summary || {};
    const failed = summary.failed || 0;
    if (!options.auto || isCpaAutoEnabled()) {
      const label = options.auto ? '自动仓管已连接' : '已连接';
      setWarehouseConnectionState('connected', failed > 0 ? `${label} · ${failed} 个失败` : label);
    }
    if (!options.silent) showToast('CPA 仓管处理完成', 'success');
  } catch (err) {
    if (!options.silent) showToast('修复失败: ' + err.message, 'error');
    addWarehouseLog('修复失败: ' + err.message, 'error');
    setWarehouseConnectionState('error', '连接失败');
  } finally {
    _warehouseBusy = false;
    if (!options.silent) setButtonLoading(btn, false);
  }
}

function stopCpaAutoWarehouse(reason = '自动仓管已关闭') {
  if (_warehouseAutoTimer) {
    clearInterval(_warehouseAutoTimer);
    _warehouseAutoTimer = null;
  }
  setWarehouseConnectionState('idle', '未连接');
  addWarehouseLog(reason, 'info');
}

function startCpaAutoWarehouse() {
  saveCpaWarehouseSettings();
  if (_warehouseAutoTimer) {
    clearInterval(_warehouseAutoTimer);
    _warehouseAutoTimer = null;
  }

  const payload = getCpaWarehousePayload();
  if (!validateCpaWarehousePayload(payload)) {
    document.getElementById('cpaAutoToggle').checked = false;
    saveCpaWarehouseSettings();
    setWarehouseConnectionState('idle', '未连接');
    return;
  }

  const intervalMs = getCpaAutoIntervalMs();
  const minutes = Math.round(intervalMs / 60000);
  setWarehouseConnectionState('running', '自动运行中');
  addWarehouseLog(`自动仓管已开启: 每 ${minutes} 分钟扫描并修复 401`, 'success');
  repairCpa401({ auto: true, silent: true });
  _warehouseAutoTimer = setInterval(() => {
    repairCpa401({ auto: true, silent: true });
  }, intervalMs);
}

function handleCpaAutoToggle() {
  saveCpaWarehouseSettings();
  const enabled = document.getElementById('cpaAutoToggle')?.checked;
  if (enabled) startCpaAutoWarehouse();
  else stopCpaAutoWarehouse();
}

function restartCpaAutoWarehouseIfNeeded() {
  saveCpaWarehouseSettings();
  const toggle = document.getElementById('cpaAutoToggle');
  if (!toggle?.checked) return;
  startCpaAutoWarehouse();
}

function stopCodexManagerAutoImport(reason = 'Codex-Manager 自动导入已关闭') {
  if (_codexManagerAutoTimer) {
    clearInterval(_codexManagerAutoTimer);
    _codexManagerAutoTimer = null;
  }
  setCodexManagerState('idle', '未连接');
  addCodexManagerLog(reason, 'info');
}

function startCodexManagerAutoImport() {
  saveCodexManagerSettings();
  if (_codexManagerAutoTimer) {
    clearInterval(_codexManagerAutoTimer);
    _codexManagerAutoTimer = null;
  }

  const payload = getCodexManagerPayload();
  if (!validateCodexManagerPayload(payload)) {
    document.getElementById('codexManagerAutoToggle').checked = false;
    saveCodexManagerSettings();
    setCodexManagerState('idle', '未连接');
    return;
  }

  const intervalMs = getCodexManagerAutoIntervalMs();
  const minutes = Math.round(intervalMs / 60000);
  setCodexManagerState('running', '自动导入中');
  addCodexManagerLog(`自动导入已开启: 每 ${minutes} 分钟扫描并导入成功账号`, 'success');
  importCodexManagerSuccessAccounts({ auto: true, silent: true });
  _codexManagerAutoTimer = setInterval(() => {
    importCodexManagerSuccessAccounts({ auto: true, silent: true });
  }, intervalMs);
}

function handleCodexManagerAutoToggle() {
  saveCodexManagerSettings();
  const enabled = document.getElementById('codexManagerAutoToggle')?.checked;
  if (enabled) startCodexManagerAutoImport();
  else stopCodexManagerAutoImport();
}

function restartCodexManagerAutoIfNeeded() {
  saveCodexManagerSettings();
  if (!isCodexManagerAutoEnabled()) return;
  startCodexManagerAutoImport();
}

function renderWarehouseRows(rows) {
  const tbody = document.getElementById('warehouseTableBody');
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state" style="padding:40px 20px"><p>没有需要处理的 401 凭证</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const message = row.message || row.status_message || '-';
    const action = formatWarehouseAction(row.action || row.status || '401');
    const okClass = row.ok === true ? 'warehouse-ok' : row.ok === false ? 'warehouse-bad' : '';
    return `<tr>
      <td title="${escapeAttr(row.name || '')}">${escapeHtml(row.name || '-')}</td>
      <td title="${escapeAttr(row.email || '')}">${escapeHtml(row.email || '-')}</td>
      <td>${escapeHtml(action)}</td>
      <td class="${okClass}" title="${escapeAttr(message)}">${escapeHtml(message)}</td>
    </tr>`;
  }).join('');
}

function updateWarehouseStats(summary = {}) {
  document.getElementById('cpaStatTotal').textContent = summary.total ?? 0;
  document.getElementById('cpaStat401').textContent = summary.candidates ?? summary.processed ?? 0;
  document.getElementById('cpaStatUploaded').textContent = summary.uploaded ?? 0;
  document.getElementById('cpaStatDeleted').textContent = summary.deleted ?? 0;
}

function formatWarehouseAction(action) {
  const labels = {
    uploaded: '已上传',
    deleted_deactivated: '封号删除',
    skipped: '已跳过',
    login_failed: '登录失败',
    ready: '正常',
  };
  return labels[action] || action || '-';
}

function onWarehouseEvent(data) {
  if (data.type === 'warehouse_start') {
    addWarehouseLog(`开始处理: ${data.total || 0} 个 401 凭证`, 'info');
  } else if (data.type === 'warehouse_status') {
    if (!WAREHOUSE_LOGGABLE_LOGIN_STATUSES.has(data.status)) return;
    addWarehouseLog(`${data.email || data.name || 'CPA 凭证'} ${formatLoginStatus(data.status, data.detail)}`, data.status === 'waiting_code' ? 'warning' : 'info');
  } else if (data.type === 'warehouse_item') {
    const result = data.result || {};
    addWarehouseLog(`${result.email || result.name || 'CPA 凭证'} ${result.message || result.action}`, result.ok ? 'success' : 'warning');
  } else if (data.type === 'warehouse_complete') {
    const s = data.summary || {};
    addWarehouseLog(`处理完成: 上传 ${s.uploaded || 0}，删除 ${s.deleted || 0}，失败 ${s.failed || 0}，跳过 ${s.skipped || 0}`, s.failed ? 'warning' : 'success');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadCpaWarehouseSettings();
  loadCodexManagerSettings();
  document.getElementById('btnCpaScan401')?.addEventListener('click', scanCpa401);
  document.getElementById('btnCpaRepair401')?.addEventListener('click', () => repairCpa401());
  document.getElementById('cpaAutoToggle')?.addEventListener('change', handleCpaAutoToggle);
  document.getElementById('cpaAutoInterval')?.addEventListener('change', restartCpaAutoWarehouseIfNeeded);
  document.getElementById('cpaBaseUrl')?.addEventListener('change', restartCpaAutoWarehouseIfNeeded);
  document.getElementById('cpaManagementKey')?.addEventListener('change', restartCpaAutoWarehouseIfNeeded);
  document.getElementById('cpaMaxItems')?.addEventListener('change', saveCpaWarehouseSettings);
  document.getElementById('cpaBaseUrl')?.addEventListener('input', saveCpaWarehouseSettings);
  document.getElementById('cpaManagementKey')?.addEventListener('input', saveCpaWarehouseSettings);
  document.getElementById('cpaMaxItems')?.addEventListener('input', saveCpaWarehouseSettings);
  document.getElementById('cpaAutoInterval')?.addEventListener('input', saveCpaWarehouseSettings);
  document.getElementById('btnCodexManagerImport')?.addEventListener('click', importCodexManagerSuccessAccounts);
  document.getElementById('btnCodexManagerCheck')?.addEventListener('click', checkCodexManagerConnection);
  document.getElementById('btnCodexManagerScan')?.addEventListener('click', () => scanCodexManagerCandidates());
  document.getElementById('btnClearCodexManagerLogs')?.addEventListener('click', () => {
    document.getElementById('codexManagerLogList').innerHTML = '';
    addCodexManagerLog('Codex-Manager 日志已清空', 'info');
  });
  document.getElementById('codexManagerAutoToggle')?.addEventListener('change', handleCodexManagerAutoToggle);
  document.getElementById('codexManagerAutoInterval')?.addEventListener('change', restartCodexManagerAutoIfNeeded);
  document.getElementById('codexManagerBaseUrl')?.addEventListener('input', saveCodexManagerSettings);
  document.getElementById('codexManagerRpcToken')?.addEventListener('input', saveCodexManagerSettings);
  document.getElementById('codexManagerWebPassword')?.addEventListener('input', saveCodexManagerSettings);
  document.getElementById('codexManagerWebUsername')?.addEventListener('input', saveCodexManagerSettings);
  document.getElementById('codexManagerMaxItems')?.addEventListener('input', saveCodexManagerSettings);
  document.getElementById('codexManagerSkipExisting')?.addEventListener('change', restartCodexManagerAutoIfNeeded);
  document.getElementById('codexManagerBaseUrl')?.addEventListener('change', restartCodexManagerAutoIfNeeded);
  document.getElementById('codexManagerRpcToken')?.addEventListener('change', restartCodexManagerAutoIfNeeded);
  document.getElementById('codexManagerWebPassword')?.addEventListener('change', restartCodexManagerAutoIfNeeded);
  document.getElementById('codexManagerWebUsername')?.addEventListener('change', restartCodexManagerAutoIfNeeded);
  document.getElementById('codexManagerMaxItems')?.addEventListener('change', saveCodexManagerSettings);
  document.getElementById('codexManagerAutoInterval')?.addEventListener('input', saveCodexManagerSettings);
  setWarehouseConnectionState('idle', '未连接');
  setCodexManagerState('idle', '未连接');
  if (document.getElementById('cpaAutoToggle')?.checked) startCpaAutoWarehouse();
  if (document.getElementById('codexManagerAutoToggle')?.checked) startCodexManagerAutoImport();
});

import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'

const ITEMS_PER_PAGE = 12

// SSE 流式请求工具
function useSSERequest() {
  const abortRef = useRef(null)

  const startSSE = useCallback((url, body, { onStart, onProgress, onDone, onError }) => {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    }).then(async res => {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        let eventType = 'message'
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (eventType === 'start') onStart?.(data)
              else if (eventType === 'progress') onProgress?.(data)
              else if (eventType === 'done') onDone?.(data)
              else if (eventType === 'error') onError?.(data)
            } catch {}
          }
        }
      }
    }).catch(e => {
      if (e.name !== 'AbortError') onError?.({ error: e.message })
    })

    return () => ctrl.abort()
  }, [])

  const cancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
  }, [])

  return { startSSE, cancel }
}

function CodexPage() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  // 操作状态
  const [operation, setOperation] = useState(null) // null | 'checking' | 'deleting' | 'quota'
  const [progress, setProgress] = useState({ checked: 0, total: 0, valid: 0, invalid: 0, current: '' })
  const [checkResult, setCheckResult] = useState(null) // { valid, invalid, invalidAccounts }
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0, deleted: 0, failed: 0 })

  const [checkingQuota, setCheckingQuota] = useState(false)
  const [showQuotaModal, setShowQuotaModal] = useState(false)
  const [showCleanModal, setShowCleanModal] = useState(false)
  const [cleanThreshold, setCleanThreshold] = useState({ quota: 20, days: 5 })
  const [toast, setToast] = useState(null)

  const { startSSE, cancel: cancelSSE } = useSSERequest()

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/codex/accounts')
      if (res.ok) {
        const data = await res.json()
        setAccounts(data)
      }
    } catch (e) {
      console.error('Failed to fetch accounts:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAccounts() }, [])

  // 流式检查账号状态
  const handleCheckStatus = () => {
    setOperation('checking')
    setProgress({ checked: 0, total: 0, valid: 0, invalid: 0, current: '' })
    setCheckResult(null)

    startSSE('/api/codex/check-stream', null, {
      onStart: (data) => {
        setProgress(p => ({ ...p, total: data.total }))
      },
      onProgress: (data) => {
        setProgress({
          checked: data.checked,
          total: data.total,
          valid: data.valid,
          invalid: data.invalid,
          current: data.current,
        })
        // 实时标记卡片状态
        setAccounts(prev => prev.map(acc =>
          acc.email === data.current
            ? { ...acc, checkStatus: data.status }
            : acc
        ))
      },
      onDone: (data) => {
        setCheckResult({
          valid: data.valid,
          invalid: data.invalid,
          invalidAccounts: data.invalidAccounts || [],
        })
        if (data.invalidAccounts) {
          const invalidEmails = new Set(data.invalidAccounts.map(a => a.email))
          setAccounts(prev => prev.map(acc => ({
            ...acc,
            checkStatus: invalidEmails.has(acc.email) ? 'invalid' : 'valid'
          })))
        }
        setOperation(null)
      },
      onError: (data) => {
        showToast(data.error || '检查出错', 'error')
        setOperation(null)
      }
    })
  }

  // 流式删除无效账号
  const handleDeleteInvalid = () => {
    if (!checkResult?.invalidAccounts?.length) return
    const names = checkResult.invalidAccounts.map(a => a.name).filter(Boolean)
    if (names.length === 0) return

    setOperation('deleting')
    setDeleteProgress({ current: 0, total: names.length, deleted: 0, failed: 0 })

    startSSE('/api/codex/delete-stream', { names }, {
      onStart: (data) => {
        setDeleteProgress(p => ({ ...p, total: data.total }))
      },
      onProgress: (data) => {
        setDeleteProgress({
          current: data.current,
          total: data.total,
          deleted: data.deleted,
          failed: data.failed,
        })
      },
      onDone: (data) => {
        setOperation(null)
        setCheckResult(null)
        showToast(`已删除 ${data.deleted} 个无效账号`)
        fetchAccounts()
      },
      onError: (data) => {
        setOperation(null)
        showToast(data.error || '删除出错', 'error')
      }
    })
  }

  // 流式删除低配额账号
  const handleCleanLowQuota = () => {
    const toClean = getCleanableAccounts()
    if (toClean.length === 0) return
    const authIndexes = toClean.map(a => a.authIndex)

    setShowCleanModal(false)
    setOperation('deleting')
    setDeleteProgress({ current: 0, total: toClean.length, deleted: 0, failed: 0 })

    startSSE('/api/codex/delete-stream', { authIndexes }, {
      onStart: (data) => {
        setDeleteProgress(p => ({ ...p, total: data.total }))
      },
      onProgress: (data) => {
        setDeleteProgress({
          current: data.current,
          total: data.total,
          deleted: data.deleted,
          failed: data.failed,
        })
      },
      onDone: (data) => {
        setOperation(null)
        showToast(`已清除 ${data.deleted} 个低配额账号`)
        fetchAccounts()
      },
      onError: (data) => {
        setOperation(null)
        showToast(data.error || '清除出错', 'error')
      }
    })
  }

  // 配额检查（保持原有逻辑）
  const handleCheckQuota = async (pageCount) => {
    setShowQuotaModal(false)
    setCheckingQuota(true)

    let startIdx, endIdx
    if (pageCount === 'all') {
      startIdx = 0
      endIdx = accounts.length
    } else {
      const pages = parseInt(pageCount)
      startIdx = (page - 1) * ITEMS_PER_PAGE
      endIdx = Math.min(startIdx + pages * ITEMS_PER_PAGE, accounts.length)
    }

    const authIndexes = accounts.slice(startIdx, endIdx).map(a => a.authIndex).filter(Boolean)

    try {
      const res = await fetch('/api/codex/quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authIndexes })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.quotas) {
          setAccounts(prev => prev.map(acc => {
            const quota = data.quotas.find(q => q.authIndex === acc.authIndex)
            return quota ? {
              ...acc,
              quota: quota.completionQuota,
              usedPercent: quota.usedPercent,
              resetAt: quota.resetAt
            } : acc
          }))
        }
        showToast(`已检查 ${data.checked} 个账号配额`)
      }
    } catch (e) {
      showToast('配额检查失败', 'error')
    } finally {
      setCheckingQuota(false)
    }
  }

  const getCleanableAccounts = () => {
    const now = Date.now() / 1000
    const thresholdSeconds = cleanThreshold.days * 24 * 60 * 60
    return accounts.filter(acc => {
      if (acc.quota === undefined) return false
      if (acc.quota > cleanThreshold.quota) return false
      if (!acc.resetAt) return false
      return (acc.resetAt - now) > thresholdSeconds
    })
  }

  const isBusy = operation !== null || checkingQuota
  const totalPages = Math.ceil(accounts.length / ITEMS_PER_PAGE)
  const invalidCount = accounts.filter(a => a.checkStatus === 'invalid').length

  const pct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0
  const delPct = deleteProgress.total > 0 ? Math.round((deleteProgress.current / deleteProgress.total) * 100) : 0

  return (
    <div className="min-h-screen pt-10 pb-20 px-6 bg-white">
      <div className="max-w-6xl mx-auto">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-6 right-6 z-[100] px-5 py-3 rounded-lg shadow-lg text-sm font-medium transition-all animate-in slide-in-from-right ${
            toast.type === 'error' ? 'bg-[#ef4444] text-white' : 'bg-[#0d0d0d] text-white'
          }`}>
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="text-[#6e6e80] hover:text-[#0d0d0d] flex items-center gap-2 mb-4 transition-colors text-sm cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            返回使用量统计
          </Link>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-[#0d0d0d]">CodeX 账号管理</h1>
              <p className="text-[#6e6e80] mt-1.5 text-sm">
                批量检查账号有效性、查询剩余配额，自动清理无效和低配额账号
              </p>
            </div>
            {!loading && accounts.length > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <span className="px-3 py-1.5 rounded-lg bg-[#f7f7f8] text-[#0d0d0d] font-medium">{accounts.length} 个账号</span>
                {accounts.filter(a => a.planType === 'team').length > 0 && (
                  <span className="px-3 py-1.5 rounded-lg bg-[#dbeafe] text-[#1d4ed8] font-medium">
                    {accounts.filter(a => a.planType === 'team').length} Team
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 进度面板 — 检查状态 */}
        {operation === 'checking' && (
          <div className="mb-6 p-5 border border-[#e5e5e5] rounded-xl bg-[#fafafa]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse" />
                <span className="text-sm font-medium text-[#0d0d0d]">正在检查账号有效性</span>
              </div>
              <span className="text-sm text-[#6e6e80] font-mono">{progress.checked} / {progress.total}</span>
            </div>
            <div className="h-3 bg-[#e5e5e5] rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[#6e6e80]">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#10a37f]" />
                  有效 {progress.valid}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#ef4444]" />
                  无效 {progress.invalid}
                </span>
              </div>
              {progress.current && (
                <span className="font-mono truncate max-w-[200px]" title={progress.current}>
                  {progress.current}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 进度面板 — 删除中 */}
        {operation === 'deleting' && (
          <div className="mb-6 p-5 border border-[#fecaca] rounded-xl bg-[#fef2f2]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse" />
                <span className="text-sm font-medium text-[#0d0d0d]">正在删除账号</span>
              </div>
              <span className="text-sm text-[#6e6e80] font-mono">{deleteProgress.current} / {deleteProgress.total}</span>
            </div>
            <div className="h-3 bg-[#fecaca] rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ef4444] to-[#f87171] transition-all duration-300"
                style={{ width: `${delPct}%` }}
              />
            </div>
            <div className="flex items-center gap-4 text-xs text-[#6e6e80]">
              <span>已删除 {deleteProgress.deleted}</span>
              {deleteProgress.failed > 0 && <span className="text-[#ef4444]">失败 {deleteProgress.failed}</span>}
            </div>
          </div>
        )}

        {/* 检查完成结果面板 */}
        {checkResult && operation === null && (
          <div className="mb-6 p-5 border border-[#e5e5e5] rounded-xl bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[#0d0d0d]">检查完成</h3>
              <button onClick={() => setCheckResult(null)} className="text-[#6e6e80] hover:text-[#0d0d0d] transition-colors cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-[#f7f7f8] rounded-lg text-center">
                <p className="text-2xl font-semibold text-[#0d0d0d]">{checkResult.valid + checkResult.invalid}</p>
                <p className="text-xs text-[#6e6e80] mt-1">总检查</p>
              </div>
              <div className="p-3 bg-[#f0fdf4] rounded-lg text-center">
                <p className="text-2xl font-semibold text-[#10a37f]">{checkResult.valid}</p>
                <p className="text-xs text-[#6e6e80] mt-1">有效账号</p>
              </div>
              <div className="p-3 bg-[#fef2f2] rounded-lg text-center">
                <p className="text-2xl font-semibold text-[#ef4444]">{checkResult.invalid}</p>
                <p className="text-xs text-[#6e6e80] mt-1">无效账号</p>
              </div>
            </div>
            {checkResult.invalid > 0 && (
              <button
                onClick={handleDeleteInvalid}
                className="w-full py-2.5 bg-[#ef4444] text-white rounded-lg text-sm font-medium hover:bg-[#dc2626] transition-colors cursor-pointer"
              >
                一键删除 {checkResult.invalid} 个无效账号
              </button>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={handleCheckStatus}
            disabled={isBusy || accounts.length === 0}
            className="px-5 py-2.5 bg-[#0d0d0d] text-white rounded-lg text-sm font-medium hover:bg-[#2d2d2d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer inline-flex items-center gap-2"
          >
            {operation === 'checking' ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                检查中 {pct}%
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                检查有效性
              </>
            )}
          </button>
          <button
            onClick={() => setShowQuotaModal(true)}
            disabled={isBusy || accounts.length === 0}
            className="px-5 py-2.5 bg-white text-[#0d0d0d] border border-[#e5e5e5] rounded-lg text-sm font-medium hover:bg-[#f7f7f8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer inline-flex items-center gap-2"
          >
            {checkingQuota ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-[#0d0d0d]/30 border-t-[#0d0d0d] rounded-full animate-spin" />
                查询配额中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                查询配额
              </>
            )}
          </button>
          <button
            onClick={() => setShowCleanModal(true)}
            disabled={isBusy}
            className="px-5 py-2.5 bg-white text-[#ef4444] border border-[#ef4444]/30 rounded-lg text-sm font-medium hover:bg-[#fef2f2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            清除低配额
          </button>
          {invalidCount > 0 && !checkResult && (
            <span className="px-3 py-2.5 text-xs text-[#ef4444] bg-[#fef2f2] rounded-lg font-medium">
              {invalidCount} 个无效账号
            </span>
          )}
        </div>

        {/* 账号列表 */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-2 border-[#e5e5e5] border-t-[#0d0d0d] rounded-full animate-spin" />
            <p className="mt-4 text-[#6e6e80] text-sm">正在加载账号列表...</p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-20 text-[#6e6e80]">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <p className="text-lg font-medium text-[#0d0d0d]">暂无 CodeX 账号</p>
            <p className="text-sm mt-2">请先在 CLI-Proxy 中配置 CodeX 账号后刷新此页面</p>
          </div>
        ) : (
          <>
            {/* 分页 */}
            {totalPages > 1 && (
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs text-[#6e6e80]">
                  显示第 {(page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, accounts.length)} 个，共 {accounts.length} 个
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-xs border border-[#e5e5e5] rounded-lg hover:bg-[#f7f7f8] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    上一页
                  </button>
                  <span className="px-3 py-1.5 text-xs text-[#6e6e80] font-mono">{page}/{totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-xs border border-[#e5e5e5] rounded-lg hover:bg-[#f7f7f8] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}

            {/* 卡片网格 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE).map((account, idx) => (
                <div
                  key={idx}
                  className={`group relative p-4 border rounded-xl flex flex-col transition-all duration-200 cursor-default ${
                    account.checkStatus === 'invalid'
                      ? 'border-[#ef4444]/40 bg-[#fef2f2]'
                      : account.checkStatus === 'valid'
                      ? 'border-[#10a37f]/40 bg-[#f0fdf4]'
                      : 'border-[#e5e5e5] hover:border-[#d1d1d6] hover:shadow-sm'
                  }`}
                >
                  {/* 邮箱 + 状态 */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="font-mono text-[13px] text-[#0d0d0d] break-all leading-5 flex-1" title={account.email}>
                      {account.email}
                    </p>
                    {account.checkStatus === 'valid' && (
                      <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-[#10a37f] text-white rounded">
                        ALIVE
                      </span>
                    )}
                    {account.checkStatus === 'invalid' && (
                      <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-[#ef4444] text-white rounded">
                        DEAD
                      </span>
                    )}
                  </div>

                  {/* Plan 标签 */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      account.planType === 'team'
                        ? 'bg-[#dbeafe] text-[#1d4ed8]'
                        : 'bg-[#f3f4f6] text-[#6b7280]'
                    }`}>
                      {(account.planType || 'free').toUpperCase()}
                    </span>
                  </div>

                  {/* 配额条 */}
                  <div className="mt-auto">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-[#6e6e80]">
                        {account.quota !== undefined ? '剩余配额' : '配额未检查'}
                      </span>
                      {account.quota !== undefined && (
                        <span className={`text-[11px] font-semibold ${
                          account.quota > 50 ? 'text-[#10a37f]' : account.quota > 20 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
                        }`}>
                          {Math.round(account.quota)}%
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 bg-[#e5e5e5] rounded-full overflow-hidden">
                      {account.quota !== undefined ? (
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            account.quota > 50 ? 'bg-[#10a37f]' : account.quota > 20 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'
                          }`}
                          style={{ width: `${account.quota}%` }}
                        />
                      ) : (
                        <div className="h-full w-0 bg-[#d1d5db] rounded-full" />
                      )}
                    </div>
                    {account.resetAt && (
                      <p className="text-[10px] text-[#8e8ea0] mt-1">
                        配额重置于 {new Date(account.resetAt * 1000).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 底部分页 */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-xs border border-[#e5e5e5] rounded-lg hover:bg-[#f7f7f8] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    首页
                  </button>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-xs border border-[#e5e5e5] rounded-lg hover:bg-[#f7f7f8] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    上一页
                  </button>
                  <span className="px-4 py-1.5 text-xs text-[#6e6e80]">{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-xs border border-[#e5e5e5] rounded-lg hover:bg-[#f7f7f8] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    下一页
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-xs border border-[#e5e5e5] rounded-lg hover:bg-[#f7f7f8] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    末页
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* 配额检查弹窗 */}
        {showQuotaModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowQuotaModal(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-[#0d0d0d] mb-1">查询账号配额</h3>
              <p className="text-xs text-[#6e6e80] mb-5">选择检查范围（从当前页第 {page} 页开始），建议分批检查以避免请求限制</p>
              <div className="space-y-2">
                {[1, 3, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => handleCheckQuota(n)}
                    className="w-full py-3 text-left px-4 border border-[#e5e5e5] rounded-xl hover:bg-[#f7f7f8] transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span className="text-sm font-medium">{n} 页</span>
                    <span className="text-xs text-[#6e6e80]">{Math.min(ITEMS_PER_PAGE * n, accounts.length - (page - 1) * ITEMS_PER_PAGE)} 个账号</span>
                  </button>
                ))}
                <button
                  onClick={() => handleCheckQuota('all')}
                  className="w-full py-3 text-left px-4 border border-[#ef4444]/30 rounded-xl hover:bg-[#fef2f2] transition-colors cursor-pointer flex items-center justify-between text-[#ef4444]"
                >
                  <span className="text-sm font-medium">全部</span>
                  <span className="text-xs">{accounts.length} 个账号</span>
                </button>
              </div>
              <button
                onClick={() => setShowQuotaModal(false)}
                className="w-full mt-4 py-2 text-xs text-[#6e6e80] hover:text-[#0d0d0d] transition-colors cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 清除低配额弹窗 */}
        {showCleanModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowCleanModal(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-[#0d0d0d] mb-1">清除低配额账号</h3>
              <p className="text-xs text-[#6e6e80] mb-5">删除配额不足且短期内不会恢复的账号，需先查询配额</p>

              <div className="mb-4 p-3 bg-[#f7f7f8] rounded-xl grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-xl font-semibold text-[#0d0d0d]">{accounts.length}</p>
                  <p className="text-[10px] text-[#6e6e80]">总账号</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-[#0d0d0d]">{accounts.filter(a => a.quota !== undefined).length}</p>
                  <p className="text-[10px] text-[#6e6e80]">已查配额</p>
                </div>
              </div>

              <div className="space-y-4 mb-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-[#0d0d0d] font-medium">剩余配额低于</label>
                    <span className="text-xs font-semibold text-[#ef4444]">{cleanThreshold.quota}%</span>
                  </div>
                  <input
                    type="range" min="0" max="50"
                    value={cleanThreshold.quota}
                    onChange={e => setCleanThreshold(prev => ({ ...prev, quota: parseInt(e.target.value) }))}
                    className="w-full h-1.5 bg-[#e5e5e5] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[#0d0d0d] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-[#0d0d0d] font-medium">恢复还需超过</label>
                    <span className="text-xs font-semibold text-[#ef4444]">{cleanThreshold.days} 天</span>
                  </div>
                  <input
                    type="range" min="1" max="7"
                    value={cleanThreshold.days}
                    onChange={e => setCleanThreshold(prev => ({ ...prev, days: parseInt(e.target.value) }))}
                    className="w-full h-1.5 bg-[#e5e5e5] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[#0d0d0d] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#fef2f2] rounded-xl mb-4 text-center">
                <p className="text-sm text-[#ef4444]">
                  将删除 <span className="font-bold text-lg">{getCleanableAccounts().length}</span> 个账号
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleCleanLowQuota}
                  disabled={getCleanableAccounts().length === 0}
                  className="w-full py-3 bg-[#ef4444] text-white rounded-xl text-sm font-medium hover:bg-[#dc2626] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  确认清除
                </button>
                <button
                  onClick={() => setShowCleanModal(false)}
                  className="w-full py-3 border border-[#e5e5e5] rounded-xl text-sm font-medium hover:bg-[#f7f7f8] transition-colors cursor-pointer"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CodexPage

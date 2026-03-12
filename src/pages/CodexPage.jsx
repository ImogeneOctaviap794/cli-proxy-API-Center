import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'

const PER_PAGE = 15

const cx = (...cls) => cls.filter(Boolean).join(' ')

function useSSE() {
  const ref = useRef(null)
  const fire = useCallback((url, body, cbs) => {
    if (ref.current) ref.current.abort()
    const ctrl = new AbortController()
    ref.current = ctrl
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    }).then(async res => {
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        let ev = 'message'
        for (const l of lines) {
          if (l.startsWith('event: ')) ev = l.slice(7).trim()
          else if (l.startsWith('data: ')) {
            try {
              const d = JSON.parse(l.slice(6))
              cbs[ev]?.(d)
            } catch {}
          }
        }
      }
    }).catch(e => {
      if (e.name !== 'AbortError') cbs.error?.({ error: e.message })
    })
    return () => ctrl.abort()
  }, [])
  return fire
}

const neonStyles = `
  @keyframes scanline {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }
  @keyframes glow-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @keyframes data-flow {
    0% { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
  @keyframes float-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .neon-card {
    background: linear-gradient(135deg, rgba(0,229,255,0.03) 0%, rgba(15,15,30,0.8) 100%);
    border: 1px solid rgba(0,229,255,0.12);
    backdrop-filter: blur(8px);
    transition: all 0.25s ease;
  }
  .neon-card:hover {
    border-color: rgba(0,229,255,0.35);
    box-shadow: 0 0 20px rgba(0,229,255,0.08), inset 0 0 20px rgba(0,229,255,0.03);
  }
  .neon-card.dead {
    border-color: rgba(255,51,102,0.4);
    background: linear-gradient(135deg, rgba(255,51,102,0.06) 0%, rgba(15,15,30,0.8) 100%);
  }
  .neon-card.alive {
    border-color: rgba(0,255,136,0.3);
    background: linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(15,15,30,0.8) 100%);
  }
  .neon-btn {
    position: relative;
    overflow: hidden;
    transition: all 0.2s ease;
  }
  .neon-btn::after {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .neon-btn:hover::after {
    opacity: 1;
  }
  .progress-glow {
    background: linear-gradient(90deg, #00e5ff, #00ff88, #00e5ff);
    background-size: 200% 100%;
    animation: data-flow 2s linear infinite;
  }
  .progress-glow-red {
    background: linear-gradient(90deg, #ff3366, #ff6600, #ff3366);
    background-size: 200% 100%;
    animation: data-flow 2s linear infinite;
  }
  .stat-panel {
    background: rgba(0,229,255,0.04);
    border: 1px solid rgba(0,229,255,0.15);
    position: relative;
  }
  .stat-panel::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0,229,255,0.5), transparent);
  }
  .float-in {
    animation: float-in 0.3s ease forwards;
  }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .sans { font-family: 'Inter', sans-serif; }
`

function CodexPage() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [op, setOp] = useState(null)
  const [prog, setProg] = useState({ checked: 0, total: 0, valid: 0, invalid: 0, current: '' })
  const [result, setResult] = useState(null)
  const [delProg, setDelProg] = useState({ current: 0, total: 0, deleted: 0, failed: 0 })
  const [quotaLoading, setQuotaLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [cleanCfg, setCleanCfg] = useState({ quota: 20, days: 5 })
  const [toast, setToast] = useState(null)
  const fire = useSSE()

  const notify = (msg, t = 'ok') => { setToast({ msg, t }); setTimeout(() => setToast(null), 4000) }

  const load = async () => {
    try {
      const r = await fetch('/api/codex/accounts')
      if (r.ok) setAccounts(await r.json())
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const doCheck = () => {
    setOp('check')
    setProg({ checked: 0, total: 0, valid: 0, invalid: 0, current: '' })
    setResult(null)
    fire('/api/codex/check-stream', null, {
      start: d => setProg(p => ({ ...p, total: d.total })),
      progress: d => {
        setProg({ checked: d.checked, total: d.total, valid: d.valid, invalid: d.invalid, current: d.current })
        setAccounts(prev => prev.map(a => a.email === d.current ? { ...a, checkStatus: d.status } : a))
      },
      done: d => {
        setResult({ valid: d.valid, invalid: d.invalid, list: d.invalidAccounts || [] })
        if (d.invalidAccounts) {
          const bad = new Set(d.invalidAccounts.map(a => a.email))
          setAccounts(prev => prev.map(a => ({ ...a, checkStatus: bad.has(a.email) ? 'invalid' : 'valid' })))
        }
        setOp(null)
      },
      error: d => { notify(d.error || 'SCAN FAILED', 'err'); setOp(null) },
    })
  }

  const doDeleteInvalid = () => {
    if (!result?.list?.length) return
    const names = result.list.map(a => a.name).filter(Boolean)
    if (!names.length) return
    setOp('del')
    setDelProg({ current: 0, total: names.length, deleted: 0, failed: 0 })
    fire('/api/codex/delete-stream', { names }, {
      start: d => setDelProg(p => ({ ...p, total: d.total })),
      progress: d => setDelProg({ current: d.current, total: d.total, deleted: d.deleted, failed: d.failed }),
      done: d => { setOp(null); setResult(null); notify(`PURGED ${d.deleted} DEAD NODES`); load() },
      error: d => { setOp(null); notify(d.error || 'PURGE FAILED', 'err') },
    })
  }

  const doClean = () => {
    const targets = getCleanable()
    if (!targets.length) return
    setModal(null)
    setOp('del')
    setDelProg({ current: 0, total: targets.length, deleted: 0, failed: 0 })
    fire('/api/codex/delete-stream', { authIndexes: targets.map(a => a.authIndex) }, {
      start: d => setDelProg(p => ({ ...p, total: d.total })),
      progress: d => setDelProg({ current: d.current, total: d.total, deleted: d.deleted, failed: d.failed }),
      done: d => { setOp(null); notify(`CLEANED ${d.deleted} LOW-QUOTA NODES`); load() },
      error: d => { setOp(null); notify(d.error || 'CLEAN FAILED', 'err') },
    })
  }

  const doQuota = async (scope) => {
    setModal(null)
    setQuotaLoading(true)
    let s = 0, e = accounts.length
    if (scope !== 'all') { const n = parseInt(scope); s = (page - 1) * PER_PAGE; e = Math.min(s + n * PER_PAGE, accounts.length) }
    const idxs = accounts.slice(s, e).map(a => a.authIndex).filter(Boolean)
    try {
      const r = await fetch('/api/codex/quota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authIndexes: idxs }) })
      if (r.ok) {
        const d = await r.json()
        if (d.quotas) setAccounts(prev => prev.map(a => { const q = d.quotas.find(x => x.authIndex === a.authIndex); return q ? { ...a, quota: q.completionQuota, usedPercent: q.usedPercent, resetAt: q.resetAt } : a }))
        notify(`SCANNED ${d.checked} QUOTAS`)
      }
    } catch { notify('QUOTA SCAN FAILED', 'err') } finally { setQuotaLoading(false) }
  }

  const getCleanable = () => {
    const now = Date.now() / 1000, th = cleanCfg.days * 86400
    return accounts.filter(a => a.quota !== undefined && a.quota <= cleanCfg.quota && a.resetAt && (a.resetAt - now) > th)
  }

  const busy = op || quotaLoading
  const pages = Math.ceil(accounts.length / PER_PAGE)
  const pct = prog.total > 0 ? Math.round((prog.checked / prog.total) * 100) : 0
  const dpct = delProg.total > 0 ? Math.round((delProg.current / delProg.total) * 100) : 0
  const teamCount = accounts.filter(a => a.planType === 'team').length
  const aliveCount = accounts.filter(a => a.checkStatus === 'valid').length
  const deadCount = accounts.filter(a => a.checkStatus === 'invalid').length

  return (
    <>
      <style>{neonStyles}</style>
      <div className="min-h-screen sans" style={{ background: 'linear-gradient(180deg, #06080f 0%, #0a0e1a 50%, #06080f 100%)' }}>

        {toast && (
          <div className={cx(
            'fixed top-5 right-5 z-[200] px-5 py-3 rounded mono text-xs font-medium float-in',
            toast.t === 'err' ? 'text-[#ff3366]' : 'text-[#00ff88]'
          )} style={{
            background: 'rgba(10,14,26,0.95)',
            border: `1px solid ${toast.t === 'err' ? 'rgba(255,51,102,0.4)' : 'rgba(0,255,136,0.4)'}`,
            boxShadow: `0 0 20px ${toast.t === 'err' ? 'rgba(255,51,102,0.15)' : 'rgba(0,255,136,0.15)'}`,
          }}>
            {toast.t === 'err' ? '[ ERROR ] ' : '[ OK ] '}{toast.msg}
          </div>
        )}

        <div className="max-w-7xl mx-auto px-6 pt-8 pb-20">

          {/* NAV */}
          <Link to="/" className="inline-flex items-center gap-2 text-[#4a5568] hover:text-[#00e5ff] transition-colors text-xs mono mb-6 cursor-pointer group">
            <svg className="w-3.5 h-3.5 group-hover:translate-x-[-2px] transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            cd ../dashboard
          </Link>

          {/* HEADER */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
                CODEX <span style={{ color: '#00e5ff' }}>ACCOUNT</span> MANAGER
              </h1>
              <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(0,229,255,0.3), transparent)' }} />
            </div>
            <p className="text-xs mono" style={{ color: '#4a5568' }}>
              // endpoint_scanner v2.0 &mdash; batch verify, quota analysis, auto-purge dead nodes
            </p>
          </div>

          {/* STAT BAR */}
          {!loading && accounts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'TOTAL', value: accounts.length, color: '#00e5ff' },
                { label: 'TEAM', value: teamCount, color: '#a78bfa' },
                { label: 'ALIVE', value: aliveCount || '--', color: '#00ff88' },
                { label: 'DEAD', value: deadCount || '--', color: '#ff3366' },
              ].map(s => (
                <div key={s.label} className="stat-panel rounded-lg p-4 text-center">
                  <p className="mono text-2xl font-bold" style={{ color: s.color, textShadow: `0 0 20px ${s.color}33` }}>{s.value}</p>
                  <p className="mono text-[10px] mt-1 tracking-widest" style={{ color: '#4a5568' }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* PROGRESS: CHECK */}
          {op === 'check' && (
            <div className="mb-6 p-5 rounded-lg float-in" style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.2)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#00e5ff', boxShadow: '0 0 8px #00e5ff', animation: 'glow-pulse 1.5s infinite' }} />
                  <span className="mono text-xs font-medium" style={{ color: '#00e5ff' }}>SCANNING ENDPOINTS...</span>
                </div>
                <span className="mono text-xs" style={{ color: '#64748b' }}>{prog.checked}/{prog.total} ({pct}%)</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,229,255,0.1)' }}>
                <div className="h-full rounded-full progress-glow transition-all duration-200" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex gap-4 mono text-[11px]">
                  <span style={{ color: '#00ff88' }}>ALIVE: {prog.valid}</span>
                  <span style={{ color: '#ff3366' }}>DEAD: {prog.invalid}</span>
                </div>
                {prog.current && <span className="mono text-[10px] truncate max-w-[220px]" style={{ color: '#475569' }}>{prog.current}</span>}
              </div>
            </div>
          )}

          {/* PROGRESS: DELETE */}
          {op === 'del' && (
            <div className="mb-6 p-5 rounded-lg float-in" style={{ background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.25)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: '#ff3366', boxShadow: '0 0 8px #ff3366', animation: 'glow-pulse 1s infinite' }} />
                  <span className="mono text-xs font-medium" style={{ color: '#ff3366' }}>PURGING DEAD NODES...</span>
                </div>
                <span className="mono text-xs" style={{ color: '#64748b' }}>{delProg.current}/{delProg.total} ({dpct}%)</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,51,102,0.1)' }}>
                <div className="h-full rounded-full progress-glow-red transition-all duration-200" style={{ width: `${dpct}%` }} />
              </div>
              <div className="flex gap-4 mt-3 mono text-[11px]" style={{ color: '#64748b' }}>
                <span>DELETED: {delProg.deleted}</span>
                {delProg.failed > 0 && <span style={{ color: '#ff3366' }}>FAILED: {delProg.failed}</span>}
              </div>
            </div>
          )}

          {/* RESULT PANEL */}
          {result && !op && (
            <div className="mb-6 p-5 rounded-lg float-in" style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.15)' }}>
              <div className="flex items-center justify-between mb-4">
                <span className="mono text-xs font-medium" style={{ color: '#00e5ff' }}>[ SCAN COMPLETE ]</span>
                <button onClick={() => setResult(null)} className="cursor-pointer" style={{ color: '#475569' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 rounded" style={{ background: 'rgba(0,229,255,0.06)' }}>
                  <p className="mono text-xl font-bold" style={{ color: '#e2e8f0' }}>{result.valid + result.invalid}</p>
                  <p className="mono text-[9px] tracking-wider mt-1" style={{ color: '#475569' }}>TOTAL SCANNED</p>
                </div>
                <div className="text-center p-3 rounded" style={{ background: 'rgba(0,255,136,0.06)' }}>
                  <p className="mono text-xl font-bold" style={{ color: '#00ff88', textShadow: '0 0 12px rgba(0,255,136,0.3)' }}>{result.valid}</p>
                  <p className="mono text-[9px] tracking-wider mt-1" style={{ color: '#475569' }}>ALIVE</p>
                </div>
                <div className="text-center p-3 rounded" style={{ background: 'rgba(255,51,102,0.06)' }}>
                  <p className="mono text-xl font-bold" style={{ color: '#ff3366', textShadow: '0 0 12px rgba(255,51,102,0.3)' }}>{result.invalid}</p>
                  <p className="mono text-[9px] tracking-wider mt-1" style={{ color: '#475569' }}>DEAD</p>
                </div>
              </div>
              {result.invalid > 0 && (
                <button onClick={doDeleteInvalid} className="neon-btn w-full py-2.5 rounded mono text-xs font-bold cursor-pointer" style={{ background: 'rgba(255,51,102,0.15)', border: '1px solid rgba(255,51,102,0.4)', color: '#ff3366' }}>
                  PURGE {result.invalid} DEAD NODES
                </button>
              )}
            </div>
          )}

          {/* ACTION BAR */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={doCheck} disabled={busy || !accounts.length} className={cx('neon-btn px-5 py-2.5 rounded mono text-xs font-semibold cursor-pointer inline-flex items-center gap-2', busy && 'opacity-40 cursor-not-allowed')} style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff' }}>
              {op === 'check' ? <><div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(0,229,255,0.2)', borderTopColor: '#00e5ff' }} />SCANNING {pct}%</> : <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              SCAN STATUS</>}
            </button>
            <button onClick={() => setModal('quota')} disabled={busy || !accounts.length} className={cx('neon-btn px-5 py-2.5 rounded mono text-xs font-semibold cursor-pointer inline-flex items-center gap-2', busy && 'opacity-40 cursor-not-allowed')} style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', color: '#a78bfa' }}>
              {quotaLoading ? <><div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(167,139,250,0.2)', borderTopColor: '#a78bfa' }} />QUERYING...</> : <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              SCAN QUOTA</>}
            </button>
            <button onClick={() => setModal('clean')} disabled={busy} className={cx('neon-btn px-5 py-2.5 rounded mono text-xs font-semibold cursor-pointer inline-flex items-center gap-2', busy && 'opacity-40 cursor-not-allowed')} style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.25)', color: '#ff3366' }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              AUTO CLEAN
            </button>
          </div>

          {/* GRID */}
          {loading ? (
            <div className="text-center py-24">
              <div className="inline-block w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(0,229,255,0.15)', borderTopColor: '#00e5ff' }} />
              <p className="mono text-xs mt-4" style={{ color: '#475569' }}>LOADING NODE DATABASE...</p>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-24">
              <p className="mono text-sm" style={{ color: '#475569' }}>NO CODEX NODES FOUND</p>
              <p className="mono text-xs mt-2" style={{ color: '#334155' }}>Configure CodeX accounts in CLI-Proxy first</p>
            </div>
          ) : (
            <>
              {pages > 1 && (
                <div className="flex items-center justify-between mb-4">
                  <p className="mono text-[10px]" style={{ color: '#475569' }}>
                    SHOWING {(page-1)*PER_PAGE+1}-{Math.min(page*PER_PAGE, accounts.length)} OF {accounts.length}
                  </p>
                  <div className="flex items-center gap-1">
                    {[
                      { label: '|<', go: 1, dis: page === 1 },
                      { label: '<', go: Math.max(1, page-1), dis: page === 1 },
                      { label: '>', go: Math.min(pages, page+1), dis: page >= pages },
                      { label: '>|', go: pages, dis: page >= pages },
                    ].map((b, i) => (
                      <button key={i} onClick={() => setPage(b.go)} disabled={b.dis} className={cx('px-2.5 py-1 rounded mono text-[10px] cursor-pointer transition-colors', b.dis && 'opacity-30 cursor-not-allowed')} style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.12)', color: '#64748b' }}>
                        {b.label}
                      </button>
                    ))}
                    <span className="mono text-[10px] px-2" style={{ color: '#475569' }}>{page}/{pages}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {accounts.slice((page-1)*PER_PAGE, page*PER_PAGE).map((a, i) => (
                  <div key={i} className={cx('neon-card rounded-lg p-4 flex flex-col', a.checkStatus === 'invalid' && 'dead', a.checkStatus === 'valid' && 'alive')}>
                    {/* email + badge */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <p className="mono text-[12px] break-all leading-5 flex-1" style={{ color: '#cbd5e1' }} title={a.email}>{a.email}</p>
                      {a.checkStatus === 'valid' && (
                        <span className="shrink-0 mono text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', textShadow: '0 0 6px rgba(0,255,136,0.3)' }}>ALIVE</span>
                      )}
                      {a.checkStatus === 'invalid' && (
                        <span className="shrink-0 mono text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,51,102,0.15)', color: '#ff3366', textShadow: '0 0 6px rgba(255,51,102,0.3)' }}>DEAD</span>
                      )}
                    </div>
                    {/* plan */}
                    <span className={cx('mono text-[9px] font-bold px-2 py-0.5 rounded self-start mb-3')} style={{
                      background: a.planType === 'team' ? 'rgba(167,139,250,0.12)' : 'rgba(100,116,139,0.1)',
                      color: a.planType === 'team' ? '#a78bfa' : '#475569',
                    }}>
                      {(a.planType || 'free').toUpperCase()}
                    </span>
                    {/* quota */}
                    <div className="mt-auto">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="mono text-[9px]" style={{ color: '#475569' }}>{a.quota !== undefined ? 'QUOTA' : 'UNCHECKED'}</span>
                        {a.quota !== undefined && (
                          <span className="mono text-[11px] font-bold" style={{
                            color: a.quota > 50 ? '#00ff88' : a.quota > 20 ? '#ffaa00' : '#ff3366',
                            textShadow: `0 0 8px ${a.quota > 50 ? 'rgba(0,255,136,0.2)' : a.quota > 20 ? 'rgba(255,170,0,0.2)' : 'rgba(255,51,102,0.2)'}`,
                          }}>{Math.round(a.quota)}%</span>
                        )}
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(100,116,139,0.15)' }}>
                        {a.quota !== undefined ? (
                          <div className="h-full rounded-full transition-all duration-500" style={{
                            width: `${a.quota}%`,
                            background: a.quota > 50 ? '#00ff88' : a.quota > 20 ? '#ffaa00' : '#ff3366',
                            boxShadow: `0 0 6px ${a.quota > 50 ? 'rgba(0,255,136,0.4)' : a.quota > 20 ? 'rgba(255,170,0,0.4)' : 'rgba(255,51,102,0.4)'}`,
                          }} />
                        ) : <div className="h-full w-0" />}
                      </div>
                      {a.resetAt && (
                        <p className="mono text-[9px] mt-1.5" style={{ color: '#334155' }}>
                          RESET: {new Date(a.resetAt * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {pages > 1 && (
                <div className="mt-6 flex justify-center">
                  <div className="flex items-center gap-1">
                    {[
                      { label: '|<', go: 1, dis: page === 1 },
                      { label: 'PREV', go: Math.max(1, page-1), dis: page === 1 },
                      { label: 'NEXT', go: Math.min(pages, page+1), dis: page >= pages },
                      { label: '>|', go: pages, dis: page >= pages },
                    ].map((b, i) => (
                      <button key={i} onClick={() => setPage(b.go)} disabled={b.dis} className={cx('px-3 py-1.5 rounded mono text-[10px] cursor-pointer transition-colors', b.dis && 'opacity-30 cursor-not-allowed')} style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.12)', color: '#64748b' }}>
                        {b.label}
                      </button>
                    ))}
                    <span className="mono text-[10px] px-3" style={{ color: '#475569' }}>{page} / {pages}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* QUOTA MODAL */}
        {modal === 'quota' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(6,8,15,0.85)', backdropFilter: 'blur(4px)' }} onClick={() => setModal(null)}>
            <div className="w-full max-w-sm mx-4 p-6 rounded-lg float-in" style={{ background: '#0d1117', border: '1px solid rgba(0,229,255,0.2)' }} onClick={e => e.stopPropagation()}>
              <h3 className="mono text-sm font-bold mb-1" style={{ color: '#00e5ff' }}>SCAN QUOTA</h3>
              <p className="mono text-[10px] mb-5" style={{ color: '#475569' }}>Select scan range from page {page}. Batch scan recommended.</p>
              <div className="space-y-2">
                {[1, 3, 5].map(n => (
                  <button key={n} onClick={() => doQuota(n)} className="neon-btn w-full py-3 px-4 rounded flex items-center justify-between cursor-pointer" style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                    <span className="mono text-xs font-medium">{n} PAGE{n > 1 ? 'S' : ''}</span>
                    <span className="mono text-[10px]" style={{ color: '#475569' }}>{Math.min(PER_PAGE * n, accounts.length - (page-1)*PER_PAGE)} nodes</span>
                  </button>
                ))}
                <button onClick={() => doQuota('all')} className="neon-btn w-full py-3 px-4 rounded flex items-center justify-between cursor-pointer" style={{ background: 'rgba(255,51,102,0.05)', border: '1px solid rgba(255,51,102,0.2)', color: '#ff3366' }}>
                  <span className="mono text-xs font-medium">ALL</span>
                  <span className="mono text-[10px]">{accounts.length} nodes</span>
                </button>
              </div>
              <button onClick={() => setModal(null)} className="w-full mt-4 py-2 mono text-[10px] cursor-pointer" style={{ color: '#475569' }}>CANCEL</button>
            </div>
          </div>
        )}

        {/* CLEAN MODAL */}
        {modal === 'clean' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(6,8,15,0.85)', backdropFilter: 'blur(4px)' }} onClick={() => setModal(null)}>
            <div className="w-full max-w-md mx-4 p-6 rounded-lg float-in" style={{ background: '#0d1117', border: '1px solid rgba(255,51,102,0.2)' }} onClick={e => e.stopPropagation()}>
              <h3 className="mono text-sm font-bold mb-1" style={{ color: '#ff3366' }}>AUTO CLEAN</h3>
              <p className="mono text-[10px] mb-5" style={{ color: '#475569' }}>Purge low-quota nodes that won't recover soon. Run SCAN QUOTA first.</p>
              <div className="grid grid-cols-2 gap-3 mb-5 p-3 rounded" style={{ background: 'rgba(0,229,255,0.03)', border: '1px solid rgba(0,229,255,0.1)' }}>
                <div className="text-center">
                  <p className="mono text-lg font-bold" style={{ color: '#e2e8f0' }}>{accounts.length}</p>
                  <p className="mono text-[9px]" style={{ color: '#475569' }}>TOTAL</p>
                </div>
                <div className="text-center">
                  <p className="mono text-lg font-bold" style={{ color: '#a78bfa' }}>{accounts.filter(a => a.quota !== undefined).length}</p>
                  <p className="mono text-[9px]" style={{ color: '#475569' }}>SCANNED</p>
                </div>
              </div>
              <div className="space-y-4 mb-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="mono text-[10px]" style={{ color: '#64748b' }}>QUOTA BELOW</span>
                    <span className="mono text-xs font-bold" style={{ color: '#ff3366' }}>{cleanCfg.quota}%</span>
                  </div>
                  <input type="range" min="0" max="50" value={cleanCfg.quota} onChange={e => setCleanCfg(p => ({ ...p, quota: +e.target.value }))} className="w-full h-1 rounded-full appearance-none cursor-pointer" style={{ background: 'rgba(255,51,102,0.15)' }} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="mono text-[10px]" style={{ color: '#64748b' }}>RESET IN &gt;</span>
                    <span className="mono text-xs font-bold" style={{ color: '#ff3366' }}>{cleanCfg.days} DAYS</span>
                  </div>
                  <input type="range" min="1" max="7" value={cleanCfg.days} onChange={e => setCleanCfg(p => ({ ...p, days: +e.target.value }))} className="w-full h-1 rounded-full appearance-none cursor-pointer" style={{ background: 'rgba(255,51,102,0.15)' }} />
                </div>
              </div>
              <div className="p-3 rounded text-center mb-4" style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.2)' }}>
                <p className="mono text-xs" style={{ color: '#ff3366' }}>TARGETS: <span className="text-lg font-bold">{getCleanable().length}</span> NODES</p>
              </div>
              <div className="space-y-2">
                <button onClick={doClean} disabled={!getCleanable().length} className={cx('neon-btn w-full py-3 rounded mono text-xs font-bold cursor-pointer', !getCleanable().length && 'opacity-30 cursor-not-allowed')} style={{ background: 'rgba(255,51,102,0.15)', border: '1px solid rgba(255,51,102,0.4)', color: '#ff3366' }}>
                  EXECUTE PURGE
                </button>
                <button onClick={() => setModal(null)} className="w-full py-3 rounded mono text-xs cursor-pointer" style={{ border: '1px solid rgba(100,116,139,0.2)', color: '#475569' }}>
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default CodexPage

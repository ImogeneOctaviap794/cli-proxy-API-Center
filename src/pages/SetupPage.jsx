import { useState, useEffect } from 'react'

const SYNC_INTERVALS = [
  { label: '1 分钟', value: 1 },
  { label: '3 分钟', value: 3 },
  { label: '5 分钟', value: 5 },
  { label: '10 分钟', value: 10 },
  { label: '30 分钟', value: 30 },
]

function SetupPage({ onComplete, initialSettings }) {
  const [cliProxyUrl, setCliProxyUrl] = useState(initialSettings?.cliProxyUrl || 'http://localhost:8317')
  const [cliProxyKey, setCliProxyKey] = useState('')
  const [syncInterval, setSyncInterval] = useState(initialSettings?.syncInterval || 5)
  const [openCodeConfigPath, setOpenCodeConfigPath] = useState(initialSettings?.openCodeConfigPath || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialSettings) {
      if (initialSettings.cliProxyUrl) setCliProxyUrl(initialSettings.cliProxyUrl)
      if (initialSettings.syncInterval) setSyncInterval(initialSettings.syncInterval)
      if (initialSettings.openCodeConfigPath !== undefined) setOpenCodeConfigPath(initialSettings.openCodeConfigPath)
    }
  }, [initialSettings])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliProxyUrl, cliProxyKey, syncInterval, openCodeConfigPath })
      })
      const data = await res.json()
      if (res.ok) {
        onComplete()
      } else {
        setError(data.error || '保存失败')
      }
    } catch (e) {
      setError('连接失败: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-[#0d0d0d]">欢迎使用 API Center</h1>
          <p className="text-[#6e6e80] mt-2">请配置 CLI-Proxy 连接信息</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm text-[#6e6e80] mb-2">CLI-Proxy 地址</label>
            <input
              type="text"
              value={cliProxyUrl}
              onChange={e => setCliProxyUrl(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-lg text-[#0d0d0d] focus:outline-none focus:border-[#0d0d0d]"
              placeholder="http://localhost:8317"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#6e6e80] mb-2">管理密码</label>
            <input
              type="password"
              value={cliProxyKey}
              onChange={e => setCliProxyKey(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-lg text-[#0d0d0d] focus:outline-none focus:border-[#0d0d0d]"
              placeholder="cli-proxy-admin"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#6e6e80] mb-2">数据同步间隔</label>
            <div className="flex flex-wrap gap-2">
              {SYNC_INTERVALS.map(item => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSyncInterval(item.value)}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    syncInterval === item.value
                      ? 'bg-[#0d0d0d] text-white border-[#0d0d0d]'
                      : 'bg-white text-[#0d0d0d] border-[#e5e5e5] hover:border-[#0d0d0d]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#6e6e80] mt-2">从 CLI-Proxy 同步使用数据的频率</p>
          </div>


          <div>
            <label className="block text-sm text-[#6e6e80] mb-2">OpenCode 配置目录 <span className="text-xs text-[#acacac]">(可选)</span></label>
            <input
              type="text"
              value={openCodeConfigPath}
              onChange={e => setOpenCodeConfigPath(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-lg text-[#0d0d0d] focus:outline-none focus:border-[#0d0d0d]"
              placeholder="如 C:\\Users\\你的用户名\\.config\\opencode"
            />
            <p className="text-xs text-[#6e6e80] mt-2">填写后可在主页管理 OpenCode 的模型和提供商配置</p>
          </div>

          {error && (
            <p className="text-[#ef4444] text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#0d0d0d] text-white rounded-lg font-medium hover:bg-[#2d2d2d] disabled:opacity-50 transition-colors"
          >
            {loading ? '保存中...' : '开始使用'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default SetupPage

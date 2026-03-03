import { useState, useEffect } from 'react'

function SiteManager({ onClose, onUpdate }) {
  const [configSites, setConfigSites] = useState([])
  const [managedSites, setManagedSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingSite, setEditingSite] = useState(null)
  const [directUrl, setDirectUrl] = useState('')

  const fetchData = async () => {
    try {
      const [configRes, sitesRes] = await Promise.all([
        fetch('/api/config-sites'),
        fetch('/api/sites')
      ])
      const configData = await configRes.json()
      const sitesData = await sitesRes.json()
      setConfigSites(configData)
      setManagedSites(sitesData)
    } catch (e) {
      console.error('加载数据失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAddSite = async (site, customDirectUrl = '') => {
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: site.name, directUrl: customDirectUrl })
      })
      if (res.ok) {
        setEditingSite(null)
        setDirectUrl('')
        fetchData()
        onUpdate()
      }
    } catch (e) {
      console.error('添加失败:', e)
    }
  }

  const handleUpdateDirectUrl = async (siteName) => {
    try {
      await fetch(`/api/sites/${encodeURIComponent(siteName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directUrl })
      })
      setEditingSite(null)
      setDirectUrl('')
      fetchData()
      onUpdate()
    } catch (e) {
      console.error('更新失败:', e)
    }
  }

  const startEditing = (site) => {
    setEditingSite(site.name)
    setDirectUrl(site.directUrl || '')
  }

  const handleRemove = async (siteName) => {
    try {
      await fetch(`/api/sites/${encodeURIComponent(siteName)}`, {
        method: 'DELETE'
      })
      fetchData()
      onUpdate()
    } catch (e) {
      console.error('删除失败:', e)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-xl w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e5e5]">
          <h2 className="text-lg font-semibold text-[#0d0d0d]">签到管理</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f7f7f8] text-[#6e6e80] hover:text-[#0d0d0d] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block w-6 h-6 border-2 border-[#e5e5e5] border-t-[#0d0d0d] rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              {/* 已添加的签到站点 */}
              <div>
                <h3 className="text-sm font-medium text-[#6e6e80] mb-3">已添加的签到站点</h3>
                {managedSites.length === 0 ? (
                  <p className="text-[#8e8ea0] text-sm py-4 text-center">暂无站点，请从下方配置列表添加</p>
                ) : (
                  <div className="space-y-2">
                    {managedSites.map(site => (
                      <div key={site.name} className="p-4 border border-[#e5e5e5] rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[#0d0d0d] truncate">{site.name}</p>
                            <p className="text-xs text-[#6e6e80] truncate">{site.baseUrl}</p>
                          </div>
                          <button
                            onClick={() => handleRemove(site.name)}
                            className="ml-3 px-3 py-1.5 text-sm text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors"
                          >
                            移除
                          </button>
                        </div>
                        {editingSite === site.name ? (
                          <div className="flex gap-2 mt-3">
                            <input
                              type="text"
                              placeholder="直达链接 (签到页面地址)"
                              value={directUrl}
                              onChange={e => setDirectUrl(e.target.value)}
                              className="flex-1 px-3 py-2 border border-[#e5e5e5] rounded-lg text-[#0d0d0d] text-sm placeholder-[#8e8ea0] focus:outline-none focus:border-[#0d0d0d]"
                            />
                            <button
                              onClick={() => handleUpdateDirectUrl(site.name)}
                              className="px-3 py-2 text-sm bg-[#0d0d0d] text-white rounded-lg hover:bg-[#2d2d2d] transition-colors"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => { setEditingSite(null); setDirectUrl(''); }}
                              className="px-3 py-2 text-sm text-[#6e6e80] hover:bg-[#f7f7f8] rounded-lg transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-[#6e6e80]">直达链接:</span>
                            {site.directUrl ? (
                              <span className="text-xs text-[#0d0d0d] truncate flex-1">{site.directUrl}</span>
                            ) : (
                              <span className="text-xs text-[#8e8ea0]">未设置</span>
                            )}
                            <button
                              onClick={() => startEditing(site)}
                              className="text-xs text-[#0d0d0d] hover:underline"
                            >
                              编辑
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 从配置导入 */}
              <div>
                <h3 className="text-sm font-medium text-[#6e6e80] mb-3">从 cli-proxy 配置添加</h3>
                <div className="space-y-2">
                  {configSites.map(site => (
                    <div key={site.name} className="p-3 border border-[#e5e5e5] rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[#0d0d0d] truncate">{site.name}</p>
                          <p className="text-xs text-[#6e6e80] truncate">{site.baseUrl}</p>
                        </div>
                        {site.added ? (
                          <span className="ml-3 px-3 py-1.5 text-sm text-[#10a37f] bg-[#10a37f]/10 rounded-lg">
                            已添加
                          </span>
                        ) : editingSite === `add-${site.name}` ? (
                          <button
                            onClick={() => { setEditingSite(null); setDirectUrl(''); }}
                            className="ml-3 px-3 py-1.5 text-sm text-[#6e6e80] hover:bg-[#f7f7f8] rounded-lg transition-colors"
                          >
                            取消
                          </button>
                        ) : (
                          <button
                            onClick={() => { setEditingSite(`add-${site.name}`); setDirectUrl(''); }}
                            className="ml-3 px-3 py-1.5 text-sm text-[#0d0d0d] hover:bg-[#f7f7f8] rounded-lg transition-colors"
                          >
                            添加
                          </button>
                        )}
                      </div>
                      {editingSite === `add-${site.name}` && (
                        <div className="flex gap-2 mt-3">
                          <input
                            type="text"
                            placeholder="直达链接 (可选，如签到页面地址)"
                            value={directUrl}
                            onChange={e => setDirectUrl(e.target.value)}
                            className="flex-1 px-3 py-2 border border-[#e5e5e5] rounded-lg text-[#0d0d0d] text-sm placeholder-[#8e8ea0] focus:outline-none focus:border-[#0d0d0d]"
                          />
                          <button
                            onClick={() => handleAddSite(site, directUrl)}
                            className="px-4 py-2 text-sm bg-[#0d0d0d] text-white rounded-lg hover:bg-[#2d2d2d] transition-colors"
                          >
                            确认添加
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SiteManager

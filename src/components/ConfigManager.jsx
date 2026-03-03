import { useState, useEffect } from 'react'

function ConfigManager({ onClose, onUpdate }) {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingSite, setEditingSite] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    'base-url': '',
    'api-key-entries': [{ 'api-key': '' }],
    models: []
  })

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/config/sites')
      if (res.ok) {
        const data = await res.json()
        setSites(data)
      }
    } catch (e) {
      console.error('加载站点失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSites()
  }, [])

  const resetForm = () => {
    setFormData({
      name: '',
      'base-url': '',
      'api-key-entries': [{ 'api-key': '' }],
      models: []
    })
    setError('')
  }

  const handleAddSite = async () => {
    setError('')
    if (!formData.name.trim() || !formData['base-url'].trim()) {
      setError('站点名称和地址不能为空')
      return
    }

    try {
      const res = await fetch('/api/config/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess('站点添加成功')
        setShowAddForm(false)
        resetForm()
        fetchSites()
        onUpdate()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || '添加失败')
      }
    } catch (e) {
      setError('添加失败: ' + e.message)
    }
  }

  const handleUpdateSite = async (siteName) => {
    setError('')
    try {
      const res = await fetch(`/api/config/sites/${encodeURIComponent(siteName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess('站点更新成功')
        setEditingSite(null)
        resetForm()
        fetchSites()
        onUpdate()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || '更新失败')
      }
    } catch (e) {
      setError('更新失败: ' + e.message)
    }
  }

  const handleDeleteSite = async (siteName) => {
    if (!confirm(`确定要删除站点 "${siteName}" 吗？此操作将修改 cli-proxy 配置文件！`)) {
      return
    }

    try {
      const res = await fetch(`/api/config/sites/${encodeURIComponent(siteName)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setSuccess('站点删除成功')
        fetchSites()
        onUpdate()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        const data = await res.json()
        setError(data.error || '删除失败')
      }
    } catch (e) {
      setError('删除失败: ' + e.message)
    }
  }

  const startEditing = (site) => {
    setEditingSite(site.name)
    setFormData({
      name: site.name,
      'base-url': site['base-url'],
      'api-key-entries': site['api-key-entries'] || [{ 'api-key': '' }],
      models: site.models || []
    })
    setShowAddForm(false)
    setError('')
  }

  const addApiKey = () => {
    setFormData(prev => ({
      ...prev,
      'api-key-entries': [...prev['api-key-entries'], { 'api-key': '' }]
    }))
  }

  const removeApiKey = (index) => {
    setFormData(prev => ({
      ...prev,
      'api-key-entries': prev['api-key-entries'].filter((_, i) => i !== index)
    }))
  }

  const updateApiKey = (index, value) => {
    setFormData(prev => ({
      ...prev,
      'api-key-entries': prev['api-key-entries'].map((entry, i) => 
        i === index ? { 'api-key': value } : entry
      )
    }))
  }

  const renderForm = (isEditing = false, originalName = '') => (
    <div className="space-y-4 p-4 bg-[#0f0f23] rounded-xl border border-white/10">
      <div>
        <label className="block text-sm text-[#94a3b8] mb-1">站点名称</label>
        <input
          type="text"
          value={formData.name}
          onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
          className="w-full px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-[#a855f7]/50"
          placeholder="如: my-api"
        />
      </div>
      <div>
        <label className="block text-sm text-[#94a3b8] mb-1">Base URL</label>
        <input
          type="text"
          value={formData['base-url']}
          onChange={e => setFormData(prev => ({ ...prev, 'base-url': e.target.value }))}
          className="w-full px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-[#a855f7]/50"
          placeholder="如: https://api.example.com/v1"
        />
      </div>
      <div>
        <label className="block text-sm text-[#94a3b8] mb-1">API Keys</label>
        <div className="space-y-2">
          {formData['api-key-entries'].map((entry, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={entry['api-key']}
                onChange={e => updateApiKey(index, e.target.value)}
                className="flex-1 px-3 py-2 bg-[#1a1a2e] border border-white/10 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-[#a855f7]/50"
                placeholder="sk-..."
              />
              {formData['api-key-entries'].length > 1 && (
                <button
                  onClick={() => removeApiKey(index)}
                  className="px-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addApiKey}
            className="text-sm text-[#a855f7] hover:underline"
          >
            + 添加 API Key
          </button>
        </div>
      </div>
      
      {error && <p className="text-red-400 text-sm">{error}</p>}
      
      <div className="flex gap-2 pt-2">
        {isEditing ? (
          <>
            <button
              onClick={() => handleUpdateSite(originalName)}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white rounded-lg font-medium hover:from-[#b866f8] hover:to-[#8b4ae6] transition-all"
            >
              保存修改
            </button>
            <button
              onClick={() => { setEditingSite(null); resetForm(); }}
              className="px-4 py-2 text-[#94a3b8] hover:bg-white/10 rounded-lg transition-colors"
            >
              取消
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleAddSite}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-[#a855f7] to-[#7c3aed] text-white rounded-lg font-medium hover:from-[#b866f8] hover:to-[#8b4ae6] transition-all"
            >
              添加站点
            </button>
            <button
              onClick={() => { setShowAddForm(false); resetForm(); }}
              className="px-4 py-2 text-[#94a3b8] hover:bg-white/10 rounded-lg transition-colors"
            >
              取消
            </button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative glass-card rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-white">管理站点配置</h2>
            <p className="text-xs text-[#94a3b8] mt-1">编辑 cli-proxy config.yaml</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-[#94a3b8] hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 警告提示 */}
        <div className="mx-6 mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <p className="text-yellow-400 text-sm flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            此操作将直接修改 cli-proxy 配置文件，请谨慎操作
          </p>
        </div>

        {success && (
          <div className="mx-6 mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
            <p className="text-green-400 text-sm">{success}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block w-8 h-8 border-4 border-[#1a1a2e] border-t-[#a855f7] rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              {/* 添加新站点按钮 */}
              {!showAddForm && !editingSite && (
                <button
                  onClick={() => { setShowAddForm(true); resetForm(); }}
                  className="w-full p-4 border-2 border-dashed border-[#a855f7]/30 rounded-xl text-[#a855f7] hover:bg-[#a855f7]/10 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  添加新站点
                </button>
              )}

              {/* 添加表单 */}
              {showAddForm && renderForm(false)}

              {/* 站点列表 */}
              <div className="space-y-3">
                {sites.map(site => (
                  <div key={site.name} className="p-4 bg-[#1a1a2e] rounded-xl">
                    {editingSite === site.name ? (
                      renderForm(true, site.name)
                    ) : (
                      <>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-white">{site.name}</h4>
                            <p className="text-xs text-[#94a3b8] truncate mt-1">{site['base-url']}</p>
                            <p className="text-xs text-[#94a3b8]/60 mt-1">
                              {site['api-key-entries']?.length || 0} 个 API Key · {site.models?.length || 0} 个模型
                            </p>
                          </div>
                          <div className="flex gap-2 ml-3">
                            <button
                              onClick={() => startEditing(site)}
                              className="px-3 py-1.5 text-sm text-[#a855f7] hover:bg-[#a855f7]/20 rounded-lg transition-colors"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleDeleteSite(site.name)}
                              className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConfigManager

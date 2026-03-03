import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function ConfigPage() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingSite, setEditingSite] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    name: '',
    'base-url': '',
    'api-key-entries': [{ 'api-key': '' }],
    models: []
  })

  const [newModel, setNewModel] = useState({ name: '', alias: '' })
  const [availableModels, setAvailableModels] = useState([])
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [showAliasSuggestions, setShowAliasSuggestions] = useState(false)

  const getFilteredModels = (input) => {
    if (!input) return []
    const lower = input.toLowerCase()
    return availableModels
      .filter(m => m.toLowerCase().includes(lower))
      .slice(0, 5)
  }

  const fetchAvailableModels = async () => {
    try {
      const res = await fetch('/api/usage')
      if (res.ok) {
        const data = await res.json()
        const models = new Set()
        if (data.usage?.apis) {
          Object.values(data.usage.apis).forEach(api => {
            if (api.models) {
              Object.keys(api.models).forEach(m => models.add(m))
            }
          })
        }
        setAvailableModels([...models].sort())
      }
    } catch (e) {
      console.error('获取模型列表失败:', e)
    }
  }

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
    fetchAvailableModels()
  }, [])

  const resetForm = () => {
    setFormData({
      name: '',
      'base-url': '',
      'api-key-entries': [{ 'api-key': '' }],
      models: []
    })
    setNewModel({ name: '', alias: '' })
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

  const addModel = () => {
    if (!newModel.name.trim()) return
    setFormData(prev => ({
      ...prev,
      models: [...prev.models, { name: newModel.name, alias: newModel.alias || '' }]
    }))
    setNewModel({ name: '', alias: '' })
  }

  const removeModel = (index) => {
    setFormData(prev => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index)
    }))
  }

  const updateModel = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      models: prev.models.map((model, i) => 
        i === index ? { ...model, [field]: value } : model
      )
    }))
  }

  const renderForm = (isEditing = false, originalName = '') => (
    <div className="space-y-6 p-6 bg-[#f7f7f8] rounded-xl border border-[#e5e5e5]">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-[#6e6e80] mb-2">站点名称</label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-lg text-[#0d0d0d] focus:outline-none focus:border-[#0d0d0d]"
            placeholder="如: my-api"
          />
        </div>
        <div>
          <label className="block text-sm text-[#6e6e80] mb-2">Base URL</label>
          <input
            type="text"
            value={formData['base-url']}
            onChange={e => setFormData(prev => ({ ...prev, 'base-url': e.target.value }))}
            className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-lg text-[#0d0d0d] focus:outline-none focus:border-[#0d0d0d]"
            placeholder="如: https://api.example.com/v1"
          />
        </div>
      </div>

      {/* API Keys */}
      <div>
        <label className="block text-sm text-[#6e6e80] mb-2">API Keys</label>
        <div className="space-y-2">
          {formData['api-key-entries'].map((entry, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={entry['api-key']}
                onChange={e => updateApiKey(index, e.target.value)}
                className="flex-1 px-4 py-3 bg-white border border-[#e5e5e5] rounded-lg text-[#0d0d0d] font-mono text-sm focus:outline-none focus:border-[#0d0d0d]"
                placeholder="sk-..."
              />
              {formData['api-key-entries'].length > 1 && (
                <button
                  onClick={() => removeApiKey(index)}
                  className="px-3 text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addApiKey}
            className="text-sm text-[#0d0d0d] hover:underline flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            添加 API Key
          </button>
        </div>
      </div>

      {/* Models */}
      <div>
        <label className="block text-sm text-[#6e6e80] mb-2">模型配置</label>
        <div className="space-y-2">
          {formData.models.map((model, index) => (
            <div key={index} className="flex gap-2 items-center p-3 bg-white border border-[#e5e5e5] rounded-lg">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={model.name}
                  onChange={e => updateModel(index, 'name', e.target.value)}
                  className="px-3 py-2 bg-[#f7f7f8] border border-[#e5e5e5] rounded-lg text-[#0d0d0d] text-sm focus:outline-none focus:border-[#0d0d0d]"
                  placeholder="模型名称"
                />
                <input
                  type="text"
                  value={model.alias || ''}
                  onChange={e => updateModel(index, 'alias', e.target.value)}
                  className="px-3 py-2 bg-[#f7f7f8] border border-[#e5e5e5] rounded-lg text-[#0d0d0d] text-sm focus:outline-none focus:border-[#0d0d0d]"
                  placeholder="别名 (可选)"
                />
              </div>
              <button
                onClick={() => removeModel(index)}
                className="px-2 py-2 text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          
          {/* Add new model */}
          <div className="flex gap-2 items-center">
            <div className="flex-1 relative">
              <input
                type="text"
                value={newModel.name}
                onChange={e => {
                  setNewModel(prev => ({ ...prev, name: e.target.value }))
                  setShowNameSuggestions(true)
                }}
                onFocus={() => setShowNameSuggestions(true)}
                onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
                className="w-full px-3 py-2 bg-white border border-[#e5e5e5] rounded-lg text-[#0d0d0d] text-sm focus:outline-none focus:border-[#0d0d0d]"
                placeholder="新模型名称"
              />
              {showNameSuggestions && getFilteredModels(newModel.name).length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-[#e5e5e5] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {getFilteredModels(newModel.name).map(m => (
                    <button
                      key={m}
                      type="button"
                      onMouseDown={() => {
                        setNewModel(prev => ({ ...prev, name: m }))
                        setShowNameSuggestions(false)
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-[#0d0d0d] hover:bg-[#f7f7f8] truncate"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 relative">
              <input
                type="text"
                value={newModel.alias}
                onChange={e => {
                  setNewModel(prev => ({ ...prev, alias: e.target.value }))
                  setShowAliasSuggestions(true)
                }}
                onFocus={() => setShowAliasSuggestions(true)}
                onBlur={() => setTimeout(() => setShowAliasSuggestions(false), 150)}
                className="w-full px-3 py-2 bg-white border border-[#e5e5e5] rounded-lg text-[#0d0d0d] text-sm focus:outline-none focus:border-[#0d0d0d]"
                placeholder="别名 (可选)"
              />
              {showAliasSuggestions && getFilteredModels(newModel.alias).length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-[#e5e5e5] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {getFilteredModels(newModel.alias).map(m => (
                    <button
                      key={m}
                      type="button"
                      onMouseDown={() => {
                        setNewModel(prev => ({ ...prev, alias: m }))
                        setShowAliasSuggestions(false)
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-[#0d0d0d] hover:bg-[#f7f7f8] truncate"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={addModel}
              className="px-4 py-2 bg-[#f7f7f8] text-[#0d0d0d] border border-[#e5e5e5] rounded-lg hover:bg-[#e5e5e5] transition-colors"
            >
              添加
            </button>
          </div>
        </div>
      </div>
      
      {error && <p className="text-[#ef4444] text-sm">{error}</p>}
      
      <div className="flex gap-3 pt-2">
        {isEditing ? (
          <>
            <button
              onClick={() => handleUpdateSite(originalName)}
              className="flex-1 px-6 py-3 bg-[#0d0d0d] text-white rounded-lg font-medium hover:bg-[#2d2d2d] transition-colors"
            >
              保存修改
            </button>
            <button
              onClick={() => { setEditingSite(null); resetForm(); }}
              className="px-6 py-3 text-[#6e6e80] hover:bg-[#f7f7f8] rounded-lg transition-colors"
            >
              取消
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleAddSite}
              className="flex-1 px-6 py-3 bg-[#0d0d0d] text-white rounded-lg font-medium hover:bg-[#2d2d2d] transition-colors"
            >
              添加站点
            </button>
            <button
              onClick={() => { setShowAddForm(false); resetForm(); }}
              className="px-6 py-3 text-[#6e6e80] hover:bg-[#f7f7f8] rounded-lg transition-colors"
            >
              取消
            </button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen py-10 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        {/* 头部 */}
        <div className="mb-8">
          <Link 
            to="/" 
            className="text-[#6e6e80] hover:text-[#0d0d0d] flex items-center gap-2 mb-4 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            返回签到中心
          </Link>
          <h1 className="text-3xl font-semibold text-[#0d0d0d]">
            站点配置管理
          </h1>
          <p className="text-[#6e6e80] mt-2">编辑 cli-proxy config.yaml 中的 openai-compatibility 配置</p>
        </div>


        {success && (
          <div className="mb-6 p-4 bg-[#d1fae5] border border-[#10a37f]/30 rounded-lg">
            <p className="text-[#065f46] text-sm flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {success}
            </p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-2 border-[#e5e5e5] border-t-[#0d0d0d] rounded-full animate-spin"></div>
            <p className="mt-4 text-[#6e6e80]">加载中...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 添加新站点按钮 */}
            {!showAddForm && !editingSite && (
              <button
                onClick={() => { setShowAddForm(true); resetForm(); }}
                className="w-full p-5 border-2 border-dashed border-[#e5e5e5] rounded-xl text-[#6e6e80] hover:border-[#0d0d0d] hover:text-[#0d0d0d] transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                添加新站点
              </button>
            )}

            {/* 添加表单 */}
            {showAddForm && renderForm(false)}

            {/* 站点列表 */}
            {sites.map(site => (
              <div key={site.name} className="border border-[#e5e5e5] rounded-xl overflow-hidden">
                {editingSite === site.name ? (
                  <div className="p-6">
                    {renderForm(true, site.name)}
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-[#0d0d0d]">{site.name}</h3>
                        <p className="text-[#6e6e80] text-sm mt-1 font-mono">{site['base-url']}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEditing(site)}
                          className="px-3 py-1.5 text-sm text-[#0d0d0d] hover:bg-[#f7f7f8] rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          编辑
                        </button>
                        <button
                          onClick={() => handleDeleteSite(site.name)}
                          className="px-3 py-1.5 text-sm text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      {/* API Keys */}
                      <div className="p-4 bg-[#f7f7f8] rounded-lg">
                        <h4 className="text-sm text-[#6e6e80] mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                          </svg>
                          API Keys ({site['api-key-entries']?.length || 0})
                        </h4>
                        <div className="space-y-1">
                          {(site['api-key-entries'] || []).map((entry, i) => (
                            <p key={i} className="text-xs text-[#8e8ea0] font-mono truncate">
                              {entry['api-key'] ? `${entry['api-key'].slice(0, 10)}...${entry['api-key'].slice(-4)}` : '(空)'}
                            </p>
                          ))}
                        </div>
                      </div>

                      {/* Models */}
                      <div className="p-4 bg-[#f7f7f8] rounded-lg">
                        <h4 className="text-sm text-[#6e6e80] mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                          模型 ({site.models?.length || 0})
                        </h4>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {(site.models || []).map((model, i) => (
                            <p key={i} className="text-xs text-[#0d0d0d]">
                              {model.name}
                              {model.alias && <span className="text-[#8e8ea0]"> → {model.alias}</span>}
                            </p>
                          ))}
                          {(!site.models || site.models.length === 0) && (
                            <p className="text-xs text-[#8e8ea0]">暂无模型配置</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ConfigPage

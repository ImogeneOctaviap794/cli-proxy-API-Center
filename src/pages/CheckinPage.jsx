import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import SiteCard from '../components/SiteCard'
import SiteManager from '../components/SiteManager'

function CheckinPage() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCheckinManager, setShowCheckinManager] = useState(false)

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/sites')
      if (res.ok) {
        const data = await res.json()
        setSites(data)
      }
    } catch (e) {
      setError('加载站点失败')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSites()
  }, [])

  const handleCheckin = async (siteName) => {
    try {
      const res = await fetch(`/api/checkin/${encodeURIComponent(siteName)}`, {
        method: 'POST'
      })
      if (res.ok) {
        fetchSites()
      }
    } catch (e) {
      console.error('签到失败:', e)
    }
  }

  const checkedCount = sites.filter(s => s.checkedIn).length

  return (
    <div className="min-h-screen py-10 px-6 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link 
              to="/" 
              className="text-[#6e6e80] hover:text-[#0d0d0d] flex items-center gap-2 mb-4 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              返回主页
            </Link>
            <h1 className="text-3xl font-semibold text-[#0d0d0d]">签到中心</h1>
            <p className="text-[#6e6e80] mt-2">
              {sites.length > 0 ? `今日已签到 ${checkedCount}/${sites.length} 个站点` : '管理你的API站点签到'}
            </p>
          </div>
        </div>

        {/* 加载状态 */}
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-2 border-[#e5e5e5] border-t-[#0d0d0d] rounded-full animate-spin"></div>
            <p className="mt-4 text-[#6e6e80]">加载中...</p>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="text-center py-20 text-[#ef4444]">
            <p>{error}</p>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !error && sites.length === 0 && (
          <div className="text-center py-20 text-[#6e6e80]">
            <p className="text-lg">暂无签到站点</p>
            <p className="text-sm mt-2">点击右下角"签到管理"添加需要签到的站点</p>
          </div>
        )}

        {/* 站点卡片网格 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sites.map((site, index) => (
            <SiteCard
              key={site.name}
              site={site}
              onCheckin={handleCheckin}
              index={index}
            />
          ))}
        </div>

        {/* 右下角签到管理按钮 */}
        <button
          onClick={() => setShowCheckinManager(true)}
          className="fixed bottom-8 right-8 px-5 py-3 bg-[#0d0d0d] text-white rounded-full font-medium hover:bg-[#2d2d2d] transition-colors shadow-lg inline-flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          签到管理
        </button>
      </div>

      {/* 签到管理弹窗 */}
      {showCheckinManager && (
        <SiteManager 
          onClose={() => setShowCheckinManager(false)} 
          onUpdate={fetchSites}
        />
      )}
    </div>
  )
}

export default CheckinPage

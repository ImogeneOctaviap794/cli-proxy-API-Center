import { useState } from 'react'

function SiteCard({ site, onCheckin, index }) {
  const [loading, setLoading] = useState(false)

  const handleGoToSite = () => {
    let url = site.directUrl || site.baseUrl
    if (!site.directUrl && (url.endsWith('/v1') || url.endsWith('/v1/'))) {
      url = url.replace(/\/v1\/?$/, '')
    }
    window.open(url, '_blank')
  }

  const handleToggleCheckin = async () => {
    setLoading(true)
    await onCheckin(site.name, !site.checkedIn)
    setLoading(false)
  }

  return (
    <div 
      className={`border rounded-xl p-5 transition-all duration-200 ${
        site.checkedIn 
          ? 'border-[#10a37f] bg-[#10a37f]/5' 
          : 'border-[#e5e5e5] hover:border-[#d1d1d1] bg-white'
      }`}
    >
      {/* 站点信息 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#f7f7f8] flex items-center justify-center text-[#0d0d0d] font-semibold">
            {site.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-semibold text-[#0d0d0d] flex items-center gap-2">
              {site.name}
              {site.checkedIn && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#10a37f]/10 text-[#10a37f] font-medium">
                  已完成
                </span>
              )}
            </h3>
            <p className="text-[#6e6e80] text-sm truncate max-w-[200px]" title={site.baseUrl}>
              {site.baseUrl}
            </p>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={handleGoToSite}
          className="flex-1 px-4 py-2.5 bg-[#0d0d0d] hover:bg-[#2d2d2d] text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          去签到
        </button>
        
        <button
          onClick={handleToggleCheckin}
          disabled={loading}
          className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2 ${
            site.checkedIn
              ? 'border border-[#e5e5e5] text-[#6e6e80] hover:bg-[#f7f7f8]'
              : 'bg-[#10a37f] hover:bg-[#0d8a6a] text-white'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
          ) : site.checkedIn ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
              取消
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
              完成
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default SiteCard

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronDown, Share, X } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { iosInstallHintOnThisPage, isIosSafari, isStandaloneDisplay } from '@/pwaStandalone'

const IOS_HINT_KEY = 'skiftpro.iosInstallHintDismissed'
const IOS_DASHBOARD_SEEN_KEY = 'skiftpro.iosInstallHintDashboardSeen'

// Survives a re-render after the dashboard flag is written, so the first visit stays visible.
let holdDashboardHint = false

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    // Private mode can reject localStorage. The hint still hides for this visit.
  }
}

function iosHintAllowed() {
  return isIosSafari() && !isStandaloneDisplay() && !readFlag(IOS_HINT_KEY)
}

const hintPosition = {
  bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
  paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
  paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
}

export default function InstallPrompt() {
  const { pathname } = useLocation()
  const { isAuthenticated, isLoadingAuth, isLoadingPublicSettings } = useAuth()
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const dashboardReady = isAuthenticated && !isLoadingAuth && !isLoadingPublicSettings

  useEffect(() => {
    const onPrompt = (event) => {
      if (isStandaloneDisplay()) return
      event.preventDefault()
      setDeferredPrompt(event)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setShowIosHint(false)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (!iosHintAllowed()) {
      setShowIosHint(false)
      return
    }
    if (pathname === '/Dashboard' && dashboardReady && !readFlag(IOS_DASHBOARD_SEEN_KEY)) {
      holdDashboardHint = true
      writeFlag(IOS_DASHBOARD_SEEN_KEY)
    }
    if (pathname !== '/Dashboard') holdDashboardHint = false
    setShowIosHint(iosInstallHintOnThisPage(pathname, {
      dashboardSeen: readFlag(IOS_DASHBOARD_SEEN_KEY),
      holdDashboard: holdDashboardHint,
      dashboardReady,
    }))
  }, [pathname, dashboardReady])

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    try {
      await deferredPrompt.userChoice
    } catch {
      // The prompt can reject if it was already used.
    }
    setDeferredPrompt(null)
  }

  const dismissIosHint = () => {
    writeFlag(IOS_HINT_KEY)
    holdDashboardHint = false
    setShowIosHint(false)
  }

  if (deferredPrompt) {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 z-[80] flex justify-end"
        style={hintPosition}
        role="region"
        aria-label="Installer SkiftPro"
      >
        <button
          type="button"
          onClick={install}
          className="pointer-events-auto rounded-full bg-blue-950 px-4 py-2 text-sm font-medium text-white shadow-lg"
        >
          Installer appen
        </button>
      </div>
    )
  }

  if (!showIosHint) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center"
      style={hintPosition}
    >
      <div className="w-full max-w-sm">
        <div
          role="note"
          aria-label="Installer SkiftPro som app"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-600 shadow-md"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Installer SkiftPro som app</p>
              <ol className="mt-2 space-y-1.5 text-sm leading-snug">
                <li>
                  1. Trykk på Del-ikonet{' '}
                  <Share className="inline h-3.5 w-3.5 align-[-2px] text-slate-800" strokeWidth={2} aria-hidden="true" />
                  {' '}nederst i Safari (eller under «…» ved adressefeltet)
                </li>
                <li>2. Velg «Legg til på Hjem-skjerm»</li>
                <li>3. Trykk «Legg til»</li>
              </ol>
            </div>
            <button
              type="button"
              onClick={dismissIosHint}
              aria-label="Lukk"
              className="pointer-events-auto shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex justify-center text-slate-400" aria-hidden="true">
          <ChevronDown className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

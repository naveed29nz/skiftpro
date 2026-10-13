import { useEffect, useState } from 'react'
import { Share, X } from 'lucide-react'
import { isIosSafari, isStandaloneDisplay } from '@/pwaStandalone'

const IOS_HINT_KEY = 'skiftpro.iosInstallHintDismissed'

function readIosHintDismissed() {
  try {
    return localStorage.getItem(IOS_HINT_KEY) === '1'
  } catch {
    return false
  }
}

function rememberIosHintDismissed() {
  try {
    localStorage.setItem(IOS_HINT_KEY, '1')
  } catch {
    // Private mode can reject localStorage. The hint stays hidden for this visit.
  }
}

const hintPosition = {
  bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
  paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
  paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplay()) return undefined

    if (isIosSafari() && !readIosHintDismissed()) {
      setShowIosHint(true)
    }

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
    rememberIosHintDismissed()
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
      role="region"
      aria-label="Installer SkiftPro"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl bg-blue-950 px-3 py-2.5 text-white shadow-lg">
        <Share className="mt-0.5 h-4 w-4 shrink-0 text-blue-200" aria-hidden="true" />
        <p className="flex-1 text-sm leading-snug">Trykk Del-knappen og velg Legg til på Hjem-skjerm</p>
        <button
          type="button"
          onClick={dismissIosHint}
          aria-label="Lukk"
          className="shrink-0 rounded-md p-1 text-blue-200 hover:bg-blue-900 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

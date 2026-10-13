export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false
  const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches
  return standaloneMedia || window.navigator.standalone === true
}

export function isIosSafari() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const iOS = /iPad|iPhone|iPod/.test(ua) || iPadOs
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|OPT\/|GSA\//i.test(ua)
  const safari = /Safari/i.test(ua) && !otherBrowser
  return iOS && safari
}

export function installStandaloneClass() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const query = window.matchMedia('(display-mode: standalone)')
  const apply = () => {
    document.documentElement.classList.toggle('pwa-standalone', isStandaloneDisplay())
  }
  apply()
  query.addEventListener?.('change', apply)
}

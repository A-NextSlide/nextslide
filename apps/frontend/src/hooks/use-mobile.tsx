import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_LANDSCAPE_HEIGHT = 500

const getIsMobile = () => {
  if (typeof window === "undefined") return false
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0
  const isNarrow = window.innerWidth < MOBILE_BREAKPOINT
  const isShort = window.innerHeight < MOBILE_LANDSCAPE_HEIGHT
  return isTouch ? (isNarrow || isShort) : isNarrow
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(getIsMobile())

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(getIsMobile())
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    window.addEventListener("orientationchange", checkMobile)
    return () => {
      window.removeEventListener("resize", checkMobile)
      window.removeEventListener("orientationchange", checkMobile)
    }
  }, [])

  return !!isMobile
}

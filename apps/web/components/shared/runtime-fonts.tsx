'use client'

import { useEffect } from 'react'

/** Browser-loaded fonts keep the production build independent of a font service. */
export function RuntimeFonts() {
  useEffect(() => {
    if (document.getElementById('ff-runtime-fonts')) return
    const link = document.createElement('link')
    link.id = 'ff-runtime-fonts'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap'
    document.head.appendChild(link)
  }, [])
  return null
}

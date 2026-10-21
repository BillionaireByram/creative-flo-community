'use client'

import { useEffect } from 'react'

const serif = ['DM Serif Display', 'Fraunces', 'Playfair Display', 'Cormorant Garamond', 'Instrument Serif']
const mono = ['Space Mono', 'JetBrains Mono', 'Roboto Mono']
const sans = ['Anton', 'Montserrat', 'Archivo', 'Bebas Neue', 'Big Shoulders Display', 'Chakra Petch', 'Manrope', 'Michroma', 'Orbitron', 'Sora', 'Syne', 'Unbounded', 'Nunito', 'Inter', 'Roboto', 'Poppins', 'Oswald']
export const fontFamilies: Readonly<Record<string, string>> = Object.fromEntries([
  ...serif.map((name) => [name, `"${name}", Georgia, serif`]),
  ...mono.map((name) => [name, `"${name}", ui-monospace, monospace`]),
  ...sans.map((name) => [name, `"${name}", Arial, sans-serif`]),
  ['Caveat', '"Caveat", cursive'],
])
/** A family the builder names more specifically, such as "Archivo Expanded", still uses its base family. */
export function fontFamily(name?: string) {
  if (!name) return 'Arial, sans-serif'
  if (fontFamilies[name]) return fontFamilies[name]
  const base = Object.keys(fontFamilies).filter((family) => name.startsWith(`${family} `)).sort((a, b) => b.length - a.length)[0]
  return base ? fontFamilies[base] : 'Arial, sans-serif'
}
export function useStyleFonts() {
  useEffect(() => {
    if (document.getElementById('cf-style-fonts')) return
    const link = document.createElement('link')
    link.id = 'cf-style-fonts'
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${Object.keys(fontFamilies).map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}`).join('&')}&display=swap`
    document.head.appendChild(link)
  }, [])
}

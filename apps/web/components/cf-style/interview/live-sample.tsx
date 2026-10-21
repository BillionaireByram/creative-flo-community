'use client'

import { useEffect, useState } from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'
import { fontFamily } from '../fonts'
import type { Sample } from './samples'
import { classes, OriginalFrame } from './original-frames'
import css from './interview.module.css'

const words = 'I built a system that runs my business while I sleep'.split(' ')
export function LiveSample({ sample, brand }: { sample: Sample; brand: string }) {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (reduce || !sample.id.startsWith('cap-')) return
    const timer = setInterval(() => setTick((current) => (current + 1) % (words.length + 4)), 330)
    return () => clearInterval(timer)
  }, [reduce, sample.id])
  if (sample.id.startsWith('type-')) return <div className={css.spec}>
    <span className={css.tag}>{sample.fonts.join(' + ')}</span>
    <div className={css.big} style={{ fontFamily: fontFamily(sample.fonts[0]), fontWeight: 800, fontStyle: sample.id === 'type-instrument' ? 'italic' : undefined, textTransform: ['type-archivo', 'type-anton', 'type-bebas', 'type-mono'].includes(sample.id) ? 'uppercase' : undefined }}>{brand === 'Your brand' ? 'Build the machine' : brand}</div>
    <div className={css.small} style={{ fontFamily: fontFamily(sample.fonts[1]) }}>Then let it run the business you used to run by hand.</div>
  </div>
  if (sample.id.startsWith('cap-')) {
    const kind = sample.id.slice(4)
    const index = reduce ? words.length - 1 : tick
    const lastKey = [2, 3, 6, 10].filter((key) => key <= index).at(-1)
    return <div className={classes(`frame cap c-${kind}${kind === 'cine' ? ' bars' : ''}`)} aria-label={sample.title}>
      <div className={css.face} />{kind !== 'none' && <div className={classes(`line${kind === 'cine' && (reduce || tick < words.length) ? ' show' : ''}`)}>{words.map((word, i) => {
        const on = reduce || (kind === 'stack' || kind === 'lower' ? i >= Math.floor(index / 3) * 3 && i <= index : kind === 'key' ? i === lastKey : i <= index)
        return <span key={i} className={classes(`${on ? 'on' : ''} ${i === index ? 'cur' : ''}`)}>{word}</span>
      })}</div>}
    </div>
  }
  if (sample.id.startsWith('hook-')) {
    const text: Record<string, string> = { 'hook-claim': 'Your next chapter starts here.', 'hook-question': 'What if you tried this?', 'hook-result': 'From idea to opening day.', 'hook-story': 'It started with one call.', 'hook-interrupt': 'Wait. Look at this.', 'hook-text': 'Three things I wish I knew.' }
    return <div className={classes(`frame hook ${sample.id}`)}><small>THE FIRST 3 SECONDS</small><strong>{text[sample.id]}</strong></div>
  }
  if (sample.id.startsWith('motion-')) return <div className={classes(`frame dens ${sample.id === 'motion-takeover' ? 'takeover' : ''}`)}><div className={css.face} /><div className={css.dcard}>The proof</div><div className={css.dcap}>{brand}</div></div>
  return <OriginalFrame id={sample.id} brand={brand} />
}

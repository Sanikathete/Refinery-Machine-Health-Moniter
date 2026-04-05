import { useEffect, useRef, useState } from 'react'

export default function useIntersectionObserver(options = {}) {
  const { threshold = 0.2, root = null, rootMargin = '0px', triggerOnce = true } = options
  const ref = useRef(null)
  const [isIntersecting, setIsIntersecting] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion) {
      setIsIntersecting(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true)
          if (triggerOnce) observer.unobserve(entry.target)
        } else if (!triggerOnce) {
          setIsIntersecting(false)
        }
      },
      { threshold, root, rootMargin },
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [threshold, root, rootMargin, triggerOnce])

  return { ref, isIntersecting }
}


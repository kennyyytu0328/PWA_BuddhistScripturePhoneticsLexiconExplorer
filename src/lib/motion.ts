export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

// --ease-zen is set inline on <html> (index.html); the fallback keeps animations working without it.
export const zenEasing = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--ease-zen').trim() || 'cubic-bezier(0.19, 1, 0.22, 1)'

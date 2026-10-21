const resumeKey = (brand: string) => `cf-style-resume:${brand}`
export function rememberedInterview(brand: string): string | null {
  try { return localStorage.getItem(resumeKey(brand)) } catch { return null }
}
export function rememberInterview(brand: string, id: string) {
  try { localStorage.setItem(resumeKey(brand), id) } catch { /* The interview URL remains resumable without local storage. */ }
}
export function forgetInterview(brand: string, id: string) {
  try { if (rememberedInterview(brand) === id) localStorage.removeItem(resumeKey(brand)) } catch { /* Storage may be unavailable. */ }
}

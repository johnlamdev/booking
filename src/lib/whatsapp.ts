export function normalizeWhatsAppNumber(phone: string | null | undefined): string {
  return phone?.replace(/\D/g, '') ?? ''
}

export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const number = normalizeWhatsAppNumber(phone)
  const text = message.trim()
  if (!number || !text) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

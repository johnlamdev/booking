export function normalizeStudentEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized || null
}

export function normalizeStudentPhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, '') ?? ''
  if (!digits) return null
  if (digits.length === 8) return `852${digits}`
  if (digits.startsWith('00852')) return digits.slice(2)
  return digits
}

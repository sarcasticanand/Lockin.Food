const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

export function istDateString(date = new Date()): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().split('T')[0]
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().split('T')[0]
}


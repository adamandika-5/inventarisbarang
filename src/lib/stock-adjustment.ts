interface AdjustmentSuccessMessageInput {
  transactionNumber?: string
  delta?: number
  newStock?: number
  unitSymbol?: string
}

function formatQuantity(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value
  return normalized.toLocaleString('id-ID')
}

/** Build a success message without `+-5` or `undefined` values. */
export function formatAdjustmentSuccessMessage({
  transactionNumber,
  delta = 0,
  newStock,
  unitSymbol,
}: AdjustmentSuccessMessageInput): string {
  const transaction = transactionNumber ? ` ${transactionNumber}` : ''
  const signedDelta = `${delta > 0 ? '+' : ''}${formatQuantity(delta)}`
  const stockAfter = newStock === undefined ? '—' : formatQuantity(newStock)
  const unit = unitSymbol ? ` ${unitSymbol}` : ''

  return `Penyesuaian${transaction} berhasil. Delta: ${signedDelta}${unit} · Stok baru: ${stockAfter}${unit}`
}

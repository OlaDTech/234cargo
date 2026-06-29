export const PURCHASE_PLATFORMS = [
  { value: '1688', label: '1688' },
  { value: 'taobao', label: 'Taobao' },
  { value: 'pinduoduo', label: 'Pinduoduo' },
  { value: 'other', label: 'Other marketplace' },
]

export const PURCHASE_STATUSES = [
  { value: 'submitted', label: 'Submitted', color: 'var(--blue)' },
  { value: 'reviewing', label: 'Reviewing', color: 'var(--violet)' },
  { value: 'awaiting_payment', label: 'Awaiting payment', color: 'var(--amber)' },
  { value: 'payment_confirmed', label: 'Payment confirmed', color: 'var(--teal-d)' },
  { value: 'purchased', label: 'Purchased', color: 'var(--green)' },
  { value: 'unavailable', label: 'Unavailable', color: 'var(--red)' },
  { value: 'cancelled', label: 'Cancelled', color: 'var(--t3)' },
]

export const EMPTY_PURCHASE_REQUEST = {
  platform: '1688',
  product_link: '',
  product_name: '',
  variant: '',
  quantity: '1',
  variant_items: [{ variant: '', quantity: '1' }],
  notes: '',
}

export function purchasePlatformLabel(platform) {
  return PURCHASE_PLATFORMS.find(item => item.value === platform)?.label || 'Marketplace'
}

export function purchaseStatusMeta(status) {
  return PURCHASE_STATUSES.find(item => item.value === status) || PURCHASE_STATUSES[0]
}

export function marketplaceUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function positiveQuantity(value) {
  return Math.min(10000, Math.max(1, Number.parseInt(String(value || 1), 10) || 1))
}

export function normalizePurchaseVariantItems(items, fallbackVariant = '', fallbackQuantity = '1') {
  const source = Array.isArray(items) && items.length
    ? items
    : [{ variant: fallbackVariant, quantity: fallbackQuantity }]

  const normalized = source.map(item => ({
    variant: String(item?.variant || '').trim(),
    quantity: positiveQuantity(item?.quantity),
  }))

  return normalized.length ? normalized : [{ variant: '', quantity: 1 }]
}

export function purchaseVariantTotal(items) {
  return normalizePurchaseVariantItems(items).reduce((sum, item) => sum + item.quantity, 0)
}

export function purchaseVariantSummary(items) {
  return normalizePurchaseVariantItems(items)
    .map(item => `${item.variant || 'Default option'} x ${item.quantity}`)
    .join('; ')
}

export function purchaseVariantNotes(items) {
  return [
    'Requested options:',
    ...normalizePurchaseVariantItems(items).map(item => `- ${item.variant || 'Default option'}: ${item.quantity} piece${item.quantity === 1 ? '' : 's'}`),
  ].join('\n')
}

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

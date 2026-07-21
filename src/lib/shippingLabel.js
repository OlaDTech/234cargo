export function warehouseForShipment(settings = {}, shipmentType) {
  const type = shipmentType === 'air' || shipmentType === 'sea' ? shipmentType : 'sea'
  const legacy = {
    name: settings.china_warehouse_name,
    address: settings.china_warehouse_address,
    phone: settings.china_warehouse_phone,
  }

  return {
    name: settings[`china_${type}_warehouse_name`] || legacy.name,
    address: settings[`china_${type}_warehouse_address`] || legacy.address,
    phone: settings[`china_${type}_warehouse_phone`] || legacy.phone,
    heading: type === 'air' ? 'Air Freight Receiving Address' : 'Sea Freight Receiving Address',
  }
}

export function maskPhone(phone = '') {
  const value = String(phone || '').trim()
  if (value.length <= 4) return value || 'Phone not supplied'

  const digits = value.replace(/\D/g, '')
  if (digits.length >= 7) {
    const visibleStart = digits.slice(0, 3)
    const visibleEnd = digits.slice(-3)
    return `${visibleStart}${'*'.repeat(Math.max(3, digits.length - 6))}${visibleEnd}`
  }

  return `${value.slice(0, 2)}${'*'.repeat(Math.max(3, value.length - 4))}${value.slice(-2)}`
}

export function shippingLabelPayload(client, shipmentType) {
  const method = shipmentType === 'air' || shipmentType === 'sea' ? shipmentType : 'general'
  return `234:${client?.shipping_mark || ''}:${method}`
}

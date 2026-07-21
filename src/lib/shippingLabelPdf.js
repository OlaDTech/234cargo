import { generateQR } from './qr.js'
import { maskPhone, shippingLabelPayload, warehouseForShipment } from './shippingLabel.js'

const PAGE_SIZE = 283.465 // 100 mm in PDF points

const sanitize = value => String(value ?? '')
  .replace(/[\\()]/g, '\\$&')
  .replace(/[^\x20-\x7E]/g, ' ')

const wrapText = (value, width = 48, maxLines = 4) => {
  const words = String(value || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''

  words.forEach(word => {
    const next = line ? `${line} ${word}` : word
    if (next.length > width && line) {
      if (lines.length < maxLines) lines.push(line)
      line = word
    } else {
      line = next
    }
  })
  if (line && lines.length < maxLines) lines.push(line)
  return lines
}

const makePdf = content => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_SIZE} ${PAGE_SIZE}] /TrimBox [0 0 ${PAGE_SIZE} ${PAGE_SIZE}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n` })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return pdf
}

export function downloadShippingLabelPdf({ client, settings = {}, shipmentType = 'sea' }) {
  if (!client) return false

  const method = shipmentType === 'air' ? 'AIR FREIGHT' : 'SEA FREIGHT'
  const warehouse = warehouseForShipment(settings, shipmentType)
  const companyName = settings.company_name || '234Cargo Logistics'
  const mark = client.shipping_mark || 'SHIPPING MARK'
  const matrix = generateQR(shippingLabelPayload(client, shipmentType))
  const commands = []
  const text = (x, y, size, value, bold = false) => commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${sanitize(value)}) Tj ET`)
  const line = (x1, y1, x2, y2, width = 0.7) => commands.push(`0.72 G ${width} w ${x1} ${y1} m ${x2} ${y2} l S`)
  const fillRect = (x, y, width, height, gray = 0) => commands.push(`${gray} g ${x} ${y} ${width} ${height} re f`)

  fillRect(0, 252, PAGE_SIZE, 31, 0.08)
  text(14, 263, 15, companyName, true)
  text(205, 263, 10, method, true)
  text(14, 239, 7, 'CONSIGNEE', true)
  text(14, 224, 13, client.full_name || 'Client', true)
  text(14, 211, 9, client.state || client.country || '')
  text(14, 198, 9, maskPhone(client.phone))

  text(14, 175, 7, 'SHIPPING MARK', true)
  text(14, 153, 18, mark, true)

  const qrSize = 70
  const qrX = PAGE_SIZE - qrSize - 14
  const qrY = 159
  fillRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 1)
  const moduleSize = qrSize / matrix.length
  matrix.forEach((row, rowIndex) => row.forEach((dark, columnIndex) => {
    if (dark) fillRect(qrX + columnIndex * moduleSize, qrY + (matrix.length - rowIndex - 1) * moduleSize, moduleSize + 0.08, moduleSize + 0.08, 0)
  }))
  text(qrX + 8, 147, 6.5, 'SCAN SHIPPING MARK', true)

  line(14, 137, PAGE_SIZE - 14, 137, 1)
  text(14, 123, 8, warehouse.heading.toUpperCase(), true)
  text(14, 109, 9, warehouse.name || 'Receiving warehouse details pending', true)
  let addressY = 96
  wrapText(warehouse.address, 58, 4).forEach(addressLine => {
    text(14, addressY, 8, addressLine)
    addressY -= 11
  })
  if (warehouse.phone) {
    text(14, Math.max(43, addressY - 2), 8, `Warehouse phone: ${warehouse.phone}`)
  }

  line(14, 33, PAGE_SIZE - 14, 33)
  text(14, 20, 7.5, 'Attach this label clearly to every package.', true)
  text(217, 20, 7, '100 x 100 mm')

  const blob = new Blob([makePdf(commands.join('\n'))], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${mark}-${shipmentType}-100x100mm.pdf`.replace(/[^a-z0-9._-]+/gi, '-')
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

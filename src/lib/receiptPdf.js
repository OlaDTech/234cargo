const sanitize = value => String(value ?? '')
  .replace(/[\\()]/g, '\\$&')
  .replace(/[^\x20-\x7E]/g, ' ')

const money = value => `NGN ${(Number(value) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const wrapText = (value, width = 62) => {
  const words = String(value ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''

  words.forEach(word => {
    const next = line ? `${line} ${word}` : word
    if (next.length > width && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  })

  return lines.length || line ? [...lines, line] : ['']
}

const makePdf = content => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
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

export function downloadReceiptPdf({ receipt, client, companyName = '234Cargo Logistics' }) {
  if (!receipt) return false

  let items = []
  try { items = typeof receipt.items === 'string' ? JSON.parse(receipt.items || '[]') : (receipt.items || []) }
  catch { items = [] }
  const commands = []
  const text = (x, y, size, value, bold = false) => commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${sanitize(value)}) Tj ET`)
  const line = (x1, y1, x2, y2) => commands.push(`0.78 G 0.7 w ${x1} ${y1} m ${x2} ${y2} l S`)
  let y = 792

  text(48, y, 22, companyName, true)
  text(48, y - 23, 10, 'OFFICIAL RECEIPT')
  text(405, y, 12, receipt.receipt_no || 'Receipt', true)
  text(405, y - 18, 9, `Issued: ${new Date(receipt.issued_at || Date.now()).toLocaleDateString('en-GB')}`)
  text(405, y - 34, 9, `Status: ${String(receipt.status || 'unpaid').toUpperCase()}`)
  y -= 58
  line(48, y, 547, y)
  y -= 27

  text(48, y, 10, 'BILL TO', true)
  y -= 17
  text(48, y, 13, client?.full_name || 'Client', true)
  y -= 16
  text(48, y, 9, client?.phone || '')
  y -= 15
  text(48, y, 9, client?.shipping_mark ? `Shipping mark: ${client.shipping_mark}` : '')
  y -= 28

  commands.push(`0.95 g 48 ${y - 8} 499 20 re f`)
  commands.push('0 g')
  text(56, y, 9, 'DESCRIPTION', true)
  text(350, y, 9, 'QTY', true)
  text(405, y, 9, 'RATE', true)
  text(478, y, 9, 'AMOUNT', true)
  y -= 20

  const rows = items.length ? items : [{ desc: 'Shipping service', qty: 1, unit_price: receipt.subtotal || receipt.total || 0 }]
  rows.forEach(item => {
    const descriptionLines = wrapText(item.desc || item.description || 'Shipping service', 46)
    descriptionLines.forEach((description, index) => {
      text(56, y, 9, description)
      if (index === 0) {
        text(350, y, 9, item.qty ?? 1)
        text(405, y, 9, money(item.unit_price))
        text(478, y, 9, money((Number(item.qty) || 0) * (Number(item.unit_price) || 0)))
      }
      y -= 14
    })
    y -= 4
  })

  y -= 4
  line(332, y, 547, y)
  y -= 20
  text(390, y, 10, 'Subtotal')
  text(478, y, 10, money(receipt.subtotal))
  y -= 18
  text(390, y, 10, 'Discount')
  text(478, y, 10, money(receipt.discount))
  y -= 22
  line(332, y + 9, 547, y + 9)
  text(390, y, 13, 'TOTAL', true)
  text(478, y, 13, money(receipt.total), true)
  y -= 62
  line(48, y, 547, y)
  text(48, y - 22, 9, 'Thank you for choosing our China-to-Nigeria logistics service.')
  text(48, y - 38, 8, 'This receipt was generated electronically and is valid without a signature.')

  const blob = new Blob([makePdf(commands.join('\n'))], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${receipt.receipt_no || '234-cargo-receipt'}.pdf`
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

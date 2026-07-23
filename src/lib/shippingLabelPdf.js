import { generateQR } from './qr.js'
import { maskPhone, shippingLabelPayload, warehouseForShipment } from './shippingLabel.js'

const PAGE_SIZE = 283.465 // 100 mm in PDF points
const RASTER_SIZE = 1181 // 100 mm at 300 DPI

const escapeXml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const wrapText = (value, width = 52, maxLines = 3) => {
  const tokens = String(value || '').split(/\s+/).filter(Boolean).flatMap(word => {
    if (word.length <= width) return [word]
    return Array.from({ length: Math.ceil(word.length / width) }, (_, index) => word.slice(index * width, (index + 1) * width))
  })
  const lines = []
  let line = ''

  tokens.forEach(word => {
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

const fitFontSize = (value, preferred, minimum, softLimit) => {
  const length = String(value || '').length
  if (length <= softLimit) return preferred
  return Math.max(minimum, Math.floor(preferred * (softLimit / length)))
}

const makeImagePdf = (jpegBytes, pixelWidth, pixelHeight) => {
  const pageContent = `q\n${PAGE_SIZE} 0 0 ${PAGE_SIZE} 0 0 cm\n/Im1 Do\nQ`
  const encoder = new TextEncoder()
  const chunks = []
  let byteLength = 0
  const offsets = [0]
  const append = value => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value
    chunks.push(bytes)
    byteLength += bytes.length
  }
  const appendObject = (number, bodyParts) => {
    offsets.push(byteLength)
    append(`${number} 0 obj\n`)
    bodyParts.forEach(append)
    append('\nendobj\n')
  }

  append('%PDF-1.4\n')
  appendObject(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  appendObject(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'])
  appendObject(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_SIZE} ${PAGE_SIZE}] /TrimBox [0 0 ${PAGE_SIZE} ${PAGE_SIZE}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>`])
  appendObject(4, [`<< /Length ${pageContent.length} >>\nstream\n${pageContent}\nendstream`])
  appendObject(5, [
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    jpegBytes,
    '\nendstream',
  ])

  const xrefOffset = byteLength
  append(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  const pdf = new Uint8Array(byteLength)
  let position = 0
  chunks.forEach(chunk => {
    pdf.set(chunk, position)
    position += chunk.length
  })
  return pdf
}

export const buildShippingLabelSvg = ({ client, settings, shipmentType }) => {
  const method = shipmentType === 'air' || shipmentType === 'sea' ? shipmentType : 'general'
  const methodLabel = method === 'air' ? 'AIR FREIGHT' : method === 'sea' ? 'SEA FREIGHT' : 'FREIGHT'
  const methodFill = method === 'air' ? '#1D4ED8' : method === 'sea' ? '#087A4D' : '#081A33'
  const methodSoft = method === 'air' ? '#DBEAFE' : method === 'sea' ? '#DDF7EF' : '#E2E8F0'
  const warehouse = warehouseForShipment(settings, shipmentType)
  const mark = client.shipping_mark || 'SHIPPING MARK'
  const clientName = client.full_name || 'Client'
  const clientLocation = [client.state, client.country].filter(Boolean).join(', ') || 'Nigeria'
  const displayPhone = maskPhone(client.phone)
  const matrix = generateQR(shippingLabelPayload(client, shipmentType))
  const qrSize = 226
  const qrX = 708
  const qrY = 210
  const moduleSize = qrSize / matrix.length
  const qrRects = matrix.flatMap((row, rowIndex) => row.map((dark, columnIndex) => dark
    ? `<rect x="${qrX + columnIndex * moduleSize}" y="${qrY + rowIndex * moduleSize}" width="${moduleSize + 0.45}" height="${moduleSize + 0.45}" fill="#081A33"/>`
    : '')).join('')
  const markSize = fitFontSize(mark, 82, 42, 15)
  const clientNameSize = fitFontSize(clientName, 34, 24, 25)
  const clientMeta = `${clientLocation} - ${displayPhone}`
  const clientMetaSize = fitFontSize(clientMeta, 20, 16, 44)
  const warehouseName = warehouse.name || 'Receiving warehouse'
  const warehouseNameSize = fitFontSize(warehouseName, 28, 22, 40)
  const addressLines = wrapText(warehouse.address || 'Receiving warehouse details pending', 66, 3)
  const addressFontSize = addressLines.length > 2 ? 24 : 27
  const addressLineHeight = addressLines.length > 2 ? 28 : 31
  const addressStartY = 742
  const addressText = addressLines.map((line, index) => `<tspan x="96" y="${addressStartY + index * addressLineHeight}">${escapeXml(line)}</tspan>`).join('')
  const phoneY = Math.min(824, addressStartY + addressLines.length * addressLineHeight + 24)

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 1000 1000">
      <rect width="1000" height="1000" rx="32" fill="#F8FAFC"/>
      <rect x="20" y="20" width="960" height="960" rx="28" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="4"/>

      <rect x="44" y="44" width="912" height="96" rx="18" fill="#FFFFFF"/>
      <g transform="translate(70 66)">
        <path d="M47 0a28 28 0 1 0 0 46L37 34a13 13 0 1 1 0-22z" fill="#073B63"/>
        <path d="M1 19h33l16-9v26L34 26H1z" fill="#0AA85B"/>
        <rect x="49" y="12" width="22" height="22" rx="2" fill="#0AA85B"/>
        <path d="M55 15v16M63 16v14" stroke="#FFFFFF" stroke-width="3"/>
        <text x="88" y="34" font-family="Arial, sans-serif" font-size="34" font-weight="900"><tspan fill="#0AA85B">234</tspan><tspan fill="#073B63">Cargo</tspan></text>
        <text x="90" y="58" font-family="Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="1.4" fill="#64748B">CHINA TO NIGERIA LOGISTICS</text>
      </g>
      <rect x="704" y="66" width="210" height="52" rx="10" fill="${methodFill}"/>
      <text x="809" y="99" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="900" letter-spacing="1.8" fill="#FFFFFF">${methodLabel}</text>

      <rect x="60" y="166" width="616" height="292" rx="22" fill="#081A33"/>
      <rect x="60" y="166" width="14" height="292" rx="7" fill="${methodFill}"/>
      <text x="104" y="220" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="4" fill="#5EEAD4">SHIPPING MARK</text>
      <text x="104" y="315" font-family="Arial, sans-serif" font-size="${markSize}" font-weight="900" letter-spacing="4" fill="#FFFFFF">${escapeXml(mark)}</text>
      <rect x="104" y="358" width="426" height="1.8" fill="#24405F"/>
      <text x="104" y="395" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="#D7FFF8">Use this exact mark on every carton.</text>
      <text x="104" y="425" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#A7F3E5">Goods without a clear mark may be delayed.</text>

      <rect x="700" y="166" width="240" height="292" rx="22" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="3"/>
      <rect x="690" y="188" width="260" height="248" rx="18" fill="${methodSoft}"/>
      <rect x="704" y="206" width="234" height="234" rx="12" fill="#FFFFFF"/>
      ${qrRects}
      <text x="820" y="480" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="1.2" fill="#081A33">SCAN LABEL</text>

      <rect x="60" y="492" width="880" height="108" rx="18" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="3"/>
      <text x="96" y="528" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="2.4" fill="#087A4D">CLIENT</text>
      <text x="96" y="570" font-family="Arial, sans-serif" font-size="${clientNameSize}" font-weight="900" fill="#081A33">${escapeXml(clientName)}</text>
      <text x="96" y="594" font-family="Arial, sans-serif" font-size="${clientMetaSize}" font-weight="900" fill="#334155">${escapeXml(clientMeta)}</text>

      <rect x="60" y="628" width="880" height="210" rx="18" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="3"/>
      <rect x="60" y="628" width="12" height="210" rx="6" fill="${methodFill}"/>
      <text x="96" y="668" font-family="Arial, sans-serif" font-size="16" font-weight="900" letter-spacing="2.4" fill="#087A4D">${escapeXml(warehouse.heading.toUpperCase())}</text>
      <text x="96" y="709" font-family="Arial, sans-serif" font-size="${warehouseNameSize}" font-weight="900" fill="#081A33">${escapeXml(warehouseName)}</text>
      <text font-family="Arial, sans-serif" font-size="${addressFontSize}" font-weight="900" fill="#081A33">${addressText}</text>
      ${warehouse.phone ? `<text x="96" y="${phoneY}" font-family="Arial, sans-serif" font-size="21" font-weight="900" fill="${methodFill}">${escapeXml(warehouse.phone)}</text>` : ''}

      <rect x="60" y="856" width="880" height="74" rx="18" fill="#FFF7F7" stroke="#FCA5A5" stroke-width="3"/>
      <rect x="60" y="856" width="12" height="74" rx="6" fill="#DC2626"/>
      <circle cx="106" cy="893" r="23" fill="#DC2626"/>
      <text x="106" y="902" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#FFFFFF">!</text>
      <text x="150" y="885" font-family="Arial, sans-serif" font-size="20" font-weight="900" letter-spacing="1" fill="#B91C1C">IMPORTANT</text>
      <text x="150" y="914" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="#7F1D1D">Attach this label clearly to every package. Unmarked goods may be delayed.</text>

      <rect x="60" y="946" width="880" height="28" rx="9" fill="#081A33"/>
      <text x="92" y="966" font-family="Arial, sans-serif" font-size="14" font-weight="900" letter-spacing="1.3" fill="#FFFFFF">234CARGO SHIPPING LABEL</text>
      <text x="908" y="966" text-anchor="end" font-family="Arial, sans-serif" font-size="14" font-weight="900" letter-spacing="1.1" fill="#5EEAD4">100 x 100 mm</text>
    </svg>`
}

const renderSvgToJpeg = svg => new Promise((resolve, reject) => {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = RASTER_SIZE
    canvas.height = RASTER_SIZE
    const context = canvas.getContext('2d')
    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, RASTER_SIZE, RASTER_SIZE)
    context.drawImage(image, 0, 0, RASTER_SIZE, RASTER_SIZE)
    URL.revokeObjectURL(svgUrl)
    const base64 = canvas.toDataURL('image/jpeg', 0.96).split(',')[1]
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    resolve(bytes)
  }
  image.onerror = () => {
    URL.revokeObjectURL(svgUrl)
    reject(new Error('Could not render shipping label'))
  }
  image.src = svgUrl
})

export async function downloadShippingLabelPdf({ client, settings = {}, shipmentType = 'sea' }) {
  if (!client) return false
  try {
    const svg = buildShippingLabelSvg({ client, settings, shipmentType })
    const jpegBytes = await renderSvgToJpeg(svg)
    const pdf = makeImagePdf(jpegBytes, RASTER_SIZE, RASTER_SIZE)
    const mark = client.shipping_mark || 'shipping-mark'
    const blob = new Blob([pdf], { type: 'application/pdf' })
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
  } catch (error) {
    console.error('Shipping label download failed', error)
    return false
  }
}

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
  const isAir = shipmentType === 'air'
  const method = isAir ? 'AIR FREIGHT' : 'SEA FREIGHT'
  const warehouse = warehouseForShipment(settings, shipmentType)
  const companyName = settings.company_name || '234Cargo Logistics'
  const mark = client.shipping_mark || 'SHIPPING MARK'
  const matrix = generateQR(shippingLabelPayload(client, shipmentType))
  const qrSize = 230
  const qrX = 710
  const qrY = 220
  const moduleSize = qrSize / matrix.length
  const qrRects = matrix.flatMap((row, rowIndex) => row.map((dark, columnIndex) => dark
    ? `<rect x="${qrX + columnIndex * moduleSize}" y="${qrY + rowIndex * moduleSize}" width="${moduleSize + 0.5}" height="${moduleSize + 0.5}" fill="#0A1628"/>`
    : '')).join('')
  const addressLines = wrapText(warehouse.address, 55, 3)
  const addressStartY = 842
  const addressLineHeight = 22
  const addressText = addressLines.map((line, index) => `<tspan x="65" y="${addressStartY + index * addressLineHeight}">${escapeXml(line)}</tspan>`).join('')
  const warehousePhoneY = addressStartY + Math.max(0, addressLines.length - 1) * addressLineHeight + 28
  const freightFill = isAir ? '#2563EB' : '#059669'

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 1000 1000">
      <defs>
        <linearGradient id="brandGreen" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#0bbf67"/><stop offset="1" stop-color="#07883f"/></linearGradient>
        <linearGradient id="brandNavy" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#073f68"/><stop offset="1" stop-color="#062744"/></linearGradient>
      </defs>
      <rect width="1000" height="1000" fill="#FFFFFF"/>
      <rect width="1000" height="145" fill="#0E9F8E"/>
      <rect x="30" y="24" width="410" height="96" rx="14" fill="#FFFFFF"/>
      <g transform="translate(50 36)">
        <path d="M70 0a42 42 0 1 0 0 68L55 50a19 19 0 1 1 0-32z" fill="url(#brandNavy)"/>
        <path d="M5 29h48l24-13v37L53 40H5z" fill="url(#brandGreen)"/>
        <rect x="73" y="19" width="34" height="31" rx="2" fill="url(#brandGreen)"/>
        <path d="M83 23v23M94 25v19" stroke="#fff" stroke-width="4"/>
        <text x="126" y="49" font-family="Arial, sans-serif" font-size="48" font-weight="800"><tspan fill="#08A84F">234</tspan><tspan fill="#063253">Cargo</tspan></text>
      </g>
      <text x="955" y="65" text-anchor="end" font-family="Arial, sans-serif" font-size="31" font-weight="800" fill="#FFFFFF">${method}</text>
      <text x="955" y="99" text-anchor="end" font-family="Arial, sans-serif" font-size="18" font-weight="600" fill="#DDF7F2">${escapeXml(companyName)}</text>

      <rect x="45" y="170" width="210" height="48" rx="24" fill="${freightFill}"/>
      <text x="150" y="202" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="#FFFFFF">${method}</text>

      <text x="50" y="255" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="2" fill="#0A1628">CONSIGNEE</text>
      <text x="50" y="307" font-family="Arial, sans-serif" font-size="40" font-weight="900" fill="#000000">${escapeXml(client.full_name || 'Client')}</text>
      <text x="50" y="349" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="#13243F">${escapeXml(client.state || client.country || '')}</text>
      <text x="50" y="389" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#13243F">${escapeXml(maskPhone(client.phone))}</text>

      <rect x="685" y="195" width="280" height="305" rx="18" fill="#FFFFFF" stroke="#D0D9E6" stroke-width="4"/>
      ${qrRects}
      <text x="825" y="478" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="900" letter-spacing="1" fill="#0A1628">SCAN SHIPPING MARK</text>

      <rect x="45" y="430" width="605" height="142" rx="16" fill="#0A1628"/>
      <text x="75" y="472" font-family="Arial, sans-serif" font-size="19" font-weight="900" letter-spacing="3" fill="#5EEAD4">SHIPPING MARK</text>
      <text x="75" y="535" font-family="Arial, sans-serif" font-size="50" font-weight="900" letter-spacing="3" fill="#FFFFFF">${escapeXml(mark)}</text>

      <rect x="45" y="582" width="910" height="154" rx="12" fill="#FFF2E8" stroke="#DC2626" stroke-width="4"/>
      <text x="68" y="614" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="22" font-weight="900" fill="#DC2626">IMPORTANT / 重要提示</text>
      <text x="68" y="647" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#7F1D1D">This shipping mark must be attached clearly to every package.</text>
      <text x="68" y="678" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#7F1D1D">234Cargo will not be liable for goods lost or unidentified</text>
      <text x="68" y="705" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#7F1D1D">because the shipping mark was not attached.</text>
      <text x="68" y="729" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="17" font-weight="900" fill="#7F1D1D">此唛头必须贴在每个包裹上。未贴唛头导致货物丢失或无法识别，234Cargo 概不负责。</text>

      <rect x="45" y="748" width="910" height="180" rx="14" fill="#FFFFFF" stroke="#0E9F8E" stroke-width="5"/>
      <rect x="45" y="748" width="910" height="46" rx="12" fill="#0E9F8E"/>
      <text x="65" y="779" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="2" fill="#FFFFFF">${escapeXml(warehouse.heading.toUpperCase())}</text>
      <text x="65" y="816" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="25" font-weight="900" fill="#000000">${escapeXml(warehouse.name || 'Receiving warehouse details pending')}</text>
      <text font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="19" font-weight="900" fill="#000000">${addressText}</text>
      ${warehouse.phone ? `<text x="65" y="${warehousePhoneY}" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="21" font-weight="900" fill="#0B7D6F">WAREHOUSE PHONE / 仓库电话: ${escapeXml(warehouse.phone)}</text>` : ''}

      <rect x="0" y="943" width="1000" height="57" fill="#0A1628"/>
      <text x="40" y="979" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="20" font-weight="900" fill="#FFFFFF">LABEL EVERY PACKAGE / 每个包裹必须贴唛头</text>
      <text x="960" y="979" text-anchor="end" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#5EEAD4">100 x 100 mm</text>
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

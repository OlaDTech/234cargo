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
  const isAir = shipmentType === 'air'
  const method = isAir ? 'AIR FREIGHT' : 'SEA FREIGHT'
  const warehouse = warehouseForShipment(settings, shipmentType)
  const mark = client.shipping_mark || 'SHIPPING MARK'
  const clientName = client.full_name || 'Client'
  const clientLocation = client.state || client.country || 'Destination not set'
  const matrix = generateQR(shippingLabelPayload(client, shipmentType))
  const qrSize = 218
  const qrX = 721
  const qrY = 240
  const moduleSize = qrSize / matrix.length
  const qrRects = matrix.flatMap((row, rowIndex) => row.map((dark, columnIndex) => dark
    ? `<rect x="${qrX + columnIndex * moduleSize}" y="${qrY + rowIndex * moduleSize}" width="${moduleSize + 0.5}" height="${moduleSize + 0.5}" fill="#07162F"/>`
    : '')).join('')
  const addressLines = wrapText(warehouse.address || 'Receiving warehouse details pending', 64, 2)
  const addressStartY = 872
  const addressLineHeight = 21
  const addressText = addressLines.map((line, index) => `<tspan x="143" y="${addressStartY + index * addressLineHeight}">${escapeXml(line)}</tspan>`).join('')
  const warehousePhoneY = addressStartY + Math.max(0, addressLines.length - 1) * addressLineHeight + 28
  const freightFill = isAir ? '#1D4ED8' : '#087A4D'
  const freightAccent = isAir ? '#60A5FA' : '#13A56B'
  const clientNameSize = fitFontSize(clientName, 48, 31, 22)
  const locationSize = fitFontSize(clientLocation, 27, 20, 28)
  const markSize = fitFontSize(mark, 68, 40, 16)

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 1000 1000">
      <rect width="1000" height="1000" rx="26" fill="#FFFFFF"/>
      <rect x="4" y="4" width="992" height="992" rx="24" fill="none" stroke="#075C3D" stroke-width="8"/>

      <path d="M8 8H992V150H8Z" fill="${freightFill}"/>
      <path d="M8 8H590L548 150H8Z" fill="#FFFFFF"/>
      <path d="M590 8H625L580 150H546Z" fill="${freightAccent}"/>
      <g transform="translate(52 34)">
        <path d="M72 0a44 44 0 1 0 0 72L56 53a20 20 0 1 1 0-34z" fill="#073B63"/>
        <path d="M2 30h52l25-14v40L54 41H2z" fill="#0AA85B"/>
        <rect x="74" y="19" width="35" height="34" rx="2" fill="#0AA85B"/>
        <path d="M84 24v24M96 25v22" stroke="#FFFFFF" stroke-width="4"/>
        <text x="130" y="52" font-family="Arial, sans-serif" font-size="51" font-weight="900"><tspan fill="#0AA85B">234</tspan><tspan fill="#073B63">Cargo</tspan></text>
        <text x="132" y="78" font-family="Arial, sans-serif" font-size="17" font-style="italic" font-weight="700" fill="#19533E">Your trusted shipping partner</text>
      </g>
      <g transform="translate(580 47) scale(.72)" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
        ${isAir
          ? '<path d="M8 48h98M42 48 69 3l11 45M59 48l-24-20M70 21l24 15M22 72h78"/>'
          : '<path d="M3 52h110l-17 24H24L3 52Zm25 0V26h24v26M57 52V12h24v40M86 52V34h19v18M17 82c10 7 20 7 30 0 10 7 20 7 30 0 10 7 20 7 30 0"/>'}
      </g>
      <text x="958" y="68" text-anchor="end" font-family="Arial, sans-serif" font-size="34" font-weight="900" letter-spacing="2" fill="#FFFFFF">${method}</text>
      <text x="958" y="108" text-anchor="end" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="7" fill="#FFFFFF">SHIPPING MARK</text>

      <path d="M48 175H327L304 224H48Z" fill="#07162F"/>
      <circle cx="75" cy="199" r="25" fill="${freightFill}"/>
      <circle cx="75" cy="190" r="8" fill="#FFFFFF"/>
      <path d="M61 213c2-13 8-18 14-18s12 5 14 18" fill="#FFFFFF"/>
      <text x="112" y="208" font-family="Arial, sans-serif" font-size="23" font-weight="900" letter-spacing="1" fill="#FFFFFF">CONSIGNEE</text>
      <rect x="48" y="235" width="6" height="178" rx="3" fill="${freightAccent}"/>
      <text x="80" y="288" font-family="Arial, sans-serif" font-size="${clientNameSize}" font-weight="900" fill="#07162F">${escapeXml(clientName)}</text>
      <circle cx="82" cy="342" r="22" fill="${freightFill}"/>
      <path d="M82 329a10 10 0 0 0-10 10c0 12 10 22 10 22s10-10 10-22a10 10 0 0 0-10-10Zm0 14a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" fill="#FFFFFF"/>
      <text x="118" y="351" font-family="Arial, sans-serif" font-size="${locationSize}" font-weight="800" fill="#13243F">${escapeXml(clientLocation)}</text>
      <circle cx="82" cy="399" r="22" fill="${freightFill}"/>
      <path d="M72 387c3 13 11 21 24 24l6-8-10-7-5 5c-4-2-7-5-9-9l5-5-7-10z" fill="#FFFFFF"/>
      <text x="118" y="408" font-family="Arial, sans-serif" font-size="27" font-weight="900" fill="#13243F">${escapeXml(maskPhone(client.phone))}</text>

      <rect x="695" y="176" width="268" height="416" rx="20" fill="#FFFFFF" stroke="${freightFill}" stroke-width="4"/>
      <rect x="713" y="223" width="234" height="252" rx="10" fill="#FFFFFF" stroke="#D8E0E8" stroke-width="2"/>
      ${qrRects}
      <rect x="713" y="493" width="234" height="70" rx="8" fill="${freightFill}"/>
      <path d="M735 514v-10h10M758 504h10v10M735 542v10h10M768 542v10h-10" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
      <text x="838" y="536" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="900" fill="#FFFFFF">SCAN SHIPPING MARK</text>

      <rect x="48" y="459" width="622" height="133" rx="17" fill="#07162F"/>
      <path d="M72 436H430L405 485H72Z" fill="${freightFill}"/>
      <circle cx="102" cy="460" r="28" fill="${freightFill}" stroke="#FFFFFF" stroke-width="2"/>
      <path d="m88 451 14-8 14 8v17l-14 8-14-8zM88 451l14 8 14-8M102 459v17" fill="none" stroke="#FFFFFF" stroke-width="3"/>
      <text x="143" y="469" font-family="Arial, sans-serif" font-size="23" font-weight="900" letter-spacing="2" fill="#FFFFFF">SHIPPING MARK</text>
      <text x="82" y="562" font-family="Arial, sans-serif" font-size="${markSize}" font-weight="900" letter-spacing="3" fill="#FFFFFF">${escapeXml(mark)}</text>

      <rect x="48" y="614" width="915" height="159" rx="16" fill="#FFF6F3" stroke="#DC2626" stroke-width="4"/>
      <path d="M93 641 61 710h64z" fill="#DC2626"/>
      <rect x="89" y="660" width="8" height="27" rx="4" fill="#FFFFFF"/>
      <circle cx="93" cy="699" r="5" fill="#FFFFFF"/>
      <text x="147" y="653" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="25" font-weight="900" fill="#B91C1C">IMPORTANT / 重要提示</text>
      <text x="147" y="682" font-family="Arial, sans-serif" font-size="19" font-weight="900" fill="#4A1111">Attach this shipping mark clearly to every package.</text>
      <text x="147" y="708" font-family="Arial, sans-serif" font-size="17" font-weight="800" fill="#4A1111">234Cargo is not liable for goods that are lost or cannot be identified</text>
      <text x="147" y="732" font-family="Arial, sans-serif" font-size="17" font-weight="800" fill="#4A1111">because the shipping mark was not attached.</text>
      <text x="147" y="758" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="16" font-weight="900" fill="#4A1111">此唛头必须清晰贴在每个包裹上。未贴唛头导致货物丢失或无法识别，234Cargo 概不负责。</text>

      <rect x="48" y="783" width="915" height="151" rx="16" fill="#FFFFFF" stroke="${freightFill}" stroke-width="4"/>
      <path d="M48 783H963V827H48Z" fill="${freightFill}"/>
      <circle cx="92" cy="805" r="31" fill="${freightFill}" stroke="#FFFFFF" stroke-width="3"/>
      <path d="M92 789a13 13 0 0 0-13 13c0 16 13 29 13 29s13-13 13-29a13 13 0 0 0-13-13Zm0 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12Z" fill="#FFFFFF"/>
      <text x="139" y="812" font-family="Arial, sans-serif" font-size="19" font-weight="900" letter-spacing="1" fill="#FFFFFF">${escapeXml(warehouse.heading.toUpperCase())}</text>
      <text x="143" y="849" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="22" font-weight="900" fill="#07162F">${escapeXml(warehouse.name || '234Cargo')}</text>
      <text font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="18" font-weight="900" fill="#07162F">${addressText}</text>
      ${warehouse.phone ? `<circle cx="112" cy="${warehousePhoneY - 7}" r="16" fill="${freightFill}"/><path d="M104 ${warehousePhoneY - 16}c2 10 8 16 18 18l5-6-8-5-4 4c-3-2-5-4-7-7l4-4-5-8z" fill="#FFFFFF"/><text x="143" y="${warehousePhoneY}" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="19" font-weight="900" fill="#07162F">WAREHOUSE PHONE / 仓库电话: ${escapeXml(warehouse.phone)}</text>` : ''}

      <path d="M8 947H992V992H8Z" fill="#07162F"/>
      <path d="M808 947H992V992H778Z" fill="${freightFill}"/>
      <path d="m48 961 15-8 15 8v18l-15 8-15-8zM48 961l15 8 15-8M63 969v18" fill="none" stroke="#FFFFFF" stroke-width="3"/>
      <text x="94" y="978" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="18" font-weight="900" fill="#FFFFFF">LABEL EVERY PACKAGE / 每个包裹必须贴唛头</text>
      <text x="964" y="978" text-anchor="end" font-family="Arial, sans-serif" font-size="19" font-weight="900" fill="#FFFFFF">100 × 100 mm</text>
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

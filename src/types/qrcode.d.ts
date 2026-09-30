declare module 'qrcode' {
  interface SvgOptions {
    type: 'svg'
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
    margin?: number
    width?: number
    color?: { dark?: string; light?: string }
  }

  interface QrCodeApi {
    toString(text: string, options: SvgOptions): Promise<string>
    create(text: string, options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): {
      modules: { size: number; data: Uint8Array }
    }
  }

  const QRCode: QrCodeApi
  export default QRCode
}

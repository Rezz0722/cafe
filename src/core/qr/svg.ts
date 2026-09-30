export interface QrModules {
  size: number
  data: Uint8Array
}

/** SVG مربعی و سازگار با چاپگرها؛ هر ماژول QR یک مربع fill واقعی است. */
export function qrModulesToSvg(
  modules: QrModules,
  options: { margin?: number; width?: number; dark?: string; light?: string } = {},
): string {
  const margin = Math.max(0, Math.floor(options.margin ?? 4))
  const width = Math.max(128, Math.floor(options.width ?? 1024))
  const dark = /^#[0-9a-f]{6}$/i.test(options.dark ?? '') ? options.dark! : '#15231D'
  const light = /^#[0-9a-f]{6}$/i.test(options.light ?? '') ? options.light! : '#FFFFFF'
  const viewSize = modules.size + margin * 2
  const cells: string[] = []
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (modules.data[y * modules.size + x]) cells.push(`M${x + margin} ${y + margin}h1v1h-1z`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><path fill="${light}" d="M0 0h${viewSize}v${viewSize}H0z"/><path fill="${dark}" d="${cells.join('')}"/></svg>`
}

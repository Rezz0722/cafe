import { NextResponse } from 'next/server'
import { buildMenuCsv, type MenuExportData } from './menuExport'

export type MenuExportFormat = 'json' | 'csv'

export function parseMenuExportFormat(value: string | null): MenuExportFormat | null {
  return value === null || value === 'json' ? 'json' : value === 'csv' ? 'csv' : null
}

export function parseMenuExportPlaceId(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export const menuExportPrivateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
}

export function createMenuExportResponse(data: MenuExportData, placeId: number, format: MenuExportFormat): NextResponse {
  return new NextResponse(format === 'csv' ? buildMenuCsv(data) : JSON.stringify(data), {
    status: 200,
    headers: {
      ...menuExportPrivateHeaders,
      'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="kucafe-menu-${placeId}.${format}"`,
    },
  })
}

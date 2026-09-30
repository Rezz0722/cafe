import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'کو کافه — راهنمای کافه‌ها و رستوران‌های مشهد',
    short_name: 'کوکافه',
    description: 'منو، قیمت، ساعت کاری، نقشه و مسیریابی کافه‌ها و رستوران‌های مشهد.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    categories: ['food', 'lifestyle'],
    shortcuts: [
      { name: 'کشف کافه', short_name: 'کشف', url: '/search' },
      { name: 'منو و قیمت', short_name: 'منو', url: '/mashhad/menu' },
      { name: 'پروفایل و باشگاه مشتریان', short_name: 'پروفایل', url: '/profile' },
    ],
    background_color: '#fffdfa',
    theme_color: '#fffdfa',
    lang: 'fa',
    dir: 'rtl',
    icons: [
      {
        src: '/brand/app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

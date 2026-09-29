# تسک ۱۴ — Docker و تحویل مستمر از GitHub

## هدف

تبدیل انتشار دستی KuCafe به یک مسیر قابل‌تکرار و قابل‌بازگشت:

`feature branch → GitHub CI → Pull Request → production → self-hosted runner → Docker deploy`

## قواعد غیرقابل‌مذاکره

1. Production فقط از commit موجود در شاخهٔ محافظت‌شدهٔ `production` ساخته می‌شود.
2. runner تولید هیچ PR یا branch دیگری را اجرا نمی‌کند.
3. secret، دیتابیس و media داخل Git یا application image قرار نمی‌گیرند.
4. پیش از migration بکاپ دیتابیس گرفته می‌شود.
5. حداکثر ۵ image از هر جزء و ۵ snapshot افزایشی media نگهداری می‌شود.
6. روی این سرور `docker system prune` اجرا نمی‌شود؛ سرویس‌های دیگری از Docker استفاده می‌کنند.

## فازها و وضعیت

| فاز | خروجی | وضعیت |
| --- | --- | --- |
| ۰ | ممیزی Git، سرویس‌ها، دادهٔ پایدار، ظرفیت و rollback | انجام شد |
| ۱ | Dockerfile چندمرحله‌ای، Compose تولید و Compose محلی | انجام شد |
| ۲ | جداسازی media، snapshot افزایشی و retention پنج‌نسخه‌ای | انجام شد |
| ۳ | CI عمومی بدون secret و دیتابیس یک‌بارمصرف | انجام شد |
| ۴ | Deploy از runner اختصاصی با trust boundary | آماده؛ ثبت runner نیازمند token مالک است |
| ۵ | build و آزمون موازی روی پورت ۳۱۰۰ | در حال اعتبارسنجی |
| ۶ | Push، حفاظت branch/environment و cutover Apache | نیازمند دسترسی GitHub مالک |

## معماری هدف

```text
GitHub public repository
  ├─ feature/* + PR ──▶ GitHub-hosted ubuntu runner ──▶ test/typecheck/build
  └─ protected production ──▶ dedicated self-hosted runner
                                └─ root-owned deploy wrapper
                                   ├─ verifies SHA == origin/production HEAD
                                   ├─ builds immutable Docker images
                                   ├─ DB backup + migrations
                                   ├─ starts app on 127.0.0.1:3100
                                   └─ health check + rollback

Apache :443 ──▶ 127.0.0.1:3100
                     ├─ host MariaDB on 127.0.0.1:3306
                     └─ bind-mounted /var/www/kucafe/public/media
```

## معیار پایان

- `docker compose config` معتبر باشد.
- unit tests، typecheck و production build موفق باشند.
- container روی ۳۱۰۰ سالم باشد و media واقعی را ببیند.
- فقط commit شاخهٔ `production` قابل انتشار باشد.
- rollback و نگهداری پنج نسخه تست شود.
- پس از cutover، پاسخ دامنه و لاگ Apache بررسی شود.

جزئیات اجرا و دستورات مالک در [راهنمای عملیات](../../docs/DOCKER_GITHUB_CICD_FA.md) است.

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
topmenumarket_all_scraper.py

اسکریپت مستقل برای گرفتن اطلاعات کامل «همه‌ی» کافه/رستوران‌های ثبت‌شده روی
سامانه‌ی TopMenuMarket (همون سایتی که app.topmenumarket.com/providers/search
لیستشون رو نشون می‌ده): هم قیمت منو، هم اطلاعات پروفایل (شماره تماس،
آدرس/لوکیشن، اینستاگرام، ساعت کاری).

منطق کار:
  1. لیست کامل providerها (کافه/رستوران‌ها) از این endpoint گرفته می‌شه که
     صفحه‌بندی‌شده (paginated) هست:
         GET https://www.topmenumarket.com/api/v2/providers?page=N
     پاسخش یک فیلد additional.paginator داره که last_page و total رو
     مشخص می‌کنه؛ اسکریپت خودش همه‌ی صفحه‌ها رو تا آخر می‌گیره.

  2. برای هر provider (با همون id عددی که از لیست بالا اومده):
       الف) پروفایل کامل (شماره تماس، اینستاگرام/شبکه‌های اجتماعی،
            آدرس متنی + مختصات جغرافیایی):
              GET https://www.topmenumarket.com/api/v2/providers/{id}
       ب) ساعات کاری هفتگی:
              GET https://www.topmenumarket.com/api/v2/providers/{id}/hours
       ج) کل درخت منو (دسته‌بندی -> زیردسته‌بندی -> آیتم):
              GET https://www.topmenumarket.com/api/v2/providers/{id}/menu

  3. درخت منو recursively پیمایش می‌شه و به یک لیست تخت (flat) از آیتم‌ها
     با قیمت (به تومان) تبدیل می‌شه.

  4. سه دسته فایل خروجی ساخته می‌شه:
       - all_menus_*.csv/json   → هر ردیف یک آیتم منو (دسته، زیردسته، نام،
         قیمت، ...) به همراه نام/یوزرنیم کافه. مناسب اکسل/تحلیل آماری.
       - providers_info_*.csv/json → هر ردیف اطلاعات پروفایل یک کافه
         (نام، یوزرنیم، تلفن‌ها، اینستاگرام، آدرس متنی، عرض/طول جغرافیایی،
         ساعات کاری هر روز هفته). مناسب اکسل/تحلیل آماری.
       - cafes_full_*.json (و cafes_full_latest.json) → یک آرایه‌ی JSON که
         هر عضوش یک رکورد کاملاً self-contained برای یک کافه‌ست: همه‌ی
         اطلاعات پروفایل + منوی کامل به‌صورت nested (دسته > زیردسته > آیتم)
         در همون یک رکورد. این فایل بهترین گزینه‌ست اگه بخواید داده رو به
         یک AI بدید تا از روش صفحه/کارت برای هر کافه بسازه، چون نیازی به
         join کردن چند فایل نیست و ساختارش خواناست.
     اگه با --per-provider-files اجرا بشه، برای هر کافه یک CSV/JSON منو
     جدا و یک JSON کامل (`{username}_full.json`) هم جداگانه ساخته می‌شه.

نصب پیش‌نیاز:
  pip3 install requests

استفاده‌ی ساده (گرفتن همه‌چیز):
  python3 topmenumarket_all_scraper.py --out /path/to/data

استفاده با محدودکردن تعداد (برای تست سریع، مثلاً فقط ۵ تا کافه‌ی اول):
  python3 topmenumarket_all_scraper.py --out /path/to/data --limit 5

استفاده برای گرفتن فقط یک کافه‌ی خاص (با یوزرنیمی که توی آدرس سایتش هست):
  python3 topmenumarket_all_scraper.py --out /path/to/data --username ramouz.cafe

اجرای خودکار دوره‌ای (اختیاری) با cron، مثلاً هر شب ساعت ۳:
  crontab -e
  0 3 * * *  /usr/bin/python3 /path/to/topmenumarket_all_scraper.py --out /path/to/data >> /path/to/scraper.log 2>&1

نکته‌ی قیمت:
  فیلد "price" که API برمی‌گردونه به ریال هست؛ این اسکریپت تقسیم بر ۱۰
  می‌کنه تا با تومان نمایشی روی خود سایت یکی باشه.

نکته‌ی روزهای هفته در ساعات کاری:
  API روزها رو با عدد ۱ تا ۷ برمی‌گردونه. طبق مشاهده‌ی داده‌های واقعی این
  پلتفرم، عدد ۱ = شنبه (شروع هفته‌ی ایرانی) در نظر گرفته شده. اگه برای
  کافه‌ای این تطابق نداشت، عدد خام day هم توی خروجی نگه داشته می‌شه که
  خودتون بتونید تصحیحش کنید.

نکته‌ی اخلاقی/فنی:
  بین درخواست‌ها یک مکث کوچیک (REQUEST_DELAY) گذاشته شده که فشار زیادی
  به سرور سایت وارد نشه. اگر سایت با خطای 429 (too many requests) مواجه
  شدید، مقدار REQUEST_DELAY رو بیشتر کنید.
"""

import argparse
import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    sys.stderr.write(
        "کتابخانه‌ی requests نصب نیست. اول این رو اجرا کن:\n"
        "    pip3 install requests\n"
    )
    sys.exit(1)

BASE = "https://www.topmenumarket.com/api/v2"
HEADERS = {
    "accept": "application/json",
    "user-agent": "Mozilla/5.0 (compatible; MenuPriceFetcher/1.0)",
}
REQUEST_DELAY = 0.5  # ثانیه، بین هر درخواست به سرور

MENU_CSV_FIELDNAMES = [
    "نام مجموعه",
    "یوزرنیم",
    "دسته‌بندی",
    "زیردسته",
    "نام آیتم",
    "نام انگلیسی",
    "توضیحات",
    "قیمت (تومان)",
    "موجود است",
    "شناسه آیتم",
]

DAY_NAMES = {
    1: "شنبه",
    2: "یکشنبه",
    3: "دوشنبه",
    4: "سه‌شنبه",
    5: "چهارشنبه",
    6: "پنجشنبه",
    7: "جمعه",
}

PROVIDER_CSV_FIELDNAMES = [
    "شناسه",
    "نام مجموعه",
    "نام انگلیسی",
    "یوزرنیم",
    "شماره تماس‌ها",
    "اینستاگرام",
    "سایر شبکه‌های اجتماعی",
    "آدرس متنی",
    "عرض جغرافیایی (lat)",
    "طول جغرافیایی (lng)",
    "ساعات کاری",
    "درباره",
    "لوگو",
]


def api_get(path, params=None):
    resp = requests.get(f"{BASE}{path}", params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("status") != 200:
        raise RuntimeError(f"{path} -> پاسخ نامعتبر: {payload}")
    return payload


def list_all_providers(limit=None):
    """همه‌ی providerها رو با پیمایش صفحه‌به‌صفحه برمی‌گردونه."""
    providers = []
    page = 1
    while True:
        payload = api_get("/providers", params={"page": page})
        batch = payload.get("data", [])
        providers.extend(batch)
        if limit and len(providers) >= limit:
            return providers[:limit]

        paginator = (payload.get("additional") or {}).get("paginator") or {}
        last_page = paginator.get("last_page", page)
        total = paginator.get("total", len(providers))
        print(f"  صفحه {page}/{last_page} از providerها گرفته شد (مجموع تاکنون: {len(providers)} از {total})")
        if page >= last_page:
            break
        page += 1
        time.sleep(REQUEST_DELAY)
    return providers


def get_provider_by_username(username):
    payload = api_get(f"/providers/{username}", params={"key": "name"})
    return payload["data"]


def get_provider_profile(username):
    """
    اطلاعات کامل پروفایل (تلفن، اینستاگرام، آدرس و ...) رو می‌گیره.

    مهم: این endpoint فقط با «username» کار می‌کنه، نه با id عددی.
    (با id عددی خطای 404 می‌ده.)
    """
    payload = api_get(f"/providers/{username}", params={"key": "name"})
    return payload["data"]


def get_hours(provider_id):
    """
    ساعات کاری هفتگی.

    مهم: این endpoint برعکسِ endpoint پروفایل، فقط با «id عددی» کار می‌کنه،
    نه با username. (با username خطای 404 می‌ده.)
    """
    payload = api_get(f"/providers/{provider_id}/hours")
    return payload.get("data") or {}


def get_menu(provider_id):
    payload = api_get(f"/providers/{provider_id}/menu")
    return payload.get("data", [])


def format_hours(hours_data):
    """ساعات کاری هفتگی رو به یک رشته‌ی خوانا تبدیل می‌کنه."""
    details = hours_data.get("details") or []
    parts = []
    for d in sorted(details, key=lambda x: x.get("day", 0)):
        day_label = DAY_NAMES.get(d.get("day"), f"روز {d.get('day')}")
        ranges = d.get("hour") or []
        range_strs = [f"{h.get('from')}-{h.get('to')}" for h in ranges]
        if range_strs:
            parts.append(f"{day_label}: {' و '.join(range_strs)}")
        else:
            parts.append(f"{day_label}: تعطیل")
    return " | ".join(parts)


def rial_to_toman(price_str):
    if price_str in (None, ""):
        return None
    try:
        return float(price_str) / 10
    except (TypeError, ValueError):
        return None


def walk_categories(nodes, provider_name, provider_username, path=None):
    if path is None:
        path = []
    rows = []
    for node in nodes:
        title = node.get("title") or ""
        new_path = path + [title]

        for item in node.get("items", []) or []:
            rows.append(
                {
                    "نام مجموعه": provider_name,
                    "یوزرنیم": provider_username,
                    "دسته‌بندی": new_path[0] if len(new_path) > 0 else "",
                    "زیردسته": " > ".join(new_path[1:]) if len(new_path) > 1 else "",
                    "نام آیتم": item.get("title") or "",
                    "نام انگلیسی": item.get("english_title") or "",
                    "توضیحات": item.get("details") or "",
                    "قیمت (تومان)": rial_to_toman(item.get("price")),
                    "موجود است": item.get("available"),
                    "شناسه آیتم": item.get("id"),
                }
            )

        sub_categories = node.get("subCategories") or []
        if sub_categories:
            rows.extend(walk_categories(sub_categories, provider_name, provider_username, new_path))
    return rows


def clean_menu_tree(nodes):
    """
    درخت خام API رو به یک ساختار تمیز و nested تبدیل می‌کنه (برای مصرف
    توسط AI یا هر ابزار دیگه‌ای که بخواد صفحه/کارت منو بسازه) -- بدون
    فلگ‌های داخلی بی‌ربط (level, zoom, ...)، با قیمت به تومان.
    """
    cleaned = []
    for node in nodes or []:
        entry = {
            "دسته‌بندی": node.get("title") or "",
            "توضیحات": node.get("description") or "",
            "تصویر": (node.get("thumbnail") or {}).get("url") if node.get("thumbnail") else None,
            "آیتم‌ها": [],
            "زیردسته‌ها": [],
        }
        for item in node.get("items", []) or []:
            entry["آیتم‌ها"].append(
                {
                    "نام": item.get("title") or "",
                    "نام انگلیسی": item.get("english_title") or "",
                    "توضیحات": item.get("details") or "",
                    "قیمت (تومان)": rial_to_toman(item.get("price")),
                    "موجود است": item.get("available"),
                    "ویژه است": item.get("featured"),
                    "تصویر": (item.get("thumbnail") or {}).get("url") if item.get("thumbnail") else None,
                    "شناسه": item.get("id"),
                }
            )
        sub_categories = node.get("subCategories") or []
        if sub_categories:
            entry["زیردسته‌ها"] = clean_menu_tree(sub_categories)
        cleaned.append(entry)
    return cleaned


def build_full_cafe_record(profile, hours_data, menu_tree):
    """
    یک رکورد کاملاً self-contained برای یک کافه می‌سازه: پروفایل + منوی
    nested با هم، طوری که هر رکورد به‌تنهایی همه‌ی چیزی که برای ساختن
    صفحه‌ی اون کافه لازمه رو داشته باشه (بدون نیاز به join با فایل دیگه).
    """
    provider_row = build_provider_row(profile, hours_data)
    return {
        "شناسه": provider_row["شناسه"],
        "نام مجموعه": provider_row["نام مجموعه"],
        "نام انگلیسی": provider_row["نام انگلیسی"],
        "یوزرنیم": provider_row["یوزرنیم"],
        "لینک منو": f"https://app.topmenumarket.com/menu/{provider_row['یوزرنیم']}/products",
        "شماره تماس‌ها": provider_row["شماره تماس‌ها"],
        "اینستاگرام": provider_row["اینستاگرام"],
        "سایر شبکه‌های اجتماعی": provider_row["سایر شبکه‌های اجتماعی"],
        "آدرس متنی": provider_row["آدرس متنی"],
        "عرض جغرافیایی (lat)": provider_row["عرض جغرافیایی (lat)"],
        "طول جغرافیایی (lng)": provider_row["طول جغرافیایی (lng)"],
        "ساعات کاری": provider_row["ساعات کاری"],
        "درباره": provider_row["درباره"],
        "لوگو": provider_row["لوگو"],
        "منو": clean_menu_tree(menu_tree),
    }


def extract_phone_number(entry):
    """
    شکل معمول: {"phone": "0912...", "label": "..."}.
    بعضی providerها شکل خراب دارند: {"phone": {"phone": "", "label": ""},
    "label": "0912..."} — یعنی شماره‌ی واقعی زیر "label" رفته، نه "phone".
    """
    raw = entry.get("phone")
    if isinstance(raw, str) and raw:
        return raw
    label = entry.get("label")
    if isinstance(label, str) and label:
        return label
    if isinstance(raw, dict):
        nested = raw.get("phone")
        if isinstance(nested, str) and nested:
            return nested
    return ""


def build_provider_row(profile, hours_data):
    phones = profile.get("phones") or []
    phone_str = " / ".join(filter(None, (extract_phone_number(p) for p in phones)))

    socials = profile.get("social_medias") or []
    instagram = ""
    other_socials = []
    for s in socials:
        label = s.get("label") or s.get("type") or ""
        url = s.get("url") or ""
        adornment = s.get("startAdornment") or ""
        full = f"{adornment}{url}" if adornment else url
        if (s.get("type") or "").lower() == "instagram":
            instagram = full
        else:
            other_socials.append(f"{label}: {full}")

    address = profile.get("address") or {}

    return {
        "شناسه": profile.get("id"),
        "نام مجموعه": profile.get("persian_name") or "",
        "نام انگلیسی": profile.get("english_name") or "",
        "یوزرنیم": profile.get("username") or "",
        "شماره تماس‌ها": phone_str,
        "اینستاگرام": instagram,
        "سایر شبکه‌های اجتماعی": " | ".join(other_socials),
        "آدرس متنی": address.get("location") or "",
        "عرض جغرافیایی (lat)": address.get("lt"),
        "طول جغرافیایی (lng)": address.get("lg"),
        "ساعات کاری": format_hours(hours_data),
        "درباره": profile.get("about") or "",
        "لوگو": (profile.get("logo") or {}).get("url") or "",
    }


def sanitize_filename(name):
    keep = "-_."
    return "".join(c if c.isalnum() or c in keep else "_" for c in name)[:80]


def save_json(path, data):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def save_csv(path, rows, fieldnames):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(
        description="گرفتن قیمت منو + پروفایل (تلفن/آدرس/اینستاگرام/ساعت کاری) همه‌ی کافه/رستوران‌های TopMenuMarket"
    )
    parser.add_argument(
        "--out", default="./menu_data_all", help="پوشه‌ی خروجی (پیش‌فرض: ./menu_data_all)"
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="فقط N تا از کافه‌ها رو بگیر (برای تست سریع)"
    )
    parser.add_argument(
        "--username",
        default=None,
        help="اگه فقط یک کافه‌ی خاص می‌خوای (یوزرنیمش توی آدرس سایتش، مثلاً ramouz.cafe)",
    )
    parser.add_argument(
        "--per-provider-files",
        action="store_true",
        help="علاوه بر فایل ترکیبی، برای هر کافه یک CSV/JSON منو جدا هم بساز",
    )
    parser.add_argument(
        "--skip-menu",
        action="store_true",
        help="فقط اطلاعات پروفایل (تلفن/آدرس/ساعت کاری) رو بگیر، بدون آیتم‌های منو (سریع‌تر)",
    )
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    per_provider_dir = out_dir / "per_provider"
    if args.per_provider_files:
        per_provider_dir.mkdir(parents=True, exist_ok=True)

    if args.username:
        print(f"در حال گرفتن اطلاعات provider «{args.username}» ...")
        providers = [get_provider_by_username(args.username)]
    else:
        print("در حال گرفتن لیست کامل کافه/رستوران‌ها ...")
        providers = list_all_providers(limit=args.limit)

    print(f"تعداد کافه/رستوران‌هایی که پردازش می‌شن: {len(providers)}")

    all_menu_rows = []
    all_provider_rows = []
    all_full_records = []
    failed = []

    for idx, provider in enumerate(providers, start=1):
        pid = provider["id"]
        pname = provider.get("persian_name") or provider.get("english_name") or str(pid)
        pusername = provider.get("username") or str(pid)
        print(f"[{idx}/{len(providers)}] {pname} ({pusername}) ...")

        # هر بخش مستقل از بقیه گرفته می‌شه. اگه یکیشون خطا بده، بقیه
        # همچنان ذخیره می‌شن (مثلاً اگه پروفایل خطا داد، منو از دست نره).
        errors = []

        # --- پروفایل (با username) ---
        profile = None
        try:
            profile = get_provider_profile(pusername)
        except Exception as e:
            errors.append(f"profile: {e}")
        time.sleep(REQUEST_DELAY)

        # --- ساعات کاری (با id عددی) ---
        hours_data = {}
        try:
            hours_data = get_hours(pid)
        except Exception as e:
            errors.append(f"hours: {e}")
        time.sleep(REQUEST_DELAY)

        if profile:
            try:
                all_provider_rows.append(build_provider_row(profile, hours_data))
            except Exception as e:
                errors.append(f"provider_row: {e}")

        # --- منو (با id عددی) ---
        menu_tree = []
        if not args.skip_menu:
            try:
                menu_tree = get_menu(pid)
                rows = walk_categories(menu_tree, pname, pusername)
                all_menu_rows.extend(rows)
                print(f"    {len(rows)} آیتم منو پیدا شد.")

                if args.per_provider_files:
                    base = sanitize_filename(pusername or str(pid))
                    save_json(per_provider_dir / f"{base}.json", rows)
                    save_csv(per_provider_dir / f"{base}.csv", rows, MENU_CSV_FIELDNAMES)
            except Exception as e:
                errors.append(f"menu: {e}")

        # --- رکورد ترکیبی (حتی اگه پروفایل نیومده باشه، با داده‌ی لیست ساخته می‌شه) ---
        try:
            full_record = build_full_cafe_record(profile or provider, hours_data, menu_tree)
            all_full_records.append(full_record)
            if args.per_provider_files:
                base = sanitize_filename(pusername or str(pid))
                save_json(per_provider_dir / f"{base}_full.json", full_record)
        except Exception as e:
            errors.append(f"full_record: {e}")

        if errors:
            for msg in errors:
                print(f"    خطا: {msg}")
            failed.append(
                {"id": pid, "username": pusername, "name": pname, "errors": errors}
            )

        time.sleep(REQUEST_DELAY)

    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%d_%H%M%S")

    provider_json = out_dir / f"providers_info_{stamp}.json"
    provider_csv = out_dir / f"providers_info_{stamp}.csv"
    save_json(provider_json, all_provider_rows)
    save_json(out_dir / "providers_info_latest.json", all_provider_rows)
    save_csv(provider_csv, all_provider_rows, PROVIDER_CSV_FIELDNAMES)
    save_csv(out_dir / "providers_info_latest.csv", all_provider_rows, PROVIDER_CSV_FIELDNAMES)

    if not args.skip_menu:
        combined_json = out_dir / f"all_menus_{stamp}.json"
        combined_csv = out_dir / f"all_menus_{stamp}.csv"
        save_json(combined_json, all_menu_rows)
        save_json(out_dir / "all_menus_latest.json", all_menu_rows)
        save_csv(combined_csv, all_menu_rows, MENU_CSV_FIELDNAMES)
        save_csv(out_dir / "all_menus_latest.csv", all_menu_rows, MENU_CSV_FIELDNAMES)

    # فایل ترکیبیِ self-contained: هر کافه یک رکورد کامل (پروفایل + منوی
    # nested)، مناسب برای دادن مستقیم به یک AI جهت ساخت صفحه‌ی هر کافه
    # بدون نیاز به join کردن چند فایل.
    full_json = out_dir / f"cafes_full_{stamp}.json"
    save_json(full_json, all_full_records)
    save_json(out_dir / "cafes_full_latest.json", all_full_records)

    if failed:
        save_json(out_dir / f"failed_{stamp}.json", failed)

    print("\nتمام شد.")
    print(f"تعداد کافه/رستوران‌های پردازش‌شده: {len(providers)}")
    print(f"تعداد ردیف‌های پروفایل: {len(all_provider_rows)}")
    if not args.skip_menu:
        print(f"تعداد کل آیتم‌های منوی استخراج‌شده: {len(all_menu_rows)}")
    if failed:
        print(f"تعداد کافه‌هایی که خطا دادن: {len(failed)} (جزئیات در failed_{stamp}.json)")
    print(f"فایل‌های پروفایل (تخت/برای اکسل):\n  {provider_json}\n  {provider_csv}")
    print(f"فایل ترکیبی self-contained (برای AI / ساخت صفحه):\n  {full_json}")


if __name__ == "__main__":
    main()

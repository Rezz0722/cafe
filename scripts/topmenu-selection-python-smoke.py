"""Exercise provider selection with mocked TopMenu APIs: no external requests."""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("topmarket_test", Path(__file__).resolve().parents[1] / "topmarket.py")
scraper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scraper)

class NoDigitalMenuResponse:
    ok = False
    status_code = 403

    def json(self):
        return {"message": "مجموعه مورد نظر فاقد منو دیجیتال می باشد"}

    def raise_for_status(self):
        raise AssertionError("Detailed source error should be used first")

with patch.object(scraper.SESSION, "get", return_value=NoDigitalMenuResponse()):
    try:
        scraper.api_get("/providers/326/menu")
        raise AssertionError("403 must not be treated as an empty valid menu")
    except RuntimeError as error:
        assert "فاقد منو دیجیتال" in str(error)

def listing(rows, page, total=3, last_page=2):
    return {"data": rows, "additional": {"paginator": {"total": total, "last_page": last_page}}}

with patch.object(scraper, "api_get", side_effect=[listing([{"id": 11}, {"id": 22}], 1), listing([{"id": 33}], 2)]), \
     patch.object(scraper.time, "sleep"):
    assert [row["id"] for row in scraper.list_all_providers()] == [11, 22, 33]
with patch.object(scraper, "api_get", side_effect=[listing([{"id": 11}, {"id": 22}], 1), listing([], 2)]), \
     patch.object(scraper.time, "sleep"):
    try:
        scraper.list_all_providers()
        raise AssertionError("An incomplete directory must not mark other cafes removed")
    except RuntimeError as error:
        assert "ناقص" in str(error)
with tempfile.TemporaryDirectory(prefix="kucafe-python-duplicate-") as directory:
    try:
        scraper.save_complete_source_directory(Path(directory), [{"id": 11}, {"id": 11}])
        raise AssertionError("Duplicate source IDs must not be a complete directory")
    except RuntimeError as error:
        assert "تکراری" in str(error)

providers = [{"id": 11, "username": "first"}, {"id": 22, "username": "second"}, {"id": 33, "username": "third"}]
with tempfile.TemporaryDirectory(prefix="kucafe-python-selection-") as directory:
    ids = Path(directory) / "ids.json"
    ids.write_text(json.dumps([22, 33]), encoding="utf-8")
    with patch.object(sys, "argv", ["topmarket.py", "--out", directory, "--provider-ids-file", str(ids)]), \
         patch.object(scraper, "list_all_providers", return_value=providers), \
         patch.object(scraper, "get_provider_profile", return_value={}), \
         patch.object(scraper, "get_hours", return_value={}) as hours, \
         patch.object(scraper, "get_menu", return_value=[]) as menus, \
         patch.object(scraper.time, "sleep"):
        scraper.main()
        assert [call.args[0] for call in menus.call_args_list] == [22, 33]
        assert [call.args[0] for call in hours.call_args_list] == [22, 33]
        assert [cafe["شناسه"] for cafe in json.loads((Path(directory) / "cafes_full_latest.json").read_text())] == [22, 33]
        directory_ids = json.loads((Path(directory) / "source_provider_ids_latest.json").read_text())
        assert directory_ids == {"version": 1, "complete": True, "total": 3, "sourceIds": [11, 22, 33]}
    for selection in [[], [True], [0]]:
        ids.write_text(json.dumps(selection), encoding="utf-8")
        with patch.object(sys, "argv", ["topmarket.py", "--out", directory, "--provider-ids-file", str(ids)]), \
             patch.object(scraper, "list_all_providers", return_value=providers), \
             patch.object(scraper, "get_menu") as menus:
            try:
                scraper.main()
                raise AssertionError("Invalid selection must fail")
            except SystemExit as error:
                assert error.code == 2
            menus.assert_not_called()
with tempfile.TemporaryDirectory(prefix="kucafe-python-missing-") as directory:
    ids = Path(directory) / "ids.json"
    ids.write_text(json.dumps([22, 99]), encoding="utf-8")
    with patch.object(sys, "argv", ["topmarket.py", "--out", directory, "--provider-ids-file", str(ids)]), \
         patch.object(scraper, "list_all_providers", return_value=providers), \
         patch.object(scraper, "get_provider_profile", return_value={}), \
         patch.object(scraper, "get_hours", return_value={}), \
         patch.object(scraper, "get_menu", return_value=[]) as menus, \
         patch.object(scraper.time, "sleep"):
        scraper.main()
        assert [call.args[0] for call in menus.call_args_list] == [22]
        assert [cafe["شناسه"] for cafe in json.loads((Path(directory) / "cafes_full_latest.json").read_text())] == [22]
        assert json.loads((Path(directory) / "source_provider_ids_latest.json").read_text())["sourceIds"] == [11, 22, 33]
with tempfile.TemporaryDirectory(prefix="kucafe-python-all-missing-") as directory:
    ids = Path(directory) / "ids.json"
    ids.write_text(json.dumps([99]), encoding="utf-8")
    with patch.object(sys, "argv", ["topmarket.py", "--out", directory, "--provider-ids-file", str(ids)]), \
         patch.object(scraper, "list_all_providers", return_value=providers), \
         patch.object(scraper, "get_menu") as menus:
        scraper.main()
        menus.assert_not_called()
        assert json.loads((Path(directory) / "cafes_full_latest.json").read_text()) == []
with tempfile.TemporaryDirectory(prefix="kucafe-python-excluded-") as directory:
    excluded = Path(directory) / "excluded.json"
    excluded.write_text(json.dumps([22]), encoding="utf-8")
    with patch.object(sys, "argv", ["topmarket.py", "--out", directory, "--exclude-provider-ids-file", str(excluded)]), \
         patch.object(scraper, "list_all_providers", return_value=providers), \
         patch.object(scraper, "get_provider_profile", return_value={}), \
         patch.object(scraper, "get_hours", return_value={}), \
         patch.object(scraper, "get_menu", return_value=[]) as menus, \
         patch.object(scraper.time, "sleep"):
        scraper.main()
        assert [call.args[0] for call in menus.call_args_list] == [11, 33]
        assert json.loads((Path(directory) / "source_provider_ids_latest.json").read_text())["sourceIds"] == [11, 22, 33]
    for invalid in [[True], [0], ["22"]]:
        excluded.write_text(json.dumps(invalid), encoding="utf-8")
        with patch.object(sys, "argv", ["topmarket.py", "--out", directory, "--exclude-provider-ids-file", str(excluded)]), \
             patch.object(scraper, "list_all_providers") as listing:
            try:
                scraper.main()
                raise AssertionError("Invalid exclusion IDs must fail before fetching providers")
            except SystemExit as error:
                assert error.code == 2
            listing.assert_not_called()
with tempfile.TemporaryDirectory(prefix="kucafe-python-limited-") as directory:
    with patch.object(sys, "argv", ["topmarket.py", "--out", directory, "--limit", "1"]), \
         patch.object(scraper, "list_all_providers", return_value=providers[:1]), \
         patch.object(scraper, "get_provider_profile", return_value={}), \
         patch.object(scraper, "get_hours", return_value={}), \
         patch.object(scraper, "get_menu", return_value=[]), \
         patch.object(scraper.time, "sleep"):
        scraper.main()
        assert not (Path(directory) / "source_provider_ids_latest.json").exists()
print("✓ Python: stale IDs skipped without full-scrape fallback; invalid/duplicate/incomplete inputs fail safely")

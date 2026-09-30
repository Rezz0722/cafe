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
    for selection in [[], [True], [0], [99]]:
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
print("✓ Python: only selected provider menus/hours fetched; empty/invalid/missing IDs rejected before menu requests")

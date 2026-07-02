import importlib
import json
from decimal import Decimal


def _load():
    """Reload the handler inside the active moto mock so its clients bind to it."""
    import api_handler
    importlib.reload(api_handler)
    return api_handler


def _put(table, id, ts, sentiment="POSITIVE", scores=None):
    table.put_item(Item={
        "id": id, "bucket": "ALL", "timestamp": ts,
        "sentiment": sentiment, "text": "sample",
        "scores": scores or {"Positive": "0.9", "Negative": "0.03", "Neutral": "0.05", "Mixed": "0.02"},
    })


def test_returns_latest_first_with_cors(ddb_table):
    api = _load()
    _put(ddb_table, "a", "2026-01-01T00:00:00Z")
    _put(ddb_table, "b", "2026-01-03T00:00:00Z")
    _put(ddb_table, "c", "2026-01-02T00:00:00Z")

    resp = api.lambda_handler({}, None)

    assert resp["statusCode"] == 200
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"
    body = json.loads(resp["body"])
    assert [r["id"] for r in body] == ["b", "c", "a"]  # newest -> oldest via the GSI


def test_respects_page_limit(ddb_table, monkeypatch):
    api = _load()
    monkeypatch.setattr(api, "PAGE_LIMIT", 5)
    for i in range(12):
        _put(ddb_table, f"id{i:02d}", f"2026-01-01T00:00:{i:02d}Z")
    body = json.loads(api.lambda_handler({}, None)["body"])
    assert len(body) == 5


def test_decimal_scores_serialize_as_numbers(ddb_table):
    api = _load()
    ddb_table.put_item(Item={
        "id": "x", "bucket": "ALL", "timestamp": "2026-01-01T00:00:00Z",
        "sentiment": "POSITIVE", "text": "hi",
        "scores": {"Positive": Decimal("0.9")},
    })
    body = json.loads(api.lambda_handler({}, None)["body"])
    assert body[0]["scores"]["Positive"] == 0.9  # float, not Decimal/string


def test_query_error_returns_500_with_cors(ddb_table, monkeypatch):
    api = _load()

    class Boom:
        def query(self, **_):
            raise RuntimeError("ddb down")

    monkeypatch.setattr(api, "table", Boom())
    resp = api.lambda_handler({}, None)
    assert resp["statusCode"] == 500
    assert resp["headers"]["Access-Control-Allow-Origin"] == "*"
    assert "error" in json.loads(resp["body"])

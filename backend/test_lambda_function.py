import base64
import importlib
import json


class FakeComprehend:
    """Stand-in for the Comprehend client (moto doesn't emulate batch_detect_sentiment)."""

    def __init__(self, sentiments=None, raise_on_call=False):
        self.sentiments = sentiments or []
        self.raise_on_call = raise_on_call
        self.calls = 0

    def batch_detect_sentiment(self, TextList, LanguageCode):
        self.calls += 1
        if self.raise_on_call:
            raise RuntimeError("throttled")
        results = []
        for i, _text in enumerate(TextList):
            s = self.sentiments[i] if i < len(self.sentiments) else "NEUTRAL"
            results.append({
                "Index": i,
                "Sentiment": s,
                "SentimentScore": {"Positive": 0.9, "Negative": 0.03, "Neutral": 0.05, "Mixed": 0.02},
            })
        return {"ResultList": results, "ErrorList": []}


def _load():
    import lambda_function
    importlib.reload(lambda_function)
    return lambda_function


def _event(records):
    evs = []
    for i, r in enumerate(records):
        payload = json.dumps(r).encode()
        evs.append({"kinesis": {"sequenceNumber": f"seq{i}", "data": base64.b64encode(payload).decode()}})
    return {"Records": evs}


def test_processes_and_writes(ddb_table, monkeypatch):
    lf = _load()
    monkeypatch.setattr(lf, "comprehend", FakeComprehend(["POSITIVE", "NEGATIVE"]))
    event = _event([
        {"id": "r1", "text": "love it", "source": "reviews", "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "r2", "text": "hate it", "source": "reviews", "timestamp": "2026-01-01T00:00:01Z"},
    ])
    resp = lf.lambda_handler(event, None)

    assert resp["batchItemFailures"] == []
    by_id = {i["id"]: i for i in ddb_table.scan()["Items"]}
    assert set(by_id) == {"r1", "r2"}
    assert by_id["r1"]["sentiment"] == "POSITIVE"
    assert by_id["r1"]["bucket"] == "ALL"          # GSI partition carried through
    assert by_id["r1"]["source"] == "reviews"
    assert by_id["r1"]["scores"]["Positive"] == "0.9"  # stored as string


def test_malformed_record_reported_others_processed(ddb_table, monkeypatch):
    lf = _load()
    monkeypatch.setattr(lf, "comprehend", FakeComprehend(["POSITIVE"]))
    good = {"id": "ok", "text": "great", "timestamp": "2026-01-01T00:00:00Z"}
    event = {"Records": [
        {"kinesis": {"sequenceNumber": "bad", "data": "!!!not-base64!!!"}},
        {"kinesis": {"sequenceNumber": "seqok",
                     "data": base64.b64encode(json.dumps(good).encode()).decode()}},
    ]}
    resp = lf.lambda_handler(event, None)

    assert "bad" in [f["itemIdentifier"] for f in resp["batchItemFailures"]]
    assert {i["id"] for i in ddb_table.scan()["Items"]} == {"ok"}


def test_comprehend_failure_retries_whole_chunk(ddb_table, monkeypatch):
    lf = _load()
    monkeypatch.setattr(lf, "comprehend", FakeComprehend(raise_on_call=True))
    event = _event([
        {"id": "r1", "text": "a", "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "r2", "text": "b", "timestamp": "2026-01-01T00:00:01Z"},
    ])
    resp = lf.lambda_handler(event, None)

    assert {f["itemIdentifier"] for f in resp["batchItemFailures"]} == {"seq0", "seq1"}
    assert ddb_table.scan()["Items"] == []


def test_blank_text_skipped(ddb_table, monkeypatch):
    lf = _load()
    fake = FakeComprehend(["POSITIVE"])
    monkeypatch.setattr(lf, "comprehend", fake)
    event = _event([
        {"id": "blank", "text": "   ", "timestamp": "2026-01-01T00:00:00Z"},
        {"id": "real", "text": "hello", "timestamp": "2026-01-01T00:00:01Z"},
    ])
    resp = lf.lambda_handler(event, None)

    assert resp["batchItemFailures"] == []
    assert {i["id"] for i in ddb_table.scan()["Items"]} == {"real"}
    assert fake.calls == 1  # blank never reached Comprehend

import json
import base64
import os
import boto3
from datetime import datetime, timezone

REGION = os.environ.get("AWS_REGION", "us-east-1")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "SentimentResults")
# Comprehend BatchDetectSentiment accepts up to 25 documents per call.
COMPREHEND_BATCH_MAX = 25

comprehend = boto3.client('comprehend', region_name=REGION)
dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)


def _chunk(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _build_item(data, text, result):
    # Carry the producer's UUID through as the partition key so retries are
    # idempotent — reprocessing a record just overwrites its row instead of
    # creating a duplicate. `bucket` is the GSI partition key that lets the API
    # query latest-N without a Scan (constant for now; would shard at scale).
    return {
        'id': data['id'],
        'bucket': 'ALL',
        'text': text,
        'sentiment': result['Sentiment'],
        'scores': {
            'Positive': str(round(result['SentimentScore']['Positive'], 4)),
            'Negative': str(round(result['SentimentScore']['Negative'], 4)),
            'Neutral':  str(round(result['SentimentScore']['Neutral'], 4)),
            'Mixed':    str(round(result['SentimentScore']['Mixed'], 4)),
        },
        'source': data.get('source', 'kinesis'),
        'timestamp': data.get('timestamp', datetime.now(timezone.utc).isoformat()),
    }


def lambda_handler(event, context):
    records = event['Records']

    # Parse phase: decode each Kinesis record, keeping its sequence number so we
    # can report per-record failures. `failures` drives the partial batch
    # response — Kinesis retries from the earliest reported sequence number, and
    # anything still failing after MaximumRetryAttempts goes to the DLQ instead
    # of being silently dropped.
    parsed = []       # {seq, data, text}
    failures = set()  # sequence numbers to retry

    for record in records:
        seq = record['kinesis']['sequenceNumber']
        try:
            payload = base64.b64decode(record['kinesis']['data']).decode('utf-8')
            data = json.loads(payload)
            text = (data.get('text') or '').strip()
            if not text:
                # Nothing to analyse — retrying won't help, so drop it.
                continue
            parsed.append({'seq': seq, 'data': data, 'text': text})
        except Exception as e:
            # Malformed record: reporting it routes it to the DLQ after retries
            # rather than losing it. (Retrying can't fix a bad payload.)
            print(f"ERROR decoding record {seq}: {e}")
            failures.add(seq)

    processed = 0

    # Analyse + persist per chunk. One Comprehend call handles up to 25 docs
    # (vs. one call per record before); DynamoDB writes go through batch_writer.
    for chunk in _chunk(parsed, COMPREHEND_BATCH_MAX):
        texts = [p['text'] for p in chunk]
        try:
            resp = comprehend.batch_detect_sentiment(TextList=texts, LanguageCode='en')
        except Exception as e:
            # Whole call failed (e.g. throttle) — retry every record in it.
            print(f"ERROR batch_detect_sentiment: {e}")
            failures.update(p['seq'] for p in chunk)
            continue

        # Per-document errors map back to their record by Index for retry.
        for err in resp.get('ErrorList', []):
            p = chunk[err['Index']]
            print(f"ERROR comprehend doc {p['seq']}: {err.get('ErrorCode')}")
            failures.add(p['seq'])

        to_write = [(chunk[r['Index']], r) for r in resp.get('ResultList', [])]
        try:
            with table.batch_writer() as writer:
                for p, result in to_write:
                    writer.put_item(Item=_build_item(p['data'], p['text'], result))
            processed += len(to_write)
        except Exception as e:
            # Idempotent writes make retrying the whole chunk safe (no dupes).
            print(f"ERROR writing chunk to DynamoDB: {e}")
            failures.update(p['seq'] for p, _ in to_write)

    print(f"Processed {processed}/{len(records)} records, {len(failures)} to retry")

    return {'batchItemFailures': [{'itemIdentifier': seq} for seq in failures]}

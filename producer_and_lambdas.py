"""
producer.py — Simulates streaming text data into Kinesis
Run: python producer.py
Requires: pip install boto3 faker
"""

import boto3
import json
import time
import uuid
import random
from faker import Faker

fake = Faker()

STREAM_NAME = "sentiment-stream"
REGION = "ap-southeast-2"  # Change to your region

# Simulated review/tweet templates
POSITIVE_TEMPLATES = [
    "Absolutely love this product! Exceeded all my expectations.",
    "Best purchase I've made all year. Highly recommend!",
    "Incredible service, will definitely be coming back.",
    "Five stars — fast shipping, great quality, amazing experience.",
    "This completely changed how I work. So impressed.",
]

NEGATIVE_TEMPLATES = [
    "Terrible experience. Would not recommend to anyone.",
    "Complete waste of money. Broke after two days.",
    "Customer service was unhelpful and rude. Very disappointing.",
    "Worst product I've ever bought. Absolute rubbish.",
    "Never again. Took three weeks to arrive and arrived broken.",
]

NEUTRAL_TEMPLATES = [
    "Product arrived on time. Does what it says on the box.",
    "It's okay. Nothing special but works fine.",
    "Standard quality. Not great, not terrible.",
    "Received the item. Matches the description.",
    "Delivery was fine. Product seems average.",
]

MIXED_TEMPLATES = [
    "Great product but the shipping was incredibly slow.",
    "Love the quality but the price is hard to justify.",
    "Customer service was amazing, but the product itself disappointed me.",
    "Fast delivery but the item was not as described.",
    "Some features are brilliant, others feel half-finished.",
]

ALL_TEMPLATES = POSITIVE_TEMPLATES + NEGATIVE_TEMPLATES + NEUTRAL_TEMPLATES + MIXED_TEMPLATES

kinesis = boto3.client("kinesis", region_name=REGION)


def send_record(text: str, source: str = "simulated-review"):
    record = {
        "id": str(uuid.uuid4()),
        "text": text,
        "source": source,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    response = kinesis.put_record(
        StreamName=STREAM_NAME,
        Data=json.dumps(record).encode("utf-8"),
        PartitionKey=record["id"],
    )
    print(f"Sent: [{response['ShardId']}] {text[:60]}...")
    return response


def run_continuous(interval_seconds: float = 2.0, count: int = None):
    """
    Send records continuously. Set count=None for infinite loop.
    Press Ctrl+C to stop.
    """
    sent = 0
    print(f"Streaming to '{STREAM_NAME}' every {interval_seconds}s. Ctrl+C to stop.\n")
    try:
        while True:
            text = random.choice(ALL_TEMPLATES)
            send_record(text)
            sent += 1
            if count and sent >= count:
                break
            time.sleep(interval_seconds)
    except KeyboardInterrupt:
        print(f"\nStopped. Sent {sent} records.")


if __name__ == "__main__":
    run_continuous(interval_seconds=2.0)


# ─────────────────────────────────────────────────────────────────
# lambda_function.py — Stream processor (deploy this to Lambda)
# Runtime: Python 3.11
# Handler: lambda_function.lambda_handler
# Env vars: DYNAMODB_TABLE (default: SentimentResults), AWS_REGION_NAME
# ─────────────────────────────────────────────────────────────────

"""
import json
import base64
import os
import boto3
from datetime import datetime, timezone

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "SentimentResults")

comprehend = boto3.client("comprehend", region_name=REGION)
dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    records_processed = 0
    errors = 0

    for record in event["Records"]:
        try:
            # Decode base64 Kinesis payload
            payload = base64.b64decode(record["kinesis"]["data"]).decode("utf-8")
            data = json.loads(payload)

            text = data.get("text", "")
            if not text.strip():
                continue

            # Call Comprehend for sentiment
            response = comprehend.detect_sentiment(
                Text=text,
                LanguageCode="en"
            )

            sentiment = response["Sentiment"]
            scores = response["SentimentScore"]

            # Write to DynamoDB
            item = {
                "id": data.get("id"),
                "text": text,
                "sentiment": sentiment,
                "scores": {
                    "Positive": str(round(scores["Positive"], 4)),
                    "Negative": str(round(scores["Negative"], 4)),
                    "Neutral":  str(round(scores["Neutral"], 4)),
                    "Mixed":    str(round(scores["Mixed"], 4)),
                },
                "source": data.get("source", "unknown"),
                "timestamp": data.get("timestamp", datetime.now(timezone.utc).isoformat()),
            }

            table.put_item(Item=item)
            records_processed += 1
            print(f"Processed [{sentiment}]: {text[:60]}...")

        except Exception as e:
            print(f"ERROR processing record: {e}")
            errors += 1

    return {
        "statusCode": 200,
        "body": json.dumps({
            "processed": records_processed,
            "errors": errors
        })
    }
"""


# ─────────────────────────────────────────────────────────────────
# lambda_query.py — API Gateway query handler (separate Lambda)
# Runtime: Python 3.11
# Handler: lambda_query.lambda_handler
# Env vars: DYNAMODB_TABLE, AWS_REGION_NAME
# ─────────────────────────────────────────────────────────────────

"""
import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

REGION = os.environ.get("AWS_REGION_NAME", "us-east-1")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "SentimentResults")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json",
}


def decimal_to_float(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def lambda_handler(event, context):
    try:
        # Scan last 100 records (good enough for demo scale)
        response = table.scan(Limit=100)
        items = response.get("Items", [])

        # Sort by timestamp descending
        items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        # Build summary counts
        summary = {"POSITIVE": 0, "NEGATIVE": 0, "NEUTRAL": 0, "MIXED": 0}
        for item in items:
            s = item.get("sentiment", "NEUTRAL")
            if s in summary:
                summary[s] += 1

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "records": items[:50],  # Return latest 50
                "summary": summary,
                "total": len(items),
            }, default=decimal_to_float),
        }

    except Exception as e:
        print(f"ERROR: {e}")
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(e)}),
        }
"""

"""
producer.py — Simulates streaming text data into Kinesis.

Run:      python producer.py
Requires: pip install -r requirements.txt
"""

import os
import json
import time
import uuid
import random

import boto3
from faker import Faker

fake = Faker()

STREAM_NAME = "sentiment-stream"
REGION = os.environ.get("AWS_REGION", "us-east-1")

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
    """Send records continuously. count=None for infinite loop. Ctrl+C to stop."""
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

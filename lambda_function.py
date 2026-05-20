import json
import base64
import os
import boto3
from datetime import datetime, timezone

REGION = os.environ.get("AWS_REGION", "us-east-1")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "SentimentResults")

comprehend = boto3.client('comprehend', region_name=REGION)
dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    processed = 0
    errors = 0

    for record in event['Records']:
        try:
            payload = base64.b64decode(record['kinesis']['data']).decode('utf-8')
            data = json.loads(payload)
            text = data.get('text', '')

            if not text.strip():
                continue

            response = comprehend.detect_sentiment(
                Text=text,
                LanguageCode='en'
            )

            # Carry the producer's UUID through so Kinesis retries are idempotent.
            # Without this, retried records would create duplicate DynamoDB rows.
            # `bucket` is the GSI partition key that lets the API query latest-N
            # without a Scan. Constant value for now; would shard at scale.
            table.put_item(Item={
                'id': data['id'],
                'bucket': 'ALL',
                'text': text,
                'sentiment': response['Sentiment'],
                'scores': {
                    'Positive': str(round(response['SentimentScore']['Positive'], 4)),
                    'Negative': str(round(response['SentimentScore']['Negative'], 4)),
                    'Neutral':  str(round(response['SentimentScore']['Neutral'], 4)),
                    'Mixed':    str(round(response['SentimentScore']['Mixed'], 4))
                },
                'source': data.get('source', 'kinesis'),
                'timestamp': data.get('timestamp', datetime.now(timezone.utc).isoformat())
            })

            processed += 1
            print(f"Processed: {response['Sentiment']} — {text[:60]}")

        except Exception as e:
            errors += 1
            print(f"ERROR processing record: {e}")

    return {'statusCode': 200, 'body': json.dumps({'processed': processed, 'errors': errors})}
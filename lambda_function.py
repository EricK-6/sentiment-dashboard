import json
import base64
import boto3
import uuid
from datetime import datetime, timezone

comprehend = boto3.client('comprehend', region_name='ap-southeast-2')
dynamodb = boto3.resource('dynamodb', region_name='ap-southeast-2')
table = dynamodb.Table('SentimentResults')

def lambda_handler(event, context):
    for record in event['Records']:
        # Decode the Kinesis record
        payload = base64.b64decode(record['kinesis']['data']).decode('utf-8')
        data = json.loads(payload)
        text = data.get('text', '')

        if not text:
            continue

        # Call Comprehend
        response = comprehend.detect_sentiment(
            Text=text,
            LanguageCode='en'
        )

        # Write to DynamoDB
        table.put_item(Item={
            'id': str(uuid.uuid4()),
            'text': text,
            'sentiment': response['Sentiment'],
            'scores': {
                'Positive': str(round(response['SentimentScore']['Positive'], 4)),
                'Negative': str(round(response['SentimentScore']['Negative'], 4)),
                'Neutral':  str(round(response['SentimentScore']['Neutral'], 4)),
                'Mixed':    str(round(response['SentimentScore']['Mixed'], 4))
            },
            'source': data.get('source', 'kinesis'),
            'timestamp': datetime.now(timezone.utc).isoformat()
        })

        print(f"Processed: {response['Sentiment']} — {text[:60]}")

    return {'statusCode': 200}
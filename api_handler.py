import json
import os
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

REGION = os.environ.get("AWS_REGION", "us-east-1")
TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "SentimentResults")
INDEX_NAME = os.environ.get("DYNAMODB_GSI", "ByTimestamp")
PAGE_LIMIT = 50

dynamodb = boto3.resource('dynamodb', region_name=REGION)
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
}


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def lambda_handler(event, context):
    try:
        # Query the GSI (bucket=ALL, timestamp DESC) instead of scanning the table.
        # Cost is bounded by Limit, not by table size — the scan version was O(n) RCUs.
        response = table.query(
            IndexName=INDEX_NAME,
            KeyConditionExpression=Key('bucket').eq('ALL'),
            ScanIndexForward=False,
            Limit=PAGE_LIMIT,
        )
        items = response.get('Items', [])

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps(items, cls=DecimalEncoder),
        }
    except Exception as e:
        print(f"ERROR: {e}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)}),
        }

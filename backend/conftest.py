"""Shared pytest fixtures for the Lambda handler tests.

Uses moto to mock DynamoDB; Comprehend is stubbed directly in the tests since
moto doesn't emulate batch_detect_sentiment.
"""
import os
import sys

# Make lambda_function.py / api_handler.py importable regardless of cwd.
sys.path.insert(0, os.path.dirname(__file__))

import boto3
import pytest
from moto import mock_aws

REGION = "us-east-1"
TABLE = "SentimentResults"


@pytest.fixture
def ddb_table(monkeypatch):
    """A mocked SentimentResults table (+ ByTimestamp GSI), matching template.yaml."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", REGION)
    monkeypatch.setenv("AWS_REGION", REGION)
    monkeypatch.setenv("DYNAMODB_TABLE", TABLE)
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name=REGION)
        ddb.create_table(
            TableName=TABLE,
            AttributeDefinitions=[
                {"AttributeName": "id", "AttributeType": "S"},
                {"AttributeName": "bucket", "AttributeType": "S"},
                {"AttributeName": "timestamp", "AttributeType": "S"},
            ],
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "ByTimestamp",
                    "KeySchema": [
                        {"AttributeName": "bucket", "KeyType": "HASH"},
                        {"AttributeName": "timestamp", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        yield ddb.Table(TABLE)

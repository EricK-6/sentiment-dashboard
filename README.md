# Real-Time Sentiment Dashboard

A serverless, event-driven NLP pipeline on AWS that ingests streaming text, performs real-time sentiment analysis, and visualises results on a live React dashboard.

## Architecture

```
[producer.py] → [Kinesis Data Stream] → [Lambda: SentimentProcessor]
                                               ↓
                                    [AWS Comprehend (NLP)]
                                               ↓
                                         [DynamoDB]
                                               ↓
                               [Lambda: SentimentQuery] ← [API Gateway]
                                               ↓
                                    [React Dashboard (Amplify)]
```

## AWS Services Used

| Service | Purpose |
|---|---|
| Kinesis Data Streams | Real-time text ingestion |
| Lambda | Serverless processing (x2 functions) |
| AWS Comprehend | Managed NLP sentiment analysis |
| DynamoDB | NoSQL result storage |
| API Gateway | REST API serving dashboard |
| Amplify | React frontend hosting |

## Quick Start

### 1. Prerequisites
```bash
pip install boto3 faker
aws configure  # set your IAM credentials
```

### 2. Create AWS Resources
```bash
# Kinesis stream
aws kinesis create-stream --stream-name sentiment-stream --shard-count 1

# DynamoDB table
aws dynamodb create-table \
  --table-name SentimentResults \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

### 3. Deploy Lambda Functions
- Deploy `lambda_function.py` as `SentimentProcessor` (trigger: Kinesis)
- Deploy `lambda_query.py` as `SentimentQuery` (trigger: API Gateway GET /sentiment)
- Set env vars: `DYNAMODB_TABLE=SentimentResults`

### 4. Run Producer
```bash
python producer.py
```

### 5. Run Dashboard
```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with your API Gateway URL
npm install
npm start
```

## Environment Variables

### React Frontend (.env.local)
```
REACT_APP_API_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/prod
```

### Lambda Functions
```
DYNAMODB_TABLE=SentimentResults
AWS_REGION_NAME=us-east-1
```

## Cost Estimate (Demo Usage)
All services operate within AWS Free Tier at demo/interview scale:
- Kinesis: 1 shard (free 12 months)
- Comprehend: ~500 units/demo session (50K free/month)
- Lambda: negligible (1M free/month)
- DynamoDB: PAY_PER_REQUEST, free tier covers demo load
- Amplify: free build minutes well within limit

## IAM Policy (Least Privilege)
Attach to your Lambda execution role:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "comprehend:DetectSentiment",
        "dynamodb:PutItem",
        "dynamodb:Scan",
        "kinesis:GetRecords",
        "kinesis:GetShardIterator",
        "kinesis:DescribeStream",
        "kinesis:ListShards",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

## Project Structure
```
├── producer.py              # Kinesis data producer (run locally)
├── lambda_function.py       # Stream processor Lambda
├── lambda_query.py          # API query Lambda
├── frontend/
│   ├── src/
│   │   └── App.jsx          # React dashboard
│   ├── .env.example
│   └── package.json
└── README.md
```

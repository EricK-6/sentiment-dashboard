# Real-Time Sentiment Dashboard

A serverless, event-driven NLP pipeline on AWS that ingests streaming text, classifies its sentiment in real time using AWS Comprehend, and visualises the results on a live React dashboard.

## Architecture

```
producer_and_lambdas.py  →  Kinesis Data Stream  →  Lambda (SentimentProcessor)
                                                            ↓
                                                     AWS Comprehend
                                                            ↓
                                                        DynamoDB
                                                            ↓
                                         Lambda (SentimentQuery)  ←  API Gateway
                                                            ↓
                                                React Dashboard (Amplify)
```

## AWS Services

| Service              | Purpose                              |
| -------------------- | ------------------------------------ |
| Kinesis Data Streams | Real-time text ingestion             |
| Lambda × 2           | Stream processing + API query        |
| AWS Comprehend       | Managed NLP sentiment classification |
| DynamoDB             | NoSQL result storage                 |
| API Gateway          | REST endpoint for the dashboard      |
| Amplify              | React frontend hosting               |

## Project Structure

```
.
├── producer_and_lambdas.py   # Local Kinesis producer (run with `python producer_and_lambdas.py`)
├── lambda_function.py        # Stream processor — deployed as SentimentProcessor
├── api_handler.py            # API query handler — deployed as SentimentQuery
├── trust-policy.json         # IAM trust policy for Lambda execution role
├── lambda.zip                # Deployable bundle for SentimentProcessor
├── api_handler.zip           # Deployable bundle for SentimentQuery
├── build-plan.md             # 3-week build plan + interview notes
└── sentiment-dashboard/      # React dashboard (Create React App)
    ├── src/App.js            # Main dashboard component
    ├── .env.local            # Local env vars (gitignored)
    └── package.json
```

> `App.jsx` at the repo root is a leftover early prototype. The live dashboard is `sentiment-dashboard/src/App.js`.

## Quick Start

### 1. Prerequisites

```bash
pip install boto3 faker
aws configure   # set your IAM credentials and default region
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

### 3. Deploy Lambdas

- Deploy [lambda_function.py](lambda_function.py) as **`SentimentProcessor`** with the Kinesis stream as its event source.
- Deploy [api_handler.py](api_handler.py) as **`SentimentQuery`** behind an API Gateway `GET /sentiment` route with CORS enabled.

Both handlers read the region from the `AWS_REGION` environment variable. Lambda sets this automatically, so no manual config is required.

### 4. Run the Producer

```bash
python producer_and_lambdas.py
```

This streams simulated reviews into Kinesis every 2 seconds until you Ctrl+C.

### 5. Run the Dashboard

```bash
cd sentiment-dashboard
echo "REACT_APP_API_URL=https://<your-api-id>.execute-api.<region>.amazonaws.com/prod/sentiment" > .env.local
npm install
npm start
```

The dashboard polls the API every 5 seconds and re-renders as new records arrive.

## Configuration

All deployable code reads configuration from environment variables — no values are hardcoded.

### Python (Lambda + producer)

| Variable     | Default     | Notes                                                |
| ------------ | ----------- | ---------------------------------------------------- |
| `AWS_REGION` | `us-east-1` | Lambda sets this automatically; only matters locally |

### React (Create React App)

| Variable              | Required | Notes                                                                              |
| --------------------- | -------- | ---------------------------------------------------------------------------------- |
| `REACT_APP_API_URL`   | yes      | Full API Gateway endpoint URL. Set in `.env.local` locally; set in Amplify for prod |

CRA only reads env files at startup — restart `npm start` after editing `.env.local`.

## IAM Policy (Least Privilege)

Attach to the Lambda execution role:

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

## DynamoDB Schema

```json
{
  "id": "uuid-v4",
  "text": "Original input text",
  "sentiment": "POSITIVE",
  "scores": {
    "Positive": "0.9412",
    "Negative": "0.0203",
    "Neutral":  "0.0312",
    "Mixed":    "0.0073"
  },
  "source": "simulated-review",
  "timestamp": "2026-05-13T10:30:00Z"
}
```

Scores are stored as strings to preserve DynamoDB number precision; the query Lambda converts them back to floats for the JSON response.

## Cost (Demo Scale)

Designed to fit comfortably inside the AWS Free Tier at demo / interview scale:

- **Kinesis** — 1 shard (free for 12 months)
- **Comprehend** — ~500 units/session (50K free/month)
- **Lambda** — negligible (1M free requests/month)
- **DynamoDB** — `PAY_PER_REQUEST`, well below free-tier thresholds
- **Amplify** — free build minutes sufficient

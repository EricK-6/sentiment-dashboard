# Real-Time Sentiment Dashboard — Compressed 3-Week Build Plan

## Week 1 — Backend Pipeline (Days 1–5)

### Day 1 — AWS Setup & Kinesis
**Goal:** Stream is live, producer script sending data.

Tasks:
1. Create AWS account (if not done) — enable MFA immediately
2. Create IAM user `sentiment-dev` with programmatic access
3. Attach policies: `AmazonKinesisFullAccess`, `AmazonDynamoDBFullAccess`, `ComprehendFullAccess`, `AWSLambda_FullAccess`, `AmazonAPIGatewayAdministrator`
4. Install AWS CLI → `aws configure` with your keys
5. Create Kinesis Data Stream:
   ```bash
   aws kinesis create-stream --stream-name sentiment-stream --shard-count 1
   ```
6. Run the producer script (see `producer.py`) — verify records in Kinesis console

**Done when:** Kinesis console shows incoming records.

---

### Day 2 — DynamoDB Setup
**Goal:** Table created, understand data model.

Tasks:
1. Create DynamoDB table:
   ```bash
   aws dynamodb create-table \
     --table-name SentimentResults \
     --attribute-definitions AttributeName=id,AttributeType=S \
     --key-schema AttributeName=id,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST
   ```
2. Manually insert a test item via console to confirm table works
3. Understand the data schema (see schema section below)

**Done when:** Table exists with PAY_PER_REQUEST billing (stays in free tier).

---

### Day 3–4 — Lambda + Comprehend Integration
**Goal:** Lambda reads from Kinesis, calls Comprehend, writes to DynamoDB.

Tasks:
1. Create Lambda execution role with policies above
2. Write Lambda function (see `lambda_function.py`)
3. Deploy Lambda via console or CLI
4. Add Kinesis as event source trigger:
   ```bash
   aws lambda create-event-source-mapping \
     --function-name SentimentProcessor \
     --event-source-arn <your-kinesis-stream-arn> \
     --starting-position LATEST \
     --batch-size 10
   ```
5. Run producer → check CloudWatch logs → check DynamoDB for results

**Done when:** DynamoDB rows appear with POSITIVE/NEGATIVE/NEUTRAL/MIXED sentiment within seconds of producer running.

---

### Day 5 — Buffer & Debugging
- Fix any IAM permission errors (most common issue)
- Confirm end-to-end: producer → Kinesis → Lambda → Comprehend → DynamoDB
- Add basic error handling to Lambda

---

## Week 2 — API Layer + React Core (Days 1–5)

### Day 1–2 — API Gateway
**Goal:** REST endpoint serving DynamoDB data as JSON.

Tasks:
1. Create REST API in API Gateway console
2. Create resource `/sentiment` with GET method
3. Link to a new Lambda `SentimentQuery` (see `lambda_query.py`)
4. Enable CORS on the resource
5. Deploy to stage `prod`
6. Test endpoint: `curl https://<api-id>.execute-api.<region>.amazonaws.com/prod/sentiment`

**Done when:** curl returns JSON array of sentiment records.

---

### Day 3–5 — React Dashboard (Core)
**Goal:** Dashboard renders real data from your API.

Tasks:
1. Scaffold React app: `npx create-react-app sentiment-dashboard`
2. Install deps: `npm install recharts axios`
3. Build components (see React scaffolding):
   - `SentimentPieChart` — breakdown of POSITIVE/NEGATIVE/NEUTRAL
   - `SentimentTimeline` — line chart over time
   - `RecentFeed` — last 10 records as a live feed
4. Wire `REACT_APP_API_URL` env variable to your API Gateway URL
5. Poll API every 5 seconds for live updates

**Done when:** Charts update live as the producer script runs.

---

## Week 3 — Deploy, Polish, Interview Prep (Days 1–5)

### Day 1–2 — Amplify Deployment
Tasks:
1. Push React app to GitHub
2. Connect repo to AWS Amplify console
3. Set environment variable `REACT_APP_API_URL` in Amplify console
4. Deploy — get public URL
5. Fix any CORS issues (API Gateway → enable CORS, redeploy)

---

### Day 3–4 — Polish
- Add loading states and error boundaries to React
- Add a "Simulate Stream" button on the dashboard (calls producer via API)
- Write a clean README with architecture diagram link
- Add basic rate limiting awareness to producer (don't hammer Comprehend)

---

### Day 5 — Interview Prep
- Rehearse 2-minute live demo walkthrough
- Write CV bullet points (see below)
- Prepare answers to common questions (see talking points)

---

## DynamoDB Data Schema

```json
{
  "id": "uuid-v4",
  "text": "Original input text",
  "sentiment": "POSITIVE",
  "scores": {
    "Positive": 0.94,
    "Negative": 0.02,
    "Neutral": 0.03,
    "Mixed": 0.01
  },
  "source": "simulated-review",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## CV Bullet Points

```
• Built a serverless, event-driven NLP pipeline on AWS using Kinesis, Lambda, 
  Comprehend, DynamoDB, and API Gateway — processing streaming text data with 
  real-time sentiment classification

• Designed and deployed a React dashboard (hosted via AWS Amplify) visualising 
  live sentiment analytics, demonstrating full-stack ownership from cloud 
  infrastructure to frontend

• Architected for cost efficiency using AWS free-tier services and pay-per-request 
  billing, applying cloud economics principles aligned with AWS Cloud Foundations 
  certification objectives

• Applied managed AI/ML services (AWS Comprehend) for production NLP without 
  custom model training, demonstrating practical AI Foundations knowledge
```

---

## Interview Talking Points

**"Walk me through your project"**
> "I built a real-time sentiment analysis pipeline on AWS. Text data streams through Kinesis into a Lambda function, which calls AWS Comprehend for NLP sentiment scoring, stores results in DynamoDB, and serves them via API Gateway to a React dashboard. The whole thing is serverless and event-driven — it scales automatically and stays within AWS free tier."

**"Why serverless?"**
> "Serverless removes infrastructure management, scales to zero when idle (critical for cost), and lets me focus on business logic. For a streaming workload with variable load, it's the right fit — Lambda's execution model maps perfectly to Kinesis record processing."

**"What's AWS Comprehend doing exactly?"**
> "It's a managed NLP service — I send it raw text and it returns a sentiment label (POSITIVE, NEGATIVE, NEUTRAL, MIXED) plus confidence scores for each. No model training required. That's the key value of managed AI services: pre-trained, production-grade models accessible via API."

**"What would you do differently at scale?"**
> "At high volume I'd add a Kinesis Firehose for S3 archiving, introduce DynamoDB TTL to manage storage costs, add a caching layer (ElastiCache or DAX) in front of the query Lambda, and consider Kinesis Analytics for server-side aggregation rather than pulling raw records to the client."

**"What was the hardest part?"**
> "IAM permissions were the first real friction — getting least-privilege roles right for Lambda to access Kinesis, Comprehend, and DynamoDB took iteration. CORS between API Gateway and the React app was the other one. Both are exactly the kind of real-world cloud engineering problems you don't get from tutorials."

# VESPA Homepage Backend

Backend service for handling bulk toggle operations for VESPA student accounts. This service efficiently processes large-scale updates to student records when admin users toggle features like Academic Profile, Productivity Hub, and AI Coach.

## Features

- ✅ **Scalable**: Handles schools with 10 to 10,000+ students
- ✅ **Efficient**: Batch processing with rate limiting
- ✅ **Reliable**: Built-in error handling and retry logic
- ✅ **Real-time Progress**: Track update progress via status endpoint
- ✅ **Non-blocking**: Returns immediately, processes in background

## Architecture

```
Frontend (CDN) → POST /api/toggle-bulk-update → Job Created
                                                ↓
                                        Background Processing
                                                ↓
Frontend → GET /api/toggle-status/{jobId} → Progress Updates
```

## Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/4Sighteducation/Homepagebackend.git
cd Homepagebackend
npm install
```

### 2. Configure Environment Variables

Copy `env.example` to `.env` and fill in your values:

```env
# Required
KNACK_APPLICATION_ID=your_knack_app_id
KNACK_API_KEY=your_knack_api_key

# Optional (for production with Vercel KV)
KV_REST_API_URL=your_kv_url
KV_REST_API_TOKEN=your_kv_token
```

### 3. Deploy to Vercel

#### Option A: Deploy via CLI

```bash
# Install Vercel CLI globally
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

#### Option B: Deploy via GitHub

1. Connect your GitHub repo to Vercel
2. Vercel will auto-deploy on every push to main branch

### 4. Configure Environment Variables in Vercel

1. Go to your project in Vercel Dashboard
2. Navigate to Settings → Environment Variables
3. Add the following:
   - `KNACK_APPLICATION_ID`
   - `KNACK_API_KEY`
   - (Optional) KV database credentials

## API Endpoints

### POST `/api/toggle-bulk-update`

Initiates a bulk update job.

**Request Body:**
```json
{
  "schoolId": "abc123",
  "fieldName": "field_3180",
  "value": true,
  "toggleType": "productivity"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "job_1234567890_abc",
  "message": "Bulk update initiated for productivity",
  "statusUrl": "/api/toggle-status/job_1234567890_abc"
}
```

### GET `/api/toggle-status/{jobId}`

Check the status of a bulk update job.

**Response:**
```json
{
  "id": "job_1234567890_abc",
  "status": "processing",
  "progress": 45,
  "totalRecords": 500,
  "processedRecords": 225,
  "estimatedTimeRemaining": "1m 30s",
  "errors": []
}
```

## Frontend Integration

Update your `CopyofstaffHomepage7j.js` file:

```javascript
// Configuration
const BACKEND_URL = 'https://your-app.vercel.app';

// Replace updateConnectedStudentToggles function
async function updateConnectedStudentToggles(schoolId, fieldName, value) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/toggle-bulk-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Knack-Application-Id': 'your_app_id',
        'X-Knack-REST-API-Key': 'your_api_key'
      },
      body: JSON.stringify({
        schoolId,
        fieldName,
        value,
        toggleType: getToggleType(fieldName)
      })
    });
    
    const data = await response.json();
    if (data.success) {
      monitorProgress(data.jobId);
    }
  } catch (error) {
    console.error('Backend error:', error);
  }
}

// Monitor progress
async function monitorProgress(jobId) {
  const interval = setInterval(async () => {
    const response = await fetch(`${BACKEND_URL}/api/toggle-status/${jobId}`);
    const status = await response.json();
    
    updateProgressUI(status);
    
    if (status.status === 'completed' || status.status === 'failed') {
      clearInterval(interval);
    }
  }, 2000);
}
```

## Performance

| School Size | Processing Time | Notes |
|------------|-----------------|-------|
| < 100 students | < 10 seconds | Near instant |
| 100-500 students | 10-30 seconds | Fast |
| 500-1000 students | 30-60 seconds | Acceptable |
| 1000-5000 students | 1-3 minutes | Background processing |
| 5000+ students | 3-10 minutes | Consider pagination UI |

## Development

### Run Locally

```bash
npm run dev
# Server starts at http://localhost:3000
```

### Test Endpoints

```bash
# Test bulk update
curl -X POST http://localhost:3000/api/toggle-bulk-update \
  -H "Content-Type: application/json" \
  -H "X-Knack-Application-Id: your_app_id" \
  -H "X-Knack-REST-API-Key: your_api_key" \
  -d '{
    "schoolId": "test123",
    "fieldName": "field_3180",
    "value": true,
    "toggleType": "productivity"
  }'

# Check status
curl http://localhost:3000/api/toggle-status/job_xxx
```

## Monitoring

View logs in Vercel Dashboard:
1. Go to your project
2. Click on "Functions" tab
3. View real-time logs

## Error Handling

The service handles:
- Rate limiting (429 errors)
- Network failures
- Invalid records
- Partial failures (continues processing)

Failed updates are logged and returned in the status response.

## Security

- API keys can be passed via headers or environment variables
- CORS configured for your domains only
- No sensitive data stored permanently
- Jobs expire after 1 hour

## Support

For issues or questions:
- Create an issue in GitHub
- Contact the development team

## License

Copyright 4Sight Education Ltd.


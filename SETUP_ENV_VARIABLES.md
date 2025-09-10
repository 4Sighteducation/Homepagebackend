# Setting Environment Variables in Vercel

## Quick Setup

You need to add these environment variables to your Vercel project:

1. **Go to your Vercel Dashboard**: https://vercel.com/dashboard
2. **Click on your project**: `homepagebackend`
3. **Go to Settings → Environment Variables**
4. **Add these variables:**

```
KNACK_APPLICATION_ID = [Your Knack App ID]
KNACK_API_KEY = [Your Knack API Key]
```

## Getting Your Knack Credentials

1. Log into Knack: https://vespaacademy.knack.com
2. Go to **Settings** → **API & Code**
3. Copy the **Application ID** and **API Key**

## Alternative: Using Vercel CLI

If you have the Vercel CLI installed, you can run:

```bash
# Add Application ID
vercel env add KNACK_APPLICATION_ID

# Add API Key
vercel env add KNACK_API_KEY
```

Then redeploy:
```bash
vercel --prod
```

## Test Your Backend

After setting environment variables, test with:
```bash
curl -X POST https://homepagebackend.vercel.app/api/toggle-bulk-update \
  -H "Content-Type: application/json" \
  -H "X-Knack-Application-Id: YOUR_APP_ID" \
  -H "X-Knack-REST-API-Key: YOUR_API_KEY" \
  -d '{"schoolId":"test","fieldName":"field_289","value":true}'
```

You should get a response with a jobId if everything is working.

/**
 * Vercel Serverless Function to Check Job Status
 * Returns the current status of a bulk update job
 */

const { createClient } = require('@vercel/kv');

// Initialize Vercel KV for job storage
let kv;
try {
  kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
} catch (error) {
  console.log('KV not configured, using in-memory storage');
}

// In-memory job storage (fallback)
const jobs = new Map();

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only accept GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Get job ID from URL
    const { jobId } = req.query;
    
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    
    // Retrieve job data
    let jobData;
    
    if (kv) {
      const data = await kv.get(jobId);
      if (!data) {
        return res.status(404).json({ error: 'Job not found' });
      }
      jobData = JSON.parse(data);
    } else {
      jobData = jobs.get(jobId);
      if (!jobData) {
        return res.status(404).json({ error: 'Job not found' });
      }
    }
    
    // Calculate estimated time remaining
    if (jobData.status === 'processing' && jobData.totalRecords > 0) {
      const progressRate = jobData.processedRecords / 
        ((new Date() - new Date(jobData.startTime)) / 1000); // records per second
      
      if (progressRate > 0) {
        const remainingRecords = jobData.totalRecords - jobData.processedRecords;
        const estimatedSeconds = Math.ceil(remainingRecords / progressRate);
        jobData.estimatedTimeRemaining = formatTime(estimatedSeconds);
      }
    }
    
    // Return job status
    return res.status(200).json(jobData);
    
  } catch (error) {
    console.error('Error in toggle-status:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

/**
 * Format seconds into human-readable time
 */
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}


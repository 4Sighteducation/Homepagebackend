/**
 * Vercel Serverless Function for Bulk Toggle Updates
 * Handles large-scale student record updates efficiently
 */

const fetch = require('node-fetch');
const { createClient } = require('@vercel/kv');

// Initialize Vercel KV for job storage (or use memory for simple cases)
let kv;
try {
  kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
} catch (error) {
  console.log('KV not configured, using in-memory storage');
}

// In-memory job storage (fallback if KV not configured)
const jobs = new Map();

// Knack API configuration
const KNACK_API_URL = 'https://api.knack.com/v1';
const BATCH_SIZE = 25; // Process 25 records at a time
const DELAY_BETWEEN_BATCHES = 2000; // 2 second delay between batches

/**
 * Main handler for the bulk update endpoint
 */
module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Knack-Application-Id, X-Knack-REST-API-Key');
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Knack-Application-Id, X-Knack-REST-API-Key');

  try {
    const { schoolId, fieldName, value, toggleType } = req.body;
    
    // Get Knack credentials from headers or environment
    const appId = req.headers['x-knack-application-id'] || process.env.KNACK_APPLICATION_ID;
    const apiKey = req.headers['x-knack-rest-api-key'] || process.env.KNACK_API_KEY;
    
    if (!appId || !apiKey) {
      return res.status(400).json({ 
        error: 'Missing Knack credentials',
        details: 'Please provide X-Knack-Application-Id and X-Knack-REST-API-Key headers' 
      });
    }
    
    if (!schoolId || !fieldName) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        details: 'schoolId and fieldName are required' 
      });
    }
    
    // Create a unique job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize job data
    const jobData = {
      id: jobId,
      schoolId,
      fieldName,
      value,
      toggleType,
      status: 'processing',
      progress: 0,
      totalRecords: 0,
      processedRecords: 0,
      startTime: new Date().toISOString(),
      errors: []
    };
    
    // Store job data
    if (kv) {
      await kv.set(jobId, JSON.stringify(jobData), { ex: 3600 }); // Expire after 1 hour
    } else {
      jobs.set(jobId, jobData);
    }
    
    // Start processing in background (non-blocking)
    processBulkUpdate(jobId, schoolId, fieldName, value, appId, apiKey).catch(error => {
      console.error(`Job ${jobId} failed:`, error);
      updateJobStatus(jobId, { 
        status: 'failed', 
        error: error.message,
        endTime: new Date().toISOString()
      });
    });
    
    // Return immediately with job ID
    return res.status(200).json({
      success: true,
      jobId,
      message: `Bulk update initiated for ${toggleType}`,
      statusUrl: `/api/toggle-status/${jobId}`
    });
    
  } catch (error) {
    console.error('Error in toggle-bulk-update:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

/**
 * Process the bulk update asynchronously
 */
async function processBulkUpdate(jobId, schoolId, fieldName, value, appId, apiKey) {
  console.log(`Processing job ${jobId} for school ${schoolId}`);
  
  try {
    // Step 1: Fetch all student records for the school
    const students = await fetchAllStudents(schoolId, appId, apiKey);
    
    // Update job with total count
    await updateJobStatus(jobId, {
      totalRecords: students.length,
      status: 'processing'
    });
    
    if (students.length === 0) {
      await updateJobStatus(jobId, {
        status: 'completed',
        message: 'No student records found for this school',
        endTime: new Date().toISOString()
      });
      return;
    }
    
    console.log(`Found ${students.length} students to update`);
    
    // Step 2: Process in batches
    let processedCount = 0;
    const errors = [];
    
    for (let i = 0; i < students.length; i += BATCH_SIZE) {
      const batch = students.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(students.length / BATCH_SIZE)}`);
      
      // Update each record in the batch
      const batchPromises = batch.map(student => 
        updateStudentRecord(student.id, fieldName, value, appId, apiKey)
          .catch(error => {
            errors.push({
              studentId: student.id,
              error: error.message
            });
            return null;
          })
      );
      
      // Wait for batch to complete
      await Promise.all(batchPromises);
      
      processedCount += batch.length;
      
      // Update progress
      await updateJobStatus(jobId, {
        processedRecords: processedCount,
        progress: Math.round((processedCount / students.length) * 100),
        errors: errors
      });
      
      // Add delay between batches to respect rate limits
      if (i + BATCH_SIZE < students.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    // Mark job as completed
    await updateJobStatus(jobId, {
      status: 'completed',
      progress: 100,
      processedRecords: processedCount,
      endTime: new Date().toISOString(),
      errors: errors,
      message: `Successfully updated ${processedCount} of ${students.length} records`
    });
    
    console.log(`Job ${jobId} completed successfully`);
    
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    await updateJobStatus(jobId, {
      status: 'failed',
      error: error.message,
      endTime: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Fetch all student records for a school with pagination
 */
async function fetchAllStudents(schoolId, appId, apiKey) {
  const allStudents = [];
  let page = 1;
  let hasMore = true;
  const rowsPerPage = 1000;
  
  // Create filter for Object_3 records connected to this school
  const filters = {
    match: 'and',
    rules: [
      { field: 'field_122', operator: 'is', value: schoolId }
    ]
  };
  
  while (hasMore) {
    const url = `${KNACK_API_URL}/objects/object_3/records?filters=${encodeURIComponent(JSON.stringify(filters))}&page=${page}&rows_per_page=${rowsPerPage}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Knack-Application-Id': appId,
        'X-Knack-REST-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch students: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.records && data.records.length > 0) {
      allStudents.push(...data.records);
      hasMore = data.records.length === rowsPerPage;
      page++;
    } else {
      hasMore = false;
    }
  }
  
  return allStudents;
}

/**
 * Update a single student record
 */
async function updateStudentRecord(recordId, fieldName, value, appId, apiKey) {
  const url = `${KNACK_API_URL}/objects/object_3/records/${recordId}`;
  
  const updateData = {};
  updateData[fieldName] = value;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'X-Knack-Application-Id': appId,
      'X-Knack-REST-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateData)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update record ${recordId}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Update job status in storage
 */
async function updateJobStatus(jobId, updates) {
  if (kv) {
    // Get current job data
    const currentData = await kv.get(jobId);
    const jobData = currentData ? JSON.parse(currentData) : {};
    
    // Merge updates
    const updatedData = { ...jobData, ...updates };
    
    // Save back to KV
    await kv.set(jobId, JSON.stringify(updatedData), { ex: 3600 });
  } else {
    // Update in-memory storage
    const currentData = jobs.get(jobId) || {};
    jobs.set(jobId, { ...currentData, ...updates });
  }
}

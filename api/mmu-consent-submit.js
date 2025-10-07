/**
 * Vercel Serverless Function for MMU Consent Form Submission
 * Handles consent data storage and automatic login
 */

const fetch = require('node-fetch');

const KNACK_API_URL = 'https://api.knack.com/v1';
const MMU_PASSWORD = 'Manchester2025';
const REDIRECT_URL = 'https://vespaacademy.knack.com/vespa-academy#home/';

/**
 * Main handler for the MMU consent form submission
 */
module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { email, participantName, date, responses, signatureData } = req.body;
    
    console.log('[MMU Consent] Processing consent form for:', email);
    
    // Get Knack credentials from environment
    const appId = process.env.KNACK_APPLICATION_ID;
    const apiKey = process.env.KNACK_API_KEY;
    
    if (!appId || !apiKey) {
      console.error('[MMU Consent] Missing Knack credentials in environment');
      return res.status(500).json({ 
        error: 'Server configuration error',
        details: 'Missing Knack API credentials'
      });
    }
    
    // Validate required fields
    if (!email || !participantName || !date || !responses || !signatureData) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'All form fields must be completed'
      });
    }
    
    // Validate MMU email
    const emailLower = email.toLowerCase();
    if (!emailLower.endsWith('@mmu.ac.uk') && !emailLower.endsWith('@stu.mmu.ac.uk')) {
      return res.status(400).json({
        error: 'Invalid email',
        details: 'Please use your MMU email address'
      });
    }
    
    // Step 1: Find student record by email
    console.log('[MMU Consent] Finding student record...');
    const studentRecord = await findStudentByEmail(email, appId, apiKey);
    
    if (!studentRecord) {
      console.error('[MMU Consent] Student record not found:', email);
      return res.status(404).json({
        error: 'Student record not found',
        details: 'No account found with this email address. Please contact your administrator.'
      });
    }
    
    console.log('[MMU Consent] Found student record:', studentRecord.id);
    
    // Step 2: Prepare signature HTML for rich text field
    const signatureHTML = `
      <div style="border: 1px solid #ddd; padding: 10px; margin: 10px 0;">
        <h3>MMU Consent Form - Completed</h3>
        <p><strong>Participant Name:</strong> ${participantName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Date:</strong> ${date}</p>
        <h4>Consent Responses:</h4>
        <ul>
          <li>Read participant information sheet: ${responses.confirm_read ? 'YES' : 'NO'}</li>
          <li>Had time to consider: ${responses.time_to_consider ? 'YES' : 'NO'}</li>
          <li>Free to withdraw: ${responses.free_to_withdraw ? 'YES' : 'NO'}</li>
          <li>Agree to participate: ${responses.agree_participate ? 'YES' : 'NO'}</li>
          <li>Permission for research: ${responses.permission_research ? 'YES' : 'NO'}</li>
        </ul>
        <h4>Signature:</h4>
        <img src="${signatureData}" alt="Participant Signature" style="max-width: 100%; border: 1px solid #ccc; padding: 5px;">
      </div>
    `;
    
    // Step 3: Prepare consent data for Knack (object_10)
    const consentData = {
      field_3743: responses.confirm_read, // mmu_confirm_read
      field_3744: responses.time_to_consider, // mmu_time_to_consider
      field_3745: responses.free_to_withdraw, // mmu_free_to_withdraw
      field_3746: responses.agree_participate, // mmu_agree_participate
      field_3747: responses.permission_research, // mmu_permission_research
      field_3748: signatureHTML // mmu_signature (rich text)
    };
    
    // Step 4: Update student record
    console.log('[MMU Consent] Updating student record with consent data...');
    await updateStudentConsent(studentRecord.id, consentData, appId, apiKey);
    console.log('[MMU Consent] Student record updated successfully');
    
    // Step 5: Login to Knack
    console.log('[MMU Consent] Logging in student...');
    const sessionData = await loginToKnack(email, MMU_PASSWORD, appId);
    console.log('[MMU Consent] Login successful');
    
    // Step 6: Return success with session token
    return res.status(200).json({
      success: true,
      message: 'Consent form submitted successfully',
      session: sessionData.session,
      redirectUrl: REDIRECT_URL
    });
    
  } catch (error) {
    console.error('[MMU Consent] Error:', error);
    return res.status(500).json({ 
      error: 'Submission failed',
      details: error.message 
    });
  }
};

/**
 * Find student record by email in object_10
 */
async function findStudentByEmail(email, appId, apiKey) {
  // Note: field_84 is the email field in object_10
  const filters = {
    match: 'and',
    rules: [
      { field: 'field_84', operator: 'is', value: email }
    ]
  };
  
  const url = `${KNACK_API_URL}/objects/object_10/records?filters=${encodeURIComponent(JSON.stringify(filters))}`;
  
  console.log('[MMU Consent] Searching for student with email:', email);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Knack-Application-Id': appId,
      'X-Knack-REST-API-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[MMU Consent] Failed to find student:', errorText);
    throw new Error(`Failed to find student record: ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('[MMU Consent] Search returned', data.records ? data.records.length : 0, 'records');
  
  return data.records && data.records.length > 0 ? data.records[0] : null;
}

/**
 * Update student record with consent data
 */
async function updateStudentConsent(recordId, consentData, appId, apiKey) {
  const url = `${KNACK_API_URL}/objects/object_10/records/${recordId}`;
  
  console.log('[MMU Consent] Updating record:', recordId);
  console.log('[MMU Consent] Consent data:', JSON.stringify(consentData, null, 2));
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'X-Knack-Application-Id': appId,
      'X-Knack-REST-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(consentData)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[MMU Consent] Failed to update record:', errorText);
    throw new Error(`Failed to update student record: ${response.statusText}`);
  }
  
  const result = await response.json();
  console.log('[MMU Consent] Record updated successfully');
  return result;
}

/**
 * Login to Knack and get session token
 */
async function loginToKnack(email, password, appId) {
  const url = `https://api.knack.com/v1/applications/${appId}/session`;
  
  console.log('[MMU Consent] Attempting login for:', email);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Knack-Application-Id': appId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email,
      password: password
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[MMU Consent] Login failed:', errorText);
    throw new Error(`Login failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log('[MMU Consent] Login successful, session token received');
  return data;
}






/**
 * Test endpoint to verify student fetching is working
 */

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Knack-Application-Id, X-Knack-REST-API-Key');
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { schoolId } = req.body || req.query;
    
    // Get Knack credentials - prefer environment over headers for security
    const appId = process.env.KNACK_APPLICATION_ID || req.headers['x-knack-application-id'];
    const apiKey = process.env.KNACK_API_KEY || req.headers['x-knack-rest-api-key'];
    
    if (!appId || !apiKey) {
      return res.status(400).json({ 
        error: 'Missing Knack credentials',
        hasEnvAppId: !!process.env.KNACK_APPLICATION_ID,
        hasEnvApiKey: !!process.env.KNACK_API_KEY,
        hasHeaderAppId: !!req.headers['x-knack-application-id'],
        hasHeaderApiKey: !!req.headers['x-knack-rest-api-key']
      });
    }
    
    // Create filter for Object_3 records connected to this school
    const filters = {
      match: 'and',
      rules: [
        { field: 'field_122', operator: 'is', value: schoolId || '603e9f97cb8481001b31183d' }
      ]
    };
    
    const url = `https://api.knack.com/v1/objects/object_3/records?filters=${encodeURIComponent(JSON.stringify(filters))}&page=1&rows_per_page=5`;
    
    console.log(`Test fetch URL: ${url}`);
    console.log(`Using App ID: ${appId ? 'Present' : 'Missing'}`);
    console.log(`Using API Key: ${apiKey ? 'Present' : 'Missing'}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Knack-Application-Id': appId,
        'X-Knack-REST-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    const responseText = await response.text();
    console.log(`Response status: ${response.status}`);
    console.log(`Response text: ${responseText}`);
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: 'Failed to fetch from Knack',
        status: response.status,
        statusText: response.statusText,
        responseBody: responseText,
        url: url
      });
    }
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).json({ 
        error: 'Failed to parse Knack response',
        responseBody: responseText
      });
    }
    
    return res.status(200).json({
      success: true,
      totalRecords: data.total_records || 0,
      recordsReturned: data.records ? data.records.length : 0,
      sampleRecords: data.records ? data.records.slice(0, 2).map(r => ({
        id: r.id,
        field_122: r.field_122,
        field_3646: r.field_3646,
        field_3647: r.field_3647,
        field_3579: r.field_3579
      })) : [],
      filters: filters,
      url: url
    });
    
  } catch (error) {
    console.error('Test fetch error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    });
  }
};

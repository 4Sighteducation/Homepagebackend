/**
 * Test endpoint for debugging backend connectivity
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
  
  // Return test response
  return res.status(200).json({
    status: 'ok',
    message: 'Backend is working!',
    timestamp: new Date().toISOString(),
    env: {
      hasKnackAppId: !!process.env.KNACK_APPLICATION_ID,
      hasKnackApiKey: !!process.env.KNACK_API_KEY
    },
    headers: {
      receivedAppId: !!req.headers['x-knack-application-id'],
      receivedApiKey: !!req.headers['x-knack-rest-api-key']
    }
  });
};

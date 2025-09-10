/**
 * Frontend Integration for VESPA Homepage Backend
 * 
 * Add this code to your CopyofstaffHomepage7j.js file
 * Replace the existing updateConnectedStudentToggles function
 */

// ============================================================
// CONFIGURATION - Update these values
// ============================================================

const BACKEND_SERVICE = {
  // Your Vercel backend URL (you'll get this after deploying)
  PRODUCTION_URL: 'https://homepagebackend.vercel.app',
  DEVELOPMENT_URL: 'http://localhost:3000',
  
  // Auto-detect environment
  getUrl() {
    if (window.location.hostname === 'vespa.academy' || 
        window.location.hostname === 'www.vespa.academy') {
      return this.PRODUCTION_URL;
    }
    return this.DEVELOPMENT_URL;
  }
};

// ============================================================
// REPLACE YOUR EXISTING updateConnectedStudentToggles FUNCTION
// ============================================================

async function updateConnectedStudentToggles(schoolId, fieldName, value) {
  if (!schoolId) {
    console.warn('[Staff Homepage] No school ID provided for student updates');
    return;
  }
  
  try {
    console.log(`[Staff Homepage] Initiating bulk update via backend service`);
    
    // Determine toggle type from field name
    const toggleType = {
      'field_3180': 'productivity',  // Productivity Hub
      'field_3181': 'academic',       // Academic Profile
      'field_3182': 'coach'           // AI Coach
    }[fieldName] || fieldName;
    
    // Call backend service
    const response = await fetch(`${BACKEND_SERVICE.getUrl()}/api/toggle-bulk-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Pass Knack credentials (or let backend use env vars)
        'X-Knack-Application-Id': getKnackHeaders()['X-Knack-Application-Id'],
        'X-Knack-REST-API-Key': getKnackHeaders()['X-Knack-REST-API-Key']
      },
      body: JSON.stringify({
        schoolId,
        fieldName,
        value,
        toggleType
      })
    });
    
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`[Staff Homepage] Bulk update job started: ${data.jobId}`);
      
      // Start monitoring progress
      monitorBulkUpdateProgress(data.jobId, toggleType);
      
      // Show progress modal
      showBulkUpdateProgressModal(toggleType);
    } else {
      throw new Error(data.error || 'Backend service error');
    }
    
  } catch (error) {
    console.error('[Staff Homepage] Error calling backend service:', error);
    
    // Fallback to original implementation if backend is unavailable
    console.log('[Staff Homepage] Falling back to client-side bulk update');
    await updateConnectedStudentTogglesFallback(schoolId, fieldName, value);
  }
}

// ============================================================
// PROGRESS MONITORING
// ============================================================

function monitorBulkUpdateProgress(jobId, toggleType) {
  let pollCount = 0;
  const maxPolls = 300; // Max 10 minutes (300 * 2 seconds)
  
  const pollInterval = setInterval(async () => {
    try {
      pollCount++;
      
      const response = await fetch(
        `${BACKEND_SERVICE.getUrl()}/api/toggle-status/${jobId}`
      );
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }
      
      const progress = await response.json();
      
      // Update UI with progress
      updateBulkProgressUI(progress, toggleType);
      
      // Check if completed or failed
      if (progress.status === 'completed') {
        clearInterval(pollInterval);
        showBulkUpdateComplete(toggleType, progress);
      } else if (progress.status === 'failed') {
        clearInterval(pollInterval);
        showBulkUpdateError(toggleType, progress);
      } else if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        console.warn('[Staff Homepage] Progress monitoring timeout');
      }
      
    } catch (error) {
      console.error('[Staff Homepage] Error polling progress:', error);
      clearInterval(pollInterval);
    }
  }, 2000); // Poll every 2 seconds
}

// ============================================================
// UI FUNCTIONS
// ============================================================

function showBulkUpdateProgressModal(toggleType) {
  // Remove any existing progress modal
  const existing = document.getElementById('bulk-update-progress-modal');
  if (existing) existing.remove();
  
  const modalHtml = `
    <div id="bulk-update-progress-modal" class="vespa-modal" style="display: block; z-index: 10001;">
      <div class="vespa-modal-content" style="max-width: 500px;">
        <div class="vespa-modal-header" style="background: linear-gradient(135deg, #23356f, #079baa);">
          <h3 style="color: white; margin: 0;">Updating Student Accounts</h3>
        </div>
        
        <div class="vespa-modal-body" style="padding: 30px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 18px; font-weight: 600; color: #23356f; margin-bottom: 10px;">
              ${toggleType.charAt(0).toUpperCase() + toggleType.slice(1)} Settings
            </div>
            <div style="font-size: 14px; color: #666;">
              Updating all student accounts...
            </div>
          </div>
          
          <div class="progress-container" style="
            width: 100%;
            height: 30px;
            background: #e0e0e0;
            border-radius: 15px;
            overflow: hidden;
            margin: 20px 0;
            position: relative;
          ">
            <div class="progress-bar" style="
              width: 0%;
              height: 100%;
              background: linear-gradient(90deg, #00e5db, #079baa);
              border-radius: 15px;
              transition: width 0.5s ease;
              position: relative;
            "></div>
            <div class="progress-text" style="
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              color: #333;
              font-weight: 600;
              font-size: 14px;
              z-index: 1;
            ">0%</div>
          </div>
          
          <div class="progress-details" style="text-align: center; color: #666; font-size: 14px;">
            <div class="records-count">Preparing...</div>
            <div class="time-remaining" style="margin-top: 5px;"></div>
          </div>
          
          <div style="margin-top: 25px; padding: 15px; background: rgba(0,229,219,0.1); border-radius: 8px;">
            <p style="margin: 0; font-size: 13px; color: #555; line-height: 1.5;">
              <strong>Note:</strong> This process runs on our servers. You can safely close this window 
              or navigate to other pages. The updates will continue in the background.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function updateBulkProgressUI(progress, toggleType) {
  const modal = document.getElementById('bulk-update-progress-modal');
  if (!modal) return;
  
  const progressBar = modal.querySelector('.progress-bar');
  const progressText = modal.querySelector('.progress-text');
  const recordsCount = modal.querySelector('.records-count');
  const timeRemaining = modal.querySelector('.time-remaining');
  
  if (progressBar && progressText) {
    const percentage = progress.progress || 0;
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}%`;
  }
  
  if (recordsCount && progress.totalRecords) {
    recordsCount.textContent = `${progress.processedRecords || 0} of ${progress.totalRecords} students updated`;
  }
  
  if (timeRemaining && progress.estimatedTimeRemaining) {
    timeRemaining.textContent = `Estimated time remaining: ${progress.estimatedTimeRemaining}`;
  }
}

function showBulkUpdateComplete(toggleType, progress) {
  const modal = document.getElementById('bulk-update-progress-modal');
  if (!modal) return;
  
  const modalBody = modal.querySelector('.vespa-modal-body');
  modalBody.innerHTML = `
    <div style="text-align: center; padding: 30px;">
      <div style="
        width: 80px;
        height: 80px;
        margin: 0 auto 20px;
        background: #4ade80;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <i class="fas fa-check" style="color: white; font-size: 40px;"></i>
      </div>
      
      <h3 style="color: #23356f; margin-bottom: 10px;">Update Complete!</h3>
      
      <p style="font-size: 16px; color: #666; margin-bottom: 20px;">
        Successfully updated ${progress.processedRecords} student accounts
      </p>
      
      ${progress.errors && progress.errors.length > 0 ? `
        <div style="
          background: #fff3cd;
          border: 1px solid #ffd700;
          padding: 10px;
          border-radius: 6px;
          margin-bottom: 20px;
        ">
          <strong>Note:</strong> ${progress.errors.length} records had errors and were skipped
        </div>
      ` : ''}
      
      <button onclick="document.getElementById('bulk-update-progress-modal').remove()" style="
        background: #079baa;
        color: white;
        border: none;
        padding: 12px 30px;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
        font-weight: 500;
      ">
        Close
      </button>
    </div>
  `;
  
  // Auto-close after 5 seconds
  setTimeout(() => {
    const m = document.getElementById('bulk-update-progress-modal');
    if (m) m.remove();
  }, 5000);
}

function showBulkUpdateError(toggleType, progress) {
  const modal = document.getElementById('bulk-update-progress-modal');
  if (!modal) return;
  
  const modalBody = modal.querySelector('.vespa-modal-body');
  modalBody.innerHTML = `
    <div style="text-align: center; padding: 30px;">
      <div style="
        width: 80px;
        height: 80px;
        margin: 0 auto 20px;
        background: #ff6b6b;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <i class="fas fa-exclamation-triangle" style="color: white; font-size: 40px;"></i>
      </div>
      
      <h3 style="color: #dc3545; margin-bottom: 10px;">Update Failed</h3>
      
      <p style="font-size: 16px; color: #666; margin-bottom: 20px;">
        ${progress.error || 'An error occurred during the bulk update'}
      </p>
      
      <button onclick="document.getElementById('bulk-update-progress-modal').remove()" style="
        background: #dc3545;
        color: white;
        border: none;
        padding: 12px 30px;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
        font-weight: 500;
      ">
        Close
      </button>
    </div>
  `;
}

// ============================================================
// FALLBACK FUNCTION (Original Implementation)
// ============================================================

async function updateConnectedStudentTogglesFallback(schoolId, fieldName, value) {
  // This is your original implementation
  // Keep it as a fallback when backend is unavailable
  
  try {
    console.log(`[Staff Homepage] Using fallback: Searching for Object_3 records with school ID: "${schoolId}"`);
    
    const filters = encodeURIComponent(JSON.stringify({
      match: 'and',
      rules: [
        { field: 'field_122', operator: 'is', value: schoolId }
      ]
    }));
    
    const response = await retryApiCall(() => {
      return KnackAPIQueue.addRequest({
        url: `${KNACK_API_URL}/objects/object_3/records?filters=${filters}`,
        type: 'GET',
        headers: getKnackHeaders(),
        data: { format: 'raw' }
      });
    });
    
    if (response && response.records && response.records.length > 0) {
      console.log(`[Staff Homepage] Found ${response.records.length} connected student accounts to update`);
      
      // Batch updates to avoid overwhelming the API
      const batchSize = 10;
      const updateData = {};
      updateData[fieldName] = value;
      
      for (let i = 0; i < response.records.length; i += batchSize) {
        const batch = response.records.slice(i, i + batchSize);
        
        const updatePromises = batch.map(record => {
          return retryApiCall(() => {
            return KnackAPIQueue.addRequest({
              url: `${KNACK_API_URL}/objects/object_3/records/${record.id}`,
              type: 'PUT',
              headers: getKnackHeaders(),
              data: JSON.stringify(updateData)
            });
          });
        });
        
        await Promise.all(updatePromises);
        console.log(`[Staff Homepage] Updated batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(response.records.length/batchSize)}`);
        
        // Add delay between batches
        if (i + batchSize < response.records.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`[Staff Homepage] Successfully updated ${response.records.length} student accounts`);
    }
  } catch (error) {
    console.error('[Staff Homepage] Error updating connected student accounts:', error);
    throw error;
  }
}

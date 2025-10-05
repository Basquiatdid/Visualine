// DOM elements
const scanSelectedBtn = document.getElementById('scanSelected');
const scanAllBtn = document.getElementById('scanAll');
const statusArea = document.getElementById('statusArea');
const statsElement = document.getElementById('stats');
const resultsElement = document.getElementById('results');
const emptyState = document.getElementById('emptyState');

// Initialize the plugin
function initializePlugin() {
    setupEventListeners();
    resizeWindow(340, 500); // Initial size
}

// Set up event listeners
function setupEventListeners() {
    scanSelectedBtn.addEventListener('click', () => {
        startScan(true);
    });

    scanAllBtn.addEventListener('click', () => {
        startScan(false);
    });
}

// Message handling from Figma
window.onmessage = (event) => {
    const message = event.data.pluginMessage;
    
    if (!message) return;
    
    switch (message.type) {
        case 'scan-started':
            showLoading('Starting scan...');
            break;
            
        case 'scan-progress':
            showLoading(`Scanning... (${message.processed}/${message.total} layers)`);
            break;
            
        case 'scan-results':
            showResults(message.results, message.stats, message.errors);
            break;
            
        case 'scan-error':
            showError(message.message);
            break;
    }
};

// Start the scanning process
function startScan(selectedOnly) {
    // Reset UI
    clearStatus();
    hideResults();
    setButtonsDisabled(true);
    
    // Send message to plugin
    parent.postMessage({ 
        pluginMessage: { 
            type: 'scan-selection', 
            selectedOnly: selectedOnly 
        } 
    }, '*');
}

// Show loading state
function showLoading(message) {
    statusArea.innerHTML = `
        <div class="status-area status-loading">
            <div class="spinner"></div>
            <span>${escapeHtml(message)}</span>
        </div>
    `;
    statusArea.classList.remove('hidden');
}

// Show results
function showResults(results, stats, errors) {
    setButtonsDisabled(false);
    clearStatus();
    
    // Show stats
    if (stats) {
        showStats(stats);
    }
    
    // Show errors if any
    if (errors && errors.length > 0) {
        showErrors(errors);
    }
    
    // Show results
    if (results.length === 0) {
        showEmptyState();
    } else {
        hideEmptyState();
        resultsElement.innerHTML = results.map(result => createResultHTML(result)).join('');
        
        // Resize window based on content
        const estimatedHeight = 200 + (results.length * 120) + (errors ? errors.length * 80 : 0);
        const maxHeight = 600;
        resizeWindow(340, Math.min(estimatedHeight, maxHeight));
    }
}

// Show statistics
function showStats(stats) {
    statsElement.innerHTML = `
        <div class="stat-item">
            <div class="stat-value">${stats.totalNodes}</div>
            <div>Layers</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${stats.colorMatches}</div>
            <div>Colors</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${stats.errorCount}</div>
            <div>Errors</div>
        </div>
    `;
    statsElement.classList.remove('hidden');
}

// Show errors
function showErrors(errors) {
    const errorsHTML = errors.map(error => `
        <div class="error-item">
            <div class="error-header">${escapeHtml(error.nodeName)} (${error.nodeType})</div>
            <div>${escapeHtml(error.error)}</div>
        </div>
    `).join('');
    
    statusArea.innerHTML = `
        <div class="status-area status-error">
            <strong>${errors.length} error(s) occurred during scan:</strong>
            <div style="margin-top: 8px;">${errorsHTML}</div>
        </div>
    `;
    statusArea.classList.remove('hidden');
}

// Show error message
function showError(message) {
    setButtonsDisabled(false);
    statusArea.innerHTML = `
        <div class="status-area status-error">
            ${escapeHtml(message)}
        </div>
    `;
    statusArea.classList.remove('hidden');
}

// Create HTML for a single result item
function createResultHTML(result) {
    return `
        <div class="result-item">
            <div class="layer-name">
                ${escapeHtml(result.layerName)}
                <span class="layer-type">${result.layerType}</span>
            </div>
            <div class="color-info">
                <div class="color-swatch" style="background-color: ${result.color};"></div>
                <span>${result.color}</span>
                <span class="badge ${result.tokenMatch.availability}">
                    ${getAvailabilityIcon(result.tokenMatch.availability)} ${result.tokenMatch.availability}
                </span>
            </div>
            <div><strong>Token:</strong> ${escapeHtml(result.tokenMatch.name)}</div>
            <div><strong>Style:</strong> ${result.styleType}</div>
            ${result.tokenMatch.distance !== null ? 
                `<div><strong>Match distance:</strong> ${result.tokenMatch.distance.toFixed(2)}</div>` : ''}
            <div class="note">${escapeHtml(result.tokenMatch.note)}</div>
        </div>
    `;
}

// Clear status area
function clearStatus() {
    statusArea.innerHTML = '';
    statusArea.classList.add('hidden');
}

// Hide results
function hideResults() {
    statsElement.classList.add('hidden');
    showEmptyState();
}

// Show empty state
function showEmptyState() {
    emptyState.style.display = 'block';
    resultsElement.innerHTML = '';
}

// Hide empty state
function hideEmptyState() {
    emptyState.style.display = 'none';
}

// Set buttons disabled state
function setButtonsDisabled(disabled) {
    scanSelectedBtn.disabled = disabled;
    scanAllBtn.disabled = disabled;
}

// Resize plugin window
function resizeWindow(width, height) {
    parent.postMessage({
        pluginMessage: {
            type: 'resize-window',
            width: width,
            height: height
        }
    }, '*');
}

// Get availability icon
function getAvailabilityIcon(availability) {
    const icons = {
        'widely': '✅',
        'limited': '⚠️',
        'new': '🆕',
        'unknown': '❓'
    };
    return icons[availability] || '❓';
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return String(unsafe);
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Initialize the plugin when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePlugin);
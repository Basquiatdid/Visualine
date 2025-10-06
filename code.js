console.log("✅ Visualine main.js loaded successfully");

figma.showUI(__html__, { width: 340, height: 500 });

// Store baseline data in memory for performance
let baselineData = null;

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === 'scan-selection') {
      // Send loading state to UI
      figma.ui.postMessage({ type: 'scan-started' });
      
      const nodes = message.selectedOnly && figma.currentPage.selection.length > 0 
        ? figma.currentPage.selection 
        : figma.currentPage.children;
      
      const results = await scanNodes(nodes);
      figma.ui.postMessage({ 
        type: 'scan-results', 
        results: results.scannedItems,
        stats: results.stats,
        errors: results.errors
      });
    }
    
    if (message.type === 'resize-window') {
      figma.ui.resize(message.width, message.height);
    }
  } catch (error) {
    console.error('Plugin error:', error);
    figma.ui.postMessage({ 
      type: 'scan-error', 
      message: `Scan failed: ${error.message}` 
    });
  }
};

async function scanNodes(nodes) {
  const scannedItems = [];
  const errors = [];
  let processedCount = 0;

  // Load baseline data if not already loaded
  if (!baselineData) {
    baselineData = await getBaselineData();
  }

  // Process nodes with progress tracking
  for (const node of nodes) {
    try {
      await processNode(node, scannedItems, errors);
      processedCount++;
      
      // Send progress updates for large scans
      if (nodes.length > 10 && processedCount % 5 === 0) {
        figma.ui.postMessage({
          type: 'scan-progress',
          processed: processedCount,
          total: nodes.length
        });
      }
    } catch (error) {
      console.error(`Error processing node ${node.name}:`, error);
      errors.push({
        nodeName: node.name || 'Unnamed layer',
        nodeType: node.type,
        error: error.message
      });
    }
  }

  return {
    scannedItems,
    stats: {
      totalNodes: nodes.length,
      processedNodes: processedCount,
      errorCount: errors.length,
      colorMatches: scannedItems.length
    },
    errors
  };
}

async function processNode(node, scannedItems, errors) {
  // Skip invisible nodes
  if (node.visible === false) return;

  // Process fills with error handling
  if (node.fills && Array.isArray(node.fills)) {
    try {
      const fills = node.fills.filter(fill => 
        fill.type === 'SOLID' && fill.visible !== false
      );
      
      for (const fill of fills) {
        const color = rgbToHex(fill.color);
        if (color) {
          scannedItems.push({
            layerName: node.name || 'Unnamed layer',
            layerType: node.type,
            styleType: 'fill',
            color: color,
            tokenMatch: await findNearestToken(color)
          });
        }
      }
    } catch (fillError) {
      errors.push({
        nodeName: node.name || 'Unnamed layer',
        nodeType: node.type,
        error: `Fill processing error: ${fillError.message}`
      });
    }
  }

  // Process strokes with error handling
  if (node.strokes && Array.isArray(node.strokes)) {
    try {
      const strokes = node.strokes.filter(stroke => 
        stroke.type === 'SOLID' && stroke.visible !== false
      );
      
      for (const stroke of strokes) {
        const color = rgbToHex(stroke.color);
        if (color) {
          scannedItems.push({
            layerName: node.name || 'Unnamed layer',
            layerType: node.type,
            styleType: 'stroke',
            color: color,
            tokenMatch: await findNearestToken(color)
          });
        }
      }
    } catch (strokeError) {
      errors.push({
        nodeName: node.name || 'Unnamed layer',
        nodeType: node.type,
        error: `Stroke processing error: ${strokeError.message}`
      });
    }
  }

  // Process children recursively with error handling
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      try {
        await processNode(child, scannedItems, errors);
      } catch (childError) {
        errors.push({
          nodeName: child.name || 'Unnamed child layer',
          nodeType: child.type,
          error: `Child processing error: ${childError.message}`
        });
      }
    }
  }
}

function rgbToHex(color) {
  try {
    if (!color || typeof color.r === 'undefined') {
      throw new Error('Invalid color object');
    }

    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    
    // Handle potential NaN values
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      throw new Error('Invalid RGB values');
    }
    
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
  } catch (error) {
    console.error('Color conversion error:', error);
    return null;
  }
}

async function findNearestToken(hexColor) {
  try {
    if (!baselineData || !baselineData.tokens) {
      throw new Error('Baseline data not loaded');
    }

    let closestToken = null;
    let minDistance = Infinity;
    
    for (const [tokenName, tokenData] of Object.entries(baselineData.tokens)) {
      try {
        const distance = calculateColorDistance(hexColor, tokenData.value);
        if (distance < minDistance) {
          minDistance = distance;
          closestToken = {
            name: tokenName,
            value: tokenData.value,
            availability: tokenData.availability,
            note: tokenData.note,
            distance: distance
          };
        }
      } catch (tokenError) {
        console.warn(`Error processing token ${tokenName}:`, tokenError);
        // Continue with other tokens
      }
    }
    
    if (!closestToken) {
      throw new Error('No tokens found for comparison');
    }
    
    return closestToken;
  } catch (error) {
    console.error('Token matching error:', error);
    return {
      name: 'Error',
      value: hexColor,
      availability: 'unknown',
      note: `Matching failed: ${error.message}`,
      distance: null
    };
  }
}

function calculateColorDistance(hex1, hex2) {
  try {
    // Validate hex colors
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexRegex.test(hex1) || !hexRegex.test(hex2)) {
      throw new Error('Invalid hex color format');
    }

    // Normalize to 6-digit hex
    const normalizeHex = (hex) => {
      if (hex.length === 4) {
        return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
      }
      return hex;
    };

    const normalizedHex1 = normalizeHex(hex1);
    const normalizedHex2 = normalizeHex(hex2);

    const r1 = parseInt(normalizedHex1.slice(1, 3), 16);
    const g1 = parseInt(normalizedHex1.slice(3, 5), 16);
    const b1 = parseInt(normalizedHex1.slice(5, 7), 16);
    
    const r2 = parseInt(normalizedHex2.slice(1, 3), 16);
    const g2 = parseInt(normalizedHex2.slice(3, 5), 16);
    const b2 = parseInt(normalizedHex2.slice(5, 7), 16);
    
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  } catch (error) {
    console.error('Color distance calculation error:', error);
    return Infinity; // Maximum distance on error
  }
}

async function getBaselineData() {
  // In a real implementation, this would be loaded from baseline-data.json
  // For now, return static data
  return {
    tokens: {
      // Primary brand colors
      "primary/50":   { "value": "#FFF5F7", "availability": "widely",  "note": "Light tint" },
      "primary/100":  { "value": "#FFE4EA", "availability": "widely",  "note": "Soft background" },
      "primary/300":  { "value": "#FF7CA1", "availability": "widely",  "note": "Accent shade" },
      "primary/500":  { "value": "#FF3366", "availability": "widely",  "note": "Main brand" },
      "primary/700":  { "value": "#C0244B", "availability": "widely",  "note": "Dark brand" },

      // Neutral grays
      "neutral/50":   { "value": "#FAFAFA", "availability": "widely",  "note": "Light bg" },
      "neutral/100":  { "value": "#F5F5F5", "availability": "widely",  "note": "Surface bg" },
      "neutral/300":  { "value": "#D4D4D8", "availability": "widely",  "note": "Border" },
      "neutral/700":  { "value": "#374151", "availability": "widely",  "note": "Text dark" },

      // Accent colors
      "accent/blue":  { "value": "#007BFF", "availability": "limited", "note": "Some old browsers" },
      "accent/teal":  { "value": "#14B8A6", "availability": "widely",  "note": "Highlight" },
      "accent/purple":{ "value": "#8B5CF6", "availability": "widely",  "note": "Highlight" },

      // Semantic states
      "success/500":  { "value": "#10B981", "availability": "widely",  "note": "Success" },
      "warning/500":  { "value": "#F59E0B", "availability": "widely",  "note": "Warning" },
      "danger/500":   { "value": "#DC2626", "availability": "widely",  "note": "Error" },
      "info/500":     { "value": "#3B82F6", "availability": "widely",  "note": "Info" },

      // Special cases
      "glass/blur":   { "value": "#FFFFFF", "availability": "limited", "note": "Backdrop blur" },
      "lab/lch":      { "value": "#E0D8FF", "availability": "limited", "note": "New color format" }
    }
  };
}
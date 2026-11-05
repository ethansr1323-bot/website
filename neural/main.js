const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let width, height;

function resize() {
  width = canvas.width = window.innerWidth * window.devicePixelRatio;
  height = canvas.height = window.innerHeight * window.devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

resize();
window.addEventListener('resize', resize);

// Joint positions - dynamic structure
let joints = [];
let distances = [];
let segmentSizes = []; // Array of sizes for each segment: 'small' or 'normal'

const gravity = 0.5;
let platformY = window.innerHeight * 0.85;
let terrainMode = 'flat'; // 'flat', 'hill', 'rocky'
const terrainAmplitude = 100;
const terrainFrequency = 0.002;
const damping = 0.98;
const bounce = 0.3;

// Camera
const camera = { x: 0, y: 0 };

// Visualization toggles
const vizToggles = {
  forceArrows: true,
  strainColors: true,
  groundedHighlight: true,
  stats: true
};

let fastForwardMode = false;
let superMode = false;

// AI control and learning
let time = 0;
let trialTime = 0;
const trialDuration = 10 * 60; // 10 seconds at 60fps
let generation = 1;

// Learning parameters
let currentParams = {
  waveSpeed: 0.08,
  waveAmplitude: 15,
  rotationForce: 0.8,
  numSegments: 2,
  segmentSizes: Array(2).fill('normal') // One size per segment
};

let bestParams = JSON.parse(JSON.stringify(currentParams));
let bestDistance = 0;
let currentTrialMaxDistance = 0;
let startX = 0;

const learningHistory = [];

// Point system
let points = 0;
const pointGoal = 10000;
const floatingPoints = []; // Visual point shower
let pointTimer = 0;
const pointInterval = 30; // 0.5 seconds at 60fps

function getTerrainY(x) {
  if (terrainMode === 'hill') {
    // Gradual slope downward to the right
    return window.innerHeight * 0.85 + x * 0.05;
  } else if (terrainMode === 'rocky') {
    // Sine wave terrain
    return window.innerHeight * 0.85 + Math.sin(x * terrainFrequency) * terrainAmplitude;
  }
  return window.innerHeight * 0.85; // flat
}

function resetWorm() {
  const centerX = window.innerWidth * 0.5;
  startX = centerX; // Store starting position
  const terrainAtCenter = getTerrainY(centerX);
  const centerY = terrainAtCenter - 100;
  
  // Rebuild worm with current structure parameters
  const numJoints = currentParams.numSegments + 1; // N segments need N+1 joints
  joints = [];
  distances = [];
  segmentSizes = [...currentParams.segmentSizes];
  
  // Create joints
  let currentX = centerX;
  for (let i = 0; i < numJoints; i++) {
    joints.push({ x: currentX, y: centerY - Math.random() * 20, vx: 0, vy: 0 });
    
    // Calculate spacing for next joint based on segment size
    if (i < numJoints - 1) {
      const size = segmentSizes[i];
      const spacing = size === 'small' ? 25 : 40;
      currentX += spacing;
    }
  }
  
  // Calculate distances between joints
  for (let i = 0; i < joints.length - 1; i++) {
    const dx = joints[i + 1].x - joints[i].x;
    const dy = joints[i + 1].y - joints[i].y;
    distances.push(Math.sqrt(dx * dx + dy * dy));
  }
  
  points = 0;
  floatingPoints.length = 0;
  pointTimer = 0;
}

function addFloatingPoint(value, x, y) {
  floatingPoints.push({
    value: value,
    x: x,
    y: y,
    age: 0,
    maxAge: 60 // 1 second
  });
}

function evolveParameters() {
  // Record this trial
  learningHistory.push({
    gen: generation,
    params: JSON.parse(JSON.stringify(currentParams)),
    maxDistance: currentTrialMaxDistance,
    points: points
  });
  
  // Update best if this was better (now considering points too)
  const currentScore = currentTrialMaxDistance + points;
  const bestScore = bestDistance + (learningHistory.length > 0 ? Math.max(...learningHistory.map(h => h.points || 0)) : 0);
  
  if (currentScore > bestScore) {
    bestDistance = currentTrialMaxDistance;
    bestParams = JSON.parse(JSON.stringify(currentParams));
  }
  
  // In super mode, use optimized learning strategy
  const explorationChance = superMode ? 0.05 : 0.2; // Less random exploration in super mode
  
  // Exploration: completely random parameters
  if (Math.random() < explorationChance) {
    const segmentSizes = [];
    for (let i = 0; i < 2; i++) {
      segmentSizes.push(Math.random() < 0.5 ? 'small' : 'normal');
    }
    
    currentParams = {
      waveSpeed: Math.random() * 0.25 + 0.02,
      waveAmplitude: Math.random() * 25 + 5,
      rotationForce: Math.random() * 2.5 + 0.3,
      numSegments: 2,
      segmentSizes: segmentSizes
    };
  } else {
    // Generate new parameters based on best with random variation
    const mutationRate = superMode ? 0.3 : 0.8; // Smaller mutations in super mode for fine-tuning
    currentParams = {
      waveSpeed: bestParams.waveSpeed + (Math.random() - 0.5) * mutationRate * 0.1,
      waveAmplitude: bestParams.waveAmplitude + (Math.random() - 0.5) * mutationRate * 15,
      rotationForce: bestParams.rotationForce + (Math.random() - 0.5) * mutationRate * 1.2,
      numSegments: bestParams.numSegments,
      segmentSizes: [...bestParams.segmentSizes]
    };
    
    // In super mode, reduce structural mutations for more focused optimization
    const structureMutationChance = superMode ? 0.1 : 0.3;
    if (Math.random() < structureMutationChance) {
      // Change size of a random segment
      const idx = Math.floor(Math.random() * currentParams.segmentSizes.length);
      currentParams.segmentSizes[idx] = currentParams.segmentSizes[idx] === 'small' ? 'normal' : 'small';
    }
    
    // Clamp parameters to reasonable ranges
    currentParams.waveSpeed = Math.max(0.01, Math.min(0.3, currentParams.waveSpeed));
    currentParams.waveAmplitude = Math.max(1, Math.min(30, currentParams.waveAmplitude));
    currentParams.rotationForce = Math.max(0.1, Math.min(3, currentParams.rotationForce));
  }
  
  generation++;
  currentTrialMaxDistance = 0;
  trialTime = 0;
}

function update() {
  time += 1;
  trialTime += 1;
  
  // Check if trial is over
  if (trialTime >= trialDuration) {
    evolveParameters();
    resetWorm();
  }
  
  // Check if any joints are touching the ground
  const isGrounded = joints.some(j => {
    const terrainY = getTerrainY(j.x);
    return j.y >= terrainY - 7;
  });
  
  // AI Control: Apply wave-like rotation forces to propel worm forward (only when grounded)
  if (isGrounded) {
    for (let i = 0; i < joints.length; i++) {
      const phase = i * Math.PI * 0.5;
      const wave = Math.sin(time * currentParams.waveSpeed + phase);
      
      // Apply rotational force perpendicular to the worm's direction
      const forceY = wave * currentParams.rotationForce;
      const forceX = Math.cos(time * currentParams.waveSpeed + phase) * currentParams.rotationForce;
      
      joints[i].vx += forceX;
      joints[i].vy += forceY;
    }
  }
  
  // Make center joint (middle of the worm) the highest point (only when grounded)
  if (isGrounded) {
    const centerIdx = Math.floor(joints.length / 2);
    
    // Apply strong upward force to center joint
    const standingForce = 3.5;
    joints[centerIdx].vy -= standingForce;
    
    // Push adjacent joints down to ensure center is highest
    if (centerIdx > 0) {
      joints[centerIdx - 1].vy += 0.5;
    }
    if (centerIdx < joints.length - 1) {
      joints[centerIdx + 1].vy += 0.5;
    }
    
    // Additional downward pressure on outer joints
    if (centerIdx > 1) {
      joints[centerIdx - 2].vy += 0.3;
    }
    if (centerIdx < joints.length - 2) {
      joints[centerIdx + 2].vy += 0.3;
    }
  }
  
  // Store previous positions for hill mode
  const prevPositions = joints.map(j => ({ x: j.x, y: j.y }));
  
  // Apply physics
  for (let i = 0; i < joints.length; i++) {
    joints[i].vy += gravity;
    
    // Apply upward force to first joint (index 0) - not strong enough to fly
    if (i === 0) {
      joints[i].vy -= 0.4; // First joint gets 0.4 upward force
    }
    
    joints[i].x += joints[i].vx;
    joints[i].y += joints[i].vy;
    
    // Terrain collision
    const terrainY = getTerrainY(joints[i].x);
    if (joints[i].y > terrainY - 6) {
      joints[i].y = terrainY - 6;
      joints[i].vy *= -bounce;
      joints[i].vx *= damping;
    }
    
    // Apply some damping
    joints[i].vx *= 0.995;
    joints[i].vy *= 0.995;
  }
  
  // Apply distance constraints
  for (let iteration = 0; iteration < 3; iteration++) {
    for (let i = 0; i < distances.length; i++) {
      const j1 = joints[i];
      const j2 = joints[i + 1];
      const dx = j2.x - j1.x;
      const dy = j2.y - j1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const diff = (distances[i] - dist) / dist;
      const offsetX = dx * diff * 0.5;
      const offsetY = dy * diff * 0.5;
      
      j1.x -= offsetX;
      j1.y -= offsetY;
      j2.x += offsetX;
      j2.y += offsetY;
    }
  }
  
  // Update camera to follow worm's center
  let avgX = 0, avgY = 0;
  for (let i = 0; i < joints.length; i++) {
    avgX += joints[i].x;
    avgY += joints[i].y;
  }
  avgX /= joints.length;
  avgY /= joints.length;
  
  camera.x = avgX - window.innerWidth * 0.5;
  camera.y = avgY - window.innerHeight * 0.5;
  
  // Calculate distance from start
  avgX = 0;
  for (let i = 0; i < joints.length; i++) {
    avgX += joints[i].x;
  }
  avgX /= joints.length;
  const currentDistance = Math.abs(avgX - startX);
  
  // Track max distance for this trial
  if (currentDistance > currentTrialMaxDistance) {
    currentTrialMaxDistance = currentDistance;
  }
  
  // Award points every 0.5 seconds based on distance from start (1 point per 10 pixels)
  pointTimer++;
  if (pointTimer >= pointInterval) {
    pointTimer = 0;
    
    let pointsGained = currentDistance / 10;
    
    // In hill mode, modify points based on vertical movement
    if (terrainMode === 'hill') {
      const avgPrevY = prevPositions.reduce((sum, p) => sum + p.y, 0) / prevPositions.length;
      const verticalChange = avgPrevY - avgY; // positive = moving up, negative = moving down
      
      if (verticalChange > 0) {
        // Going uphill - bonus points
        pointsGained += verticalChange * 2;
      } else {
        // Going downhill - lose points
        pointsGained += verticalChange * 2; // This will be negative
      }
    }
    
    points += pointsGained;
    
    if (pointsGained > 0) {
      addFloatingPoint(`+${pointsGained.toFixed(1)}`, avgX, avgY - 30);
    } else if (pointsGained < 0) {
      addFloatingPoint(`${pointsGained.toFixed(1)}`, avgX, avgY - 30);
    }
  }
}

function draw() {
  // Run update 3 times if in fast-forward mode
  const updateCount = fastForwardMode ? 3 : 1;
  for (let i = 0; i < updateCount; i++) {
    update();
  }
  
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  
  // Save context and apply camera offset
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  
  // Draw terrain
  ctx.fillStyle = '#333';
  const platformStart = Math.floor(camera.x / window.innerWidth) * window.innerWidth;
  
  if (terrainMode === 'flat') {
    for (let i = -1; i <= 2; i++) {
      ctx.fillRect(platformStart + i * window.innerWidth, platformY, window.innerWidth, window.innerHeight - platformY);
    }
  } else {
    // Draw terrain with varying height
    ctx.beginPath();
    const startX = camera.x - 100;
    const endX = camera.x + window.innerWidth + 100;
    ctx.moveTo(startX, getTerrainY(startX));
    
    for (let x = startX; x <= endX; x += 5) {
      ctx.lineTo(x, getTerrainY(x));
    }
    
    ctx.lineTo(endX, window.innerHeight);
    ctx.lineTo(startX, window.innerHeight);
    ctx.closePath();
    ctx.fill();
  }
  
  // Draw lines with strain coloring
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  for (let i = 0; i < joints.length - 1; i++) {
    const j1 = joints[i];
    const j2 = joints[i + 1];
    
    if (vizToggles.strainColors) {
      const dx = j2.x - j1.x;
      const dy = j2.y - j1.y;
      const currentDist = Math.sqrt(dx * dx + dy * dy);
      const strain = (currentDist - distances[i]) / distances[i];
      
      // Map strain to color: blue (compressed) -> white (neutral) -> red (stretched)
      let r, g, b;
      if (strain > 0) {
        // Stretched (red)
        const intensity = Math.min(1, strain * 10);
        r = 255;
        g = Math.floor(255 * (1 - intensity));
        b = Math.floor(255 * (1 - intensity));
      } else {
        // Compressed (blue)
        const intensity = Math.min(1, Math.abs(strain) * 10);
        r = Math.floor(255 * (1 - intensity));
        g = Math.floor(255 * (1 - intensity));
        b = 255;
      }
      
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
    } else {
      ctx.strokeStyle = '#000';
    }
    
    ctx.beginPath();
    ctx.moveTo(j1.x, j1.y);
    ctx.lineTo(j2.x, j2.y);
    ctx.stroke();
  }
  
  // Draw force arrows on joints
  if (vizToggles.forceArrows) {
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      
      // Green propulsion arrows (velocity)
      if (Math.abs(j.vx) > 0.1 || Math.abs(j.vy) > 0.1) {
        ctx.beginPath();
        ctx.moveTo(j.x, j.y);
        ctx.lineTo(j.x + j.vx * 10, j.y + j.vy * 10);
        ctx.strokeStyle = 'rgba(0, 200, 0, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Red gravity arrow
      ctx.beginPath();
      ctx.moveTo(j.x, j.y);
      ctx.lineTo(j.x, j.y + gravity * 10);
      ctx.strokeStyle = 'rgba(200, 0, 0, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    

  }
  
  // Draw joints with grounded highlighting
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    const grounded = j.y >= getTerrainY(j.x) - 7;
    
    if (vizToggles.groundedHighlight) {
      ctx.fillStyle = grounded ? '#0f0' : '#000';
    } else {
      ctx.fillStyle = '#000';
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(j.x, j.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  
  ctx.restore();
  
  // Calculate current distance from start for display
  let avgX = 0;
  for (let i = 0; i < joints.length; i++) {
    avgX += joints[i].x;
  }
  avgX /= joints.length;
  const currentDistanceDisplay = Math.abs(avgX - startX);
  
  // Update and draw floating points
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  for (let i = floatingPoints.length - 1; i >= 0; i--) {
    const fp = floatingPoints[i];
    fp.age++;
    fp.y -= 1; // Float upward
    
    const alpha = 1 - (fp.age / fp.maxAge);
    ctx.fillStyle = fp.value.startsWith('+') ? `rgba(0, 200, 0, ${alpha})` : `rgba(200, 0, 0, ${alpha})`;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(fp.value, fp.x, fp.y);
    
    if (fp.age >= fp.maxAge) {
      floatingPoints.splice(i, 1);
    }
  }
  ctx.restore();
  
  // Draw stats
  if (vizToggles.stats) {
    ctx.fillStyle = '#000';
    ctx.font = '14px monospace';
    const timeLeft = ((trialDuration - trialTime) / 60).toFixed(1);
    const speedIndicator = fastForwardMode ? ' >>> 3x' : '';
    const modeIndicator = superMode ? ' [SUPER MODE]' : '';
    ctx.fillText(`Gen: ${generation} | Time: ${timeLeft}s${speedIndicator}${modeIndicator}`, 10, 25);
    ctx.fillText(`Distance: ${currentDistanceDisplay.toFixed(1)} | Best: ${bestDistance.toFixed(1)}`, 10, 45);
    ctx.fillText(`Segments: ${currentParams.numSegments} [${currentParams.segmentSizes.join(',')}]`, 10, 65);
    ctx.fillText(`WS: ${currentParams.waveSpeed.toFixed(2)} | RF: ${currentParams.rotationForce.toFixed(2)}`, 10, 85);
    
    // Draw points with progress bar
    const pointsPercent = Math.min(1, points / pointGoal);
    ctx.fillStyle = '#000';
    ctx.fillText(`Terrain: ${terrainMode.toUpperCase()}`, 10, 125);
    ctx.fillText(`Points: ${points.toFixed(1)} / ${pointGoal}`, 10, 145);
    
    // Progress bar
    ctx.strokeStyle = '#000';
    ctx.fillStyle = points >= pointGoal ? '#0c0' : '#00f';
    ctx.fillRect(10, 150, 200 * pointsPercent, 10);
    ctx.strokeRect(10, 150, 200, 10);
    
    // Draw toggle states
    ctx.fillStyle = '#000';
    ctx.font = '12px monospace';
    let toggleY = 150;
    ctx.fillText('Toggles (F/S/G/H/U):', 10, toggleY);
    toggleY += 15;
    ctx.fillStyle = vizToggles.forceArrows ? '#0c0' : '#999';
    ctx.fillText(`F: Force Arrows`, 10, toggleY);
    toggleY += 15;
    ctx.fillStyle = vizToggles.strainColors ? '#0c0' : '#999';
    ctx.fillText(`S: Strain Colors`, 10, toggleY);
    toggleY += 15;
    ctx.fillStyle = vizToggles.groundedHighlight ? '#0c0' : '#999';
    ctx.fillText(`G: Grounded Highlight`, 10, toggleY);
    toggleY += 15;
    ctx.fillStyle = vizToggles.stats ? '#0c0' : '#999';
    ctx.fillText(`H: Hide Stats`, 10, toggleY);
    toggleY += 15;
    ctx.fillStyle = superMode ? '#0c0' : '#999';
    ctx.fillText(`U: Super Mode`, 10, toggleY);
  }
  
  requestAnimationFrame(draw);
}

// Keyboard controls to switch terrain and toggle visualizations
window.addEventListener('keydown', (e) => {
  if (e.key === '1') {
    terrainMode = 'flat';
    resetWorm();
  } else if (e.key === '2') {
    terrainMode = 'hill';
    resetWorm();
  } else if (e.key === '3') {
    terrainMode = 'rocky';
    resetWorm();
  } else if (e.key === 'f' || e.key === 'F') {
    vizToggles.forceArrows = !vizToggles.forceArrows;
  } else if (e.key === 's' || e.key === 'S') {
    vizToggles.strainColors = !vizToggles.strainColors;
  } else if (e.key === 'g' || e.key === 'G') {
    vizToggles.groundedHighlight = !vizToggles.groundedHighlight;
  } else if (e.key === 'h' || e.key === 'H') {
    vizToggles.stats = !vizToggles.stats;
  } else if (e.key === '>') {
    fastForwardMode = !fastForwardMode;
  } else if (e.key === 'u' || e.key === 'U') {
    superMode = !superMode;
  }
});

// Load functionality
const loadBtn = document.getElementById('loadBtn');
const loadInput = document.getElementById('loadInput');

loadBtn.addEventListener('click', () => {
  loadInput.click();
});

loadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;
    
    // Parse parameters from the file
    const waveSpeedMatch = content.match(/wavespeed\(([\d.]+)\)/);
    const waveAmplitudeMatch = content.match(/waveamplitude\(([\d.]+)\)/);
    const rotationForceMatch = content.match(/rotationforce\(([\d.]+)\)/);
    const segmentSizesMatch = content.match(/segmentsizes\((.*?)\)/);
    
    if (waveSpeedMatch) currentParams.waveSpeed = parseFloat(waveSpeedMatch[1]);
    if (waveAmplitudeMatch) currentParams.waveAmplitude = parseFloat(waveAmplitudeMatch[1]);
    if (rotationForceMatch) currentParams.rotationForce = parseFloat(rotationForceMatch[1]);
    
    if (segmentSizesMatch) {
      const sizesStr = segmentSizesMatch[1];
      const sizes = sizesStr.match(/"(small|normal)"/g);
      if (sizes) {
        currentParams.segmentSizes = sizes.map(s => s.replace(/"/g, ''));
      }
    }
    
    // Reset worm with new parameters
    resetWorm();
    
    // Clear the input so the same file can be loaded again
    loadInput.value = '';
  };
  
  reader.readAsText(file);
});

// Download functionality
const downloadBtn = document.getElementById('downloadBtn');

downloadBtn.addEventListener('click', () => {
  const content = `// This is generation ${generation} of neuralbrain.on.websim.com.

wavespeed(${currentParams.waveSpeed.toFixed(4)})
waveamplitude(${currentParams.waveAmplitude.toFixed(2)})
rotationforce(${currentParams.rotationForce.toFixed(2)})
segmentsizes(${currentParams.segmentSizes.map(s => `"${s}"`).join(', ')})

// Performance Stats
// Current Distance: ${currentTrialMaxDistance.toFixed(2)}
// Best Distance: ${bestDistance.toFixed(2)}
// Points: ${points.toFixed(1)}
// Terrain: ${terrainMode}
`;

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gen${generation}`;
  a.click();
  URL.revokeObjectURL(url);
});

// AI Visualization Modal
const aiVisBtn = document.getElementById('aiVisBtn');
const aiModal = document.getElementById('aiModal');
const closeBtn = document.querySelector('.close');
const aiCanvas = document.getElementById('aiCanvas');
const aiCtx = aiCanvas.getContext('2d');

aiVisBtn.addEventListener('click', () => {
  aiModal.style.display = 'block';
  updateAIVisualization();
});

closeBtn.addEventListener('click', () => {
  aiModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === aiModal) {
    aiModal.style.display = 'none';
  }
});

function updateAIVisualization() {
  // Update generation number
  document.getElementById('genNum').textContent = generation;
  
  // Set canvas size
  aiCanvas.width = aiCanvas.offsetWidth * window.devicePixelRatio;
  aiCanvas.height = 200 * window.devicePixelRatio;
  aiCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  // Clear canvas
  aiCtx.clearRect(0, 0, aiCanvas.offsetWidth, 200);
  
  // Draw line graphs if we have history
  if (learningHistory.length > 1) {
    const graphHeight = 180;
    const graphY = 10;
    const graphWidth = aiCanvas.offsetWidth - 20;
    const graphX = 10;
    
    // Find max values for scaling
    const maxDistance = Math.max(...learningHistory.map(h => h.maxDistance || 0));
    const maxPoints = Math.max(...learningHistory.map(h => h.points || 0));
    const maxGen = learningHistory[learningHistory.length - 1].gen;
    
    // Draw axes
    aiCtx.strokeStyle = '#ccc';
    aiCtx.lineWidth = 1;
    aiCtx.strokeRect(graphX, graphY, graphWidth, graphHeight);
    
    // Draw distance line (green)
    aiCtx.beginPath();
    aiCtx.strokeStyle = '#0c0';
    aiCtx.lineWidth = 2;
    for (let i = 0; i < learningHistory.length; i++) {
      const h = learningHistory[i];
      const x = graphX + (h.gen / maxGen) * graphWidth;
      const y = graphY + graphHeight - ((h.maxDistance || 0) / maxDistance) * graphHeight;
      if (i === 0) aiCtx.moveTo(x, y);
      else aiCtx.lineTo(x, y);
    }
    aiCtx.stroke();
    
    // Draw points line (blue)
    if (maxPoints > 0) {
      aiCtx.beginPath();
      aiCtx.strokeStyle = '#00f';
      aiCtx.lineWidth = 2;
      for (let i = 0; i < learningHistory.length; i++) {
        const h = learningHistory[i];
        const x = graphX + (h.gen / maxGen) * graphWidth;
        const y = graphY + graphHeight - ((h.points || 0) / maxPoints) * graphHeight;
        if (i === 0) aiCtx.moveTo(x, y);
        else aiCtx.lineTo(x, y);
      }
      aiCtx.stroke();
    }
    
    // Legend
    aiCtx.font = '10px monospace';
    aiCtx.fillStyle = '#0c0';
    aiCtx.fillText(`Distance (max: ${maxDistance.toFixed(1)})`, graphX + 5, graphY + 15);
    aiCtx.fillStyle = '#00f';
    aiCtx.fillText(`Points (max: ${maxPoints.toFixed(0)})`, graphX + 5, graphY + 30);
    
    return; // Skip the structure visualization when showing graph
  }
  
  // Draw worm structure
  const centerY = 100;
  const spacing = aiCanvas.offsetWidth / (currentParams.numSegments + 2);
  let x = spacing;
  
  aiCtx.strokeStyle = '#000';
  aiCtx.lineWidth = 3;
  aiCtx.lineCap = 'round';
  
  // Draw segments
  aiCtx.beginPath();
  for (let i = 0; i <= currentParams.numSegments; i++) {
    const y = i === 15 ? centerY - 30 : centerY; // Center joint higher
    if (i === 0) {
      aiCtx.moveTo(x, y);
    } else {
      aiCtx.lineTo(x, y);
    }
    x += spacing;
  }
  aiCtx.stroke();
  
  // Draw joints with size indicators
  x = spacing;
  for (let i = 0; i <= currentParams.numSegments; i++) {
    const y = i === 5 ? centerY - 30 : centerY;
    const size = i < currentParams.segmentSizes.length ? currentParams.segmentSizes[i] : 'normal';
    const radius = size === 'small' ? 4 : 7;
    
    aiCtx.fillStyle = '#fff';
    aiCtx.strokeStyle = '#000';
    aiCtx.lineWidth = 2;
    aiCtx.beginPath();
    aiCtx.arc(x, y, radius, 0, Math.PI * 2);
    aiCtx.fill();
    aiCtx.stroke();
    
    // Label
    aiCtx.fillStyle = '#000';
    aiCtx.font = '10px monospace';
    const label = size[0].toUpperCase();
    aiCtx.fillText(label, x - 4, y + 25);
    
    x += spacing;
  }
  
  // Update parameters text
  const paramsDiv = document.getElementById('aiParams');
  paramsDiv.innerHTML = `
    <strong>Structure:</strong><br>
    Segments: ${currentParams.numSegments}<br>
    Sizes: [${currentParams.segmentSizes.join(', ')}]<br>
    <br>
    <strong>Movement Parameters:</strong><br>
    Wave Speed: ${currentParams.waveSpeed.toFixed(3)}<br>
    Wave Amplitude: ${currentParams.waveAmplitude.toFixed(2)}<br>
    Rotation Force: ${currentParams.rotationForce.toFixed(2)}<br>
    <br>
    <strong>Performance:</strong><br>
    Current Distance: ${currentTrialMaxDistance.toFixed(2)}<br>
    Best Distance: ${bestDistance.toFixed(2)}<br>
    Points: ${points.toFixed(1)} / ${pointGoal}<br>
    Terrain Mode: ${terrainMode}<br>
    Super Mode: ${superMode ? 'ON' : 'OFF'}
  `;
}

// Initialize the worm
resetWorm();
draw();

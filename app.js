// app.js
// Orchestrates the ShapeEngine SDK, UI interactions, and Data Processing

document.addEventListener('DOMContentLoaded', () => {
    
    const ui = new UIController();
    let engine = new ShapeEngine();
    let finalFingerprintData = null;

    // 1. User clicks Start
    ui.onStart(() => {
        engine.start();
        ui.openBottomSheet();
    });

    // 2. User clicks X to Stop
    ui.onStop(() => {
        ui.closeBottomSheet();
        engine.stop();
        
        // Trigger math processing
        engine.analyze();
        const results = engine.getResults();
        
        processData(results);
        ui.showResults();
    });

    // 3. User clicks Download
    ui.onDownload(() => {
        if (!finalFingerprintData) return;
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(finalFingerprintData, null, 2));
        const anchor = document.createElement('a');
        anchor.href = dataStr;
        anchor.download = `se_${Date.now()}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    });

    // 4. User clicks Start New
    ui.onRestart(() => {
        // A hard reload is the cleanest way to reset the engine state entirely
        window.location.reload();
    });

    // --- Core Data Processing ---
    function processData(results) {
        // A. Calculate exactly how large the raw event array is
        const rawEventArray = results.events || [];
        const eventCount = rawEventArray.length;
        const exactRawBytes = new Blob([JSON.stringify(rawEventArray)]).size;

        // B. Strip out the massive arrays to form the fingerprint
        let fingerprint = { ...results };
        delete fingerprint.events;
        delete fingerprint.timeline;

        // C. Recursively round all numbers to exactly 4 decimal places
        fingerprint = deepRoundTo4Decimals(fingerprint);
        
        // Save for download button
        finalFingerprintData = fingerprint;

        // D. Calculate exactly how large the new fingerprint is
        const exactFingerprintBytes = new Blob([JSON.stringify(fingerprint)]).size;

        // E. Update UI Stats & JSON
        ui.updateStats(eventCount, exactRawBytes, exactFingerprintBytes);
        ui.renderJSON(fingerprint);

        // F. Draw the visualization
        drawChart(ui.chartCanvas, fingerprint.shapes);
    }

    // Helper: Deep copy and round numbers
    function deepRoundTo4Decimals(obj) {
        if (typeof obj === 'number') {
            return Number(obj.toFixed(4));
        }
        if (Array.isArray(obj)) {
            return obj.map(deepRoundTo4Decimals);
        }
        if (typeof obj === 'object' && obj !== null) {
            const roundedObj = {};
            for (let key in obj) {
                roundedObj[key] = deepRoundTo4Decimals(obj[key]);
            }
            return roundedObj;
        }
        return obj;
    }

    // --- Canvas Data Visualization ---
    function drawChart(canvas, shapesData) {
        const ctx = canvas.getContext('2d');
        
        // Handle high DPI scaling (Retina screens)
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;

        ctx.clearRect(0, 0, width, height);

        const shapes = Object.keys(shapesData);
        const values = Object.values(shapesData);
        
        // Apple-style color palette for data
        const colors = ['#34c759', '#ff9500', '#5ac8fa', '#ff3b30', '#8e8e93', '#af52de'];
        
        const padding = 20;
        const availableHeight = height - (padding * 2);
        const barHeight = Math.min(24, availableHeight / shapes.length - 8);
        const startY = padding;
        const labelWidth = 110;
        
        for (let i = 0; i < shapes.length; i++) {
            const y = startY + i * (barHeight + 12);
            const val = values[i];
            
            const maxBarWidth = width - labelWidth - 60; // Room for label & percentage
            let barWidth = val * maxBarWidth;
            if (barWidth < 4) barWidth = 4; // Ensure minimum visibility

            // 1. Draw Background Track
            ctx.fillStyle = '#f2f2f7';
            ctx.beginPath();
            ctx.roundRect(labelWidth, y, maxBarWidth, barHeight, 6);
            ctx.fill();

            // 2. Draw Value Bar
            ctx.fillStyle = colors[i % colors.length];
            ctx.beginPath();
            ctx.roundRect(labelWidth, y, barWidth, barHeight, 6);
            ctx.fill();

            // 3. Draw Label (Left aligned)
            ctx.fillStyle = '#1d1d1f';
            ctx.font = '500 13px -apple-system, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            
            // Capitalize shape name
            const label = shapes[i].charAt(0).toUpperCase() + shapes[i].slice(1);
            ctx.fillText(label, labelWidth - 16, y + (barHeight / 2));

            // 4. Draw Percentage (Right aligned)
            ctx.fillStyle = '#86868b';
            ctx.textAlign = 'left';
            ctx.fillText((val * 100).toFixed(1) + '%', labelWidth + maxBarWidth + 12, y + (barHeight / 2));
        }
    }
});

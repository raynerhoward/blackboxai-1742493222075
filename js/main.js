class AlignmentViewer {
    constructor() {
        this.alignments = [];
        this.currentAlignmentIndex = -1;
        this.bufferDistance = 500; // Default buffer distance
        this.isMonitoring = false;
        
        // Initialize UI elements
        this.initializeUI();
        
        // Bind event handlers
        this.bindEvents();
    }

    initializeUI() {
        // Create form elements
        this.wktInput = document.createElement('textarea');
        this.wktInput.placeholder = 'Enter WKT for the horizontal road alignment...';
        this.wktInput.className = 'wkt-input';
        
        this.startMeasureInput = document.createElement('input');
        this.startMeasureInput.type = 'text';
        this.startMeasureInput.placeholder = 'Auto-detected from WKT or enter manually';
        this.startMeasureInput.className = 'measure-input';
        
        this.alignmentNameInput = document.createElement('input');
        this.alignmentNameInput.type = 'text';
        this.alignmentNameInput.placeholder = 'Enter road alignment name';
        this.alignmentNameInput.className = 'name-input';
        
        this.bufferDistanceInput = document.createElement('input');
        this.bufferDistanceInput.type = 'text';
        this.bufferDistanceInput.value = this.bufferDistance;
        this.bufferDistanceInput.className = 'buffer-input';
        
        // Create buttons
        this.extractButton = document.createElement('button');
        this.extractButton.textContent = 'Extract Start Measure';
        this.extractButton.className = 'btn extract-btn';
        
        this.addButton = document.createElement('button');
        this.addButton.textContent = 'Add Alignment';
        this.addButton.className = 'btn add-btn';
        
        this.clearButton = document.createElement('button');
        this.clearButton.textContent = 'Clear All';
        this.clearButton.className = 'btn clear-btn';
        
        // Create alignment selector
        this.alignmentSelect = document.createElement('select');
        this.alignmentSelect.className = 'alignment-select';
        
        // Create monitoring panel
        this.stationLabel = document.createElement('div');
        this.stationLabel.className = 'monitor-label';
        this.stationLabel.textContent = 'Station: N/A';
        
        this.offsetLabel = document.createElement('div');
        this.offsetLabel.className = 'monitor-label';
        this.offsetLabel.textContent = 'Offset: N/A';
        
        this.sideLabel = document.createElement('div');
        this.sideLabel.className = 'monitor-label';
        this.sideLabel.textContent = 'Side: N/A';
        
        this.monitorButton = document.createElement('button');
        this.monitorButton.textContent = 'Start Monitoring';
        this.monitorButton.className = 'btn monitor-btn';
        
        // Create canvas for visualization
        this.canvas = document.createElement('canvas');
        this.canvas.width = 800;
        this.canvas.height = 600;
        this.canvas.className = 'alignment-canvas';
        this.ctx = this.canvas.getContext('2d');
        
        // Add elements to the page
        this.createLayout();
    }

    createLayout() {
        const container = document.createElement('div');
        container.className = 'alignment-viewer';
        
        // Create two-column layout
        const leftColumn = document.createElement('div');
        leftColumn.className = 'left-column';
        
        const rightColumn = document.createElement('div');
        rightColumn.className = 'right-column';
        
        // Input form section
        const formSection = document.createElement('div');
        formSection.className = 'input-form';
        
        const addFormRow = (label, element) => {
            const row = document.createElement('div');
            row.className = 'form-row';
            const labelEl = document.createElement('label');
            labelEl.textContent = label;
            row.appendChild(labelEl);
            row.appendChild(element);
            return row;
        };
        
        formSection.appendChild(addFormRow('WKT:', this.wktInput));
        
        const measureRow = document.createElement('div');
        measureRow.className = 'form-row measure-row';
        measureRow.appendChild(addFormRow('Start Measure:', this.startMeasureInput));
        measureRow.appendChild(this.extractButton);
        formSection.appendChild(measureRow);
        
        formSection.appendChild(addFormRow('Alignment Name:', this.alignmentNameInput));
        formSection.appendChild(addFormRow('Buffer Distance:', this.bufferDistanceInput));
        
        // Buttons section
        const buttonSection = document.createElement('div');
        buttonSection.className = 'button-group';
        buttonSection.appendChild(this.addButton);
        buttonSection.appendChild(this.clearButton);
        
        // Add form and buttons to left column
        leftColumn.appendChild(formSection);
        leftColumn.appendChild(buttonSection);
        
        // Alignment selection section
        const selectionSection = document.createElement('div');
        selectionSection.className = 'alignment-selection';
        const selectLabel = document.createElement('label');
        selectLabel.textContent = 'Select Active Alignment:';
        selectionSection.appendChild(selectLabel);
        selectionSection.appendChild(this.alignmentSelect);
        leftColumn.appendChild(selectionSection);
        
        // Monitoring section
        const monitorSection = document.createElement('div');
        monitorSection.className = 'monitoring-panel';
        monitorSection.appendChild(this.stationLabel);
        monitorSection.appendChild(this.offsetLabel);
        monitorSection.appendChild(this.sideLabel);
        monitorSection.appendChild(this.monitorButton);
        leftColumn.appendChild(monitorSection);
        
        // Add canvas to right column
        rightColumn.appendChild(this.canvas);
        
        // Add columns to container
        container.appendChild(leftColumn);
        container.appendChild(rightColumn);
        
        // Add container to page
        document.body.appendChild(container);
    }

    bindEvents() {
        this.extractButton.addEventListener('click', () => this.extractStartMeasure());
        this.addButton.addEventListener('click', () => this.addAlignment());
        this.clearButton.addEventListener('click', () => this.clearAllAlignments());
        this.alignmentSelect.addEventListener('change', (e) => this.onAlignmentSelectionChanged(e));
        this.monitorButton.addEventListener('click', () => this.toggleMonitoring());
        
        // Add mouse move listener for monitoring
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isMonitoring) {
                this.handleMouseMove(e);
            }
        });
    }

    extractStartMeasure() {
        const wktText = this.wktInput.value.trim();
        if (!wktText) {
            alert('Please provide a valid WKT string.');
            return;
        }
        
        const startMeasure = WKTParser.detectStartMeasure(wktText);
        if (startMeasure !== null) {
            this.startMeasureInput.value = startMeasure;
        } else {
            alert('Could not extract start measure from WKT. Please enter manually.');
        }
    }

    addAlignment() {
        const wktText = this.wktInput.value.trim();
        if (!wktText) {
            alert('Please provide a valid WKT string.');
            return;
        }
        
        // Validate buffer distance
        const bufferDistance = parseFloat(this.bufferDistanceInput.value);
        if (isNaN(bufferDistance) || bufferDistance < 1 || bufferDistance > 10000) {
            alert('Buffer distance must be between 1 and 10000.');
            return;
        }
        
        // Get start measure
        let startMeasure = parseFloat(this.startMeasureInput.value);
        if (isNaN(startMeasure)) {
            const detectedMeasure = WKTParser.detectStartMeasure(wktText);
            if (detectedMeasure !== null) {
                startMeasure = detectedMeasure;
                this.startMeasureInput.value = detectedMeasure;
            } else {
                alert('Please provide a valid start measure.');
                return;
            }
        }
        
        // Get alignment name
        const alignmentName = this.alignmentNameInput.value.trim();
        if (!alignmentName) {
            alert('Please provide an alignment name.');
            return;
        }
        
        try {
            // Parse WKT
            const geometry = WKTParser.parse(wktText);
            
            // Add alignment
            this.alignments.push({
                name: alignmentName,
                geometry: geometry,
                startMeasure: startMeasure,
                bufferDistance: bufferDistance
            });
            
            // Add to select
            const option = document.createElement('option');
            option.value = this.alignments.length - 1;
            option.textContent = alignmentName;
            this.alignmentSelect.appendChild(option);
            
            // Select the new alignment
            this.alignmentSelect.value = this.alignments.length - 1;
            this.onAlignmentSelectionChanged({ target: this.alignmentSelect });
            
            // Clear inputs
            this.wktInput.value = '';
            this.startMeasureInput.value = '';
            this.alignmentNameInput.value = '';
            
            alert('Alignment added successfully.');
            
        } catch (error) {
            alert('Error parsing WKT: ' + error.message);
        }
    }

    clearAllAlignments() {
        this.alignments = [];
        this.currentAlignmentIndex = -1;
        this.alignmentSelect.innerHTML = '';
        this.clearCanvas();
        this.resetMonitoring();
    }

    onAlignmentSelectionChanged(event) {
        const index = parseInt(event.target.value);
        if (index >= 0 && index < this.alignments.length) {
            this.currentAlignmentIndex = index;
            this.bufferDistanceInput.value = this.alignments[index].bufferDistance;
            this.drawAlignment(this.alignments[index]);
        }
    }

    toggleMonitoring() {
        this.isMonitoring = !this.isMonitoring;
        this.monitorButton.textContent = this.isMonitoring ? 'Stop Monitoring' : 'Start Monitoring';
        
        if (!this.isMonitoring) {
            this.resetMonitoring();
        }
    }

    resetMonitoring() {
        this.stationLabel.textContent = 'Station: N/A';
        this.offsetLabel.textContent = 'Offset: N/A';
        this.sideLabel.textContent = 'Side: N/A';
    }

    handleMouseMove(event) {
        if (this.currentAlignmentIndex < 0) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const point = this.canvasToWorld({ x, y });
        const alignment = this.alignments[this.currentAlignmentIndex];
        
        const result = this.calculateStationOffset(point, alignment);
        if (result) {
            this.stationLabel.textContent = `Station: ${result.station.toFixed(4)}`;
            this.offsetLabel.textContent = `Offset: ${result.offset.toFixed(2)}`;
            this.sideLabel.textContent = `Side: ${result.side}`;
        } else {
            this.resetMonitoring();
        }
    }

    calculateStationOffset(point, alignment) {
        // Implementation will depend on the geometry type
        // This is a placeholder for the actual calculation
        return null;
    }

    drawAlignment(alignment) {
        this.clearCanvas();
        // Implementation will depend on the geometry type
        // This is a placeholder for the actual drawing
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    canvasToWorld(point) {
        // Convert canvas coordinates to world coordinates
        // This is a placeholder for the actual transformation
        return point;
    }
}

// Initialize the viewer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.alignmentViewer = new AlignmentViewer();
});
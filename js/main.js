class AlignmentViewer {
    constructor() {
        this.alignments = [];
        this.currentAlignmentIndex = -1;
        this.bufferDistance = 500; // Default buffer distance
        this.isMonitoring = false;
        this.map = window.alignmentMap; // Reference to the OpenLayers map
        
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
        
        // Add columns to container
        container.appendChild(leftColumn);
        container.appendChild(rightColumn);
        
        // Add container to page
        document.getElementById('app-container').appendChild(container);
    }

    bindEvents() {
        this.extractButton.addEventListener('click', () => this.extractStartMeasure());
        this.addButton.addEventListener('click', () => this.addAlignment());
        this.clearButton.addEventListener('click', () => this.clearAllAlignments());
        this.alignmentSelect.addEventListener('change', (e) => this.onAlignmentSelectionChanged(e));
        this.monitorButton.addEventListener('click', () => this.toggleMonitoring());
        
        // Listen for map feature selection
        window.addEventListener('alignment:select', (e) => {
            const feature = e.detail.feature;
            const index = feature.get('alignmentIndex');
            if (index !== undefined) {
                this.alignmentSelect.value = index;
                this.onAlignmentSelectionChanged({ target: this.alignmentSelect });
            }
        });
        
        // Add mouse move listener for monitoring
        if (this.map && this.map.map) {
            this.map.map.on('pointermove', (e) => {
                if (this.isMonitoring) {
                    this.handleMouseMove(e);
                }
            });
        }
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
            // Add to alignments array
            const alignmentIndex = this.alignments.length;
            this.alignments.push({
                name: alignmentName,
                wkt: wktText,
                startMeasure: startMeasure,
                bufferDistance: bufferDistance
            });
            
            // Add to the map
            if (this.map) {
                const feature = this.map.addAlignment(wktText, {
                    name: alignmentName,
                    startMeasure: startMeasure,
                    bufferDistance: bufferDistance,
                    alignmentIndex: alignmentIndex
                });
                
                // Create buffer
                this.createBuffer(wktText, bufferDistance, { alignmentIndex: alignmentIndex });
            }
            
            // Add to select dropdown
            const option = document.createElement('option');
            option.value = alignmentIndex;
            option.textContent = alignmentName;
            this.alignmentSelect.appendChild(option);
            
            // Select the new alignment
            this.alignmentSelect.value = alignmentIndex;
            this.onAlignmentSelectionChanged({ target: this.alignmentSelect });
            
            // Clear inputs
            this.wktInput.value = '';
            this.startMeasureInput.value = '';
            this.alignmentNameInput.value = '';
            
            alert('Alignment added successfully.');
            
        } catch (error) {
            alert('Error adding alignment: ' + error.message);
        }
    }
    
    createBuffer(wkt, distance, properties = {}) {
        try {
            // Use WKT parser and geometry utils to create a buffer
            const geometry = WKTParser.parse(wkt);
            const bufferWkt = GeometryUtils.createBuffer(geometry, distance);
            
            // Add buffer to the map
            if (this.map && bufferWkt) {
                this.map.addBuffer(bufferWkt, properties);
            }
        } catch (error) {
            console.error('Error creating buffer:', error);
        }
    }

    clearAllAlignments() {
        this.alignments = [];
        this.currentAlignmentIndex = -1;
        this.alignmentSelect.innerHTML = '';
        this.resetMonitoring();
        
        // Clear the map
        if (this.map) {
            this.map.clearAll();
        }
    }

    onAlignmentSelectionChanged(event) {
        const index = parseInt(event.target.value);
        if (index >= 0 && index < this.alignments.length) {
            this.currentAlignmentIndex = index;
            this.bufferDistanceInput.value = this.alignments[index].bufferDistance;
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
        if (this.currentAlignmentIndex < 0 || !this.map || !this.map.map) return;
        
        const pixel = event.pixel;
        const coordinate = this.map.map.getCoordinateFromPixel(pixel);
        const alignment = this.alignments[this.currentAlignmentIndex];
        
        // Convert to WGS84/EPSG:4326
        const lonLat = ol.proj.transform(coordinate, 'EPSG:3857', 'EPSG:4326');
        
        // Calculate station/offset using GeometryUtils
        try {
            const geometry = WKTParser.parse(alignment.wkt);
            const result = GeometryUtils.calculateStationOffset(
                { x: lonLat[0], y: lonLat[1] }, 
                geometry, 
                alignment.startMeasure
            );
            
            if (result) {
                this.stationLabel.textContent = `Station: ${result.station.toFixed(4)}`;
                this.offsetLabel.textContent = `Offset: ${result.offset.toFixed(2)}`;
                this.sideLabel.textContent = `Side: ${result.side}`;
                
                // Add point to the map
                if (this.map) {
                    this.map.clearLayer('points');
                    this.map.addPoint(lonLat, {
                        station: result.station,
                        offset: result.offset,
                        side: result.side
                    });
                }
            }
        } catch (error) {
            console.error('Error calculating station/offset:', error);
        }
    }
}

// Initialize the viewer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.alignmentViewer = new AlignmentViewer();
});
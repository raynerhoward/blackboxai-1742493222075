class RoadAlignmentViewer {
    constructor() {
        // Initialize components
        this.wktParser = new WKTParser();
        this.geometryUtils = new GeometryUtils();
        this.geoPackageLoader = new GeoPackageLoader();

        // Map and layer properties
        this.map = null;
        this.layers = {
            roadAlignments: null,
            segments: null,
            segmentBuffers: null,
            stationOffsetPoints: null
        };
        this.activeAlignment = null;
        this.bufferWidth = 500; // Default buffer width in feet

        // Initialize the application
        this.initialize();
    }

    /**
     * Initialize the application
     */
    initialize() {
        // Create vector sources
        this.sources = {
            roadAlignments: new ol.source.Vector(),
            segments: new ol.source.Vector(),
            segmentBuffers: new ol.source.Vector(),
            stationOffsetPoints: new ol.source.Vector()
        };

        // Create vector layers
        this.layers = {
            roadAlignments: new ol.layer.Vector({
                source: this.sources.roadAlignments,
                style: new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: '#0000ff',
                        width: 2
                    })
                })
            }),
            segments: new ol.layer.Vector({
                source: this.sources.segments,
                style: new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: '#ff0000',
                        width: 1
                    })
                })
            }),
            segmentBuffers: new ol.layer.Vector({
                source: this.sources.segmentBuffers,
                style: new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: '#00ff00',
                        width: 1
                    }),
                    fill: new ol.style.Fill({
                        color: 'rgba(0, 255, 0, 0.1)'
                    })
                })
            }),
            stationOffsetPoints: new ol.layer.Vector({
                source: this.sources.stationOffsetPoints,
                style: new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 5,
                        fill: new ol.style.Fill({
                            color: '#ffff00'
                        }),
                        stroke: new ol.style.Stroke({
                            color: '#ff9900',
                            width: 1
                        })
                    })
                })
            })
        };

        // Initialize map
        this.initializeMap();

        // Set up event listeners
        this.setupEventListeners();
    }

    /**
     * Initialize OpenLayers map
     */
    initializeMap() {
        // Get EPSG code from input
        const epsgCode = document.getElementById('epsgCode').value || '3857';

        this.map = new ol.Map({
            target: 'map',
            layers: [
                new ol.layer.Tile({
                    source: new ol.source.OSM()
                }),
                this.layers.roadAlignments,
                this.layers.segments,
                this.layers.segmentBuffers,
                this.layers.stationOffsetPoints
            ],
            view: new ol.View({
                projection: `EPSG:${epsgCode}`,
                center: [0, 0],
                zoom: 2
            })
        });
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // WKT input handling
        document.getElementById('loadWkt').addEventListener('click', () => {
            const wktInput = document.getElementById('wktInput').value;
            this.loadWKT(wktInput);
        });

        // Buffer width handling
        document.getElementById('bufferWidth').addEventListener('change', (e) => {
            this.bufferWidth = parseFloat(e.target.value);
            this.updateBuffers();
        });

        // Active alignment selection
        document.getElementById('activeAlignment').addEventListener('change', (e) => {
            this.setActiveAlignment(e.target.value);
        });

        // GeoPackage file upload
        document.getElementById('geopackageFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadGeoPackage(file);
            }
        });

        // Map pointer move event for real-time station/offset
        this.map.on('pointermove', (e) => {
            this.updateInfoPanel(e.coordinate);
        });

        // Map click event for adding points
        this.map.on('click', (e) => {
            this.addStationOffsetPoint(e.coordinate);
        });
    }

    /**
     * Load WKT geometry
     * @param {string} wkt - WKT string to load
     */
    loadWKT(wkt) {
        try {
            // Parse WKT
            const geometry = this.wktParser.parse(wkt);
            
            // Create feature
            const feature = new ol.Feature({
                geometry: this.convertToOLGeometry(geometry)
            });

            // Add to road alignments layer
            this.sources.roadAlignments.addFeature(feature);

            // Update segments and buffers
            this.updateSegments(geometry);
            this.updateBuffers();

            // Update active alignment dropdown
            this.updateAlignmentList();

            // Zoom to feature
            this.map.getView().fit(feature.getGeometry().getExtent(), {
                padding: [50, 50, 50, 50]
            });
        } catch (error) {
            console.error('Failed to load WKT:', error);
            alert(`Failed to load WKT: ${error.message}`);
        }
    }

    /**
     * Convert parsed geometry to OpenLayers geometry
     * @param {Object} geometry - Parsed geometry object
     * @returns {ol.geom.Geometry} OpenLayers geometry
     */
    convertToOLGeometry(geometry) {
        switch (geometry.type) {
            case 'LineString':
                return new ol.geom.LineString(
                    geometry.coordinates.map(coord => [coord.x, coord.y])
                );
            case 'CircularString':
                // For now, approximate circular strings with line segments
                return new ol.geom.LineString(
                    geometry.coordinates.map(coord => [coord.x, coord.y])
                );
            case 'CompoundCurve':
                // Combine all segments into a single line string
                const coords = [];
                geometry.segments.forEach(segment => {
                    const segmentCoords = segment.coordinates.map(coord => [coord.x, coord.y]);
                    if (coords.length > 0) {
                        segmentCoords.shift(); // Remove first point to avoid duplication
                    }
                    coords.push(...segmentCoords);
                });
                return new ol.geom.LineString(coords);
            default:
                throw new Error(`Unsupported geometry type: ${geometry.type}`);
        }
    }

    /**
     * Update segments layer
     * @param {Object} geometry - Parsed geometry object
     */
    updateSegments(geometry) {
        this.sources.segments.clear();
        
        const addSegment = (segment) => {
            const feature = new ol.Feature({
                geometry: this.convertToOLGeometry(segment)
            });
            this.sources.segments.addFeature(feature);
        };

        if (geometry.type === 'CompoundCurve') {
            geometry.segments.forEach(addSegment);
        } else {
            addSegment(geometry);
        }
    }

    /**
     * Update buffer layer
     */
    updateBuffers() {
        this.sources.segmentBuffers.clear();

        const features = this.sources.segments.getFeatures();
        features.forEach(feature => {
            const coords = feature.getGeometry().getCoordinates();
            for (let i = 0; i < coords.length - 1; i++) {
                const start = { x: coords[i][0], y: coords[i][1] };
                const end = { x: coords[i + 1][0], y: coords[i + 1][1] };
                
                const bufferPoints = GeometryUtils.generateSegmentBuffer(start, end, this.bufferWidth);
                const bufferFeature = new ol.Feature({
                    geometry: new ol.geom.Polygon([bufferPoints.map(p => [p.x, p.y])])
                });
                
                this.sources.segmentBuffers.addFeature(bufferFeature);
            }
        });
    }

    /**
     * Update the active alignment dropdown
     */
    updateAlignmentList() {
        const select = document.getElementById('activeAlignment');
        const features = this.sources.roadAlignments.getFeatures();
        
        // Clear existing options
        select.innerHTML = '<option value="">Select an alignment</option>';
        
        // Add new options
        features.forEach((feature, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Alignment ${index + 1}`;
            select.appendChild(option);
        });
    }

    /**
     * Set the active alignment
     * @param {string} alignmentId - ID of the alignment to set active
     */
    setActiveAlignment(alignmentId) {
        this.activeAlignment = alignmentId ? 
            this.sources.roadAlignments.getFeatures()[parseInt(alignmentId)] : 
            null;
    }

    /**
     * Update info panel with station/offset information
     * @param {Array} coordinate - Map coordinates [x, y]
     */
    updateInfoPanel(coordinate) {
        if (!this.activeAlignment) return;

        const point = { x: coordinate[0], y: coordinate[1] };
        const segments = this.sources.segments.getFeatures();
        
        let closestSegment = null;
        let minOffset = Infinity;
        let result = null;

        segments.forEach(segment => {
            const coords = segment.getGeometry().getCoordinates();
            const segmentGeom = {
                type: 'LineString',
                coordinates: coords.map(coord => ({ x: coord[0], y: coord[1] }))
            };

            const { station, offset, side } = GeometryUtils.calculateStationOffset(point, segmentGeom);
            
            if (offset < minOffset) {
                minOffset = offset;
                closestSegment = segment;
                result = { station, offset, side };
            }
        });

        if (result) {
            document.getElementById('stationValue').textContent = result.station.toFixed(2);
            document.getElementById('offsetValue').textContent = result.offset.toFixed(2);
            document.getElementById('sideValue').textContent = result.side;
            document.getElementById('xValue').textContent = coordinate[0].toFixed(2);
            document.getElementById('yValue').textContent = coordinate[1].toFixed(2);
        }
    }

    /**
     * Add a station/offset point
     * @param {Array} coordinate - Map coordinates [x, y]
     */
    addStationOffsetPoint(coordinate) {
        if (!this.activeAlignment) return;

        const point = { x: coordinate[0], y: coordinate[1] };
        const segments = this.sources.segments.getFeatures();
        
        let closestSegment = null;
        let minOffset = Infinity;
        let result = null;

        segments.forEach(segment => {
            const coords = segment.getGeometry().getCoordinates();
            const segmentGeom = {
                type: 'LineString',
                coordinates: coords.map(coord => ({ x: coord[0], y: coord[1] }))
            };

            const { station, offset, side } = GeometryUtils.calculateStationOffset(point, segmentGeom);
            
            if (offset < minOffset) {
                minOffset = offset;
                closestSegment = segment;
                result = { station, offset, side };
            }
        });

        if (result) {
            const feature = new ol.Feature({
                geometry: new ol.geom.Point(coordinate),
                properties: {
                    station: result.station,
                    offset: result.offset,
                    side: result.side,
                    x: coordinate[0],
                    y: coordinate[1]
                }
            });

            this.sources.stationOffsetPoints.addFeature(feature);
        }
    }

    /**
     * Load a GeoPackage file
     * @param {File} file - GeoPackage file to load
     */
    async loadGeoPackage(file) {
        try {
            const layers = await this.geoPackageLoader.loadFile(file);
            // Update layers with GeoPackage content
            // This is a placeholder as GeoPackage support requires additional implementation
        } catch (error) {
            console.error('Failed to load GeoPackage:', error);
            alert(`Failed to load GeoPackage: ${error.message}`);
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new RoadAlignmentViewer();
});
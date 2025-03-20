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

    initializeMap() {
        // Define EPSG:2274 projection
        const proj2274 = '+proj=lcc +lat_1=35.25 +lat_2=36.41666666666666 +lat_0=34.33333333333334 +lon_0=-86 +x_0=600000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs';
        proj4.defs("EPSG:2274", proj2274);
        ol.proj.proj4.register(proj4);

        // Create the map
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
                projection: 'EPSG:3857',
                center: [-9493000, 4163000],
                zoom: 16
            })
        });
    }

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

    convertToOLGeometry(geometry) {
        const transformCoords = coords => {
            return coords.map(coord => {
                try {
                    // Parse coordinates
                    const x = parseFloat(coord.x);
                    const y = parseFloat(coord.y);
                    
                    console.log('Input EPSG:2274:', [x, y]);
                    
                    // Transform to EPSG:4326
                    const [lon, lat] = proj4('EPSG:2274', 'EPSG:4326', [x, y]);
                    console.log('Intermediate EPSG:4326:', [lon, lat]);
                    
                    // Transform to EPSG:3857
                    const webMercator = ol.proj.fromLonLat([lon, lat]);
                    console.log('Output EPSG:3857:', webMercator);
                    
                    return webMercator;
                } catch (error) {
                    console.error('Coordinate transformation error:', error);
                    console.error('Failed coordinates:', coord);
                    return [0, 0];
                }
            });
        };

        switch (geometry.type) {
            case 'LineString':
                return new ol.geom.LineString(
                    transformCoords(geometry.coordinates)
                );
            case 'CircularString':
                // For now, approximate circular strings with line segments
                return new ol.geom.LineString(
                    transformCoords(geometry.coordinates)
                );
            case 'CompoundCurve':
                // Combine all segments into a single line string
                const coords = [];
                geometry.segments.forEach(segment => {
                    const segmentCoords = transformCoords(segment.coordinates);
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

    updateBuffers() {
        this.sources.segmentBuffers.clear();

        const features = this.sources.segments.getFeatures();
        features.forEach(feature => {
            const coords = feature.getGeometry().getCoordinates();
            for (let i = 0; i < coords.length - 1; i++) {
                // Transform coordinates back to EPSG:2274 for buffer calculation
                const [x1, y1] = proj4('EPSG:3857', 'EPSG:2274', coords[i]);
                const [x2, y2] = proj4('EPSG:3857', 'EPSG:2274', coords[i + 1]);
                
                const start = { x: x1, y: y1 };
                const end = { x: x2, y: y2 };
                
                // Generate buffer in EPSG:2274
                const bufferPoints = GeometryUtils.generateSegmentBuffer(start, end, this.bufferWidth);
                
                // Transform buffer points back to EPSG:3857 for display
                const transformedBufferPoints = bufferPoints.map(p => {
                    const [lon, lat] = proj4('EPSG:2274', 'EPSG:4326', [p.x, p.y]);
                    return ol.proj.fromLonLat([lon, lat]);
                });
                
                const bufferFeature = new ol.Feature({
                    geometry: new ol.geom.Polygon([transformedBufferPoints])
                });
                
                this.sources.segmentBuffers.addFeature(bufferFeature);
            }
        });
    }

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

    setActiveAlignment(alignmentId) {
        this.activeAlignment = alignmentId ? 
            this.sources.roadAlignments.getFeatures()[parseInt(alignmentId)] : 
            null;
    }

    updateInfoPanel(coordinate) {
        if (!this.activeAlignment) return;

        // Transform coordinate from EPSG:3857 to EPSG:2274
        const [x, y] = proj4('EPSG:3857', 'EPSG:2274', coordinate);
        const point = { x, y };
        
        const segments = this.sources.segments.getFeatures();
        let closestSegment = null;
        let minOffset = Infinity;
        let result = null;

        segments.forEach(segment => {
            const coords = segment.getGeometry().getCoordinates();
            const segmentGeom = {
                type: 'LineString',
                coordinates: coords.map(coord => {
                    const [x, y] = proj4('EPSG:3857', 'EPSG:2274', coord);
                    return { x, y };
                })
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
            document.getElementById('xValue').textContent = point.x.toFixed(2);
            document.getElementById('yValue').textContent = point.y.toFixed(2);
        }
    }

    addStationOffsetPoint(coordinate) {
        if (!this.activeAlignment) return;

        // Transform coordinate from EPSG:3857 to EPSG:2274
        const [x, y] = proj4('EPSG:3857', 'EPSG:2274', coordinate);
        const point = { x, y };
        
        const segments = this.sources.segments.getFeatures();
        let closestSegment = null;
        let minOffset = Infinity;
        let result = null;

        segments.forEach(segment => {
            const coords = segment.getGeometry().getCoordinates();
            const segmentGeom = {
                type: 'LineString',
                coordinates: coords.map(coord => {
                    const [x, y] = proj4('EPSG:3857', 'EPSG:2274', coord);
                    return { x, y };
                })
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
                    x: point.x,
                    y: point.y
                }
            });

            this.sources.stationOffsetPoints.addFeature(feature);
        }
    }

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
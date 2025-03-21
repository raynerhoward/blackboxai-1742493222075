/**
 * Map class for handling OpenLayers map functionality
 */
class AlignmentMap {
    constructor(target = 'map') {
        this.mapTarget = target;
        this.map = null;
        this.layers = {
            base: null,
            alignments: null,
            buffers: null,
            points: null
        };
        this.styles = {
            alignment: new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#0074D9',
                    width: 3
                })
            }),
            buffer: new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: 'rgba(0, 116, 217, 0.8)',
                    width: 1
                }),
                fill: new ol.style.Fill({
                    color: 'rgba(0, 116, 217, 0.1)'
                })
            }),
            point: new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 5,
                    fill: new ol.style.Fill({
                        color: '#FF4136'
                    }),
                    stroke: new ol.style.Stroke({
                        color: '#FFFFFF',
                        width: 2
                    })
                })
            })
        };
        
        this.init();
    }
    
    /**
     * Initialize the map
     */
    init() {
        // Create vector layers
        this.layers.base = new ol.layer.Tile({
            source: new ol.source.OSM()
        });
        
        this.layers.alignments = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: this.styles.alignment
        });
        
        this.layers.buffers = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: this.styles.buffer
        });
        
        this.layers.points = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: this.styles.point
        });
        
        // Create the map
        this.map = new ol.Map({
            target: this.mapTarget,
            layers: [
                this.layers.base,
                this.layers.buffers,
                this.layers.alignments,
                this.layers.points
            ],
            view: new ol.View({
                center: ol.proj.fromLonLat([0, 0]),
                zoom: 2
            }),
            controls: ol.control.defaults().extend([
                new ol.control.ScaleLine(),
                new ol.control.FullScreen(),
                new ol.control.MousePosition({
                    coordinateFormat: ol.coordinate.createStringXY(4),
                    projection: 'EPSG:4326',
                    className: 'custom-mouse-position',
                    undefinedHTML: '&nbsp;'
                })
            ])
        });
        
        // Add map interactions
        this.addInteractions();
    }
    
    /**
     * Add interactions to the map
     */
    addInteractions() {
        // Add hover interaction
        const hoverInteraction = new ol.interaction.Select({
            condition: ol.events.condition.pointerMove,
            layers: [this.layers.alignments]
        });
        
        this.map.addInteraction(hoverInteraction);
        
        // Add click interaction
        const clickInteraction = new ol.interaction.Select({
            condition: ol.events.condition.click,
            layers: [this.layers.alignments]
        });
        
        clickInteraction.on('select', (event) => {
            if (event.selected.length > 0) {
                const feature = event.selected[0];
                this.onFeatureSelect(feature);
            }
        });
        
        this.map.addInteraction(clickInteraction);
    }
    
    /**
     * Handle feature selection
     * @param {ol.Feature} feature The selected feature
     */
    onFeatureSelect(feature) {
        console.log('Selected feature:', feature);
        // Dispatch a custom event that can be listened to by the AlignmentViewer
        const selectEvent = new CustomEvent('alignment:select', {
            detail: { feature }
        });
        window.dispatchEvent(selectEvent);
    }
    
    /**
     * Add an alignment to the map
     * @param {string} wkt WKT string representing the alignment
     * @param {Object} properties Properties to attach to the feature
     * @returns {ol.Feature} The created feature
     */
    addAlignment(wkt, properties = {}) {
        try {
            const format = new ol.format.WKT();
            const feature = format.readFeature(wkt, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });
            
            // Set properties
            feature.setProperties(properties);
            
            // Add to the alignments layer
            this.layers.alignments.getSource().addFeature(feature);
            
            // Zoom to the feature
            this.zoomToFeature(feature);
            
            return feature;
        } catch (error) {
            console.error('Failed to add alignment:', error);
            return null;
        }
    }
    
    /**
     * Add a buffer to the map
     * @param {string} wkt WKT string representing the buffer
     * @param {Object} properties Properties to attach to the feature
     * @returns {ol.Feature} The created feature
     */
    addBuffer(wkt, properties = {}) {
        try {
            const format = new ol.format.WKT();
            const feature = format.readFeature(wkt, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });
            
            // Set properties
            feature.setProperties(properties);
            
            // Add to the buffers layer
            this.layers.buffers.getSource().addFeature(feature);
            
            return feature;
        } catch (error) {
            console.error('Failed to add buffer:', error);
            return null;
        }
    }
    
    /**
     * Add a point to the map
     * @param {Array} coordinates [lon, lat] coordinates
     * @param {Object} properties Properties to attach to the feature
     * @returns {ol.Feature} The created feature
     */
    addPoint(coordinates, properties = {}) {
        try {
            const feature = new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat(coordinates))
            });
            
            // Set properties
            feature.setProperties(properties);
            
            // Add to the points layer
            this.layers.points.getSource().addFeature(feature);
            
            return feature;
        } catch (error) {
            console.error('Failed to add point:', error);
            return null;
        }
    }
    
    /**
     * Zoom to a feature
     * @param {ol.Feature} feature The feature to zoom to
     */
    zoomToFeature(feature) {
        const extent = feature.getGeometry().getExtent();
        this.map.getView().fit(extent, {
            padding: [50, 50, 50, 50],
            duration: 500
        });
    }
    
    /**
     * Clear all features from a layer
     * @param {string} layerName Name of the layer to clear
     */
    clearLayer(layerName) {
        if (this.layers[layerName]) {
            this.layers[layerName].getSource().clear();
        }
    }
    
    /**
     * Clear all features from all layers
     */
    clearAll() {
        Object.keys(this.layers).forEach(layerName => {
            if (layerName !== 'base') {
                this.clearLayer(layerName);
            }
        });
    }
}

// Create a global instance
window.alignmentMap = new AlignmentMap(); 
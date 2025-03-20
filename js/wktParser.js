class WKTParser {
    constructor() {
        // Regular expressions for parsing different WKT types
        this.regex = {
            coordinates: /(-?\d+\.?\d*)\s+(-?\d+\.?\d*)(?:\s+(-?\d+\.?\d*))?\s+(-?\d+\.?\d*)/g,
            linestring: /LINESTRING\s*\((.*)\)/i,
            circularstring: /CIRCULARSTRING\s*\((.*)\)/i,
            compoundcurve: /COMPOUNDCURVE\s*\((.*)\)/i
        };
    }

    /**
     * Parse WKT string into structured geometry object
     * @param {string} wkt - The WKT string to parse
     * @returns {Object} Parsed geometry object
     * @throws {Error} If WKT is invalid or unsupported
     */
    parse(wkt) {
        try {
            wkt = wkt.trim();
            
            if (wkt.toUpperCase().startsWith('COMPOUNDCURVE')) {
                return this.parseCompoundCurve(wkt);
            } else if (wkt.toUpperCase().startsWith('LINESTRING')) {
                return this.parseLineString(wkt);
            } else if (wkt.toUpperCase().startsWith('CIRCULARSTRING')) {
                return this.parseCircularString(wkt);
            } else {
                throw new Error('Unsupported geometry type');
            }
        } catch (error) {
            throw new Error(`WKT parsing error: ${error.message}`);
        }
    }

    /**
     * Parse coordinates from WKT string
     * @param {string} coordsStr - String containing coordinates
     * @returns {Array} Array of coordinate objects
     */
    parseCoordinates(coordsStr) {
        const coords = [];
        let match;

        while ((match = this.regex.coordinates.exec(coordsStr)) !== null) {
            coords.push({
                x: parseFloat(match[1]),
                y: parseFloat(match[2]),
                // Ignore Z value (match[3]) as per requirements
                m: parseFloat(match[4])
            });
        }

        if (coords.length === 0) {
            throw new Error('No valid coordinates found');
        }

        return coords;
    }

    /**
     * Parse LINESTRING WKT
     * @param {string} wkt - LINESTRING WKT string
     * @returns {Object} Parsed LineString object
     */
    parseLineString(wkt) {
        const match = this.regex.linestring.exec(wkt);
        if (!match) {
            throw new Error('Invalid LINESTRING format');
        }

        return {
            type: 'LineString',
            coordinates: this.parseCoordinates(match[1])
        };
    }

    /**
     * Parse CIRCULARSTRING WKT
     * @param {string} wkt - CIRCULARSTRING WKT string
     * @returns {Object} Parsed CircularString object
     */
    parseCircularString(wkt) {
        const match = this.regex.circularstring.exec(wkt);
        if (!match) {
            throw new Error('Invalid CIRCULARSTRING format');
        }

        const coords = this.parseCoordinates(match[1]);
        if (coords.length < 3) {
            throw new Error('CircularString requires at least 3 points');
        }

        return {
            type: 'CircularString',
            coordinates: coords
        };
    }

    /**
     * Parse COMPOUNDCURVE WKT
     * @param {string} wkt - COMPOUNDCURVE WKT string
     * @returns {Object} Parsed CompoundCurve object
     */
    parseCompoundCurve(wkt) {
        const match = this.regex.compoundcurve.exec(wkt);
        if (!match) {
            throw new Error('Invalid COMPOUNDCURVE format');
        }

        const segments = [];
        let currentSegment = '';
        let parenthesesCount = 0;
        
        // Split the compound curve into individual segments
        for (let char of match[1]) {
            if (char === '(') parenthesesCount++;
            if (char === ')') parenthesesCount--;
            
            if (char === ',' && parenthesesCount === 0) {
                if (currentSegment.trim()) {
                    segments.push(this.parseSegment(currentSegment.trim()));
                }
                currentSegment = '';
            } else {
                currentSegment += char;
            }
        }
        
        if (currentSegment.trim()) {
            segments.push(this.parseSegment(currentSegment.trim()));
        }

        return {
            type: 'CompoundCurve',
            segments: segments
        };
    }

    /**
     * Parse individual segment of a COMPOUNDCURVE
     * @param {string} segment - Segment string
     * @returns {Object} Parsed segment object
     */
    parseSegment(segment) {
        if (segment.toUpperCase().startsWith('CIRCULARSTRING')) {
            return this.parseCircularString(segment);
        } else {
            // Assume LINESTRING if no type specified
            if (!segment.toUpperCase().startsWith('LINESTRING')) {
                segment = 'LINESTRING ' + segment;
            }
            return this.parseLineString(segment);
        }
    }

    /**
     * Validate parsed geometry
     * @param {Object} geometry - Parsed geometry object
     * @returns {boolean} True if valid, throws error if invalid
     */
    validate(geometry) {
        if (!geometry || !geometry.type) {
            throw new Error('Invalid geometry object');
        }

        switch (geometry.type) {
            case 'LineString':
            case 'CircularString':
                if (!geometry.coordinates || geometry.coordinates.length < 2) {
                    throw new Error(`${geometry.type} must have at least 2 points`);
                }
                break;
            case 'CompoundCurve':
                if (!geometry.segments || geometry.segments.length === 0) {
                    throw new Error('CompoundCurve must have at least one segment');
                }
                geometry.segments.forEach(segment => this.validate(segment));
                break;
            default:
                throw new Error(`Unsupported geometry type: ${geometry.type}`);
        }

        return true;
    }
}

// Export the parser
window.WKTParser = WKTParser;
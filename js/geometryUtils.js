class GeometryUtils {
    /**
     * Calculate distance between two points
     * @param {Object} p1 - First point {x, y}
     * @param {Object} p2 - Second point {x, y}
     * @returns {number} Distance between points
     */
    static distance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    /**
     * Calculate angle between three points
     * @param {Object} p1 - First point {x, y}
     * @param {Object} p2 - Second point (center) {x, y}
     * @param {Object} p3 - Third point {x, y}
     * @returns {number} Angle in radians
     */
    static angle(p1, p2, p3) {
        const a = this.distance(p2, p3);
        const b = this.distance(p1, p3);
        const c = this.distance(p1, p2);
        return Math.acos((a * a + c * c - b * b) / (2 * a * c));
    }

    /**
     * Calculate point on line at given distance from start
     * @param {Object} start - Start point {x, y}
     * @param {Object} end - End point {x, y}
     * @param {number} distance - Distance from start
     * @returns {Object} Point {x, y}
     */
    static pointAlongLine(start, end, distance) {
        const length = this.distance(start, end);
        const t = distance / length;
        return {
            x: start.x + (end.x - start.x) * t,
            y: start.y + (end.y - start.y) * t
        };
    }

    /**
     * Calculate perpendicular distance from point to line segment
     * @param {Object} point - Point to measure from {x, y}
     * @param {Object} lineStart - Line start point {x, y}
     * @param {Object} lineEnd - Line end point {x, y}
     * @returns {Object} Distance and closest point
     */
    static perpendicularDistance(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let closestPoint;
        if (param < 0) {
            closestPoint = { x: lineStart.x, y: lineStart.y };
        } else if (param > 1) {
            closestPoint = { x: lineEnd.x, y: lineEnd.y };
        } else {
            closestPoint = {
                x: lineStart.x + param * C,
                y: lineStart.y + param * D
            };
        }

        const distance = this.distance(point, closestPoint);
        return { distance, closestPoint };
    }

    /**
     * Determine side of line (left/right) for a point
     * @param {Object} lineStart - Line start point {x, y}
     * @param {Object} lineEnd - Line end point {x, y}
     * @param {Object} point - Point to test {x, y}
     * @returns {string} 'left' or 'right'
     */
    static pointSide(lineStart, lineEnd, point) {
        const value = ((lineEnd.x - lineStart.x) * (point.y - lineStart.y) -
                      (lineEnd.y - lineStart.y) * (point.x - lineStart.x));
        return value > 0 ? 'left' : 'right';
    }

    /**
     * Generate buffer polygon for a line segment
     * @param {Object} start - Start point {x, y, m}
     * @param {Object} end - End point {x, y, m}
     * @param {number} width - Buffer width
     * @returns {Array} Array of points forming buffer polygon
     */
    static generateSegmentBuffer(start, end, width) {
        // Calculate perpendicular vector
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        // Normalize and rotate 90 degrees
        const perpX = (-dy / length) * width;
        const perpY = (dx / length) * width;

        // Generate buffer points
        return [
            { x: start.x + perpX, y: start.y + perpY },
            { x: end.x + perpX, y: end.y + perpY },
            { x: end.x - perpX, y: end.y - perpY },
            { x: start.x - perpX, y: start.y - perpY },
            { x: start.x + perpX, y: start.y + perpY } // Close the polygon
        ];
    }

    /**
     * Calculate station and offset for a point relative to a segment
     * @param {Object} point - Point to measure {x, y}
     * @param {Object} segment - Segment {type, coordinates}
     * @returns {Object} Station and offset values
     */
    static calculateStationOffset(point, segment) {
        if (segment.type === 'LineString') {
            return this.calculateLineStringStationOffset(point, segment.coordinates);
        } else if (segment.type === 'CircularString') {
            return this.calculateCircularStringStationOffset(point, segment.coordinates);
        }
        throw new Error('Unsupported segment type');
    }

    /**
     * Calculate station and offset for a point relative to a linestring
     * @param {Object} point - Point to measure {x, y}
     * @param {Array} coordinates - Array of coordinates
     * @returns {Object} Station and offset values
     */
    static calculateLineStringStationOffset(point, coordinates) {
        let minDistance = Infinity;
        let station = 0;
        let offset = 0;
        let accumulatedLength = 0;
        let side = 'right';

        for (let i = 0; i < coordinates.length - 1; i++) {
            const start = coordinates[i];
            const end = coordinates[i + 1];
            
            const { distance, closestPoint } = this.perpendicularDistance(point, start, end);
            
            if (distance < minDistance) {
                minDistance = distance;
                offset = distance;
                side = this.pointSide(start, end, point);
                
                // Calculate station at closest point
                const distanceToStart = this.distance(start, closestPoint);
                station = accumulatedLength + distanceToStart;
            }
            
            accumulatedLength += this.distance(start, end);
        }

        return { station, offset, side };
    }

    /**
     * Calculate station and offset for a point relative to a circular string
     * @param {Object} point - Point to measure {x, y}
     * @param {Array} coordinates - Array of coordinates (at least 3 points)
     * @returns {Object} Station and offset values
     */
    static calculateCircularStringStationOffset(point, coordinates) {
        // This is a simplified implementation
        // For a full implementation, you would need to:
        // 1. Calculate the center and radius of the circular arc
        // 2. Calculate the angles between start and end points
        // 3. Calculate the station along the arc
        // 4. Calculate the offset from the arc
        
        // For now, we'll treat it as a series of line segments
        return this.calculateLineStringStationOffset(point, coordinates);
    }

    /**
     * Find the segment containing a point within its buffer
     * @param {Object} point - Point to test {x, y}
     * @param {Array} segments - Array of segments
     * @param {number} bufferWidth - Buffer width
     * @returns {Object|null} Matching segment or null
     */
    static findContainingSegment(point, segments, bufferWidth) {
        let minDistance = Infinity;
        let matchingSegment = null;

        segments.forEach(segment => {
            const { offset } = this.calculateStationOffset(point, segment);
            if (offset <= bufferWidth && offset < minDistance) {
                minDistance = offset;
                matchingSegment = segment;
            }
        });

        return matchingSegment;
    }
}

// Export the utilities
window.GeometryUtils = GeometryUtils;
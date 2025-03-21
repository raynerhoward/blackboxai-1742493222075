class GeometryUtils {
    static distanceBetweenPoints(p1, p2) {
        return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
    }

    static circleCenterFromThreePoints(p1, pMid, p2) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = pMid.x, y2 = pMid.y;
        const x3 = p2.x, y3 = p2.y;

        const midX1 = (x1 + x2) / 2;
        const midY1 = (y1 + y2) / 2;
        const midX2 = (x2 + x3) / 2;
        const midY2 = (y2 + y3) / 2;

        let slope1, slope2;

        if (y2 - y1 !== 0) {
            slope1 = -(x2 - x1) / (y2 - y1);
        } else {
            slope1 = Infinity;
        }

        if (y3 - y2 !== 0) {
            slope2 = -(x3 - x2) / (y3 - y2);
        } else {
            slope2 = Infinity;
        }

        let cx, cy;

        if (slope1 === Infinity) {
            cx = midX1;
            cy = slope2 * (cx - midX2) + midY2;
        } else if (slope2 === Infinity) {
            cx = midX2;
            cy = slope1 * (cx - midX1) + midY1;
        } else {
            cx = (slope1 * midX1 - slope2 * midX2 + midY2 - midY1) / (slope1 - slope2);
            cy = slope1 * (cx - midX1) + midY1;
        }

        return { x: cx, y: cy };
    }

    static closestPointOnArcToGivenPoint(center, radius, givenPoint) {
        const cx = center.x, cy = center.y;
        const gx = givenPoint.x, gy = givenPoint.y;

        const vectorX = gx - cx;
        const vectorY = gy - cy;
        const distance = Math.sqrt(vectorX ** 2 + vectorY ** 2);

        if (distance === 0) {
            return { x: cx + radius, y: cy };
        }

        const closestX = cx + (vectorX / distance) * radius;
        const closestY = cy + (vectorY / distance) * radius;

        return { x: closestX, y: closestY };
    }

    static calculateCurvature(p1, pMid, p2, center) {
        // Calculate vectors from center to points
        const vec1 = [p1.x - center.x, p1.y - center.y];
        const vec2 = [p2.x - center.x, p2.y - center.y];

        // Calculate cross product to determine direction
        const cross = vec1[0] * vec2[1] - vec1[1] * vec2[0];

        // Calculate angles for start and end points
        const angleStart = Math.atan2(p1.y - center.y, p1.x - center.x);
        const angleEnd = Math.atan2(p2.y - center.y, p2.x - center.x);

        // Calculate sweep angle
        const deltaAngle = Math.atan2(Math.sin(angleEnd - angleStart), Math.cos(angleEnd - angleStart));

        // Calculate curvature value in degrees
        const curvatureVal = Math.abs(deltaAngle) * (180 / Math.PI);

        // Return signed curvature (negative for counterclockwise, positive for clockwise)
        return cross > 0 ? -curvatureVal : curvatureVal;
    }

    static calculateStationOnArc(p1, p2, closestPoint, center, radius, curvature, startMeasure) {
        // Check if closest point coincides with start
        if (this.distanceBetweenPoints(p1, closestPoint) < 0.001) {
            return startMeasure;
        }

        // Calculate angles in radians
        const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
        const closestAngle = Math.atan2(closestPoint.y - center.y, closestPoint.x - center.x);

        // Calculate arc length from start to closest point
        let angleDiff = closestAngle - startAngle;

        // Normalize angle difference based on curvature direction
        if (curvature > 0) { // Clockwise arc
            if (angleDiff > 0) {
                angleDiff = angleDiff - 2 * Math.PI;
            }
        } else { // Counterclockwise arc
            if (angleDiff < 0) {
                angleDiff = angleDiff + 2 * Math.PI;
            }
        }

        // Calculate arc length
        const arcLength = radius * Math.abs(angleDiff);

        // Calculate station
        return startMeasure + arcLength;
    }

    static determineSideForCircularString(center, radius, givenPoint, curvature) {
        const cx = center.x, cy = center.y;
        const gx = givenPoint.x, gy = givenPoint.y;

        const distanceToCenter = Math.sqrt((gx - cx) ** 2 + (gy - cy) ** 2);

        // Determine direction based on curvature
        // Positive curvature means clockwise, negative means counterclockwise
        const direction = curvature > 0 ? 1 : -1;

        // Calculate signed offset
        const signedOffset = direction * (distanceToCenter - radius);

        if (Math.abs(signedOffset) < 0.001) { // Small threshold for "on-line"
            return "on-line";
        } else if (signedOffset > 0) {
            return "left";
        } else {
            return "right";
        }
    }

    static determineSideForLine(pt, proj, segment) {
        if (!segment || !segment.geometry) {
            return "undefined";
        }

        // Get the segment's direction vector
        const vertices = segment.geometry;
        if (vertices.length < 2) {
            return "undefined";
        }

        // Create vector from projection to point
        const vecX = pt.x - proj.x;
        const vecY = pt.y - proj.y;
        
        // Create direction vector of the segment
        const dirX = vertices[1].x - vertices[0].x;
        const dirY = vertices[1].y - vertices[0].y;
        
        // Cross product to determine side
        const cross = vecX * dirY - vecY * dirX;
        
        if (Math.abs(cross) < 0.001) { // Small threshold for "on-line"
            return "on-line";
        } else if (cross > 0) {
            return "left";
        } else {
            return "right";
        }
    }
    
    /**
     * Create a buffer around a geometry
     * @param {Object} geometry The parsed WKT geometry
     * @param {number} distance Buffer distance in meters
     * @returns {string} WKT string representing the buffer
     */
    static createBuffer(geometry, distance) {
        try {
            // For simplicity, this is a placeholder implementation
            // For a real implementation, you would need to:
            // 1. Use turf.js or a similar library for buffer creation
            // 2. Or implement buffer algorithms for different geometry types
            
            // For LINESTRING or CIRCULARSTRING, create a simplified buffer 
            // by generating a set of points at the buffer distance along the normal vectors
            
            if (geometry.type === 'LineString') {
                return this.createLineStringBuffer(geometry, distance);
            } else if (geometry.type === 'CircularString') {
                return this.createCircularStringBuffer(geometry, distance);
            } else {
                console.warn('Buffer creation for', geometry.type, 'not implemented');
                return null;
            }
        } catch (error) {
            console.error('Error creating buffer:', error);
            return null;
        }
    }
    
    /**
     * Create a simplified buffer for a LineString
     * @param {Object} geometry LineString geometry
     * @param {number} distance Buffer distance
     * @returns {string} WKT POLYGON string
     */
    static createLineStringBuffer(geometry, distance) {
        const points = geometry.coordinates;
        if (points.length < 2) return null;
        
        // Create rectangles for each segment and union them
        const bufferPoints = [];
        
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            // Vector from p1 to p2
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            
            // Normalized perpendicular vector
            const length = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / length;
            const ny = dx / length;
            
            // Add buffer points (4 corners of the rectangle)
            if (i === 0) {
                bufferPoints.push({
                    x: p1.x + nx * distance,
                    y: p1.y + ny * distance
                });
                bufferPoints.push({
                    x: p1.x - nx * distance,
                    y: p1.y - ny * distance
                });
            }
            
            bufferPoints.push({
                x: p2.x + nx * distance,
                y: p2.y + ny * distance
            });
            bufferPoints.push({
                x: p2.x - nx * distance,
                y: p2.y - ny * distance
            });
        }
        
        // Add closing point
        bufferPoints.push({
            x: bufferPoints[0].x,
            y: bufferPoints[0].y
        });
        
        // Convert to WKT
        const wkt = 'POLYGON((';
        const coords = bufferPoints.map(p => `${p.x} ${p.y}`).join(',');
        return wkt + coords + '))';
    }
    
    /**
     * Create a simplified buffer for a CircularString
     * @param {Object} geometry CircularString geometry
     * @param {number} distance Buffer distance
     * @returns {string} WKT POLYGON string
     */
    static createCircularStringBuffer(geometry, distance) {
        const points = geometry.coordinates;
        if (points.length < 3) return null;
        
        // For a circle, use a simpler approach: create a larger and smaller circle
        const p1 = points[0];
        const pMid = points[1];
        const p2 = points[2];
        
        // Calculate center and radius
        const center = this.circleCenterFromThreePoints(p1, pMid, p2);
        const radius = this.distanceBetweenPoints(center, p1);
        
        // Calculate inner and outer buffer radii
        const innerRadius = Math.max(0, radius - distance);
        const outerRadius = radius + distance;
        
        // Create a polygon approximation with multiple points
        const numPoints = 36; // 10-degree intervals
        const bufferPoints = [];
        
        // Generate outer circle points
        for (let i = 0; i <= numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            bufferPoints.push({
                x: center.x + outerRadius * Math.cos(angle),
                y: center.y + outerRadius * Math.sin(angle)
            });
        }
        
        // Generate inner circle points in reverse order
        for (let i = numPoints; i >= 0; i--) {
            const angle = (i / numPoints) * 2 * Math.PI;
            bufferPoints.push({
                x: center.x + innerRadius * Math.cos(angle),
                y: center.y + innerRadius * Math.sin(angle)
            });
        }
        
        // Add closing point
        bufferPoints.push({
            x: bufferPoints[0].x,
            y: bufferPoints[0].y
        });
        
        // Convert to WKT
        const wkt = 'POLYGON((';
        const coords = bufferPoints.map(p => `${p.x} ${p.y}`).join(',');
        return wkt + coords + '))';
    }
    
    /**
     * Calculate station and offset for a point relative to an alignment
     * @param {Object} point Point coordinates {x, y}
     * @param {Object} geometry Alignment geometry
     * @param {number} startMeasure Starting measure of the alignment
     * @returns {Object|null} Station, offset, and side information or null
     */
    static calculateStationOffset(point, geometry, startMeasure) {
        try {
            // Check geometry type
            if (geometry.type === 'LineString') {
                return this.calculateStationOffsetForLineString(point, geometry, startMeasure);
            } else if (geometry.type === 'CircularString') {
                return this.calculateStationOffsetForCircularString(point, geometry, startMeasure);
            } else {
                console.warn('Station/offset calculation for', geometry.type, 'not implemented');
                return null;
            }
        } catch (error) {
            console.error('Error calculating station/offset:', error);
            return null;
        }
    }
    
    /**
     * Calculate station and offset for a LineString alignment
     * @param {Object} point Point coordinates {x, y}
     * @param {Object} geometry LineString geometry
     * @param {number} startMeasure Starting measure
     * @returns {Object|null} Station, offset, and side information
     */
    static calculateStationOffsetForLineString(point, geometry, startMeasure) {
        const points = geometry.coordinates;
        if (points.length < 2) return null;
        
        let closestDistance = Infinity;
        let closestSegmentIndex = -1;
        let closestProjection = null;
        
        // Find closest segment
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            // Project point onto segment
            const projection = this.projectPointOnSegment(point, p1, p2);
            
            // Calculate distance to projection
            const distance = this.distanceBetweenPoints(point, projection);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestSegmentIndex = i;
                closestProjection = projection;
            }
        }
        
        if (closestSegmentIndex === -1) return null;
        
        // Calculate distance along alignment up to the closest segment
        let stationDistance = 0;
        for (let i = 0; i < closestSegmentIndex; i++) {
            stationDistance += this.distanceBetweenPoints(points[i], points[i + 1]);
        }
        
        // Add distance from the start of closest segment to projection
        stationDistance += this.distanceBetweenPoints(points[closestSegmentIndex], closestProjection);
        
        // Calculate station
        const station = startMeasure + stationDistance;
        
        // Calculate offset (distance from point to projection)
        const offset = this.distanceBetweenPoints(point, closestProjection);
        
        // Determine which side of the alignment the point is on
        const side = this.determineSideForLine(
            point, 
            closestProjection, 
            { geometry: [points[closestSegmentIndex], points[closestSegmentIndex + 1]] }
        );
        
        return {
            station,
            offset,
            side
        };
    }
    
    /**
     * Calculate station and offset for a CircularString alignment
     * @param {Object} point Point coordinates {x, y}
     * @param {Object} geometry CircularString geometry
     * @param {number} startMeasure Starting measure
     * @returns {Object|null} Station, offset, and side information
     */
    static calculateStationOffsetForCircularString(point, geometry, startMeasure) {
        const points = geometry.coordinates;
        if (points.length < 3) return null;
        
        // For circular alignment, we need center and radius
        const p1 = points[0];
        const pMid = points[1];
        const p2 = points[2];
        
        // Calculate center and radius
        const center = this.circleCenterFromThreePoints(p1, pMid, p2);
        const radius = this.distanceBetweenPoints(center, p1);
        
        // Calculate closest point on arc
        const closestPoint = this.closestPointOnArcToGivenPoint(center, radius, point);
        
        // Calculate curvature
        const curvature = this.calculateCurvature(p1, pMid, p2, center);
        
        // Calculate station
        const station = this.calculateStationOnArc(p1, p2, closestPoint, center, radius, curvature, startMeasure);
        
        // Calculate offset (distance from point to closest point, signed based on inside/outside)
        const distanceToCenter = this.distanceBetweenPoints(center, point);
        const offset = Math.abs(distanceToCenter - radius);
        
        // Determine which side of the alignment the point is on
        const side = this.determineSideForCircularString(center, radius, point, curvature);
        
        return {
            station,
            offset,
            side
        };
    }
    
    /**
     * Project a point onto a line segment
     * @param {Object} point The point {x, y}
     * @param {Object} p1 First point of segment {x, y}
     * @param {Object} p2 Second point of segment {x, y}
     * @returns {Object} Projected point {x, y}
     */
    static projectPointOnSegment(point, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len2 = dx * dx + dy * dy;
        
        if (len2 === 0) return p1; // Segment is actually a point
        
        // Calculate projection
        const t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / len2;
        
        // Constrain to segment
        if (t < 0) return p1;
        if (t > 1) return p2;
        
        return {
            x: p1.x + t * dx,
            y: p1.y + t * dy
        };
    }
}

// Export the utils
window.GeometryUtils = GeometryUtils;
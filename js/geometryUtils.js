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

        // Get segment direction vector
        const segStart = vertices[0];
        const segEnd = vertices[vertices.length - 1];
        const segVecX = segEnd.x - segStart.x;
        const segVecY = segEnd.y - segStart.y;

        // Compute cross product (z-component)
        const cross = segVecX * vecY - segVecY * vecX;

        if (Math.abs(cross) < 0.001) { // Small threshold for "on-line"
            return "on-line";
        } else if (cross > 0) {
            return "left";
        } else {
            return "right";
        }
    }
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeometryUtils;
}
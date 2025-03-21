class WKTParser {
    static parse(wktString) {
        // Preprocess WKT to handle NULL values
        wktString = wktString.replace(/\sNULL\s/gi, ' 0 ');
        
        const wktUpper = wktString.toUpperCase().trim();
        
        if (wktUpper.startsWith('COMPOUNDCURVE')) {
            return this.parseCompoundCurve(wktString);
        } else if (wktUpper.startsWith('CIRCULARSTRING')) {
            return this.parseCircularString(wktString);
        } else if (wktUpper.startsWith('LINESTRING')) {
            return this.parseLineString(wktString);
        } else {
            throw new Error('Unsupported WKT type');
        }
    }

    static parseCompoundCurve(wktString) {
        const segments = [];
        // Extract content between outer parentheses
        const content = wktString.substring(
            wktString.indexOf('(') + 1,
            wktString.lastIndexOf(')')
        );

        // Split segments while respecting nested parentheses
        const segmentTexts = this.splitPreservingParentheses(content);

        for (const segmentText of segmentTexts) {
            if (segmentText.toUpperCase().includes('CIRCULARSTRING')) {
                segments.push({
                    type: 'circular',
                    geometry: this.parseCircularString(segmentText)
                });
            } else {
                segments.push({
                    type: 'line',
                    geometry: this.parseLineString(segmentText)
                });
            }
        }

        return {
            type: 'compound',
            segments: segments
        };
    }

    static parseCircularString(wktString) {
        // Extract coordinates text
        let coordsText = wktString.substring(
            wktString.indexOf('(') + 1,
            wktString.lastIndexOf(')')
        );

        // Remove CIRCULARSTRING prefix if present
        coordsText = coordsText.replace(/CIRCULARSTRING\s*/i, '');

        // Split into points and parse
        const points = coordsText.split(',').map(point => {
            const values = point.trim().split(/\s+/);
            return {
                x: parseFloat(values[0]),
                y: parseFloat(values[1]),
                m: values.length >= 4 ? parseFloat(values[3]) : 
                   values.length >= 3 ? parseFloat(values[2]) : null
            };
        });

        return points;
    }

    static parseLineString(wktString) {
        // Extract coordinates text
        const coordsText = wktString.substring(
            wktString.indexOf('(') + 1,
            wktString.lastIndexOf(')')
        );

        // Split into points and parse
        const points = coordsText.split(',').map(point => {
            const values = point.trim().split(/\s+/);
            return {
                x: parseFloat(values[0]),
                y: parseFloat(values[1]),
                m: values.length >= 4 ? parseFloat(values[3]) : 
                   values.length >= 3 ? parseFloat(values[2]) : null
            };
        });

        return points;
    }

    static splitPreservingParentheses(text) {
        const segments = [];
        let currentSegment = '';
        let parenCount = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            
            if (char === '(') {
                parenCount++;
                currentSegment += char;
            } else if (char === ')') {
                parenCount--;
                currentSegment += char;
                
                if (parenCount === 0) {
                    segments.push(currentSegment.trim());
                    currentSegment = '';
                }
            } else if (char === ',' && parenCount === 0) {
                // Skip commas between segments
                continue;
            } else {
                currentSegment += char;
            }
        }

        // Add any remaining segment
        if (currentSegment.trim()) {
            segments.push(currentSegment.trim());
        }

        return segments;
    }

    static detectStartMeasure(wktString) {
        const wktUpper = wktString.toUpperCase().trim();
        
        // Try to extract measure from first coordinate
        let match;
        
        // Try X Y Z M format first
        match = wktString.match(/\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(?:NULL|-?\d+\.?\d*)\s+(-?\d+\.?\d*)/i);
        if (match) {
            return parseFloat(match[3]); // Return M value (4th component)
        }
        
        // Try X Y M format
        match = wktString.match(/\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/i);
        if (match) {
            return parseFloat(match[3]); // Return M value (3rd component)
        }
        
        return null;
    }
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WKTParser;
}
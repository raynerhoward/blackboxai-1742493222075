# Road Alignments Viewer

A web-based application for viewing, creating, and analyzing road alignments. This tool provides functionality for monitoring station/offset values along road alignments and creating buffers around alignment geometries.

## Features

- Add and manage multiple road alignments from WKT geometry
- Automatic extraction of start measures from WKT
- Real-time station/offset monitoring as you move your cursor over the map
- Interactive map display using OpenLayers
- Buffer generation around alignment geometries
- Support for both straight-line and curved alignments

## Installation

1. Clone this repository:
```
git clone <repository-url>
cd road-alignments-viewer
```

2. Install dependencies:
```
npm install
```

3. Start the development server:
```
npm start
```

4. Open your browser to http://localhost:8080

## Usage

### Adding an Alignment

1. Enter a WKT string representing a road alignment in the WKT input field
2. Click "Extract Start Measure" or enter a start measure manually
3. Enter a name for the alignment
4. Adjust the buffer distance if needed
5. Click "Add Alignment"

### Monitoring Station/Offset

1. Select an alignment from the dropdown list
2. Click "Start Monitoring"
3. Move your cursor over the map to see real-time station, offset, and side information

### Clearing Alignments

- Click "Clear All" to remove all alignments from the map

## WKT Format

The application supports the following WKT geometry types:
- `LINESTRING` - for straight road segments
- `CIRCULARSTRING` - for curved road segments

Example WKT formats:
```
LINESTRING(0 0, 100 0, 200 100)
CIRCULARSTRING(0 0, 50 50, 100 0)
```

## Development

This project uses:
- OpenLayers for map display
- Vanilla JavaScript for the core functionality
- Tailwind CSS for styling

The main components are:
- `js/main.js` - AlignmentViewer class that handles UI and user interaction
- `js/map.js` - AlignmentMap class that manages the OpenLayers map
- `js/geometryUtils.js` - Utility functions for geometric calculations
- `js/wktParser.js` - WKT parsing functionality

## License

MIT

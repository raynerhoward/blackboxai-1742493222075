import os, re, math
from qgis.core import (
    QgsProject,
    QgsFeature,
    QgsGeometry,
    QgsVectorLayer,
    QgsPointXY,
    QgsWkbTypes,
    QgsField,
    QgsFields,
    QgsCoordinateReferenceSystem
)
from qgis.PyQt.QtCore import QVariant
from qgis.gui import QgsMapTool, QgsMapCanvas, QgsRubberBand
from qgis.PyQt.QtWidgets import (
    QAction,
    QDockWidget,
    QWidget,
    QLabel,
    QVBoxLayout,
    QHBoxLayout,
    QPushButton,
    QLineEdit,
    QTextEdit,
    QMessageBox,
    QFormLayout,
    QComboBox,
    QGroupBox,
    QDialog
)
from qgis.PyQt.QtCore import Qt, QObject, pyqtSignal
from qgis.PyQt.QtGui import QColor
import numpy as np

class AlignmentSegment:
    def __init__(self, geometry, start_measure, end_measure, segment_type, buffer_distance=500):
        self.geometry = geometry
        self.start_measure = start_measure
        self.end_measure = end_measure
        self.segment_type = segment_type
        self.square_buffer = None
        self.center = None
        self.radius = None
        self.bufferDistance = buffer_distance  # Store buffer distance
        
        # For circular segments, calculate center and radius
        if segment_type == 'circular':
            vertices = geometry.asPolyline()
            if len(vertices) >= 3:
                p1, p_mid, p2 = vertices[0], vertices[1], vertices[2]
                self.center = self._circle_center_from_three_points(p1, p_mid, p2)
                self.radius = self._distance_between_points(self.center, p1)
    
    def calculate_square_buffer(self):
        if not self.geometry or self.geometry.isEmpty():
            print("WARNING: Cannot calculate buffer for empty geometry")
            return
            
        if self.segment_type == 'circular':
            # For circular strings, create a polygon with curved sides
            vertices = self.geometry.asPolyline()
            if len(vertices) < 3:
                print("WARNING: Circular segment has insufficient vertices")
                return
                
            # Get points defining the arc
            p1, p_mid, p2 = vertices[0], vertices[1], vertices[2]
            
            # Calculate center and radius if not already cached
            if not self.center or not self.radius:
                self.center = self._circle_center_from_three_points(p1, p_mid, p2)
                self.radius = self._distance_between_points(self.center, p1)
            
            # Use vectors to determine direction (clockwise or counterclockwise)
            # Vector from center to start point
            vec_center_to_start = [p1.x() - self.center.x(), p1.y() - self.center.y()]
            # Vector from center to mid point
            vec_center_to_mid = [p_mid.x() - self.center.x(), p_mid.y() - self.center.y()]
            # Vector from center to end point
            vec_center_to_end = [p2.x() - self.center.x(), p2.y() - self.center.y()]
            
            # Calculate cross products to determine rotational direction
            cross_start_mid = vec_center_to_start[0] * vec_center_to_mid[1] - vec_center_to_start[1] * vec_center_to_mid[0]
            cross_mid_end = vec_center_to_mid[0] * vec_center_to_end[1] - vec_center_to_mid[1] * vec_center_to_end[0]
            
            # If both cross products have the same sign, the direction is consistent
            if cross_start_mid * cross_mid_end > 0:
                is_clockwise = cross_start_mid < 0
            else:
                # If signs are different, use the larger magnitude to determine direction
                is_clockwise = abs(cross_start_mid) < abs(cross_mid_end) if cross_mid_end < 0 else abs(cross_start_mid) > abs(cross_mid_end)
            
            # Calculate angles for the three points (in radians)
            angle1 = math.atan2(p1.y() - self.center.y(), p1.x() - self.center.x())
            angle_mid = math.atan2(p_mid.y() - self.center.y(), p_mid.x() - self.center.x())
            angle2 = math.atan2(p2.y() - self.center.y(), p2.x() - self.center.x())
            
            # Normalize angles to [0, 2π]
            angle1 = (angle1 + 2 * math.pi) % (2 * math.pi)
            angle_mid = (angle_mid + 2 * math.pi) % (2 * math.pi)
            angle2 = (angle2 + 2 * math.pi) % (2 * math.pi)
            
            # Determine if midpoint is between start and end (considering direction)
            def is_between(a, mid, b, clockwise):
                if clockwise:
                    # For clockwise, we go from larger to smaller angles
                    if a > b:
                        return a >= mid >= b
                    else:  # We cross 0/2π boundary
                        return a >= mid or mid >= b
                else:
                    # For counterclockwise, we go from smaller to larger angles
                    if a < b:
                        return a <= mid <= b
                    else:  # We cross 0/2π boundary
                        return a <= mid or mid <= b
            
            mid_is_between = is_between(angle1, angle_mid, angle2, is_clockwise)
            
            # Calculate sweep angle based on direction and mid-point position
            if is_clockwise:
                if angle1 > angle2:
                    sweep_angle = angle1 - angle2
                else:
                    sweep_angle = angle1 + (2 * math.pi - angle2)
                    
                # If mid is not between, we need the complementary angle
                if not mid_is_between:
                    sweep_angle = 2 * math.pi - sweep_angle
            else:
                if angle2 > angle1:
                    sweep_angle = angle2 - angle1
                else:
                    sweep_angle = (2 * math.pi - angle1) + angle2
                    
                # If mid is not between, we need the complementary angle
                if not mid_is_between:
                    sweep_angle = 2 * math.pi - sweep_angle
            
            # Calculate the expected arc length based on the radius and sweep angle
            expected_arc_length = self.radius * sweep_angle
            
            # CRITICAL: Verify if our calculated sweep angle produces an arc with length matching
            # the difference between end_measure and start_measure
            actual_arc_length = self.end_measure - self.start_measure
            
            # If there's a significant mismatch, we need to adjust our sweep angle
            if abs(expected_arc_length - actual_arc_length) > 1:
                # Correct sweep angle based on actual arc length
                correct_sweep = actual_arc_length / self.radius
                
                # Set the correct end angle based on start angle and corrected sweep
                if is_clockwise:
                    angle2 = angle1 - correct_sweep
                else:
                    angle2 = angle1 + correct_sweep
                
                # Update the sweep angle
                sweep_angle = correct_sweep
            
            # Calculate outer and inner radius using the specified buffer distance
            outer_radius = self.radius + self.bufferDistance
            inner_radius = max(self.radius - self.bufferDistance, 0)  # Prevent negative radius
            
            # Generate more points for smoother curves, especially for large sweep angles
            num_points = max(50, int(math.degrees(sweep_angle) / 2))
            
            # Generate angles from start to end (respecting direction)
            if is_clockwise:
                t_values = np.linspace(angle1, angle1 - sweep_angle, num_points)
            else:
                t_values = np.linspace(angle1, angle1 + sweep_angle, num_points)
            
            # Generate points for both sides of the buffer
            outer_points = []
            inner_points = []
            
            # Create points for both sides
            for angle in t_values:
                # Ensure angle is within [0, 2π]
                normalized_angle = angle % (2 * math.pi)
                
                # Outer points (larger radius)
                outer_x = self.center.x() + outer_radius * math.cos(normalized_angle)
                outer_y = self.center.y() + outer_radius * math.sin(normalized_angle)
                outer_points.append(QgsPointXY(outer_x, outer_y))
                
                # Inner points (smaller radius)
                inner_x = self.center.x() + inner_radius * math.cos(normalized_angle)
                inner_y = self.center.y() + inner_radius * math.sin(normalized_angle)
                inner_points.append(QgsPointXY(inner_x, inner_y))
            
            # Create the complete buffer polygon
            buffer_points = outer_points.copy()
            buffer_points.append(inner_points[-1])
            buffer_points.extend(inner_points[-2::-1])
            buffer_points.append(outer_points[0])
            
            # Create buffer geometry
            self.square_buffer = QgsGeometry.fromPolygonXY([buffer_points])
            
        else:
            # Handle line segments
            vertices = self.geometry.asPolyline()
            if len(vertices) < 2:
                print("WARNING: Line segment has insufficient vertices")
                return
                
            # Get start and end points
            start_point = vertices[0]
            end_point = vertices[-1]
            
            # Calculate direction vector
            dx = end_point.x() - start_point.x()
            dy = end_point.y() - start_point.y()
            length = math.sqrt(dx*dx + dy*dy)
            if length == 0:
                print("WARNING: Line segment has zero length")
                return
                
            # Normalize direction vector
            dx = dx / length
            dy = dy / length
            
            # Calculate perpendicular vectors (both sides)
            perp1_x = -dy
            perp1_y = dx
            perp2_x = dy
            perp2_y = -dx
            
            # Use the specified buffer distance
            buffer_width = self.bufferDistance
            
            # Create buffer polygon points
            buffer_points = [
                QgsPointXY(start_point.x() + perp1_x * buffer_width, start_point.y() + perp1_y * buffer_width),
                QgsPointXY(start_point.x() + perp2_x * buffer_width, start_point.y() + perp2_y * buffer_width),
                QgsPointXY(end_point.x() + perp2_x * buffer_width, end_point.y() + perp2_y * buffer_width),
                QgsPointXY(end_point.x() + perp1_x * buffer_width, end_point.y() + perp1_y * buffer_width)
            ]
            
            # Create buffer geometry
            self.square_buffer = QgsGeometry.fromPolygonXY([buffer_points])
    
    def _circle_center_from_three_points(self, p1, p_mid, p2):
        x1, y1 = p1.x(), p1.y()
        x2, y2 = p_mid.x(), p_mid.y()
        x3, y3 = p2.x(), p2.y()
        
        mid_x1, mid_y1 = (x1 + x2) / 2, (y1 + y2) / 2
        mid_x2, mid_y2 = (x2 + x3) / 2, (y2 + y3) / 2
        
        if (y2 - y1) != 0:
            slope1 = -(x2 - x1) / (y2 - y1)
        else:
            slope1 = float('inf')
            
        if (y3 - y2) != 0:
            slope2 = -(x3 - x2) / (y3 - y2)
        else:
            slope2 = float('inf')
        
        if slope1 == float('inf'):
            cx = mid_x1
            cy = slope2 * (cx - mid_x2) + mid_y2
        elif slope2 == float('inf'):
            cx = mid_x2
            cy = slope1 * (cx - mid_x1) + mid_y1
        else:
            cx = (slope1 * mid_x1 - slope2 * mid_x2 + mid_y2 - mid_y1) / (slope1 - slope2)
            cy = slope1 * (cx - mid_x1) + mid_y1
            
        return QgsPointXY(cx, cy)
        
    def _distance_between_points(self, p1, p2):
        return math.sqrt((p1.x() - p2.x()) ** 2 + (p1.y() - p2.y()) ** 2)

# Map tool for real-time mouse monitoring, panning, and station/offset calculations
class AlignmentMapTool(QgsMapTool):
    # Define signals as class attributes
    updateInfo = pyqtSignal(float, float, str)
    createPoint = pyqtSignal(QgsPointXY, float, float, str, str, float)
    outOfBounds = pyqtSignal()
    
    def __init__(self, canvas, iface, alignmentGeom=None, startMeasure=0.0, alignmentName="", bufferDistance=500):
        # Initialize QgsMapTool with canvas
        super().__init__(canvas)
        
        self.canvas = canvas
        self.iface = iface
        self.alignmentGeom = alignmentGeom
        self.startMeasure = startMeasure
        self.alignmentName = alignmentName
        self.dragging = False
        self.dragged = False
        self.lastPoint = None
        self.segments = []
        self.bufferDistance = bufferDistance
        # Store the WKT string to detect geometry type
        self.wktString = None if alignmentGeom is None else alignmentGeom.asWkt()
        # Flag to indicate if the geometry is a circular string
        self.isCircularString = False if self.wktString is None else "CIRCULARSTRING" in self.wktString.upper()
        # Set cursor to crosshair
        self.setCursor(Qt.CrossCursor)
        # Cache for buffer containment checks
        self.last_point = None
        self.last_containing_segment = None
        self.last_closest_point = None
        
    def setAlignment(self, alignmentGeom, startMeasure, alignmentName, bufferDistance):
        print(f"DEBUG: Setting alignment {alignmentName} with start measure {startMeasure}")
        self.alignmentGeom = alignmentGeom
        self.startMeasure = startMeasure
        self.alignmentName = alignmentName
        self.wktString = None if alignmentGeom is None else alignmentGeom.asWkt()
        self.isCircularString = False if self.wktString is None else "CIRCULARSTRING" in self.wktString.upper()
        self.bufferDistance = bufferDistance
        
        # Initialize segments
        self.segments = []
        if self.wktString:
            print("DEBUG: Parsing alignment segments")
            self._parseAlignmentSegments()

    def _parseAlignmentSegments(self):
        print("DEBUG: Starting to parse alignment segments")
        if not self.wktString:
            print("DEBUG: No WKT string available")
            return
            
        print(f"DEBUG: WKT string: {self.wktString}")
        # Parse the WKT string to extract individual segments
        if "COMPOUNDCURVE" in self.wktString.upper():
            print("DEBUG: Processing COMPOUNDCURVE")
            # Extract segments from COMPOUNDCURVE
            segments_text = self.wktString[self.wktString.find("(")+1:self.wktString.rfind(")")]
            current_measure = self.startMeasure
            
            # Split segments by commas, but not within parentheses
            segment_texts = []
            current_segment = ""
            paren_count = 0
            
            for char in segments_text:
                if char == '(':
                    paren_count += 1
                    current_segment += char
                elif char == ')':
                    paren_count -= 1
                    current_segment += char
                    if paren_count == 0:
                        # End of a segment, add it to our list
                        segment_texts.append(current_segment.strip())
                        current_segment = ""
                elif char == ',' and paren_count == 0:
                    # Skip commas between segments
                    continue
                else:
                    current_segment += char
                    
            print(f"DEBUG: Found {len(segment_texts)} top-level segments")
            for i, segment_text in enumerate(segment_texts):
                print(f"DEBUG: Processing top-level segment {i}: {segment_text}")
                try:
                    # Determine segment type
                    if "CIRCULARSTRING" in segment_text.upper():
                        print("DEBUG: Found CIRCULARSTRING segment")
                        # Extract coordinates from the segment text
                        coords_text = segment_text[segment_text.find("(")+1:segment_text.rfind(")")]
                        
                        # Remove any CIRCULARSTRING prefix from the coordinates
                        coords_text = re.sub(r'CIRCULARSTRING\s*', '', coords_text, flags=re.IGNORECASE)
                        coords_text = re.sub(r'^\s*\(\s*', '', coords_text)
                        coords_text = re.sub(r'\s*\)\s*$', '', coords_text)
                        print(f"DEBUG: Extracted coords_text: {coords_text}")
                        
                        # Split into individual points, handling NULL values
                        points = []
                        for point in coords_text.split(','):
                            values = point.strip().split()
                            # Replace NULL with 0 for Z coordinate
                            if len(values) >= 3 and values[2].upper() == 'NULL':
                                values[2] = '0'
                            points.append(' '.join(values))
                        
                        num_points = len(points)
                        print(f"DEBUG: Found {num_points} points in CIRCULARSTRING")
                        
                        # Handle CIRCULARSTRING with more than 3 points
                        if num_points > 3:
                            print(f"DEBUG: CIRCULARSTRING has {num_points} points, breaking into circular arcs")
                            
                            # Process each consecutive 3-point arc
                            for j in range(0, num_points - 2, 2):
                                # Every 2 points form a new arc (with overlap)
                                three_points = points[j:j+3]
                                print(f"DEBUG: Processing circular arc {j//2 + 1} with points {j}, {j+1}, {j+2}")
                                
                                # Create geometry for this arc
                                arc_coords_text = ", ".join(three_points)
                                arc_geom = QgsGeometry.fromWkt(f"CIRCULARSTRING({arc_coords_text})")
                                
                                if arc_geom and not arc_geom.isEmpty():
                                    # Extract start and end measures
                                    start_point = three_points[0]
                                    end_point = three_points[2]
                                    start_values = start_point.split()
                                    end_values = end_point.split()
                                    
                                    # Extract measures (4th value if it exists, otherwise 3rd value)
                                    start_measure = current_measure
                                    end_measure = float(end_values[3]) if len(end_values) >= 4 else float(end_values[2])
                                    
                                    print(f"DEBUG: Circular arc {j//2 + 1} - Start: {start_measure}, End: {end_measure}")
                                    
                                    # Create segment and calculate buffer
                                    segment = AlignmentSegment(arc_geom, start_measure, end_measure, 'circular', self.bufferDistance)
                                    segment.calculate_square_buffer()
                                    self.segments.append(segment)
                                    
                                    # Update current measure for next segment
                                    current_measure = end_measure
                        else:
                            # Standard 3-point CIRCULARSTRING
                            arc_geom = QgsGeometry.fromWkt(f"CIRCULARSTRING({', '.join(points)})")
                            
                            if arc_geom and not arc_geom.isEmpty():
                                # Extract start and end measures
                                start_point = points[0]
                                end_point = points[-1]
                                start_values = start_point.split()
                                end_values = end_point.split()
                                
                                # Extract measures (4th value if it exists, otherwise 3rd value)
                                start_measure = current_measure
                                end_measure = float(end_values[3]) if len(end_values) >= 4 else float(end_values[2])
                                
                                print(f"DEBUG: Single circular arc - Start: {start_measure}, End: {end_measure}")
                                
                                # Create segment and calculate buffer
                                segment = AlignmentSegment(arc_geom, start_measure, end_measure, 'circular', self.bufferDistance)
                                segment.calculate_square_buffer()
                                self.segments.append(segment)
                                
                                # Update current measure for next segment
                                current_measure = end_measure
                    else:
                        # Handle regular (non-CIRCULARSTRING) segments
                        # Extract coordinates from the segment text
                        coords_text = segment_text[segment_text.find("(")+1:segment_text.rfind(")")]
                        
                        # Split into individual points
                        point_texts = coords_text.split(',')
                        
                        # Process each pair of consecutive points as a separate line segment
                        for j in range(len(point_texts) - 1):
                            # Get current and next point
                            current_point = point_texts[j].strip()
                            next_point = point_texts[j + 1].strip()
                            
                            # Handle NULL values in coordinates
                            current_values = current_point.split()
                            next_values = next_point.split()
                            
                            # Replace NULL with 0 for Z coordinate
                            if len(current_values) >= 3 and current_values[2].upper() == 'NULL':
                                current_values[2] = '0'
                            if len(next_values) >= 3 and next_values[2].upper() == 'NULL':
                                next_values[2] = '0'
                            
                            # Create points array for this segment
                            points = [' '.join(current_values), ' '.join(next_values)]
                            
                            print(f"DEBUG: Creating line segment from {points[0]} to {points[1]}")
                            
                            # Create line segment geometry
                            geom = QgsGeometry.fromWkt(f"LINESTRING({', '.join(points)})")
                            if geom and not geom.isEmpty():
                                # Get end measure from the next point
                                end_measure = float(next_values[3]) if len(next_values) >= 4 else float(next_values[2])
                                
                                # Create segment and calculate buffer
                                segment = AlignmentSegment(geom, current_measure, end_measure, 'line', self.bufferDistance)
                                segment.calculate_square_buffer()
                                self.segments.append(segment)
                                print(f"DEBUG: Added line segment with start measure {current_measure} and end measure {end_measure}")
                                
                                # Update current measure for next segment
                                current_measure = end_measure
                except Exception as e:
                    print(f"WARNING: Error processing segment: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    continue
        else:
            print("DEBUG: Processing single segment")
            # Handle single segment (LINESTRING or CIRCULARSTRING)
            try:
                if "CIRCULARSTRING" in self.wktString.upper():
                    print("DEBUG: Single CIRCULARSTRING segment")
                    segment_type = 'circular'
                    
                    # Extract coordinates and handle NULL values
                    coords_text = self.wktString[self.wktString.find("(")+1:self.wktString.rfind(")")]
                    points = []
                    for point in coords_text.split(','):
                        values = point.strip().split()
                        # Replace NULL with 0 for Z coordinate
                        if len(values) >= 3 and values[2].upper() == 'NULL':
                            values[2] = '0'
                        points.append(' '.join(values))
                    
                    num_points = len(points)
                    
                    # Handle CIRCULARSTRING with more than 3 points
                    if num_points > 3:
                        print(f"DEBUG: CIRCULARSTRING has {num_points} points, breaking into circular arcs")
                        current_measure = self.startMeasure
                        
                        # Process each consecutive 3-point arc
                        for j in range(0, num_points - 2, 2):
                            # Every 2 points form a new arc (with overlap)
                            three_points = points[j:j+3]
                            print(f"DEBUG: Processing circular arc {j//2 + 1} with points {j}, {j+1}, {j+2}")
                            
                            # Create geometry for this arc
                            arc_coords_text = ", ".join(three_points)
                            arc_geom = QgsGeometry.fromWkt(f"CIRCULARSTRING({arc_coords_text})")
                            
                            if arc_geom and not arc_geom.isEmpty():
                                # Extract start and end measures
                                start_point = three_points[0]
                                end_point = three_points[2]
                                start_values = start_point.split()
                                end_values = end_point.split()
                                
                                # Extract measures (4th value if it exists, otherwise 3rd value)
                                start_measure = current_measure
                                end_measure = float(end_values[3]) if len(end_values) >= 4 else float(end_values[2])
                                
                                print(f"DEBUG: Circular arc {j//2 + 1} - Start: {start_measure}, End: {end_measure}")
                                
                                # Create segment and calculate buffer
                                segment = AlignmentSegment(arc_geom, start_measure, end_measure, 'circular', self.bufferDistance)
                                segment.calculate_square_buffer()
                                self.segments.append(segment)
                                
                                # Update current measure for next segment
                                current_measure = end_measure
                    else:
                        # Standard 3-point CIRCULARSTRING
                        if self.alignmentGeom and not self.alignmentGeom.isEmpty():
                            # Create segment and calculate buffer
                            segment = AlignmentSegment(self.alignmentGeom, self.startMeasure, 
                                                     self.startMeasure + self.alignmentGeom.length(), segment_type,
                                                     self.bufferDistance)
                            segment.calculate_square_buffer()
                            self.segments.append(segment)
                            print(f"DEBUG: Added single segment of type {segment_type}")
                else:
                    # Handle single LINESTRING
                    segment_type = 'line'
                    if self.alignmentGeom and not self.alignmentGeom.isEmpty():
                        # Create segment and calculate buffer
                        segment = AlignmentSegment(self.alignmentGeom, self.startMeasure, 
                                                 self.startMeasure + self.alignmentGeom.length(), segment_type,
                                                 self.bufferDistance)
                        segment.calculate_square_buffer()
                        self.segments.append(segment)
                        print(f"DEBUG: Added single segment of type {segment_type}")
            except Exception as e:
                print(f"WARNING: Error processing single segment: {str(e)}")
                import traceback
                traceback.print_exc()
                
        print(f"DEBUG: Total segments created: {len(self.segments)}")
        for i, segment in enumerate(self.segments):
            print(f"DEBUG: Segment {i}: type={segment.segment_type}, start={segment.start_measure}, end={segment.end_measure}")
            print(f"DEBUG: Segment {i} buffer valid: {not segment.square_buffer.isEmpty() if segment.square_buffer else False}")

    def deactivate(self):
        # Clean up when the tool is deactivated
        super().deactivate()
        
    def _distance_between_points(self, p1, p2):
        return math.sqrt((p1.x() - p2.x()) ** 2 + (p1.y() - p2.y()) ** 2)
        
    def _circle_center_from_three_points(self, p1, p_mid, p2):
        x1, y1 = p1.x(), p1.y()
        x2, y2 = p_mid.x(), p_mid.y()
        x3, y3 = p2.x(), p2.y()
        
        mid_x1, mid_y1 = (x1 + x2) / 2, (y1 + y2) / 2
        mid_x2, mid_y2 = (x2 + x3) / 2, (y2 + y3) / 2
        
        if (y2 - y1) != 0:
            slope1 = -(x2 - x1) / (y2 - y1)
        else:
            slope1 = float('inf')
            
        if (y3 - y2) != 0:
            slope2 = -(x3 - x2) / (y3 - y2)
        else:
            slope2 = float('inf')
        
        if slope1 == float('inf'):
            cx = mid_x1
            cy = slope2 * (cx - mid_x2) + mid_y2
        elif slope2 == float('inf'):
            cx = mid_x2
            cy = slope1 * (cx - mid_x1) + mid_y1
        else:
            cx = (slope1 * mid_x1 - slope2 * mid_x2 + mid_y2 - mid_y1) / (slope1 - slope2)
            cy = slope1 * (cx - mid_x1) + mid_y1
            
        return QgsPointXY(cx, cy)
        
    def _closest_point_on_arc_to_given_point(self, center, radius, given_point):
        cx, cy = center.x(), center.y()
        gx, gy = given_point.x(), given_point.y()
        
        vector_x = gx - cx
        vector_y = gy - cy
        distance = math.sqrt(vector_x ** 2 + vector_y ** 2)
        
        if distance == 0:
            # If given point is exactly at the center, return point on circle at 0 angle
            return QgsPointXY(cx + radius, cy)
            
        closest_x = cx + (vector_x / distance) * radius
        closest_y = cy + (vector_y / distance) * radius
        
        return QgsPointXY(closest_x, closest_y)
        
    def _determine_side_for_circular_string(self, center, radius, given_point, curvature):
        cx, cy = center.x(), center.y()
        gx, gy = given_point.x(), given_point.y()
        
        distance_to_center = math.sqrt((gx - cx) ** 2 + (gy - cy) ** 2)
        
        # Determine direction based on curvature
        # Positive curvature means clockwise, negative means counterclockwise
        direction = 1 if curvature > 0 else -1
        
        # Calculate signed offset
        signed_offset = direction * (distance_to_center - radius)
        
        if abs(signed_offset) < 0.001:  # Small threshold for "on-line"
            return "on-line"
        elif signed_offset > 0:
            return "left"
        else:
            return "right"
            
    def _calculate_curvature(self, p1, p_mid, p2, center):
        # Calculate vectors from center to points
        vec1 = [p1.x() - center.x(), p1.y() - center.y()]
        vec2 = [p2.x() - center.x(), p2.y() - center.y()]
        
        # Calculate cross product to determine direction
        cross = vec1[0]*vec2[1] - vec1[1]*vec2[0]
        
        # Calculate angles for start and end points
        angle_start = math.atan2(p1.y() - center.y(), p1.x() - center.x())
        angle_end = math.atan2(p2.y() - center.y(), p2.x() - center.x())
        
        # Calculate sweep angle
        delta_angle = math.atan2(math.sin(angle_end - angle_start), math.cos(angle_end - angle_start))
        
        # Calculate curvature value in degrees
        curvature_val = math.degrees(abs(delta_angle))
        
        # Determine sign based on cross product
        # If cross > 0, arc is counterclockwise (negative curvature)
        # If cross < 0, arc is clockwise (positive curvature)
        return -curvature_val if cross > 0 else curvature_val
        
    def _calculate_station_on_arc(self, p1, p2, closest_point, center, radius, curvature, start_measure):
        # Check if closest point coincides with start or end
        if self._distance_between_points(p1, closest_point) < 0.001:
            return start_measure
            
        # Calculate angles in radians
        start_angle = math.atan2(p1.y() - center.y(), p1.x() - center.x())
        closest_angle = math.atan2(closest_point.y() - center.y(), closest_point.x() - center.x())
        
        # Calculate arc length from start to closest point
        angle_diff = closest_angle - start_angle
        
        # Normalize angle difference based on curvature direction
        if curvature > 0:  # Clockwise arc
            if angle_diff > 0:
                angle_diff = angle_diff - 2 * math.pi
        else:  # Counterclockwise arc
            if angle_diff < 0:
                angle_diff = angle_diff + 2 * math.pi
                
        # Calculate arc length
        arc_length = radius * abs(angle_diff)
        
        # Calculate station
        station = start_measure + arc_length
        
        return station

    def _determineSide(self, pt: QgsPointXY, proj: QgsPointXY, segment):
        """Determine on which side (left/right) the point pt lies relative to the segment"""
        if not segment or not segment.geometry:
            return "undefined"
            
        # Get the segment's direction vector
        vertices = segment.geometry.asPolyline()
        if len(vertices) < 2:
            return "undefined"
            
        # Create vector from projection to point
        vecX = pt.x() - proj.x()
        vecY = pt.y() - proj.y()
        
        # Get segment direction vector
        segStart = vertices[0]
        segEnd = vertices[-1]
        segVecX = segEnd.x() - segStart.x()
        segVecY = segEnd.y() - segStart.y()
        
        # Compute cross product (z-component)
        cross = segVecX * vecY - segVecY * vecX
        
        if abs(cross) < 0.001:  # Small threshold for "on-line"
            return "on-line"
        elif cross > 0:
            return "left"
        else:
            return "right"

    def _isPointInBuffers(self, point):
        """Check if a point is within any segment buffer, with caching for performance"""
        # If this is the same point as last time, return cached result
        if (self.last_point and 
            abs(point.x() - self.last_point.x()) < 0.0001 and 
            abs(point.y() - self.last_point.y()) < 0.0001):
            return (self.last_containing_segment, self.last_closest_point)
            
        # Reset cache
        self.last_point = point
        self.last_containing_segment = None
        self.last_closest_point = None
        
        # Track the closest segment and its distance
        min_offset = float('inf')
        closest_segment = None
        closest_proj_point = None
        
        # Check each segment's buffer
        for segment in self.segments:
            if not segment.square_buffer:
                continue
                
            if segment.square_buffer.contains(QgsGeometry.fromPointXY(point)):
                # For contained points, find the closest point on the segment
                if segment.segment_type == 'circular':
                    proj_point = self._closest_point_on_arc_to_given_point(
                        segment.center, segment.radius, point)
                else:
                    # For line segments
                    projGeom = QgsGeometry.fromPointXY(point)
                    alongDistance = segment.geometry.lineLocatePoint(projGeom)
                    proj_point = segment.geometry.interpolate(alongDistance).asPoint()
                
                # Calculate offset distance
                offset = self._distance_between_points(proj_point, point)
                
                # Update if this is the closest segment so far
                if offset < min_offset:
                    min_offset = offset
                    closest_segment = segment
                    closest_proj_point = proj_point
        
        # Cache and return the results for the closest segment
        if closest_segment:
            self.last_containing_segment = closest_segment
            self.last_closest_point = closest_proj_point
            return (closest_segment, closest_proj_point)
                
        return (None, None)

    def canvasMoveEvent(self, event):
        # Get mouse point from the event in map coordinates
        mousePoint = self.toMapCoordinates(event.pos())
        qPoint = QgsPointXY(mousePoint)
        
        # Handle panning when dragging
        if self.dragging:
            currentPos = self.toMapCoordinates(event.pos())
            if self.lastPoint and (abs(self.lastPoint.x() - currentPos.x()) > 3 or abs(self.lastPoint.y() - currentPos.y()) > 3):
                self.dragged = True
            self.panMapByMouseEvent(event)
            return
            
        # Check that alignment geometry is valid
        if self.alignmentGeom is None or self.alignmentGeom.isEmpty():
            self.outOfBounds.emit()
            return
            
        # Check if point is within any buffer
        containing_segment, closest_point = self._isPointInBuffers(qPoint)
        
        if not containing_segment:
            self.outOfBounds.emit()
            return
            
        try:
            # Handle circular strings differently
            if containing_segment.segment_type == 'circular':
                # Use cached center and radius from segment
                center = containing_segment.center
                radius = containing_segment.radius
                
                # Calculate curvature if not cached
                if not hasattr(containing_segment, 'cached_curvature'):
                    vertices = containing_segment.geometry.asPolyline()
                    p1, p_mid, p2 = vertices[0], vertices[1], vertices[2]
                    containing_segment.cached_curvature = self._calculate_curvature(p1, p_mid, p2, center)
                
                # Calculate station using the improved method
                station = self._calculate_station_on_arc(
                    containing_segment.geometry.asPolyline()[0],
                    containing_segment.geometry.asPolyline()[-1],
                    closest_point, center, radius,
                    containing_segment.cached_curvature,
                    containing_segment.start_measure)
                
                # Calculate offset
                offset = self._distance_between_points(closest_point, qPoint)
                
                # Determine side
                side = self._determine_side_for_circular_string(center, radius, qPoint, containing_segment.cached_curvature)
            else:
                # For linestrings
                projGeom = QgsGeometry.fromPointXY(closest_point)
                alongDistance = containing_segment.geometry.lineLocatePoint(projGeom)
                
                station = containing_segment.start_measure + alongDistance
                offset = self._distance_between_points(closest_point, qPoint)
                side = self._determineSide(qPoint, closest_point, containing_segment)
            
            # Emit the update signal with station, offset and side
            self.updateInfo.emit(station, offset, side)
            
        except Exception as e:
            print(f"Error in canvasMoveEvent: {str(e)}")
            import traceback
            traceback.print_exc()
            self.outOfBounds.emit()
            return

    def canvasPressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.dragging = True
            self.dragged = False  # Flag to track if actual dragging occurred
            self.lastPoint = self.toMapCoordinates(event.pos())

    def canvasReleaseEvent(self, event):
        if event.button() == Qt.LeftButton:
            # Only create a point if it was a click (not a drag)
            if not self.dragged:
                # Get the current mouse position
                mousePoint = self.toMapCoordinates(event.pos())
                qPoint = QgsPointXY(mousePoint)
                
                # Check that alignment geometry is valid
                if self.alignmentGeom is None or self.alignmentGeom.isEmpty():
                    self.dragging = False
                    self.dragged = False
                    return
                
                # Check if point is within any buffer
                containing_segment, closest_point = self._isPointInBuffers(qPoint)
                
                if not containing_segment:
                    self.dragging = False
                    self.dragged = False
                    return
                
                try:
                    # Handle circular strings differently
                    if containing_segment.segment_type == 'circular':
                        # Use cached values from segment
                        center = containing_segment.center
                        radius = containing_segment.radius
                        
                        # Calculate curvature if not cached
                        if not hasattr(containing_segment, 'cached_curvature'):
                            vertices = containing_segment.geometry.asPolyline()
                            p1, p_mid, p2 = vertices[0], vertices[1], vertices[2]
                            containing_segment.cached_curvature = self._calculate_curvature(p1, p_mid, p2, center)
                        
                        # Calculate station using the improved method
                        station = self._calculate_station_on_arc(
                            containing_segment.geometry.asPolyline()[0],
                            containing_segment.geometry.asPolyline()[-1],
                            closest_point, center, radius,
                            containing_segment.cached_curvature,
                            containing_segment.start_measure)
                        
                        # Calculate offset
                        offset = self._distance_between_points(closest_point, qPoint)
                        
                        # Determine side
                        side = self._determine_side_for_circular_string(center, radius, qPoint, containing_segment.cached_curvature)
                    else:
                        # For linestrings
                        projGeom = QgsGeometry.fromPointXY(closest_point)
                        alongDistance = containing_segment.geometry.lineLocatePoint(projGeom)
                        
                        station = containing_segment.start_measure + alongDistance
                        offset = self._distance_between_points(closest_point, qPoint)
                        side = self._determineSide(qPoint, closest_point, containing_segment)
                    
                    # Emit signal to create a point at this position with attributes
                    self.createPoint.emit(qPoint, station, offset, side, self.alignmentName, self.startMeasure)
                except Exception as e:
                    print(f"Error in canvasReleaseEvent: {str(e)}")
                    import traceback
                    traceback.print_exc()
            
            # Reset flags
            self.dragging = False
            self.dragged = False

    def panMapByMouseEvent(self, event):
        # Calculate the new position
        newPos = self.toMapCoordinates(event.pos())
        
        # Calculate how much the map should be moved
        dx = self.lastPoint.x() - newPos.x()
        dy = self.lastPoint.y() - newPos.y()
        
        # Get current center and calculate new center
        currentCenter = self.canvas.center()
        newCenter = QgsPointXY(currentCenter.x() + dx, currentCenter.y() + dy)
        
        # Set the new center
        self.canvas.setCenter(newCenter)
        self.canvas.refresh()
        
        # Update the last point
        self.lastPoint = self.toMapCoordinates(event.pos())

    def _validate_station(self, p1, p2, closest_point, center, radius, curvature, station, offset, side):
        """Validate that the calculated station makes sense for the given arc and closest point"""
        try:
            # Check if station is within the expected range
            if station < self.startMeasure:
                print(f"WARNING: Calculated station {station} is less than start measure {self.startMeasure}")
                return False
                
            # Calculate the arc length from measures
            arc_length = self.alignmentGeom.length()
            
            if station > self.startMeasure + arc_length:
                print(f"WARNING: Calculated station {station} exceeds end measure {self.startMeasure + arc_length}")
                return False
                
            # Verify that the closest point is actually on the arc
            angle_closest = math.atan2(closest_point.y() - center.y(), closest_point.x() - center.x())
            angle_p1 = math.atan2(p1.y() - center.y(), p1.x() - center.x())
            angle_p2 = math.atan2(p2.y() - center.y(), p2.x() - center.x())
            
            # Normalize angles
            angle_closest = (angle_closest + 2 * math.pi) % (2 * math.pi)
            angle_p1 = (angle_p1 + 2 * math.pi) % (2 * math.pi)
            angle_p2 = (angle_p2 + 2 * math.pi) % (2 * math.pi)
            
            # Check if the closest angle is in the arc range
            is_clockwise = curvature > 0
            
            if is_clockwise:
                if angle_p1 > angle_p2:
                    in_range = angle_p1 >= angle_closest >= angle_p2
                else:
                    in_range = angle_p1 >= angle_closest or angle_closest >= angle_p2
            else:
                if angle_p1 < angle_p2:
                    in_range = angle_p1 <= angle_closest <= angle_p2
                else:
                    in_range = angle_p1 <= angle_closest or angle_closest <= angle_p2
                    
            if not in_range:
                print(f"WARNING: Closest point angle {math.degrees(angle_closest):.2f}° is outside the arc range")
                return False
                
            # All validations passed
            return True
            
        except Exception as e:
            print(f"ERROR in _validate_station: {str(e)}")
            return False

# The main plugin class
class AlignmentViewerPlugin:
    def __init__(self, iface):
        self.iface = iface
        self.canvas = iface.mapCanvas()
        self.pluginDir = os.path.dirname(__file__)
        self.action = None
        self.dockWidget = None
        self.mapTool = None
        self.alignmentLayer = None
        self.pointLayer = None
        self.bufferLayer = None  # Add buffer layer
        self.previousMapTool = None
        # Store alignments
        self.alignments = []  # List of (name, geometry, startMeasure) tuples
        self.currentAlignmentIndex = -1
        self.activeAlignment = None  # Initialize activeAlignment attribute

    def initGui(self):
        self.action = QAction("Alignment Viewer", self.iface.mainWindow())
        self.action.triggered.connect(self.showPluginDialog)
        self.iface.addToolBarIcon(self.action)
        self.iface.addPluginToMenu("&Alignment Viewer", self.action)
        # Create a dock widget acting as the main UI panel
        self.createDockWidget()
        
        # Apply styles to existing layers if any
        if self.alignmentLayer:
            self._applyLayerStyles(self.alignmentLayer)

    def unload(self):
        # Stop monitoring if active
        if hasattr(self, 'monitorButton') and self.monitorButton and self.monitorButton.isChecked():
            self.monitorButton.setChecked(False)
            
        # Disconnect any remaining signals from the map tool
        if hasattr(self, 'mapTool') and self.mapTool:
            try:
                self.mapTool.updateInfo.disconnect()
                self.mapTool.createPoint.disconnect()
                self.mapTool.outOfBounds.disconnect()
            except:
                pass
            self.mapTool = None
            
        # Remove menu and toolbar items
        self.iface.removePluginMenu("&Alignment Viewer", self.action)
        self.iface.removeToolBarIcon(self.action)
        
        # Remove dock widget if it exists
        if hasattr(self, 'dockWidget') and self.dockWidget:
            self.iface.removeDockWidget(self.dockWidget)
            self.dockWidget.deleteLater()
            self.dockWidget = None
            
        # Clear alignments list
        if hasattr(self, 'alignments'):
            self.alignments = []
            
        # Reset current alignment index
        if hasattr(self, 'currentAlignmentIndex'):
            self.currentAlignmentIndex = -1
            
        # Safely remove layers
        project = QgsProject.instance()
        
        # Function to safely remove a layer
        def safe_remove_layer(layer_attr):
            if hasattr(self, layer_attr):
                layer = getattr(self, layer_attr)
                if layer:
                    try:
                        if project.mapLayers().get(layer.id()):
                            project.removeMapLayer(layer.id())
                    except:
                        pass
                setattr(self, layer_attr, None)
        
        # Remove each layer safely
        safe_remove_layer('alignmentLayer')
        safe_remove_layer('pointLayer')
        safe_remove_layer('bufferLayer')
        
        # Clean up any remaining references
        self.canvas = None
        self.iface = None

    def createDockWidget(self):
        self.dockWidget = QDockWidget("Alignment Viewer", self.iface.mainWindow())
        self.dockWidget.setObjectName("AlignmentViewerDock")
        mainWidget = QWidget()
        layout = QVBoxLayout()
        
        # Create input form for WKT, start measure and alignment name
        formGroupBox = QGroupBox("Alignment Input")
        formLayout = QFormLayout()
        
        self.wktInput = QTextEdit()
        self.wktInput.setPlaceholderText("Enter WKT for the horizontal road alignment...")
        formLayout.addRow("Alignment WKT:", self.wktInput)
        
        startMeasureLayout = QHBoxLayout()
        self.startMeasureInput = QLineEdit()
        self.startMeasureInput.setPlaceholderText("Auto-detected from WKT or enter manually")
        startMeasureLayout.addWidget(self.startMeasureInput)
        self.extractStationButton = QPushButton("Extract")
        self.extractStationButton.clicked.connect(self.extractStartMeasure)
        startMeasureLayout.addWidget(self.extractStationButton)
        formLayout.addRow("Start Measure:", startMeasureLayout)
        
        self.alignmentNameInput = QLineEdit()
        self.alignmentNameInput.setPlaceholderText("Enter road alignment name")
        formLayout.addRow("Alignment Name:", self.alignmentNameInput)
        
        # Add buffer distance input with default value
        self.bufferDistanceInput = QLineEdit()
        self.bufferDistanceInput.setText("500")  # Set default value
        self.bufferDistanceInput.setPlaceholderText("Enter buffer distance (1-10000)")
        formLayout.addRow("Buffer Distance:", self.bufferDistanceInput)
        
        formGroupBox.setLayout(formLayout)
        layout.addWidget(formGroupBox)
        
        # Buttons for alignment management
        buttonLayout = QHBoxLayout()
        self.loadButton = QPushButton("Add Alignment")
        self.loadButton.clicked.connect(self.addAlignment)
        buttonLayout.addWidget(self.loadButton)
        
        self.clearButton = QPushButton("Clear All")
        self.clearButton.clicked.connect(self.clearAllAlignments)
        buttonLayout.addWidget(self.clearButton)
        
        # Add a button to reload styles
        self.reloadStylesButton = QPushButton("Reload Styles")
        self.reloadStylesButton.clicked.connect(self.reloadStyles)
        buttonLayout.addWidget(self.reloadStylesButton)
        
        layout.addLayout(buttonLayout)
        
        # Alignment selection combo box (for multiple alignments)
        selectGroupBox = QGroupBox("Select Active Alignment")
        selectLayout = QVBoxLayout()
        self.alignmentComboBox = QComboBox()
        self.alignmentComboBox.currentIndexChanged.connect(self.onAlignmentSelectionChanged)
        selectLayout.addWidget(self.alignmentComboBox)
        selectGroupBox.setLayout(selectLayout)
        layout.addWidget(selectGroupBox)
        
        # Panel to show station, offset and side
        monitorGroupBox = QGroupBox("Station-Offset Monitoring")
        monitorLayout = QVBoxLayout()
        self.stationLabel = QLabel("Station: N/A")
        self.offsetLabel = QLabel("Offset: N/A")
        self.sideLabel = QLabel("Side: N/A")
        monitorLayout.addWidget(self.stationLabel)
        monitorLayout.addWidget(self.offsetLabel)
        monitorLayout.addWidget(self.sideLabel)
        
        # Button to start/stop monitoring mouse movement
        self.monitorButton = QPushButton("Start Monitoring")
        self.monitorButton.setCheckable(True)
        self.monitorButton.toggled.connect(self.toggleMonitoring)
        monitorLayout.addWidget(self.monitorButton)
        
        # Add button for station/offset point creation
        self.createPointButton = QPushButton("Create Point by Station/Offset")
        self.createPointButton.clicked.connect(self.createPointDialog)
        monitorLayout.addWidget(self.createPointButton)
        
        monitorGroupBox.setLayout(monitorLayout)
        layout.addWidget(monitorGroupBox)
        
        mainWidget.setLayout(layout)
        self.dockWidget.setWidget(mainWidget)
        self.iface.addDockWidget(Qt.RightDockWidgetArea, self.dockWidget)

    def showPluginDialog(self):
        # Simply show the dock widget
        self.dockWidget.show()

    def extractStartMeasure(self):
        # Extract start measure from WKT
        wktText = self.wktInput.toPlainText().strip()
        if not wktText:
            QMessageBox.warning(None, "Input Error", "Please provide a valid WKT string.")
            return
            
        # Try to extract the measure value
        startMeasure = self._detectStartMeasureFromWkt(wktText)
        if startMeasure is not None:
            self.startMeasureInput.setText(str(startMeasure))
            # Show brief message without blocking
            self.iface.messageBar().pushMessage(
                "Success", 
                f"Start measure extracted: {startMeasure}",
                level=0, duration=2
            )
        else:
            # Provide more detailed information about the WKT format
            wktUpper = wktText.upper()
            if "CIRCULARSTRING" in wktUpper:
                QMessageBox.warning(None, "Extraction Failed", 
                    "Could not extract start measure from CircularString WKT. The format should be:\n"
                    "CIRCULARSTRING(x1 y1 m1, x2 y2 m2, x3 y3 m3) or\n"
                    "CIRCULARSTRING(x1 y1 z1 m1, x2 y2 z2 m2, x3 y3 z3 m3)\n"
                    "Please check your WKT format or enter the start measure manually.")
            elif "LINESTRING" in wktUpper:
                QMessageBox.warning(None, "Extraction Failed", 
                    "Could not extract start measure from LineString WKT. The format should be:\n"
                    "LINESTRING(x1 y1 m1, x2 y2 m2, ...) or\n"
                    "LINESTRING(x1 y1 z1 m1, x2 y2 z2 m2, ...)\n"
                    "Please check your WKT format or enter the start measure manually.")
            elif "COMPOUNDCURVE" in wktUpper:
                QMessageBox.warning(None, "Extraction Failed", 
                    "Could not extract start measure from CompoundCurve WKT. The format should include M values in coordinates.\n"
                    "Please check your WKT format or enter the start measure manually.")
            else:
                QMessageBox.warning(None, "Extraction Failed", 
                    "Could not extract start measure from WKT. Please enter manually or check your WKT format.")

    def addAlignment(self):
        # Read WKT input
        wktText = self.wktInput.toPlainText().strip()
        if not wktText:
            QMessageBox.warning(None, "Input Error", "Please provide a valid WKT string.")
            return
            
        # Preprocess WKT to handle NULL values
        wktText = re.sub(r'\sNULL\s', ' 0 ', wktText, flags=re.IGNORECASE)
            
        # Validate buffer distance
        try:
            buffer_distance = float(self.bufferDistanceInput.text())
            if buffer_distance < 1 or buffer_distance > 10000:
                QMessageBox.warning(None, "Input Error", "Buffer distance must be between 1 and 10000.")
                return
        except ValueError:
            QMessageBox.warning(None, "Input Error", "Please enter a valid number for buffer distance.")
            return
            
        # Attempt to create geometry from WKT
        geom = QgsGeometry.fromWkt(wktText)
        if geom is None or geom.isEmpty():
            QMessageBox.warning(None, "Geometry Error", "Could not create geometry from the provided WKT.")
            return
            
        # Get start measure
        try:
            startMeasure = float(self.startMeasureInput.text())
        except ValueError:
            # Try to auto-detect if not specified
            detectedMeasure = self._detectStartMeasureFromWkt(wktText)
            if detectedMeasure is not None:
                startMeasure = detectedMeasure
                self.startMeasureInput.setText(str(detectedMeasure))
            else:
                QMessageBox.warning(None, "Input Error", "Please provide a valid start measure.")
                return

        # Get alignment name
        alignmentName = self.alignmentNameInput.text().strip()
        if not alignmentName:
            QMessageBox.warning(None, "Input Error", "Please provide an alignment name.")
            return

        # Create layers if they don't exist
        self._createLayersIfNeeded()
        
        # Add alignment to the list
        self.alignments.append((alignmentName, geom, startMeasure, buffer_distance))
        
        # Add to combobox
        self.alignmentComboBox.addItem(alignmentName)
        
        # Add to layer
        self._addAlignmentFeature(alignmentName, geom, startMeasure, buffer_distance)
        
        # Show segment buffers immediately
        self._showAlignmentBuffers(geom, startMeasure, buffer_distance)
        
        # Select the newly added alignment
        self.alignmentComboBox.setCurrentIndex(len(self.alignments) - 1)
        
        # Zoom to the new alignment
        self.iface.mapCanvas().setExtent(geom.boundingBox())
        self.iface.mapCanvas().refresh()
        
        QMessageBox.information(None, "Success", f"Alignment '{alignmentName}' added successfully.")

    def _applyLayerStyles(self, layer):
        """Apply symbology and labeling styles in the correct order to the given layer"""
        if not layer:
            return False
            
        success = True
        # Apply symbology first
        symbology_path = os.path.join(self.pluginDir, "road_alignments_symbology.xml")
        if os.path.isfile(symbology_path):
            try:
                style_result = layer.loadNamedStyle(symbology_path)
                if not style_result[0]:  # style_result returns (success, message)
                    print(f"WARNING: Failed to apply symbology: {style_result[1]}")
                    success = False
                else:
                    print(f"DEBUG: Applied symbology from {symbology_path}")
            except Exception as e:
                print(f"ERROR: Exception applying symbology: {str(e)}")
                success = False
        else:
            print(f"WARNING: Symbology file not found at {symbology_path}")
            # Use default styling since file not found
            success = False
            
        # Apply labeling second, but only if a different file
        labels_path = os.path.join(self.pluginDir, "road_alignments_labels.xml")
        if os.path.isfile(labels_path) and labels_path != symbology_path:
            try:
                label_result = layer.loadNamedStyle(labels_path)
                if not label_result[0]:  # label_result returns (success, message)
                    print(f"WARNING: Failed to apply labeling: {label_result[1]}")
                else:
                    print(f"DEBUG: Applied labeling from {labels_path}")
            except Exception as e:
                print(f"ERROR: Exception applying labeling: {str(e)}")
        else:
            if labels_path == symbology_path:
                print(f"DEBUG: Skipping labels as it's the same file as symbology")
            else:
                print(f"WARNING: Labeling file not found at {labels_path}")
                
        # Refresh the layer regardless of success
        layer.triggerRepaint()
        return success
        
    def _createLayersIfNeeded(self):
        # Create alignment layer if it doesn't exist
        if self.alignmentLayer is None:
            self.alignmentLayer = QgsVectorLayer("LineString?crs=" + self.iface.mapCanvas().mapSettings().destinationCrs().authid(),
                                                "Road Alignments", "memory")
            # Add fields for name, start measure, and buffer distance
            provider = self.alignmentLayer.dataProvider()
            provider.addAttributes([
                QgsField("name", QVariant.String),
                QgsField("start_measure", QVariant.Double),
                QgsField("buffer_distance", QVariant.Double)
            ])
            self.alignmentLayer.updateFields()
            QgsProject.instance().addMapLayer(self.alignmentLayer)
            
            # Apply style and labeling
            self._applyLayerStyles(self.alignmentLayer)
            
        # Create point layer if it doesn't exist
        if self.pointLayer is None:
            self.pointLayer = QgsVectorLayer("Point?crs=" + self.iface.mapCanvas().mapSettings().destinationCrs().authid(),
                                            "Station-Offset Points", "memory")
            # Add fields for station, offset, side, and now coordinates, EPSG and alignment info
            provider = self.pointLayer.dataProvider()
            provider.addAttributes([
                QgsField("station", QVariant.Double),
                QgsField("offset", QVariant.Double),
                QgsField("side", QVariant.String),
                QgsField("x_coord", QVariant.Double),
                QgsField("y_coord", QVariant.Double),
                QgsField("epsg", QVariant.String),
                QgsField("alignment", QVariant.String),
                QgsField("start_measure", QVariant.Double)
            ])
            self.pointLayer.updateFields()
            QgsProject.instance().addMapLayer(self.pointLayer)
            
        # Create buffer layer if it doesn't exist
        if self.bufferLayer is None:
            self.bufferLayer = QgsVectorLayer("Polygon?crs=" + self.iface.mapCanvas().mapSettings().destinationCrs().authid(),
                                            "Segment Buffers", "memory")
            # Add fields for segment info
            provider = self.bufferLayer.dataProvider()
            provider.addAttributes([
                QgsField("segment_type", QVariant.String),
                QgsField("start_measure", QVariant.Double),
                QgsField("end_measure", QVariant.Double)
            ])
            self.bufferLayer.updateFields()
            
            # Set the layer style
            renderer = self.bufferLayer.renderer()
            symbol = renderer.symbol()
            # Set the fill color with transparency
            symbol.setColor(QColor(255, 0, 0, 50))  # Semi-transparent red
            # Set the stroke (outline) properties
            symbol_layer = symbol.symbolLayer(0)
            symbol_layer.setStrokeColor(QColor(255, 0, 0))  # Solid red
            symbol_layer.setStrokeWidth(0.5)  # Line width
            
            QgsProject.instance().addMapLayer(self.bufferLayer)
            
    def _addAlignmentFeature(self, name, geometry, startMeasure, bufferDistance):
        if self.alignmentLayer:
            feature = QgsFeature()
            feature.setGeometry(geometry)
            feature.setAttributes([name, startMeasure, bufferDistance])
            
            self.alignmentLayer.dataProvider().addFeatures([feature])
            self.alignmentLayer.updateExtents()
            
            # Reapply styles to ensure proper rendering
            self._applyLayerStyles(self.alignmentLayer)

    def toggleMonitoring(self, toggled):
        print(f"DEBUG: toggleMonitoring called with toggled={toggled}")
        if toggled:
            # Check if we have a valid alignment selected
            if self.currentAlignmentIndex < 0 or self.currentAlignmentIndex >= len(self.alignments):
                QMessageBox.warning(None, "Monitoring Error", "Please select a valid alignment before starting monitoring.")
                self.monitorButton.setChecked(False)
                return
                
            # Get the current alignment
            alignmentName, geom, startMeasure, bufferDistance = self.alignments[self.currentAlignmentIndex]
            print(f"DEBUG: Setting up monitoring for alignment: {alignmentName}")
            
            # Create alignment buffers
            print("DEBUG: Creating alignment buffers")
            self._showAlignmentBuffers(geom, startMeasure, bufferDistance)
            
            # Create new map tool and set it as active
            print("DEBUG: Creating map tool")
            self.mapTool = AlignmentMapTool(self.canvas, self.iface, geom, startMeasure, alignmentName, bufferDistance)
            
            # Initialize segments in the map tool
            print("DEBUG: Initializing segments in map tool")
            self.mapTool._parseAlignmentSegments()
            
            # Connect signals BEFORE setting the map tool
            print("DEBUG: Connecting signals")
            try:
                self.mapTool.updateInfo.connect(self.updateMonitorPanel)
                print("DEBUG: Connected updateInfo signal")
                self.mapTool.createPoint.connect(self.createPointAtLocation)
                print("DEBUG: Connected createPoint signal")
                self.mapTool.outOfBounds.connect(self.handleOutOfBounds)
                print("DEBUG: Connected outOfBounds signal")
            except Exception as e:
                print(f"ERROR connecting signals: {str(e)}")
                import traceback
                traceback.print_exc()
                self.monitorButton.setChecked(False)
                return
            
            # Set the map tool as active
            print("DEBUG: Setting map tool as active")
            self.canvas.setMapTool(self.mapTool)
            
            # Update UI
            print("DEBUG: Updating UI")
            self.monitorButton.setText("Stop Monitoring")
            self.monitorButton.setChecked(True)
        else:
            # Stop monitoring
            if self.mapTool:
                # Disconnect signals
                try:
                    print("DEBUG: Disconnecting signals")
                    self.mapTool.updateInfo.disconnect(self.updateMonitorPanel)
                    print("DEBUG: Disconnected updateInfo signal")
                    self.mapTool.createPoint.disconnect(self.createPointAtLocation)
                    print("DEBUG: Disconnected createPoint signal")
                    self.mapTool.outOfBounds.disconnect(self.handleOutOfBounds)
                    print("DEBUG: Disconnected outOfBounds signal")
                except Exception as e:
                    print(f"WARNING: Error disconnecting signals: {str(e)}")
                    pass  # Ignore errors if signals weren't connected
                
                # Reset map tool
                print("DEBUG: Resetting map tool")
                self.mapTool = None
                
                # Update UI
                print("DEBUG: Updating UI")
                self.monitorButton.setText("Start Monitoring")
                self.monitorButton.setChecked(False)
                
                # Clear labels
                print("DEBUG: Clearing labels")
                self.stationLabel.setText("Station: N/A")
                self.offsetLabel.setText("Offset: N/A")
                self.sideLabel.setText("Side: N/A")

    def clearAll(self):
        """Clear all data and reset the plugin state"""
        print("DEBUG: clearAll called")
        # Clear the buffer layer
        if self.bufferLayer:
            self.bufferLayer.dataProvider().truncate()
            self.bufferLayer.updateExtents()
            self.bufferLayer.triggerRepaint()
            
        # Clear the profile view
        self.profileView.clearView()
        
        # Reset active alignment
        self.activeAlignment = None
        
        # Reset UI
        self.monitorButton.setEnabled(False)
        self.monitorButton.setText("Start Monitoring")
        self.monitorButton.setChecked(False)
        self.measureLabel.setEnabled(False)
        self.measureLabel.setText("Measure: --")
        self.segmentLabel.setEnabled(False)
        self.segmentLabel.setText("Segment: --")
        self.profileView.setEnabled(False)
        
        # Reset map tool
        if self.mapTool:
            self.mapTool.measureChanged.disconnect(self.updateMeasureLabel)
            self.mapTool.segmentChanged.disconnect(self.updateSegmentLabel)
            self.mapTool.measureChanged.disconnect(self.updateProfileView)
            self.mapTool.segmentChanged.disconnect(self.updateProfileView)
            self.mapTool = None
            
        # Clear the alignment list
        self.alignmentList.clear()
        
        # Reset the alignment dictionary
        self.alignments = {}

    def updateMonitorPanel(self, station: float, offset: float, side: str):
        # Update the dock widget labels with the computed station, offset, and side
        self.stationLabel.setText("Station: {:.4f}".format(station))
        self.offsetLabel.setText("Offset: {:.2f}".format(offset))
        self.sideLabel.setText("Side: " + side)
        
        # Print debug info to console
        print(f"Station: {station:.4f}, Offset: {offset:.2f}, Side: {side}")

    def handleOutOfBounds(self):
        # Clear the station, offset, and side labels when the mouse is out of bounds
        self.stationLabel.setText("Station: N/A")
        self.offsetLabel.setText("Offset: N/A")
        self.sideLabel.setText("Side: N/A")

    def createPointAtLocation(self, point: QgsPointXY, station: float, offset: float, side: str, alignmentName: str, startMeasure: float):
        # Create a new point feature with station, offset, side, coordinates, EPSG, and alignment info
        if self.pointLayer:
            # Get current CRS (cache this value)
            if not hasattr(self, 'cached_crs'):
                self.cached_crs = self.canvas.mapSettings().destinationCrs()
                self.cached_epsg = self.cached_crs.authid()
            
            # Create feature with minimal attributes
            feature = QgsFeature()
            feature.setGeometry(QgsGeometry.fromPointXY(point))
            feature.setAttributes([
                station, 
                offset, 
                side, 
                point.x(),
                point.y(),
                self.cached_epsg,
                alignmentName,
                startMeasure
            ])
            
            # Add feature to layer
            self.pointLayer.dataProvider().addFeatures([feature])
            
            # Update layer without full refresh
            self.pointLayer.triggerRepaint()
            
            # Show brief message without blocking
            self.iface.messageBar().pushMessage(
                "Point Created", 
                f"Station: {station:.2f}, Offset: {offset:.2f}, Side: {side}",
                level=0, duration=2
            )

    def onAlignmentSelectionChanged(self, index):
        print(f"DEBUG: onAlignmentSelectionChanged called with index={index}")
        if 0 <= index < len(self.alignments):
            self.currentAlignmentIndex = index
            # Get the selected alignment
            alignmentName, geom, startMeasure, bufferDistance = self.alignments[index]
            print(f"DEBUG: Selected alignment: {alignmentName}")
            
            # Update buffer distance input to match selected alignment
            self.bufferDistanceInput.setText(str(bufferDistance))
            
            # Clear existing buffers and show new ones
            if self.bufferLayer:
                self.bufferLayer.dataProvider().truncate()
                self._showAlignmentBuffers(geom, startMeasure, bufferDistance)
            
            # If monitoring is on, update the map tool with the new alignment
            if self.monitorButton.isChecked() and self.mapTool is not None:
                print("DEBUG: Updating map tool with new alignment")
                self.mapTool.setAlignment(geom, startMeasure, alignmentName, bufferDistance)
        else:
            print("DEBUG: Invalid alignment index")
            self.currentAlignmentIndex = -1

    def clearAllAlignments(self):
        # Remove all alignments and reset the plugin
        if self.alignmentLayer:
            self.alignmentLayer.dataProvider().truncate()
            
            # Reapply styles to the empty layer (important to maintain consistent styling)
            self._applyLayerStyles(self.alignmentLayer)
            
            self.alignmentLayer.triggerRepaint()
            
        if self.pointLayer:
            self.pointLayer.dataProvider().truncate()
            self.pointLayer.triggerRepaint()
            
        if self.bufferLayer:
            self.bufferLayer.dataProvider().truncate()
            self.bufferLayer.triggerRepaint()
            
        # Clear the alignment list and combobox
        self.alignments = []
        self.alignmentComboBox.clear()
        self.currentAlignmentIndex = -1
        
        # Stop monitoring if it's active
        if self.monitorButton.isChecked():
            self.monitorButton.setChecked(False)
            
        QMessageBox.information(None, "Cleared", "All alignments and points have been removed.")

    def _detectStartMeasureFromWkt(self, wktText: str):
        # Enhanced method to extract start measure from WKT
        wktUpper = wktText.strip().upper()
        print(f"DEBUG: Trying to extract start measure from WKT: {wktText}")
        
        # Handle LINESTRING with Z and M values (format: X Y Z M)
        if "LINESTRING" in wktUpper:
            print(f"DEBUG: Processing LINESTRING")
            
            # For LINESTRING with Z and M values, look for 4 values per coordinate
            # Allow NULL as a valid Z value
            matches = re.findall(r'(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(NULL|-?\d+\.?\d*)\s+(-?\d+\.?\d*)', wktText, re.IGNORECASE)
            if matches and len(matches) >= 1:
                first_coord = matches[0]
                if len(first_coord) == 4:  # X Y Z M format
                    print(f"DEBUG: Found 4 coordinate values: {first_coord}")
                    try:
                        # In X Y Z M format, the M value is the 4th element
                        measure = float(first_coord[3])
                        print(f"DEBUG: Extracted start measure (from 4th position): {measure}")
                        return measure
                    except ValueError:
                        print(f"DEBUG: Failed to convert 4th value to float: {first_coord[3]}")
                        pass
            
            # For LINESTRING with only M values (format: X Y M)
            matches = re.findall(r'(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)', wktText)
            if matches and len(matches) >= 1:
                first_coord = matches[0]
                if len(first_coord) == 3:  # X Y M format
                    try:
                        # In X Y M format, the M value is the 3rd element
                        measure = float(first_coord[2])
                        print(f"DEBUG: Extracted start measure (from 3rd position): {measure}")
                        return measure
                    except ValueError:
                        print(f"DEBUG: Failed to convert 3rd value to float: {first_coord[2]}")
                        pass
        
        # First check if it's a regular CIRCULARSTRING without M suffix
        if "CIRCULARSTRING" in wktUpper and "CIRCULARSTRINGM" not in wktUpper:
            print(f"DEBUG: Processing CIRCULARSTRING")
            # For regular CIRCULARSTRING, extract coordinates and check if they have M values
            # Allow NULL as a valid Z value
            matches = re.findall(r'(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(NULL|-?\d+\.?\d*)\s+(-?\d+\.?\d*)', wktText, re.IGNORECASE)
            if matches and len(matches) >= 1:
                first_coord = matches[0]
                print(f"DEBUG: Found coordinates with NULL handling: {first_coord}")
                # If we have 4 values, the M value is the 4th one (X Y Z M)
                if len(first_coord) == 4:
                    try:
                        measure = float(first_coord[3])
                        print(f"DEBUG: Extracted start measure (from 4th position): {measure}")
                        return measure
                    except ValueError:
                        print(f"DEBUG: Failed to convert 4th value to float: {first_coord[3]}")
                        pass
            
            # Try alternative pattern for X Y M format
            matches = re.findall(r'(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)', wktText)
            if matches and len(matches) >= 1:
                first_coord = matches[0]
                if len(first_coord) == 3:
                    try:
                        measure = float(first_coord[2])
                        print(f"DEBUG: Extracted start measure (from 3rd position): {measure}")
                        return measure
                    except ValueError:
                        print(f"DEBUG: Failed to convert 3rd value to float: {first_coord[2]}")
                        pass
        
        # Handle COMPOUNDCURVE with CIRCULARSTRING segments
        if "COMPOUNDCURVE" in wktUpper:
            print(f"DEBUG: Processing COMPOUNDCURVE")
            # Try to find the first segment in the COMPOUNDCURVE
            match = re.search(r'\(\s*([^,\)]+)', wktText)
            if match:
                first_segment = match.group(1).strip()
                print(f"DEBUG: First segment: {first_segment}")
                # Check if it's a CIRCULARSTRING segment
                if "CIRCULARSTRING" in first_segment.upper():
                    # Extract coordinates with NULL handling
                    segment_matches = re.findall(r'(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(NULL|-?\d+\.?\d*)\s+(-?\d+\.?\d*)', first_segment, re.IGNORECASE)
                    if segment_matches and len(segment_matches) >= 1:
                        first_coord = segment_matches[0]
                        print(f"DEBUG: Found coordinates in CIRCULARSTRING: {first_coord}")
                        # If we have 4 values, the M value is the 4th one (X Y Z M)
                        if len(first_coord) == 4:
                            try:
                                measure = float(first_coord[3])
                                print(f"DEBUG: Extracted start measure (from 4th position): {measure}")
                                return measure
                            except ValueError:
                                print(f"DEBUG: Failed to convert 4th value to float: {first_coord[3]}")
                                pass
                    
                    # Try alternative pattern for X Y M format
                    segment_matches = re.findall(r'(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)', first_segment)
                    if segment_matches and len(segment_matches) >= 1:
                        first_coord = segment_matches[0]
                        if len(first_coord) >= 3:
                            try:
                                measure = float(first_coord[2])
                                print(f"DEBUG: Extracted start measure (from 3rd position): {measure}")
                                return measure
                            except ValueError:
                                print(f"DEBUG: Failed to convert 3rd value to float: {first_coord[2]}")
                                pass
        
        print("DEBUG: Failed to extract start measure from WKT")
        return None

    def _showAlignmentBuffers(self, geometry, startMeasure, bufferDistance):
        print("DEBUG: Starting to show alignment buffers")
        if not self.bufferLayer:
            print("WARNING: Buffer layer not initialized")
            return
            
        # Clear existing buffers for this alignment
        self.bufferLayer.dataProvider().truncate()
        
        # Use the map tool parsing functionality to create segments
        # This ensures consistent handling of complex geometries like CIRCULARSTRING with multiple points
        temp_map_tool = AlignmentMapTool(self.canvas, self.iface, geometry, startMeasure, "temp", bufferDistance)
        temp_map_tool._parseAlignmentSegments()
        
        # Add each segment's buffer to the buffer layer
        for segment in temp_map_tool.segments:
            if segment.square_buffer and not segment.square_buffer.isEmpty():
                feature = QgsFeature()
                feature.setGeometry(segment.square_buffer)
                feature.setAttributes([segment.segment_type, segment.start_measure, segment.end_measure])
                success = self.bufferLayer.dataProvider().addFeatures([feature])
                print(f"DEBUG: Added buffer for {segment.segment_type} segment from {segment.start_measure} to {segment.end_measure}")
        
        # Update the buffer layer
        self.bufferLayer.updateExtents()
        self.bufferLayer.triggerRepaint()

    def _createSegmentBuffer(self, geometry, start_measure, end_measure, segment_type):
        try:
            print(f"DEBUG: Creating buffer for segment type: {segment_type}")
            if not geometry or geometry.isEmpty():
                print("WARNING: Cannot calculate buffer for empty geometry")
                return
                
            if segment_type == 'line':
                print("DEBUG: Processing line segment")
                # For lines, create a rectangular buffer
                vertices = geometry.asPolyline()
                if len(vertices) < 2:
                    print("WARNING: Line segment has insufficient vertices")
                    return
                    
                # Get start and end points
                start_point = vertices[0]
                end_point = vertices[-1]
                
                # Calculate direction vector
                dx = end_point.x() - start_point.x()
                dy = end_point.y() - start_point.y()
                length = math.sqrt(dx*dx + dy*dy)
                if length == 0:
                    print("WARNING: Line segment has zero length")
                    return
                    
                # Normalize direction vector
                dx = dx / length
                dy = dy / length
                
                # Calculate perpendicular vectors (both sides)
                perp1_x = -dy
                perp1_y = dx
                perp2_x = dy
                perp2_y = -dx
                
                # Fixed buffer width of 500 units
                buffer_width = 500
                
                # Create buffer polygon points
                buffer_points = [
                    QgsPointXY(start_point.x() + perp1_x * buffer_width, start_point.y() + perp1_y * buffer_width),
                    QgsPointXY(start_point.x() + perp2_x * buffer_width, start_point.y() + perp2_y * buffer_width),
                    QgsPointXY(end_point.x() + perp2_x * buffer_width, end_point.y() + perp2_y * buffer_width),
                    QgsPointXY(end_point.x() + perp1_x * buffer_width, end_point.y() + perp1_y * buffer_width)
                ]
                
                # Create buffer geometry
                buffer_geom = QgsGeometry.fromPolygonXY([buffer_points])
                
            else:
                print("DEBUG: Processing circular string segment")
                # For circular strings, create a polygon with curved sides
                vertices = geometry.asPolyline()
                print(f"DEBUG: Number of vertices: {len(vertices)}")
                print(f"DEBUG: Geometry WKT: {geometry.asWkt()}")
                
                if len(vertices) < 3:
                    print("WARNING: Circular segment has insufficient vertices")
                    return
                    
                # Get points defining the arc
                p1, p_mid, p2 = vertices[0], vertices[1], vertices[2]
                print(f"DEBUG: Arc points - Start: ({p1.x()}, {p1.y()}), Mid: ({p_mid.x()}, {p_mid.y()}), End: ({p2.x()}, {p2.y()})")
                
                # Calculate center and radius
                center = self._circle_center_from_three_points(p1, p_mid, p2)
                radius = self._distance_between_points(center, p1)
                print(f"DEBUG: Circle center: ({center.x()}, {center.y()}), radius: {radius}")
                
                # Calculate angles
                angle_start = math.atan2(p1.y() - center.y(), p1.x() - center.x())
                angle_end = math.atan2(p2.y() - center.y(), p2.x() - center.x())
                print(f"DEBUG: Angles - Start: {math.degrees(angle_start)}, End: {math.degrees(angle_end)}")
                
                # Calculate sweep angle
                sweep_angle = math.atan2(math.sin(angle_end - angle_start), math.cos(angle_end - angle_start))
                print(f"DEBUG: Sweep angle: {math.degrees(sweep_angle)}")
                
                # Fixed buffer width of 500 units
                buffer_width = 500
                
                # Create points for both sides using curved segments
                num_points = 50  # Total number of points per side
                left_points = []
                right_points = []
                
                # Create points for both sides
                for i in range(num_points + 1):
                    t = i / num_points
                    angle = angle_start + sweep_angle * t
                    
                    # Left side points (outer curve - convex side - full 500ft buffer)
                    left_x = center.x() + (radius + buffer_width) * math.cos(angle)
                    left_y = center.y() + (radius + buffer_width) * math.sin(angle)
                    left_points.append(QgsPointXY(left_x, left_y))
                    
                    # Right side points (inner curve - concave side - limited by radius)
                    right_x = center.x() + max(radius - buffer_width, 0) * math.cos(angle)
                    right_y = center.y() + max(radius - buffer_width, 0) * math.sin(angle)
                    right_points.append(QgsPointXY(right_x, right_y))
                
                print(f"DEBUG: Created {len(left_points)} points for each side")
                
                # Create the complete buffer polygon
                buffer_points = [left_points[0]] + left_points + [left_points[-1], right_points[-1]] + right_points[::-1] + [right_points[0]]
                print(f"DEBUG: Total buffer points: {len(buffer_points)}")
                
                # Create buffer geometry
                buffer_geom = QgsGeometry.fromPolygonXY([buffer_points])
                print(f"DEBUG: Buffer geometry created: {buffer_geom.isValid()}")
            
            # Add buffer to the layer
            feature = QgsFeature()
            feature.setGeometry(buffer_geom)
            feature.setAttributes([segment_type, start_measure, end_measure])
            success = self.bufferLayer.dataProvider().addFeatures([feature])
            print(f"DEBUG: Feature added to layer: {success}")
            
        except Exception as e:
            print(f"WARNING: Error calculating buffer: {str(e)}")
            import traceback
            traceback.print_exc()

    def onAlignmentSelected(self, index):
        """Handle alignment selection"""
        print(f"DEBUG: onAlignmentSelected called with index={index}")
        if index >= 0 and index < len(self.alignments):
            # Get the selected alignment
            alignmentName, geom, startMeasure, bufferDistance = self.alignments[index]
            print(f"DEBUG: Selected alignment: {alignmentName}")
            
            # Create a QgsFeature from the geometry
            feature = QgsFeature()
            feature.setGeometry(geom)
            feature.setAttributes([alignmentName])
            
            # Create a QgsVectorLayer for the alignment
            self.activeAlignment = QgsVectorLayer("LineString?crs=EPSG:27700", alignmentName, "memory")
            self.activeAlignment.dataProvider().addFeatures([feature])
            
            # Enable monitoring button
            self.monitorButton.setEnabled(True)
            
            # If monitoring is active, update the buffers and map tool
            if self.monitorButton.isChecked():
                print("DEBUG: Monitoring is active, updating buffers")
                # Clear existing buffers
                if self.bufferLayer:
                    self.bufferLayer.dataProvider().truncate()
                
                # Create new buffers for the selected alignment
                self._showAlignmentBuffers(geom, startMeasure, bufferDistance)
                
                # Update the map tool with the new alignment
                if self.mapTool:
                    self.mapTool.setAlignment(self.activeAlignment)
                    self.mapTool.updateView()
                
                # Update the profile view
                self.profileView.setAlignment(self.activeAlignment)
                self.profileView.updateView()
        else:
            print("DEBUG: Invalid alignment index")
            self.activeAlignment = None
            self.monitorButton.setEnabled(False)

    def reloadStyles(self):
        """Reload all styles from XML files"""
        if self.alignmentLayer:
            self._applyLayerStyles(self.alignmentLayer)
            print("DEBUG: Reloaded styles for Road Alignments layer")
            
        # Could extend to reload styles for other layers if needed

    def createPointDialog(self):
        """Open dialog to create point by station/offset"""
        # Check if we have a valid alignment selected
        if self.currentAlignmentIndex < 0 or self.currentAlignmentIndex >= len(self.alignments):
            QMessageBox.warning(None, "Error", "Please select a valid alignment first.")
            return
            
        # Get the current alignment
        alignmentName, geom, startMeasure, bufferDistance = self.alignments[self.currentAlignmentIndex]
        
        dialog = self.StationOffsetDialog(self.iface.mainWindow())
        result = dialog.exec_()
        
        if result == QDialog.Accepted:
            station, offset, side = dialog.getValues()
            
            if station is None or offset is None:
                QMessageBox.warning(None, "Invalid Input", "Please enter valid numeric values for station and offset.")
                return
                
            # Calculate point coordinates based on station, offset, and side
            point = self._calculatePointFromStationOffset(geom, startMeasure, station, offset, side)
            
            if point:
                # Create a point at this location
                self.createPointAtLocation(point, station, offset, side, alignmentName, startMeasure)
                
                # Zoom to the new point
                self.canvas.zoomToFeatureExtent(QgsGeometry.fromPointXY(point).boundingBox())
                self.canvas.refresh()
            else:
                QMessageBox.warning(None, "Calculation Error", "Could not calculate point position. Station may be outside alignment range.")
    
    def _calculatePointFromStationOffset(self, alignmentGeom, startMeasure, station, offset, side):
        """Calculate the XY coordinates of a point based on station, offset, and side"""
        if not alignmentGeom or alignmentGeom.isEmpty():
            return None
            
        try:
            # Create temporary map tool to parse segments (reuse existing functionality)
            temp_map_tool = AlignmentMapTool(self.canvas, self.iface, alignmentGeom, startMeasure, "", 0)
            temp_map_tool._parseAlignmentSegments()
            
            # Find which segment contains this station
            containing_segment = None
            for segment in temp_map_tool.segments:
                if segment.start_measure <= station <= segment.end_measure:
                    containing_segment = segment
                    break
                    
            if not containing_segment:
                print(f"WARNING: No segment found containing station {station}")
                return None
                
            # Calculate point based on segment type
            if containing_segment.segment_type == 'circular':
                return self._calculatePointOnCircularSegment(containing_segment, station, offset, side)
            else:
                return self._calculatePointOnLineSegment(containing_segment, station, offset, side)
                
        except Exception as e:
            print(f"ERROR in _calculatePointFromStationOffset: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def _calculatePointOnLineSegment(self, segment, station, offset, side):
        """Calculate point on a line segment based on station, offset, and side"""
        # Get line geometry
        line = segment.geometry
        
        # Calculate distance along the line
        distance_along = station - segment.start_measure
        
        # Get point on line at that distance
        point_on_line = line.interpolate(distance_along).asPoint()
        
        # If offset is zero, return point on line
        if abs(offset) < 0.001:
            return QgsPointXY(point_on_line)
        
        # Get direction along line at this point
        # For simple line, we can use the whole line direction
        vertices = line.asPolyline()
        if len(vertices) < 2:
            return None
            
        # Calculate direction vector
        start_point = vertices[0]
        end_point = vertices[-1]
        dx = end_point.x() - start_point.x()
        dy = end_point.y() - start_point.y()
        length = math.sqrt(dx*dx + dy*dy)
        
        if length == 0:
            return None
            
        # Normalize
        dx = dx / length
        dy = dy / length
        
        # Calculate perpendicular direction based on side
        if side == "left":
            perp_x = -dy
            perp_y = dx
        else:  # right
            perp_x = dy
            perp_y = -dx
            
        # Calculate offset point
        offset_x = point_on_line.x() + perp_x * offset
        offset_y = point_on_line.y() + perp_y * offset
        
        return QgsPointXY(offset_x, offset_y)
    
    def _calculatePointOnCircularSegment(self, segment, station, offset, side):
        """Calculate point on a circular segment based on station, offset, and side"""
        if not segment.center or not segment.radius:
            print("WARNING: Circular segment missing center or radius")
            return None
            
        # Get the arc's center and radius
        center = segment.center
        radius = segment.radius
        
        # Get the vertex points from the geometry 
        vertices = segment.geometry.asPolyline()
        p1, p_mid, p2 = vertices[0], vertices[1], vertices[2]
        
        # Calculate the angle at start point
        angle_start = math.atan2(p1.y() - center.y(), p1.x() - center.x())
        
        # Calculate curvature to determine clockwise/counterclockwise
        if not hasattr(segment, 'cached_curvature'):
            segment.cached_curvature = self._calculate_curvature(p1, p_mid, p2, center)
        
        curvature = segment.cached_curvature
        is_clockwise = curvature > 0
        
        # Calculate arc length from start to station
        arc_length = station - segment.start_measure
        
        # Calculate angle from arc length
        angle_at_station = angle_start
        if is_clockwise:
            angle_at_station = angle_start - (arc_length / radius)
        else:
            angle_at_station = angle_start + (arc_length / radius)
            
        # Calculate point on arc
        x_on_arc = center.x() + radius * math.cos(angle_at_station)
        y_on_arc = center.y() + radius * math.sin(angle_at_station)
        point_on_arc = QgsPointXY(x_on_arc, y_on_arc)
        
        # If offset is zero, return point on arc
        if abs(offset) < 0.001:
            return point_on_arc
            
        # Calculate direction for offset based on side
        # For circular segments, the offset is radial from center
        radial_x = x_on_arc - center.x()
        radial_y = y_on_arc - center.y()
        radial_length = math.sqrt(radial_x**2 + radial_y**2)
        
        if radial_length == 0:
            return None
            
        # Normalize radial vector
        radial_x = radial_x / radial_length
        radial_y = radial_y / radial_length
        
        # Determine which side is converging toward the center
        # For clockwise curves, right side converges to center
        # For counterclockwise curves, left side converges to center
        is_converging_side = (side == "right" and is_clockwise) or (side == "left" and not is_clockwise)
        
        # Check if offset exceeds radius on the converging side
        if is_converging_side and offset >= radius:
            # We cannot place a point beyond the center, so return None
            QMessageBox.warning(None, "Invalid Offset", 
                f"For this curve, the maximum offset on the {side} side is {radius:.2f} units (the radius of the curve).")
            return None
            
        # Apply offset based on side
        if (side == "left" and is_clockwise) or (side == "right" and not is_clockwise):
            # Outward from center - no limit
            offset_x = x_on_arc + radial_x * offset
            offset_y = y_on_arc + radial_y * offset
        else:
            # Inward toward center - must be less than radius
            offset_x = x_on_arc - radial_x * offset
            offset_y = y_on_arc - radial_y * offset
            
        return QgsPointXY(offset_x, offset_y)
        
    def _calculate_curvature(self, p1, p_mid, p2, center):
        """Calculate curvature of an arc (positive = clockwise, negative = counterclockwise)"""
        # Calculate vectors from center to points
        vec1 = [p1.x() - center.x(), p1.y() - center.y()]
        vec2 = [p2.x() - center.x(), p2.y() - center.y()]
        
        # Calculate cross product to determine direction
        cross = vec1[0]*vec2[1] - vec1[1]*vec2[0]
        
        # Calculate angles for start and end points
        angle_start = math.atan2(p1.y() - center.y(), p1.x() - center.x())
        angle_end = math.atan2(p2.y() - center.y(), p2.x() - center.x())
        
        # Calculate sweep angle
        delta_angle = math.atan2(math.sin(angle_end - angle_start), math.cos(angle_end - angle_start))
        
        # Calculate curvature value in degrees
        curvature_val = math.degrees(abs(delta_angle))
        
        # Determine sign based on cross product
        # If cross > 0, arc is counterclockwise (negative curvature)
        # If cross < 0, arc is clockwise (positive curvature)
        return -curvature_val if cross > 0 else curvature_val
        
    # Dialog class for entering station/offset values
    class StationOffsetDialog(QDialog):
        def __init__(self, parent=None):
            super().__init__(parent)
            self.setWindowTitle("Create Point by Station/Offset")
            self.resize(300, 200)
            
            layout = QVBoxLayout(self)
            
            # Create form layout for inputs
            formLayout = QFormLayout()
            
            # Station input
            self.stationInput = QLineEdit()
            formLayout.addRow("Station:", self.stationInput)
            
            # Offset input
            self.offsetInput = QLineEdit()
            formLayout.addRow("Offset:", self.offsetInput)
            
            # Side input (combo box)
            self.sideCombo = QComboBox()
            self.sideCombo.addItems(["left", "right"])
            formLayout.addRow("Side:", self.sideCombo)
            
            layout.addLayout(formLayout)
            
            # Add buttons
            buttonBox = QHBoxLayout()
            self.createButton = QPushButton("Create Point")
            self.createButton.clicked.connect(self.accept)
            self.cancelButton = QPushButton("Cancel")
            self.cancelButton.clicked.connect(self.reject)
            
            buttonBox.addWidget(self.createButton)
            buttonBox.addWidget(self.cancelButton)
            layout.addLayout(buttonBox)
            
            self.setLayout(layout)
        
        def getValues(self):
            try:
                station = float(self.stationInput.text())
                offset = float(self.offsetInput.text())
                side = self.sideCombo.currentText()
                return station, offset, side
            except ValueError:
                return None, None, None
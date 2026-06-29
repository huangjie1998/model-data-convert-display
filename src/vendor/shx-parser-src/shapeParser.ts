import { Point } from './point';
import { ShxFontData, ShxFontType, CadCharShapeOptions, CadCharShapeResult } from './fontData';
import { Arc } from './arc';
import { ShxFileReader } from './fileReader';
import { ShxShape } from './shape';

/**
 * Scaling options for shape parsing
 */
export interface ScalingOptions {
  /** Scale by a uniform factor */
  factor?: number;
  /** Scale by specific height and width */
  height?: number;
  width?: number;
}

/**
 * Shared execution state for inline subshape execution.
 * Parent and child shapes share the same state instance.
 */
interface ExecuteState {
  /** Logical SHX program point. Main-path scale affects this; BigFont wrapper scale does not. */
  currentPoint: Point;
  /** Last rendered point after applying wrapperScale. Used for glyph advance/lastPoint. */
  lastRenderedPoint?: Point;
  penDown: boolean;
  /** Scale from commands in the main drawing program. Affects currentPoint movement. */
  scale: number;
  /** Scale contributed by BigFont control subshapes. Affects emitted/rendered points only. */
  wrapperScale: number;
  /** Whether command 3/4 currently targets main path scale or wrapper scale. */
  scaleTarget: 'path' | 'wrapper';
  stack: Point[];
  polylines: Point[][];
  currentPolyline: Point[];
  verticalText: boolean;
}

const CIRCLE_SPAN = Math.PI / 18;

/**
 * Parses SHX font data into shapes on demand. To improve performance, the shape is parsed on demand by
 * character code and font size. Parsed shapes are cached.
 */
export class ShxShapeParser {
  /** Font data of the font file */
  private readonly fontData: ShxFontData;
  /** Cached shapes for performance. Key is character code. */
  private shapeCache: Map<number, ShxShape> = new Map();
  /** Shapes data. Key is the char code */
  private shapeData: Map<number, ShxShape> = new Map();

  constructor(fontData: ShxFontData) {
    this.fontData = fontData;
  }

  /**
   * Releases parsed shapes and cached shapes
   */
  release(): void {
    this.shapeCache.clear();
    this.shapeData.clear();
  }

  /**
   * Parses a character's shape with the given font size.
   * @param code - The character code
   * @param size - The font size
   * @returns The parsed shape or undefined if the character is not found
   */
  getCharShape(code: number, size: number): ShxShape | undefined {
    const scale = size / this.fontData.content.height;
    return this.parseAndScale(code, { factor: scale });
  }

  private cadCellHeight(): number {
    if (this.fontData.header.fontType === ShxFontType.BIGFONT) {
      // BigFont uses a font-level height metric, not the individual glyph bbox.
      // AutoCAD-compatible rule observed for horizontal BigFont text:
      // - if above/baseUp > 0, scale by textHeight / above
      // - if above/baseUp == 0, use AutoCAD's fallback metric (= 8 for gbcbig-like fonts)
      const above = this.fontData.content.baseUp;
      return above > 0 ? above : 8;
    }
    // Normal SHX (unifont/shapes) scales by the full cell height.
    return this.fontData.content.height;
  }

  /**
   * CAD-level character shape retrieval.
   * Uses the same inline SHX program execution as parseShape.
   * Does NOT normalizeToOrigin, then scales once by fontSize/cellH.
   * BigFont control subshapes execute inline and may affect later strokes.
   * @param code - The character code
   * @param options - CAD options
   * @returns The CAD shape result or undefined
   */
  executeCadShape(code: number, options: CadCharShapeOptions = {}): CadCharShapeResult | undefined {
    if (code === 0) return undefined;

    const data = this.fontData.content.data[code];
    if (!data) return undefined;

    const fontSize = options.fontSize ?? this.cadCellHeight();
    const cellHeight = this.cadCellHeight();
    const scale = fontSize / cellHeight;

    // Execute with the current DWG entity orientation, not the SHX file's orientation flag.
    // BigFont files such as gbcbig.shx may declare vertical-capable data, but ordinary
    // horizontal TEXT must skip command-14 vertical-only payloads.
    const shape = this.parseShape(data, options.verticalText === true);

    // Scale once to target font size
    const scaled = this.scaleShapeByFactor(shape, scale);

    if (!scaled.polylines.length) return undefined;

    const polylines = scaled.polylines.map(pl =>
      pl.map(p => ({ x: p.x, y: p.y }))
    );

    return {
      polylines,
      lastPoint: scaled.lastPoint ? { x: scaled.lastPoint.x, y: scaled.lastPoint.y } : undefined,
      bbox: scaled.bbox,
      finalScale: 1,
      baselineY: 0,
    };
  }

  /**
   * Parses a character's shape with scaling options
   */
  private parseAndScale(code: number, options: ScalingOptions): ShxShape | undefined {
    if (code === 0) return undefined;

    let baseShape: ShxShape | undefined;
    if (this.shapeCache.has(code)) {
      baseShape = this.shapeCache.get(code)!;
    } else {
      const codes = this.fontData.content.data;
      if (codes[code]) {
        const data = codes[code];
        baseShape = this.parseShape(data);
        this.shapeData.set(code, baseShape);
        this.shapeCache.set(code, baseShape);
      }
    }

    if (!baseShape) return undefined;

    if (options.factor !== undefined) {
      return this.scaleShapeByFactor(baseShape, options.factor);
    } else if (options.height !== undefined) {
      const targetWidth = options.width ?? options.height;
      return this.scaleShapeByHeightAndWidth(baseShape, options.height, targetWidth);
    }
    return baseShape;
  }

  private scaleShapeByFactor(shape: ShxShape, factor: number): ShxShape {
    return new ShxShape(
      shape.lastPoint?.clone().multiply(factor),
      shape.polylines.map(line => line.map(point => point.clone().multiply(factor)))
    );
  }

  private scaleShapeByHeightAndWidth(shape: ShxShape, height: number, width: number): ShxShape {
    const bbox = shape.bbox;
    const shapeHeight = bbox.maxY - bbox.minY;
    const shapeWidth = bbox.maxX - bbox.minX;
    const heightScale = shapeHeight > 0 ? height / shapeHeight : 1;
    const widthScale = shapeWidth > 0 ? width / shapeWidth : 1;

    const scaledLastPoint = shape.lastPoint?.clone();
    if (scaledLastPoint) {
      scaledLastPoint.x *= widthScale;
      scaledLastPoint.y *= heightScale;
    }

    const scaledPolylines = shape.polylines.map(line =>
      line.map(point => {
        const scaledPoint = point.clone();
        scaledPoint.x *= widthScale;
        scaledPoint.y *= heightScale;
        return scaledPoint;
      })
    );

    return new ShxShape(scaledLastPoint, scaledPolylines);
  }

  // ========================================================================
  // Original parseShape (backward-compatible, no inline subshape)
  // ========================================================================

  private parseShape(data: Uint8Array, verticalText = false): ShxShape {
    const state: ExecuteState = {
      currentPoint: new Point(),
      penDown: false,
      scale: 1,
      wrapperScale: 1,
      scaleTarget: 'path',
      stack: [],
      polylines: [],
      currentPolyline: [],
      verticalText,
    };

    this.executeShapeInline(data, state);

    if (state.currentPolyline.length > 1) {
      state.polylines.push(state.currentPolyline.slice());
    }

    return new ShxShape(state.lastRenderedPoint ?? this.renderPoint(state), state.polylines);
  }

  private handleSpecialCommand(
    command: number,
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      polylines: Point[][];
      currentPolyline: Point[];
      sp: Point[];
      isPenDown: boolean;
      scale: number;
    }
  ): number {
    let i = index;

    switch (command) {
      case 0:
        state.currentPolyline = [];
        state.isPenDown = false;
        break;
      case 1:
        state.isPenDown = true;
        state.currentPolyline.push(state.currentPoint.clone());
        break;
      case 2:
        state.isPenDown = false;
        if (state.currentPolyline.length > 1) {
          state.polylines.push(state.currentPolyline.slice());
        }
        state.currentPolyline = [];
        break;
      case 3:
        i++;
        state.scale /= data[i];
        break;
      case 4:
        i++;
        state.scale *= data[i];
        break;
      case 5:
        if (state.sp.length === 4) {
          throw new Error('The position stack is only four locations deep');
        }
        state.sp.push(state.currentPoint.clone());
        break;
      case 6:
        state.currentPoint = (state.sp.pop() as Point) ?? state.currentPoint;
        break;
      case 7:
        i = this.handleSubshapeCommand(data, i, state);
        break;
      case 8:
        i = this.handleXYDisplacement(data, i, state);
        break;
      case 9:
        i = this.handleMultipleXYDisplacements(data, i, state);
        break;
      case 10:
        i = this.handleOctantArc(data, i, state);
        break;
      case 11:
        i = this.handleFractionalArc(data, i, state);
        break;
      case 12:
        i = this.handleBulgeArc(data, i, state);
        break;
      case 13:
        i = this.handleMultipleBulgeArcs(data, i, state);
        break;
      case 14:
        i = this.skipCode(data, ++i);
        break;
    }

    return i;
  }

  private handleVectorCommand(
    command: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): void {
    const len = (command & 0xf0) >> 4;
    const dir = command & 0x0f;
    const vec = this.getVectorForDirection(dir);
    state.currentPoint.add(vec.multiply(len * state.scale));
    if (state.isPenDown) {
      state.currentPolyline.push(state.currentPoint.clone());
    }
  }

  private getVectorForDirection(dir: number): Point {
    const vec = new Point();
    switch (dir) {
      case 0: vec.x = 1; break;
      case 1: vec.x = 1; vec.y = 0.5; break;
      case 2: vec.x = 1; vec.y = 1; break;
      case 3: vec.x = 0.5; vec.y = 1; break;
      case 4: vec.y = 1; break;
      case 5: vec.x = -0.5; vec.y = 1; break;
      case 6: vec.x = -1; vec.y = 1; break;
      case 7: vec.x = -1; vec.y = 0.5; break;
      case 8: vec.x = -1; break;
      case 9: vec.x = -1; vec.y = -0.5; break;
      case 10: vec.x = -1; vec.y = -1; break;
      case 11: vec.x = -0.5; vec.y = -1; break;
      case 12: vec.y = -1; break;
      case 13: vec.x = 0.5; vec.y = -1; break;
      case 14: vec.x = 1; vec.y = -1; break;
      case 15: vec.x = 1; vec.y = -0.5; break;
    }
    return vec;
  }

  private handleSubshapeCommand(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      polylines: Point[][];
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    let subCode = 0;
    let shape;
    let height = state.scale * this.fontData.content.height;
    let width = height;
    const origin = state.currentPoint.clone();

    if (state.currentPolyline.length > 1) {
      state.polylines.push(state.currentPolyline.slice());
      state.currentPolyline = [];
    }

    switch (this.fontData.header.fontType) {
      case ShxFontType.SHAPES:
        i++;
        subCode = data[i];
        break;
      case ShxFontType.BIGFONT:
        i++;
        subCode = data[i];
        if (subCode === 0) {
          // Extended BigFont: 7,0,primitive#,basepoint-x,basepoint-y[,width],height
          i++;
          subCode = (data[i++] << 8) | data[i++];
          origin.x = ShxFileReader.byteToSByte(data[i++]) * state.scale;
          origin.y = ShxFileReader.byteToSByte(data[i++]) * state.scale;
          if (this.fontData.content.isExtended) {
            width = data[i++] * state.scale;
            height = data[i] * state.scale;
          } else {
            height = data[i] * state.scale;
          }
        }
        break;
      case ShxFontType.UNIFONT:
        i++;
        subCode = (data[i++] << 8) | data[i++];
        break;
    }

    if (subCode !== 0) {
      shape = this.getScaledSubshapeAtInsertPoint(subCode, width, height, origin);
      if (shape) {
        state.polylines.push(...shape.polylines.slice());
      }
    }

    state.currentPolyline = [];
    return i;
  }

  private handleXYDisplacement(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    const vec = new Point();
    vec.x = ShxFileReader.byteToSByte(data[++i]);
    vec.y = ShxFileReader.byteToSByte(data[++i]);
    state.currentPoint.add(vec.multiply(state.scale));
    if (state.isPenDown) {
      state.currentPolyline.push(state.currentPoint.clone());
    }
    return i;
  }

  private handleMultipleXYDisplacements(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    while (true) {
      const vec = new Point();
      vec.x = ShxFileReader.byteToSByte(data[++i]);
      vec.y = ShxFileReader.byteToSByte(data[++i]);
      if (vec.x === 0 && vec.y === 0) break;
      state.currentPoint.add(vec.multiply(state.scale));
      if (state.isPenDown) {
        state.currentPolyline.push(state.currentPoint.clone());
      }
    }
    return i;
  }

  private handleOctantArc(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    const radius = data[++i] * state.scale;
    const flag = ShxFileReader.byteToSByte(data[++i]);
    const startOctant = (flag & 0x70) >> 4;
    let octantCount = flag & 0x07;
    const isClockwise = flag < 0;
    const startRadian = (Math.PI / 4) * startOctant;
    const center = state.currentPoint
      .clone()
      .subtract(new Point(Math.cos(startRadian) * radius, Math.sin(startRadian) * radius));

    const arc = Arc.fromOctant(center, radius, startOctant, octantCount, isClockwise);

    if (state.isPenDown) {
      const arcPoints = arc.tessellate();
      state.currentPolyline.pop();
      state.currentPolyline.push(...arcPoints.slice());
    }
    state.currentPoint = arc.tessellate().pop()?.clone() as Point;
    return i;
  }

  private handleFractionalArc(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    const startOffset = data[++i];
    const endOffset = data[++i];
    const hr = data[++i];
    const lr = data[++i];
    const r = (hr * 255 + lr) * state.scale;
    const flag = ShxFileReader.byteToSByte(data[++i]);
    const n1 = (flag & 0x70) >> 4;
    let n2 = flag & 0x07;
    if (n2 === 0) n2 = 8;
    if (endOffset !== 0) n2--;

    const pi_4 = Math.PI / 4;
    let span = pi_4 * n2;
    let delta = CIRCLE_SPAN;
    let sign = 1;
    if (flag < 0) {
      delta = -delta;
      span = -span;
      sign = -1;
    }

    let startRadian = pi_4 * n1;
    let endRadian = startRadian + span;
    startRadian += ((pi_4 * startOffset) / 256) * sign;
    endRadian += ((pi_4 * endOffset) / 256) * sign;

    const center = state.currentPoint
      .clone()
      .subtract(new Point(r * Math.cos(startRadian), r * Math.sin(startRadian)));

    state.currentPoint = center
      .clone()
      .add(new Point(r * Math.cos(endRadian), r * Math.sin(endRadian)));

    if (state.isPenDown) {
      let currentRadian = startRadian;
      const points = [];
      points.push(
        center.clone().add(new Point(r * Math.cos(currentRadian), r * Math.sin(currentRadian)))
      );
      if (delta > 0) {
        while (currentRadian + delta < endRadian) {
          currentRadian += delta;
          points.push(
            center.clone().add(new Point(r * Math.cos(currentRadian), r * Math.sin(currentRadian)))
          );
        }
      } else {
        while (currentRadian + delta > endRadian) {
          currentRadian += delta;
          points.push(
            center.clone().add(new Point(r * Math.cos(currentRadian), r * Math.sin(currentRadian)))
          );
        }
      }
      points.push(center.clone().add(new Point(r * Math.cos(endRadian), r * Math.sin(endRadian))));
      state.currentPolyline.push(...points);
    }
    return i;
  }

  private handleBulgeArc(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    const vec = new Point();
    vec.x = ShxFileReader.byteToSByte(data[++i]);
    vec.y = ShxFileReader.byteToSByte(data[++i]);
    const bulge = ShxFileReader.byteToSByte(data[++i]);
    state.currentPoint = this.handleArcSegment(
      state.currentPoint, vec, bulge, state.scale, state.isPenDown, state.currentPolyline
    );
    return i;
  }

  private handleMultipleBulgeArcs(
    data: Uint8Array,
    index: number,
    state: {
      currentPoint: Point;
      currentPolyline: Point[];
      scale: number;
      isPenDown: boolean;
    }
  ): number {
    let i = index;
    while (true) {
      const vec = new Point();
      vec.x = ShxFileReader.byteToSByte(data[++i]);
      vec.y = ShxFileReader.byteToSByte(data[++i]);
      if (vec.x === 0 && vec.y === 0) break;
      const bulge = ShxFileReader.byteToSByte(data[++i]);
      state.currentPoint = this.handleArcSegment(
        state.currentPoint, vec, bulge, state.scale, state.isPenDown, state.currentPolyline
      );
    }
    return i;
  }

  private handleArcSegment(
    currentPoint: Point,
    vec: Point,
    bulge: number,
    scale: number,
    isPenDown: boolean,
    currentPolyline: Point[]
  ): Point {
    vec.x *= scale;
    vec.y *= scale;
    if (bulge < -127) bulge = -127;

    const newPoint = currentPoint.clone();
    if (isPenDown) {
      if (bulge === 0) {
        currentPolyline.push(newPoint.clone().add(vec));
      } else {
        const end = newPoint.clone().add(vec);
        const arc = Arc.fromBulge(newPoint, end, bulge / 127.0);
        const arcPoints = arc.tessellate();
        currentPolyline.push(...arcPoints.slice(1));
      }
    }
    newPoint.add(vec);
    return newPoint;
  }

  private skipCode(data: Uint8Array, index: number): number {
    const cb = data[index];
    switch (cb) {
      case 0x00: break;
      case 0x01: break;
      case 0x02: break;
      case 0x03:
      case 0x04:
        index++;
        break;
      case 0x05: break;
      case 0x06: break;
      case 0x07:
        switch (this.fontData.header.fontType) {
          case ShxFontType.SHAPES:
            index++;
            break;
          case ShxFontType.BIGFONT:
            {
              index++;
              const subCode = data[index];
              if (subCode === 0) {
                index += this.fontData.content.isExtended ? 6 : 5;
              }
            }
            break;
          case ShxFontType.UNIFONT:
            index += 2;
            break;
        }
        break;
      case 0x08:
        index += 2;
        break;
      case 0x09:
        {
          while (true) {
            const x = data[++index];
            const y = data[++index];
            if (x === 0 && y === 0) break;
          }
        }
        break;
      case 0x0a:
        index += 2;
        break;
      case 0x0b:
        index += 5;
        break;
      case 0x0c:
        index += 3;
        break;
      case 0x0d:
        {
          while (true) {
            const x = data[++index];
            const y = data[++index];
            if (x === 0 && y === 0) break;
            index++;
          }
        }
        break;
      case 0x0e:
        break;
      default:
        break;
    }
    return index;
  }

  private getScaledSubshapeAtInsertPoint(
    code: number,
    width: number,
    height: number,
    insertPoint: Point
  ): ShxShape | undefined {
    let baseShape = this.shapeCache.get(code);
    if (!baseShape) {
      const data = this.fontData.content.data[code];
      if (!data) return undefined;
      baseShape = this.parseShape(data);
      this.shapeData.set(code, baseShape);
      this.shapeCache.set(code, baseShape);
    }

    const normalized = baseShape.normalizeToOrigin(true);
    const scaled = this.scaleShapeByHeightAndWidth(normalized, height, width);
    return scaled.offset(insertPoint, false);
  }

  // ========================================================================
  // NEW: Inline execution engine (CAD mode)
  // Subshapes execute in the parent's state context.
  // ========================================================================

  /**
   * Execute a shape's bytecode inline, sharing state with the caller.
   * This is the core of the CAD rendering engine.
   */
  private executeShapeInline(data: Uint8Array, state: ExecuteState): void {
    for (let i = 0; i < data.length; i++) {
      const cb = data[i];

      if (cb <= 0x0f) {
        i = this.executeSpecialCommand(cb, data, i, state);
      } else {
        this.executeVectorCommand(cb, state);
      }
    }
  }

  /**
   * Execute a special command (0x00 - 0x0F) inline.
   * Key differences from the legacy handler:
   * - Command 7: inline-executes the subshape (shared state)
   * - Command 14: properly skips/executes based on verticalText flag
   * - Commands 3/4/5/6: work on the shared state
   */
  private executeSpecialCommand(
    command: number,
    data: Uint8Array,
    index: number,
    state: ExecuteState
  ): number {
    let i = index;

    switch (command) {
      case 0: // End
        break;

      case 1: // Pen down
        state.penDown = true;
        state.currentPolyline.push(this.renderPoint(state));
        break;

      case 2: // Pen up
        state.penDown = false;
        if (state.currentPolyline.length > 1) {
          state.polylines.push(state.currentPolyline.slice());
        }
        state.currentPolyline = [];
        break;

      case 3: // Divide scale
        i++;
        if (state.scaleTarget === 'wrapper') {
          state.wrapperScale /= data[i];
        } else {
          state.scale /= data[i];
        }
        break;

      case 4: // Multiply scale
        i++;
        if (state.scaleTarget === 'wrapper') {
          state.wrapperScale *= data[i];
        } else {
          state.scale *= data[i];
        }
        break;

      case 5: // Push (shared stack)
        if (state.stack.length >= 16) break; // safety limit
        state.stack.push(state.currentPoint.clone());
        break;

      case 6: // Pop (shared stack)
        if (state.stack.length > 0) {
          state.currentPoint = state.stack.pop()!;
        }
        break;

      case 7: // Subshape — INLINE EXECUTION
        i = this.executeSubshapeInline(data, i, state);
        break;

      case 8: // XY displacement
        i = this.executeXYDisplacement(data, i, state);
        break;

      case 9: // Multiple XY displacements
        i = this.executeMultipleXYDisplacements(data, i, state);
        break;

      case 10: // Octant arc
        i = this.executeOctantArc(data, i, state);
        break;

      case 11: // Fractional arc
        i = this.executeFractionalArc(data, i, state);
        break;

      case 12: // Bulge arc
        i = this.executeBulgeArc(data, i, state);
        break;

      case 13: // Multiple bulge arcs
        i = this.executeMultipleBulgeArcs(data, i, state);
        break;

      case 14: // Vertical-only command
        i = this.executeVerticalOnlyCommand(data, i, state);
        break;
    }

    return i;
  }

  private renderPoint(state: ExecuteState): Point {
    return this.renderLogicalPoint(state.currentPoint, state);
  }

  private renderLogicalPoint(point: Point, state: ExecuteState): Point {
    const rendered = point.clone().multiply(state.wrapperScale);
    state.lastRenderedPoint = rendered.clone();
    return rendered;
  }

  /**
   * Execute vector command inline (shared state)
   */
  private executeVectorCommand(command: number, state: ExecuteState): void {
    const len = (command & 0xf0) >> 4;
    const dir = command & 0x0f;
    const vec = this.getVectorForDirection(dir);
    state.currentPoint.add(vec.multiply(len * state.scale));
    const renderedPoint = this.renderPoint(state);
    if (state.penDown) {
      state.currentPolyline.push(renderedPoint);
    }
  }

  /**
   * Execute subshape (command 7) INLINE.
   * The subshape's commands execute on the same SHX program state as the parent.
   * This means scale/currentPoint/stack/pen/currentPolyline changes intentionally
   * propagate back to the parent path. BigFont control subshapes such as 142/143
   * rely on this behavior to scale the following main strokes and restore later.
   */
  private executeSubshapeInline(
    data: Uint8Array,
    index: number,
    state: ExecuteState
  ): number {
    let i = index;
    let subCode = 0;

    switch (this.fontData.header.fontType) {
      case ShxFontType.SHAPES:
        i++;
        subCode = data[i];
        this.executeSubshapeByCode(subCode, state);
        break;

      case ShxFontType.BIGFONT:
        i++;
        subCode = data[i];
        if (subCode === 0) {
          i++;
          subCode = (data[i++] << 8) | data[i++];
          const originX = ShxFileReader.byteToSByte(data[i++]) * state.scale;
          const originY = ShxFileReader.byteToSByte(data[i++]) * state.scale;
          let width: number;
          let height: number;
          if (this.fontData.content.isExtended) {
            width = data[i++] * state.scale;
            height = data[i] * state.scale;
          } else {
            height = data[i] * state.scale;
            width = height;
          }
          const insertPoint = state.currentPoint.clone().add(new Point(originX, originY));
          const shape = this.getScaledSubshapeAtInsertPoint(subCode, width, height, insertPoint);
          if (shape) {
            state.polylines.push(...shape.polylines);
          }
        } else {
          // Non-extended BigFont subshape: 7,subCode only.
          // Enter subshape context: scaleTarget='wrapper', scale changes affect wrapperScale.
          // This isolates BigFont control subshape scale modifications from the main path.
          const savedTarget = state.scaleTarget;
          state.scaleTarget = 'wrapper';
          this.executeSubshapeByCode(subCode, state);
          state.scaleTarget = savedTarget;
        }
        break;

      case ShxFontType.UNIFONT:
        i++;
        subCode = (data[i++] << 8) | data[i++];
        this.executeSubshapeByCode(subCode, state);
        break;
    }

    return i;
  }

  private executeSubshapeByCode(code: number, state: ExecuteState): void {
    let subCode = code;
    if (subCode < 0) subCode += 256;
    const subData = this.fontData.content.data[subCode];
    if (!subData) return;
    this.executeShapeInline(subData, state);
  }

  /**
   * Command 14: Vertical-only command.
   * Horizontal: skip the next command.
   * Vertical: execute the next command normally.
   */
  private executeVerticalOnlyCommand(
    data: Uint8Array,
    index: number,
    state: ExecuteState
  ): number {
    let i = index;
    i++; // move past the 0x0E byte

    if (state.verticalText) {
      // Vertical mode: execute the next command
      if (i < data.length) {
        const next = data[i];
        if (next <= 0x0f) {
          i = this.executeSpecialCommand(next, data, i, state);
        } else {
          this.executeVectorCommand(next, state);
        }
      }
    } else {
      // Horizontal mode: skip the next command
      i = this.skipCommandForHorizontal(data, i);
    }

    return i;
  }

  /**
   * Skip one complete command (for horizontal mode handling of command 14).
   * Properly skips all parameter bytes of the command.
   */
  private skipCommandForHorizontal(data: Uint8Array, index: number): number {
    if (index >= data.length) return index;

    const cb = data[index];
    if (cb <= 0x0f) {
      // Special command: skip its parameters
      return this.skipCode(data, index);
    } else {
      // Vector command: single byte, no parameters to skip
      return index;
    }
  }

  // ========================================================================
  // Inline execution helpers for commands 8-13
  // Same logic as legacy handlers but operate on shared ExecuteState
  // ========================================================================

  private executeXYDisplacement(
    data: Uint8Array,
    index: number,
    state: ExecuteState
  ): number {
    let i = index;
    const dx = ShxFileReader.byteToSByte(data[++i]);
    const dy = ShxFileReader.byteToSByte(data[++i]);
    state.currentPoint.x += dx * state.scale;
    state.currentPoint.y += dy * state.scale;
    const renderedPoint = this.renderPoint(state);
    if (state.penDown) {
      state.currentPolyline.push(renderedPoint);
    }
    return i;
  }

  private executeMultipleXYDisplacements(
    data: Uint8Array,
    index: number,
    state: ExecuteState
  ): number {
    let i = index;
    while (true) {
      const dx = ShxFileReader.byteToSByte(data[++i]);
      const dy = ShxFileReader.byteToSByte(data[++i]);
      if (dx === 0 && dy === 0) break;
      state.currentPoint.x += dx * state.scale;
      state.currentPoint.y += dy * state.scale;
      const renderedPoint = this.renderPoint(state);
      if (state.penDown) {
        state.currentPolyline.push(renderedPoint);
      }
    }
    return i;
  }

  private executeOctantArc(
    data: Uint8Array,
    index: number,
    state: ExecuteState
  ): number {
    let i = index;
    const radius = data[++i] * state.scale;
    const flag = ShxFileReader.byteToSByte(data[++i]);
    const startOctant = (flag & 0x70) >> 4;
    let octantCount = flag & 0x07;
    const isClockwise = flag < 0;
    const startRadian = (Math.PI / 4) * startOctant;
    const center = state.currentPoint
      .clone()
      .subtract(new Point(Math.cos(startRadian) * radius, Math.sin(startRadian) * radius));

    const arc = Arc.fromOctant(center, radius, startOctant, octantCount, isClockwise);

    if (state.penDown) {
      const arcPoints = arc.tessellate();
      state.currentPolyline.pop();
      state.currentPolyline.push(...arcPoints.map(point => this.renderLogicalPoint(point, state)));
    }
    state.currentPoint = arc.tessellate().pop()?.clone() as Point;
    return i;
  }

  private executeFractionalArc(
    data: Uint8Array,
    index: number,
    state: ExecuteState
  ): number {
    let i = index;
    const startOffset = data[++i];
    const endOffset = data[++i];
    const hr = data[++i];
    const lr = data[++i];
    const r = (hr * 255 + lr) * state.scale;
    const flag = ShxFileReader.byteToSByte(data[++i]);
    const n1 = (flag & 0x70) >> 4;
    let n2 = flag & 0x07;
    if (n2 === 0) n2 = 8;
    if (endOffset !== 0) n2--;

    const pi_4 = Math.PI / 4;
    let span = pi_4 * n2;
    let delta = CIRCLE_SPAN;
    let sign = 1;
    if (flag < 0) {
      delta = -delta;
      span = -span;
      sign = -1;
    }

    let startRadian = pi_4 * n1;
    let endRadian = startRadian + span;
    startRadian += ((pi_4 * startOffset) / 256) * sign;
    endRadian += ((pi_4 * endOffset) / 256) * sign;

    const center = state.currentPoint
      .clone()
      .subtract(new Point(r * Math.cos(startRadian), r * Math.sin(startRadian)));

    state.currentPoint = center
      .clone()
      .add(new Point(r * Math.cos(endRadian), r * Math.sin(endRadian)));

    if (state.penDown) {
      let currentRadian = startRadian;
      const points = [];
      points.push(
        center.clone().add(new Point(r * Math.cos(currentRadian), r * Math.sin(currentRadian)))
      );
      if (delta > 0) {
        while (currentRadian + delta < endRadian) {
          currentRadian += delta;
          points.push(
            center.clone().add(new Point(r * Math.cos(currentRadian), r * Math.sin(currentRadian)))
          );
        }
      } else {
        while (currentRadian + delta > endRadian) {
          currentRadian += delta;
          points.push(
            center.clone().add(new Point(r * Math.cos(currentRadian), r * Math.sin(currentRadian)))
          );
        }
      }
      points.push(center.clone().add(new Point(r * Math.cos(endRadian), r * Math.sin(endRadian))));
      state.currentPolyline.push(...points.map(point => this.renderLogicalPoint(point, state)));
    }
    return i;
  }

  private executeBulgeArc(
    data: Uint8Array,
    index: number,
    state: ExecuteState
  ): number {
    let i = index;
    const vec = new Point();
    vec.x = ShxFileReader.byteToSByte(data[++i]) * state.scale;
    vec.y = ShxFileReader.byteToSByte(data[++i]) * state.scale;
    const bulge = ShxFileReader.byteToSByte(data[++i]);

    const newPoint = state.currentPoint.clone();
    if (state.penDown) {
      if (bulge === 0) {
        state.currentPolyline.push(this.renderLogicalPoint(newPoint.clone().add(vec), state));
      } else {
        const end = newPoint.clone().add(vec);
        const arc = Arc.fromBulge(newPoint, end, bulge / 127.0);
        const arcPoints = arc.tessellate().slice(1);
        state.currentPolyline.push(...arcPoints.map(point => this.renderLogicalPoint(point, state)));
      }
    }
    state.currentPoint = newPoint.add(vec);
    return i;
  }

  private executeMultipleBulgeArcs(
    data: Uint8Array,
    index: number,
    state: ExecuteState
  ): number {
    let i = index;
    while (true) {
      const vec = new Point();
      vec.x = ShxFileReader.byteToSByte(data[++i]) * state.scale;
      vec.y = ShxFileReader.byteToSByte(data[++i]) * state.scale;
      if (vec.x === 0 && vec.y === 0) break;
      const bulge = ShxFileReader.byteToSByte(data[++i]);

      const newPoint = state.currentPoint.clone();
      if (state.penDown) {
        if (bulge === 0) {
          state.currentPolyline.push(this.renderLogicalPoint(newPoint.clone().add(vec), state));
        } else {
          const end = newPoint.clone().add(vec);
          const arc = Arc.fromBulge(newPoint, end, bulge / 127.0);
          const arcPoints = arc.tessellate().slice(1);
        state.currentPolyline.push(...arcPoints.map(point => this.renderLogicalPoint(point, state)));
        }
      }
      state.currentPoint = newPoint.add(vec);
    }
    return i;
  }
}

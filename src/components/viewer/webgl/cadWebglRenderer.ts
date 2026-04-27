interface RenderViewState {
  width: number;
  height: number;
  dpr: number;
  zoom: number;
  panX: number;
  panY: number;
  centerX: number;
  centerY: number;
}

interface GeometryBuffers {
  lineVertex: Float32Array;
  pointVertex: Float32Array;
}

interface ProgramUniforms {
  uViewport: WebGLUniformLocation | null;
  uCenter: WebGLUniformLocation | null;
  uPan: WebGLUniformLocation | null;
  uZoom: WebGLUniformLocation | null;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(shader) || 'shader compile failed';
    gl.deleteShader(shader);
    throw new Error(msg);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  if (!p) throw new Error('createProgram failed');
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const msg = gl.getProgramInfoLog(p) || 'program link failed';
    gl.deleteProgram(p);
    throw new Error(msg);
  }
  return p;
}

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec3 a_color;
layout(location=2) in vec3 a_pick;
uniform vec2 u_viewport;
uniform vec2 u_center;
uniform vec2 u_pan;
uniform float u_zoom;
out vec3 v_color;
out vec3 v_pick;
void main() {
  float sx = a_pos.x * u_zoom + u_pan.x + u_center.x;
  float sy = -a_pos.y * u_zoom + u_pan.y + u_center.y;
  float ndcX = (sx / u_viewport.x) * 2.0 - 1.0;
  float ndcY = 1.0 - (sy / u_viewport.y) * 2.0;
  gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
  gl_PointSize = 3.0;
  v_color = a_color;
  v_pick = a_pick;
}`;

const FS_RENDER = `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 outColor;
void main() {
  outColor = vec4(v_color, 1.0);
}`;

const FS_PICK = `#version 300 es
precision highp float;
in vec3 v_pick;
out vec4 outColor;
void main() {
  outColor = vec4(v_pick, 1.0);
}`;

export class CadWebglRenderer {
  private readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private renderProgram: WebGLProgram;
  private pickProgram: WebGLProgram;
  private renderUniforms: ProgramUniforms;
  private pickUniforms: ProgramUniforms;
  private lineVbo: WebGLBuffer;
  private pointVbo: WebGLBuffer;
  private lineVao: WebGLVertexArrayObject | null;
  private pointVao: WebGLVertexArrayObject | null;
  private lineCount = 0;
  private pointCount = 0;
  private pickFramebuffer: WebGLFramebuffer | null = null;
  private pickTexture: WebGLTexture | null = null;
  private pickDepth: WebGLRenderbuffer | null = null;
  private frameWidth = 1;
  private frameHeight = 1;
  private pickDirty = true;
  private view: RenderViewState = { width: 1, height: 1, dpr: 1, zoom: 1, panX: 0, panY: 0, centerX: 0.5, centerY: 0.5 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.renderProgram = createProgram(gl, VS, FS_RENDER);
    this.pickProgram = createProgram(gl, VS, FS_PICK);
    this.renderUniforms = this.getUniformLocations(this.renderProgram);
    this.pickUniforms = this.getUniformLocations(this.pickProgram);
    const lineVbo = gl.createBuffer();
    const pointVbo = gl.createBuffer();
    if (!lineVbo || !pointVbo) throw new Error('createBuffer failed');
    this.lineVbo = lineVbo;
    this.pointVbo = pointVbo;
    this.lineVao = this.createGeometryVao(this.lineVbo);
    this.pointVao = this.createGeometryVao(this.pointVbo);
  }

  resize(width: number, height: number, dpr: number) {
    const pixelW = Math.max(1, Math.floor(width * dpr));
    const pixelH = Math.max(1, Math.floor(height * dpr));
    this.canvas.width = pixelW;
    this.canvas.height = pixelH;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.frameWidth = pixelW;
    this.frameHeight = pixelH;
    this.pickDirty = true;
    this.ensurePickTargets();
  }

  updateView(view: RenderViewState) {
    const prev = this.view;
    this.view = view;
    if (
      prev.width !== view.width ||
      prev.height !== view.height ||
      prev.dpr !== view.dpr ||
      prev.zoom !== view.zoom ||
      prev.panX !== view.panX ||
      prev.panY !== view.panY ||
      prev.centerX !== view.centerX ||
      prev.centerY !== view.centerY
    ) {
      this.pickDirty = true;
    }
  }

  setGeometry(data: GeometryBuffers) {
    const gl = this.gl;
    this.lineCount = Math.floor(data.lineVertex.length / 8);
    this.pointCount = Math.floor(data.pointVertex.length / 8);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.lineVertex, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.pointVertex, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.pickDirty = true;
  }

  render() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.frameWidth, this.frameHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(3 / 255, 7 / 255, 18 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawProgram(this.renderProgram, this.renderUniforms);
  }

  pick(cssX: number, cssY: number): number {
    const gl = this.gl;
    this.ensurePickTargets();
    if (!this.pickFramebuffer) return 0;
    this.ensurePickBuffer();

    const px = Math.max(0, Math.min(this.frameWidth - 1, Math.floor(cssX * this.view.dpr)));
    const pyTop = Math.max(0, Math.min(this.frameHeight - 1, Math.floor(cssY * this.view.dpr)));
    const py = this.frameHeight - 1 - pyTop;
    const out = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFramebuffer);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const idx = out[0] + (out[1] << 8) + (out[2] << 16);
    return idx;
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.lineVbo);
    gl.deleteBuffer(this.pointVbo);
    if (this.lineVao) gl.deleteVertexArray(this.lineVao);
    if (this.pointVao) gl.deleteVertexArray(this.pointVao);
    gl.deleteProgram(this.renderProgram);
    gl.deleteProgram(this.pickProgram);
    if (this.pickTexture) gl.deleteTexture(this.pickTexture);
    if (this.pickDepth) gl.deleteRenderbuffer(this.pickDepth);
    if (this.pickFramebuffer) gl.deleteFramebuffer(this.pickFramebuffer);
  }

  private getUniformLocations(program: WebGLProgram): ProgramUniforms {
    const gl = this.gl;
    return {
      uViewport: gl.getUniformLocation(program, 'u_viewport'),
      uCenter: gl.getUniformLocation(program, 'u_center'),
      uPan: gl.getUniformLocation(program, 'u_pan'),
      uZoom: gl.getUniformLocation(program, 'u_zoom'),
    };
  }

  private createGeometryVao(vbo: WebGLBuffer): WebGLVertexArrayObject | null {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) return null;
    const stride = 8 * 4;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 5 * 4);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vao;
  }

  private ensurePickTargets() {
    const gl = this.gl;
    if (!this.pickFramebuffer) this.pickFramebuffer = gl.createFramebuffer();
    if (!this.pickTexture) this.pickTexture = gl.createTexture();
    if (!this.pickDepth) this.pickDepth = gl.createRenderbuffer();
    if (!this.pickFramebuffer || !this.pickTexture || !this.pickDepth) return;

    gl.bindTexture(gl.TEXTURE_2D, this.pickTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.frameWidth, this.frameHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.frameWidth, this.frameHeight);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pickTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.pickDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  private ensurePickBuffer() {
    if (!this.pickDirty || !this.pickFramebuffer) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFramebuffer);
    gl.viewport(0, 0, this.frameWidth, this.frameHeight);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.drawProgram(this.pickProgram, this.pickUniforms);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.pickDirty = false;
  }

  private drawProgram(program: WebGLProgram, uniforms: ProgramUniforms) {
    const gl = this.gl;
    gl.useProgram(program);
    gl.uniform2f(uniforms.uViewport, this.view.width, this.view.height);
    gl.uniform2f(uniforms.uCenter, this.view.centerX, this.view.centerY);
    gl.uniform2f(uniforms.uPan, this.view.panX, this.view.panY);
    gl.uniform1f(uniforms.uZoom, this.view.zoom);

    if (this.lineCount > 0 && this.lineVao) {
      gl.bindVertexArray(this.lineVao);
      gl.drawArrays(gl.LINES, 0, this.lineCount);
    }
    if (this.pointCount > 0 && this.pointVao) {
      gl.bindVertexArray(this.pointVao);
      gl.drawArrays(gl.POINTS, 0, this.pointCount);
    }
    gl.bindVertexArray(null);
  }
}

export type { RenderViewState };

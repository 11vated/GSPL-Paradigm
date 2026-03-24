/**
 * WebGL2 Renderer — compiles and renders GLSL fragment shaders.
 *
 * Handles context creation, shader compilation, uniform management,
 * fullscreen quad geometry, animation loop, and graceful error recovery.
 * Designed to render gene-driven SDF shaders from @paradigm/renderer.
 */

import { useRef, useEffect, useCallback, useState, memo } from 'react';

interface WebGLRendererProps {
  /** GLSL fragment shader source (version 300 es). */
  fragmentSource: string;
  /** GLSL vertex shader source. */
  vertexSource: string;
  /** Additional CSS classes. */
  className?: string;
  /** Emotion state: 0=calm, 1=rage. Controls aura color/intensity. */
  emotion?: number;
  /** Transform state: 0=base, 1=fully transformed. Controls morph+color shift. */
  transform?: number;
  /** Power activation: 0=dormant, 1=active. Controls ability VFX. */
  power?: number;
}

/**
 * Renders a GLSL shader on a WebGL2 canvas with animation.
 * Memoized — only recompiles when shader source changes.
 */
export const WebGLRenderer = memo(function WebGLRenderer({
  fragmentSource,
  vertexSource,
  className = '',
  emotion = 0,
  transform = 0,
  power = 0,
}: WebGLRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const uniformsRef = useRef({ emotion, transform, power });
  uniformsRef.current = { emotion, transform, power };
  const stateRef = useRef<{
    gl: WebGL2RenderingContext | null;
    program: WebGLProgram | null;
    animId: number;
    startTime: number;
  }>({ gl: null, program: null, animId: 0, startTime: performance.now() });

  const [error, setError] = useState<string | null>(null);

  const compileAndLink = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    // Get or create WebGL2 context
    let gl = stateRef.current.gl;
    if (!gl) {
      gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!gl) {
        setError('WebGL2 not supported in this browser');
        return false;
      }
      stateRef.current.gl = gl;
    }

    // Compile vertex shader
    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return false;
    gl.shaderSource(vs, vertexSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      setError(`Vertex shader: ${gl.getShaderInfoLog(vs) ?? 'unknown error'}`);
      gl.deleteShader(vs);
      return false;
    }

    // Compile fragment shader
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) { gl.deleteShader(vs); return false; }
    gl.shaderSource(fs, fragmentSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fs) ?? 'unknown error';
      setError(`Fragment shader: ${log.slice(0, 200)}`);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return false;
    }

    // Link program
    const program = gl.createProgram();
    if (!program) { gl.deleteShader(vs); gl.deleteShader(fs); return false; }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    // Clean up shader objects (attached to program now)
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setError(`Link: ${gl.getProgramInfoLog(program) ?? 'unknown error'}`);
      gl.deleteProgram(program);
      return false;
    }

    // Clean up old program
    if (stateRef.current.program) {
      gl.deleteProgram(stateRef.current.program);
    }
    stateRef.current.program = program;

    // Set up fullscreen quad geometry
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }

    gl.useProgram(program);
    stateRef.current.startTime = performance.now();
    setError(null);
    return true;
  }, [fragmentSource, vertexSource]);

  // Animation loop
  useEffect(() => {
    const success = compileAndLink();
    if (!success) return;

    const render = () => {
      const { gl, program } = stateRef.current;
      const canvas = canvasRef.current;
      if (!gl || !program || !canvas) return;

      // Handle display resize
      const dpr = Math.min(window.devicePixelRatio, 2);
      const displayW = canvas.clientWidth;
      const displayH = canvas.clientHeight;
      const pixelW = Math.floor(displayW * dpr);
      const pixelH = Math.floor(displayH * dpr);

      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }

      gl.viewport(0, 0, pixelW, pixelH);
      gl.useProgram(program);

      // Set uniforms
      const resLoc = gl.getUniformLocation(program, 'u_resolution');
      const timeLoc = gl.getUniformLocation(program, 'u_time');
      const mouseLoc = gl.getUniformLocation(program, 'u_mouse');
      const emotionLoc = gl.getUniformLocation(program, 'u_emotion');
      const transformLoc = gl.getUniformLocation(program, 'u_transform');
      const powerLoc = gl.getUniformLocation(program, 'u_power');

      if (resLoc) gl.uniform2f(resLoc, pixelW, pixelH);
      if (timeLoc) gl.uniform1f(timeLoc, (performance.now() - stateRef.current.startTime) / 1000.0);
      if (mouseLoc) gl.uniform2f(mouseLoc, mouseRef.current.x, mouseRef.current.y);
      if (emotionLoc) gl.uniform1f(emotionLoc, uniformsRef.current.emotion);
      if (transformLoc) gl.uniform1f(transformLoc, uniformsRef.current.transform);
      if (powerLoc) gl.uniform1f(powerLoc, uniformsRef.current.power);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      stateRef.current.animId = requestAnimationFrame(render);
    };

    stateRef.current.animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(stateRef.current.animId);
    };
  }, [compileAndLink]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(stateRef.current.animId);
      if (stateRef.current.program && stateRef.current.gl) {
        stateRef.current.gl.deleteProgram(stateRef.current.program);
      }
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: 1.0 - (e.clientY - rect.top) / rect.height,
    };
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`}>
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ display: 'block' }}
        onMouseMove={handleMouseMove}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)]/90 p-4">
          <div className="max-w-sm rounded-md border border-red-800/50 bg-red-900/20 p-3 text-xs text-red-300">
            <div className="mb-1 font-medium">Shader Error</div>
            <div className="font-mono text-[10px] leading-relaxed opacity-80">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
});

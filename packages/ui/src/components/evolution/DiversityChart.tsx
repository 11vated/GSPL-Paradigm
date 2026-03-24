import { useRef, useEffect, memo } from 'react';
import * as d3 from 'd3';
import type { GenerationSnapshot } from '../../stores/evolutionStore';

interface DiversityChartProps {
  data: GenerationSnapshot[];
  width?: number;
  height?: number;
}

/**
 * D3-powered population diversity chart over generations.
 * Memoized to prevent unnecessary re-renders.
 */
export const DiversityChart = memo(function DiversityChart({ data, width = 500, height = 120 }: DiversityChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length < 2) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 8, right: 12, bottom: 24, left: 40 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Gradient
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'diversity-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    gradient.append('stop').attr('offset', '0%').attr('stop-color', 'var(--color-cyan)').attr('stop-opacity', 0.3);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', 'var(--color-cyan)').attr('stop-opacity', 0.02);

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(data, (d) => d.generation) ?? 1])
      .range([0, w]);

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([h, 0]);

    // Filled area
    const area = d3.area<GenerationSnapshot>()
      .x((d) => xScale(d.generation))
      .y0(h)
      .y1((d) => yScale(d.diversity))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('d', area)
      .attr('fill', 'url(#diversity-gradient)');

    // Line
    const line = d3.line<GenerationSnapshot>()
      .x((d) => xScale(d.generation))
      .y((d) => yScale(d.diversity))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', 'var(--color-cyan)')
      .attr('stroke-width', 2)
      .attr('filter', 'drop-shadow(0 0 4px var(--color-cyan-glow))');

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale).ticks(6).tickSize(0).tickPadding(6))
      .call((sel) => {
        sel.select('.domain').attr('stroke', 'var(--color-border)');
        sel.selectAll('.tick text').attr('fill', 'var(--color-text-muted)').attr('font-size', '9px');
      });

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(4).tickSize(0).tickPadding(6).tickFormat(d3.format('.0%')))
      .call((sel) => {
        sel.select('.domain').remove();
        sel.selectAll('.tick text').attr('fill', 'var(--color-text-muted)').attr('font-size', '9px');
      });

  }, [data, width, height]);

  if (data.length < 2) return null;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full rounded-md bg-[var(--color-bg)]"
    />
  );
});

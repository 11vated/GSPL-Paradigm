import { useRef, useEffect, memo } from 'react';
import * as d3 from 'd3';
import type { GenerationSnapshot } from '../../stores/evolutionStore';

interface FitnessChartProps {
  data: GenerationSnapshot[];
  width?: number;
  height?: number;
}

/**
 * D3-powered fitness chart showing best, average, and worst fitness
 * over generations with confidence band. Memoized to prevent re-renders
 * when parent state changes but data hasn't.
 */
export const FitnessChart = memo(function FitnessChart({ data, width = 500, height = 200 }: FitnessChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length < 2) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 12, right: 12, bottom: 28, left: 40 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(data, (d) => d.generation) ?? 1])
      .range([0, w]);

    const allFitness = data.flatMap((d) => [d.bestFitness, d.avgFitness, d.worstFitness]);
    const yMin = Math.min(0, d3.min(allFitness) ?? 0);
    const yMax = d3.max(allFitness) ?? 1;

    const yScale = d3.scaleLinear()
      .domain([yMin, yMax * 1.05])
      .range([h, 0])
      .nice();

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(yScale)
          .ticks(5)
          .tickSize(-w)
          .tickFormat(() => ''),
      )
      .call((sel) => {
        sel.select('.domain').remove();
        sel.selectAll('.tick line')
          .attr('stroke', 'var(--color-border)')
          .attr('stroke-opacity', 0.5);
      });

    // Confidence band (worst to best)
    const area = d3.area<GenerationSnapshot>()
      .x((d) => xScale(d.generation))
      .y0((d) => yScale(d.worstFitness))
      .y1((d) => yScale(d.bestFitness))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('d', area)
      .attr('fill', 'var(--color-primary)')
      .attr('fill-opacity', 0.08);

    // Lines
    const lineGen = (accessor: (d: GenerationSnapshot) => number) =>
      d3.line<GenerationSnapshot>()
        .x((d) => xScale(d.generation))
        .y((d) => yScale(accessor(d)))
        .curve(d3.curveMonotoneX);

    // Worst fitness (dim)
    g.append('path')
      .datum(data)
      .attr('d', lineGen((d) => d.worstFitness))
      .attr('fill', 'none')
      .attr('stroke', 'var(--color-text-dim)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3');

    // Average fitness
    g.append('path')
      .datum(data)
      .attr('d', lineGen((d) => d.avgFitness))
      .attr('fill', 'none')
      .attr('stroke', 'var(--color-text-muted)')
      .attr('stroke-width', 1.5);

    // Best fitness (primary color, glowing)
    g.append('path')
      .datum(data)
      .attr('d', lineGen((d) => d.bestFitness))
      .attr('fill', 'none')
      .attr('stroke', 'var(--color-primary)')
      .attr('stroke-width', 2.5)
      .attr('filter', 'drop-shadow(0 0 4px var(--color-primary-glow))');

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale).ticks(6).tickSize(0).tickPadding(8))
      .call((sel) => {
        sel.select('.domain').attr('stroke', 'var(--color-border)');
        sel.selectAll('.tick text')
          .attr('fill', 'var(--color-text-muted)')
          .attr('font-size', '10px');
      });

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(0).tickPadding(6))
      .call((sel) => {
        sel.select('.domain').remove();
        sel.selectAll('.tick text')
          .attr('fill', 'var(--color-text-muted)')
          .attr('font-size', '10px');
      });

    // Axis labels
    g.append('text')
      .attr('x', w / 2)
      .attr('y', h + 24)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--color-text-dim)')
      .attr('font-size', '9px')
      .text('Generation');

    // Legend
    const legend = g.append('g').attr('transform', `translate(${w - 120}, 0)`);
    const items = [
      { label: 'Best', color: 'var(--color-primary)', dash: '' },
      { label: 'Average', color: 'var(--color-text-muted)', dash: '' },
      { label: 'Worst', color: 'var(--color-text-dim)', dash: '3,3' },
    ];
    items.forEach((item, i) => {
      const row = legend.append('g').attr('transform', `translate(0, ${i * 14})`);
      row.append('line')
        .attr('x1', 0).attr('x2', 16).attr('y1', 4).attr('y2', 4)
        .attr('stroke', item.color).attr('stroke-width', 2)
        .attr('stroke-dasharray', item.dash);
      row.append('text')
        .attr('x', 20).attr('y', 7)
        .attr('fill', 'var(--color-text-muted)').attr('font-size', '9px')
        .text(item.label);
    });

  }, [data, width, height]);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-md bg-[var(--color-bg)] p-8 text-xs text-[var(--color-text-dim)]">
        Start evolution to see fitness chart
      </div>
    );
  }

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

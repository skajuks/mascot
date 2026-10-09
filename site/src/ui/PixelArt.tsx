/** A pixel map (one char per pixel, looked up in the palette) as crisp SVG rects, merging horizontal runs. */
export function PixelArt({ rows, palette, size, className }: { rows: readonly string[]; palette: Record<string, string>; size: number; className?: string }) {
  const w = Math.max(...rows.map(r => r.length))
  const rects: React.ReactNode[] = []
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      let n = 1
      while (row[x + n] === row[x]) n++
      const fill = palette[row[x]]
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={n} height={1} fill={fill} />)
      x += n
    }
  })
  return (
    <svg viewBox={`0 0 ${w} ${rows.length}`} width={w * size} height={rows.length * size} shapeRendering="crispEdges" aria-hidden="true" className={className}>
      {rects}
    </svg>
  )
}

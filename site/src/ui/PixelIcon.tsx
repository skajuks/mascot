// Icons drawn as pixel maps ('x' = filled), in currentColor, so they sit in the pixel world without an icon font.

const ICONS = {
  chevron: ['xx...xx', '.xx.xx.', '..xxx..', '...x...'],
  check: ['......x', '.....xx', 'x...xx.', 'xx.xx..', '.xxx...', '..x....'],
  copy: ['xxxxx..', 'x...x..', 'x.xxxxx', 'x.x...x', 'xxx...x', '..x...x', '..xxxxx'],
  plus: ['..x..', '..x..', 'xxxxx', '..x..', '..x..'],
  minus: ['.....', '.....', 'xxxxx', '.....', '.....'],
  link: ['..xxxx.', '.x....x', '.x..x.x', 'x.x..x.', 'x.x....', '.xxxx..'],
  arrow: ['...x...', '...xx..', 'xxxxxx.', 'xxxxxxx', 'xxxxxx.', '...xx..', '...x...'],
  play: ['x....', 'xxx..', 'xxxxx', 'xxx..', 'x....'],
  star: ['...x...', '...x...', 'xxxxxxx', '.xxxxx.', '..xxx..', '.xx.xx.', 'x.....x'],
} as const

export type IconName = keyof typeof ICONS

export function PixelIcon({ name, size = 2, className }: { name: IconName; size?: number; className?: string }) {
  const rows = ICONS[name]
  const w = rows[0].length
  const h = rows.length
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * size}
      height={h * size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === 'x' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)))}
    </svg>
  )
}

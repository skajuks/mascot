// The mascot's stylesheet, injected once on first use so there's no CSS file to import.
// Theme it with --mascot-* custom properties set on :root (or .mascot); each has a default here.

const CSS = /* css */ `
.mascot {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  will-change: transform;
}
.mascot[hidden], .mascot-ball[hidden] { display: none !important; }
.mascot-body { pointer-events: auto; touch-action: none; cursor: grab; }
/* Sites style buttons globally (borders, shadows, press effects). The :is() list lifts these
   above typical rules like button:hover:not(:disabled), while staying easy to override on purpose. */
.mascot button.mascot-body,
.mascot button.mascot-body:is(:hover, :active, :focus, :focus-visible) {
  display: block;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  transform: none;
  transition: none;
  opacity: 1;
}
.mascot button.mascot-body:focus-visible { outline: 2px solid var(--mascot-accent, #5fd38d); outline-offset: 2px; }
.mascot[data-state='held'] .mascot-body { cursor: grabbing; }
.mascot-sprite { display: block; }
.mascot[data-flip] .mascot-sprite { scale: -1 1; }

.mascot:not([data-still])[data-state='walk'] .mascot-sprite { animation: mascot-bob 0.24s steps(1) infinite alternate; }
@keyframes mascot-bob { to { transform: translateY(calc(-1 * var(--mascot-px))); } }
.mascot:not([data-still])[data-state='dizzy'] .mascot-sprite { animation: mascot-wobble 0.3s steps(1) infinite alternate; }
@keyframes mascot-wobble { to { transform: translateX(var(--mascot-px)); } }
.mascot:not([data-still])[data-emote='nervous'] .mascot-sprite { animation: mascot-shiver 140ms steps(1) infinite; }
@keyframes mascot-shiver { 0% { translate: calc(-0.25 * var(--mascot-px)) 0; } 50% { translate: calc(0.25 * var(--mascot-px)) 0; } }

.mascot-bubble {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: var(--mascot-bubble-width, 260px);
  padding: 6px 10px;
  background: var(--mascot-bubble-bg, #141412);
  color: var(--mascot-bubble-fg, #ecebe3);
  font-family: var(--mascot-bubble-font, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: var(--mascot-bubble-size, 13px);
  line-height: 1.5;
  text-align: left;
  box-shadow: var(--mascot-bubble-shadow, 3px 3px 0 rgb(0 0 0 / 0.85));
  pointer-events: auto;
  animation: mascot-pop 0.16s steps(3);
}
.mascot-bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: calc(50% - 3px);
  width: 6px;
  height: 6px;
  background: var(--mascot-bubble-bg, #141412);
  clip-path: polygon(0 0, 100% 0, 0 100%);
}
.mascot[data-edge='left'] .mascot-bubble { left: 0; transform: none; }
.mascot[data-edge='left'] .mascot-bubble::after { left: 14px; }
.mascot[data-edge='right'] .mascot-bubble { left: auto; right: 0; transform: none; }
.mascot[data-edge='right'] .mascot-bubble::after { left: auto; right: 14px; }
.mascot-ghost { visibility: hidden; }
@keyframes mascot-pop { from { opacity: 0; translate: 0 4px; } }

.mascot-menu { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.mascot-menu-title { margin-bottom: 4px; opacity: 0.7; }
.mascot .mascot-menu button,
.mascot .mascot-menu button:is(:hover, :active, :focus, :focus-visible) {
  all: unset;
  display: block;
  padding: 2px 6px;
  margin: 0 -6px;
  cursor: pointer;
}
.mascot .mascot-menu button::before { content: '> '; opacity: 0; }
.mascot .mascot-menu button:is(:hover, :focus-visible)::before { opacity: 1; }
.mascot .mascot-menu button:is(:hover, :focus-visible) { color: var(--mascot-accent, #5fd38d); }

.mascot-fx {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
}
.mascot-ball {
  position: absolute;
  top: 0;
  left: 0;
  touch-action: none;
  cursor: grab;
  will-change: transform;
}
.mascot-ball svg { display: block; }
.mascot-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .mascot-sprite, .mascot-bubble { animation: none !important; }
}
`

export function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById('mascot-styles')) return
  const style = document.createElement('style')
  style.id = 'mascot-styles'
  style.textContent = CSS
  // First in <head>, so the site's own CSS can override it without !important.
  document.head.prepend(style)
}

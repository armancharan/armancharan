// Indeterminate line loader, ported from inter-net's LoadingLine. The moving
// bar inherits the current text colour (`bg-current`), so callers control its
// shade by setting `text-*` on an ancestor.
export const LoadingLine = ({ widthPx = 100 }: { widthPx?: number }) => (
  <div
    role="status"
    aria-label="loading"
    className="relative overflow-hidden rounded-[20px]"
    style={{ width: widthPx, height: 1 }}
  >
    <span
      aria-hidden
      className="absolute h-[3px] w-[40%] rounded-[20px] bg-current"
      style={{ left: '-50%', animation: 'loading-line 1s linear infinite' }}
    />
  </div>
)

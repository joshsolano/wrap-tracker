/**
 * Renders a gray redaction bar in place of sensitive text for guest users.
 * Usage: {isGuest ? <Redacted>{name}</Redacted> : name}
 */
export function Redacted({ children }: { children: string }) {
  return (
    <span style={{ background: '#3A3A3C', color: 'transparent', borderRadius: 3, userSelect: 'none' }}>
      {children}
    </span>
  )
}

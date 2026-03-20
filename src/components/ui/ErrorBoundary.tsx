import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { B } from '../../lib/utils'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(e: Error): State {
    return { hasError: true, message: e.message }
  }

  componentDidCatch(_e: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ padding:24,color:B.red,fontSize:14 }}>
          <strong>Something went wrong.</strong>
          <p style={{ marginTop:8,color:B.textSec,fontSize:12 }}>{this.state.message}</p>
          <button
            onClick={() => this.setState({ hasError:false, message:'' })}
            style={{ marginTop:12,background:B.surface2,color:B.text,border:'none',borderRadius:8,padding:'8px 16px',cursor:'pointer' }}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

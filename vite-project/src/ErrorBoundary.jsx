import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // You could log to a service here
    // console.error('ErrorBoundary caught', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <div style={{
            maxWidth: 800,
            margin: '20px auto',
            background: '#1b1233',
            border: '3px solid #7c3aed',
            boxShadow: '0 0 0 6px #3b1747 inset',
            borderRadius: 8,
            color: '#e9d5ff',
            fontFamily: 'monospace',
            padding: 24,
          }}>
            <h2 style={{ marginTop: 0 }}>Something went wrong.</h2>
            <div style={{ opacity: 0.9, whiteSpace: 'pre-wrap' }}>
              {(this.state.error && (this.state.error.stack || this.state.error.message)) || 'Unknown error'}
            </div>
            <div style={{ marginTop: 16 }}>
              <button onClick={this.handleReload} style={{ background:'#2a2a40', color:'#e9d5ff', border:'2px solid #7c3aed', borderRadius:8, padding:'10px 14px', cursor:'pointer' }}>Reload</button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

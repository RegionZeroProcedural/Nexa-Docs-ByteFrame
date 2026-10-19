import React from 'react';
/** A recoverable UI error must not erase or silently overwrite the user's draft. */
export default class EditorErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false, error: '' }; }
  static getDerivedStateFromError(error) { return { failed: true, error: String(error?.message || 'Unknown rendering error') }; }
  componentDidCatch(error, details) { console.error('Nexa Docs component error', error, details?.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="nexa-error-recovery" role="alert">
      <h1>Nexa Docs encountered a display error</h1>
      <p>Your previously saved browser draft has not been intentionally deleted. Reopen the editor after noting the error below.</p>
      <pre>{this.state.error}</pre>
      <button type="button" onClick={() => this.setState({ failed:false, error:'' })}>Retry editor</button>
      <button type="button" onClick={() => window.location.reload()}>Reload page</button>
    </main>;
  }
}

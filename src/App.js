import React from 'react';
import Editor from './pages/editor';
import EditorErrorBoundary from './components/feedback/EditorErrorBoundary';
import './App.css';

export default function App() {
  return <EditorErrorBoundary><Editor /></EditorErrorBoundary>;
}

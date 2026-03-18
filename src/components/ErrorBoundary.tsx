import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center h-full p-8 bg-gray-900 rounded-lg">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h3 className="text-lg font-medium text-gray-200 mb-2">组件渲染出错</h3>
            <p className="text-sm text-gray-400 mb-4 text-center max-w-md">
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
            >
              重试
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

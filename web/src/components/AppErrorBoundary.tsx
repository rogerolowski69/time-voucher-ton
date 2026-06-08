import { Component, type ComponentChildren } from 'preact';

import { Alert } from '@/components/ui/alert';

interface Props {
  children: ComponentChildren;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  componentDidCatch(error: Error): void {
    console.error('[TimeVoucher] fatal.render', error);
    this.setState({ error });
  }

  render(): ComponentChildren {
    if (this.state.error) {
      return (
        <Alert variant="error" className="space-y-2">
          <p className="font-semibold">Wallet UI failed to load</p>
          <p className="text-sm">{this.state.error.message}</p>
          <p className="text-xs text-muted-foreground">
            Add ?debug=1 to the URL and check Console for [TimeVoucher] logs.
          </p>
        </Alert>
      );
    }
    return this.props.children;
  }
}

/**
 * Network Status Service
 *
 * Provides reactive network status tracking for the renderer process.
 * Monitors online/offline state and provides utilities for network error detection.
 */

/**
 * Network error types that can be detected
 */
export type NetworkErrorType =
  | 'offline' // Browser reports offline
  | 'timeout' // Request timed out
  | 'connection_refused' // Server not reachable
  | 'dns_error' // DNS resolution failed
  | 'network_error' // Generic network failure
  | 'unknown'; // Other errors

/**
 * Network status state
 */
export interface NetworkStatus {
  /** Whether the browser reports being online */
  isOnline: boolean;
  /** Timestamp of last status change */
  lastChanged: Date;
  /** Whether we're currently recovering from offline state */
  isRecovering: boolean;
}

// Reactive state for network status
let _isOnline = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
let _lastChanged = $state(new Date());
let _isRecovering = $state(false);

// Recovery timeout handle
let recoveryTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize network status listeners
 * Call this once when the app starts
 */
export function initNetworkStatus(): void {
  if (typeof window === 'undefined') return;

  const handleOnline = (): void => {
    _isOnline = true;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used for timestamp, not reactive state
    _lastChanged = new Date();
    _isRecovering = true;

    // Clear any existing recovery timeout
    if (recoveryTimeoutId) {
      clearTimeout(recoveryTimeoutId);
    }

    // Set recovering state for 2 seconds to allow UI to show "reconnecting" state
    recoveryTimeoutId = setTimeout(() => {
      _isRecovering = false;
      recoveryTimeoutId = null;
    }, 2000);
  };

  const handleOffline = (): void => {
    _isOnline = false;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used for timestamp, not reactive state
    _lastChanged = new Date();
    _isRecovering = false;

    // Clear any recovery timeout
    if (recoveryTimeoutId) {
      clearTimeout(recoveryTimeoutId);
      recoveryTimeoutId = null;
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
}

/**
 * Get current network status (reactive)
 */
export function getNetworkStatus(): NetworkStatus {
  return {
    isOnline: _isOnline,
    lastChanged: _lastChanged,
    isRecovering: _isRecovering
  };
}

/**
 * Check if currently online (reactive getter)
 */
export function isOnline(): boolean {
  return _isOnline;
}

/**
 * Check if recovering from offline state (reactive getter)
 */
export function isRecovering(): boolean {
  return _isRecovering;
}

/**
 * Detect the type of network error from an Error object
 */
export function detectNetworkErrorType(error: Error): NetworkErrorType {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Check if browser reports offline
  if (!_isOnline) {
    return 'offline';
  }

  // Timeout errors
  if (
    name === 'aborterror' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  ) {
    return 'timeout';
  }

  // Connection refused
  if (
    message.includes('econnrefused') ||
    message.includes('connection refused') ||
    message.includes('failed to fetch') ||
    message.includes('network request failed')
  ) {
    return 'connection_refused';
  }

  // DNS errors
  if (
    message.includes('enotfound') ||
    message.includes('getaddrinfo') ||
    message.includes('dns')
  ) {
    return 'dns_error';
  }

  // Generic network errors
  if (
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('socket') ||
    message.includes('epipe') ||
    name === 'typeerror' // fetch throws TypeError on network failure
  ) {
    return 'network_error';
  }

  return 'unknown';
}

/**
 * Check if an error is a network-related error
 */
export function isNetworkError(error: Error): boolean {
  const errorType = detectNetworkErrorType(error);
  return errorType !== 'unknown';
}

/**
 * Get a user-friendly message for a network error type
 */
export function getNetworkErrorMessage(errorType: NetworkErrorType): string {
  switch (errorType) {
    case 'offline':
      return 'You appear to be offline. Please check your internet connection.';
    case 'timeout':
      return 'The request timed out. The server may be slow or unreachable.';
    case 'connection_refused':
      return 'Could not connect to the server. Please try again.';
    case 'dns_error':
      return 'Could not resolve the server address. Please check your connection.';
    case 'network_error':
      return 'A network error occurred. Please check your connection and try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Create a network error with additional context
 */
export class NetworkError extends Error {
  readonly errorType: NetworkErrorType;
  readonly isRetryable: boolean;
  readonly originalError?: Error;

  constructor(message: string, errorType: NetworkErrorType, originalError?: Error) {
    super(message);
    this.name = 'NetworkError';
    this.errorType = errorType;
    this.originalError = originalError;

    // All network errors except 'unknown' are potentially retryable
    this.isRetryable = errorType !== 'unknown';
  }
}

/**
 * Wrap an error as a NetworkError if it's network-related
 */
export function wrapNetworkError(error: Error): NetworkError | Error {
  if (error instanceof NetworkError) {
    return error;
  }

  const errorType = detectNetworkErrorType(error);
  if (errorType !== 'unknown') {
    const message = getNetworkErrorMessage(errorType);
    return new NetworkError(message, errorType, error);
  }

  return error;
}

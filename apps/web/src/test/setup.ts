/** jsdom setup for component tests (React Flow needs ResizeObserver and DOMMatrixReadOnly). */
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, writable: true });
}

if (!('DOMMatrixReadOnly' in globalThis)) {
  class DOMMatrixReadOnlyStub {
    m22: number;
    constructor(transform?: string) {
      const scale = /scale\(([\d.]+)\)/.exec(transform ?? '')?.[1];
      this.m22 = scale !== undefined ? Number(scale) : 1;
    }
  }
  Object.defineProperty(globalThis, 'DOMMatrixReadOnly', { value: DOMMatrixReadOnlyStub, writable: true });
}

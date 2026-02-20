/**
 * Tests for OpenTelemetry utilities
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { trace, TracerProvider, Tracer } from '@opentelemetry/api';
import { getTracer, TRACER_NAME } from './telemetry';

describe('telemetry', () => {
  afterEach(() => {
    // Clean up: disable the global tracer provider after each test
    trace.disable();
  });

  test('TRACER_NAME is correctly defined', () => {
    expect(TRACER_NAME).toBe('@principal-ai/alexandria-collections');
  });

  test('getTracer returns a Tracer instance', () => {
    const tracer = getTracer();
    expect(tracer).toBeDefined();
    expect(typeof tracer.startSpan).toBe('function');
  });

  test('getTracer returns no-op tracer when no provider is registered', () => {
    // Ensure no provider is registered
    trace.disable();

    const tracer = getTracer();
    const span = tracer.startSpan('test-span');

    // No-op span should be safe to use
    expect(span).toBeDefined();
    expect(typeof span.end).toBe('function');

    // Should not throw when calling methods
    expect(() => {
      span.setAttribute('test', 'value');
      span.setStatus({ code: 1 });
      span.end();
    }).not.toThrow();
  });

  test('getTracer uses registered global provider', () => {
    // Create a mock provider
    const mockTracer: Tracer = {
      startSpan: () => ({
        spanContext: () => ({
          traceId: 'mock-trace-id',
          spanId: 'mock-span-id',
          traceFlags: 1,
        }),
        setAttribute: () => ({} as any),
        setAttributes: () => ({} as any),
        addEvent: () => ({} as any),
        addLink: () => ({} as any),
        addLinks: () => ({} as any),
        setStatus: () => ({} as any),
        updateName: () => ({} as any),
        end: () => {},
        isRecording: () => true,
        recordException: () => {},
      }),
      startActiveSpan: ((_name: any, _options: any, _context: any, fn: any) => {
        // Simple mock implementation
        if (typeof fn === 'function') {
          const span = mockTracer.startSpan(_name);
          return fn(span);
        }
        return fn;
      }) as any,
    };

    const mockProvider: TracerProvider = {
      getTracer: (name: string) => {
        expect(name).toBe(TRACER_NAME);
        return mockTracer;
      },
    };

    // Register the mock provider globally
    trace.setGlobalTracerProvider(mockProvider);

    const tracer = getTracer();
    expect(tracer).toBe(mockTracer);
  });

  test('getTracer returns equivalent tracer on multiple calls', () => {
    const tracer1 = getTracer();
    const tracer2 = getTracer();

    // Both tracers should have the same methods and work identically
    expect(typeof tracer1.startSpan).toBe('function');
    expect(typeof tracer2.startSpan).toBe('function');

    // Both should create spans successfully
    const span1 = tracer1.startSpan('test1');
    const span2 = tracer2.startSpan('test2');
    expect(span1).toBeDefined();
    expect(span2).toBeDefined();

    span1.end();
    span2.end();
  });

  test('tracer can create and end spans without errors', () => {
    const tracer = getTracer();

    expect(() => {
      const span = tracer.startSpan('test-operation');
      span.setAttribute('test.attribute', 'test-value');
      span.setStatus({ code: 1 }); // OK status
      span.end();
    }).not.toThrow();
  });
});

/**
 * OpenTelemetry configuration for Alexandria Collections
 *
 * Provides tracer setup with environment-based exporter switching:
 * - Development (NODE_ENV !== 'production'): Console exporter
 * - Production (NODE_ENV === 'production'): OTLP HTTP exporter
 */

import { trace, Tracer } from '@opentelemetry/api';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export const TRACER_NAME = '@principal-ai/alexandria-collections';

let tracerProvider: NodeTracerProvider | null = null;
let isEnabled = false;

/**
 * Initialize the OpenTelemetry tracer provider
 * @param serviceName - Optional service name override
 */
function initializeTracerProvider(serviceName: string = TRACER_NAME): void {
  if (tracerProvider) {
    return; // Already initialized
  }

  const resource = Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    })
  );

  const provider = new NodeTracerProvider({
    resource,
  });

  // Choose exporter based on environment
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // Production: Use OTLP exporter
    const otlpExporter = new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    });
    provider.addSpanProcessor(new BatchSpanProcessor(otlpExporter));
  } else {
    // Development: Use console exporter for debugging
    const consoleExporter = new ConsoleSpanExporter();
    provider.addSpanProcessor(new BatchSpanProcessor(consoleExporter));
  }

  provider.register();
  tracerProvider = provider;
  isEnabled = true;
}

/**
 * Get a tracer instance
 * @param enabled - Whether telemetry is enabled
 * @param serviceName - Optional service name override
 * @returns Tracer instance (or no-op tracer if disabled)
 */
export function getTracer(enabled: boolean, serviceName?: string): Tracer {
  if (!enabled) {
    // Return no-op tracer when disabled
    return trace.getTracer(TRACER_NAME);
  }

  if (!isEnabled) {
    initializeTracerProvider(serviceName);
  }

  return trace.getTracer(TRACER_NAME);
}

/**
 * Shutdown the tracer provider (for graceful shutdown)
 */
export async function shutdownTelemetry(): Promise<void> {
  if (tracerProvider && 'shutdown' in tracerProvider) {
    await tracerProvider.shutdown();
    tracerProvider = null;
    isEnabled = false;
  }
}

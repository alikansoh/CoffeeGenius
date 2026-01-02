// lib/circuitBreaker.ts

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: CircuitState = 'closed';
  
  private readonly threshold: number;
  private readonly timeout: number;
  
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
  }
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const now = Date.now();
      if (now - this.lastFailTime > this.timeout) {
        this.state = 'half-open';
        console.log('🔶 Circuit breaker: half-open');
      } else {
        throw new Error('Circuit breaker is OPEN - system overloaded');
      }
    }
    
    try {
      const result = await fn();
      
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
        console.log('✅ Circuit breaker: closed');
      }
      
      return result;
      
    } catch (error) {
      this.failures++;
      this.lastFailTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        console.error(`🔴 Circuit breaker: OPEN (${this.failures} failures)`);
      }
      
      throw error;
    }
  }
  
  getState(): { state: CircuitState; failures: number } {
    return {
      state: this.state,
      failures: this.failures,
    };
  }
  
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.lastFailTime = 0;
    console.log('🔄 Circuit breaker: reset');
  }
}

// ✅ Export singleton instance
export const orderCircuitBreaker = new CircuitBreaker(5, 60000);
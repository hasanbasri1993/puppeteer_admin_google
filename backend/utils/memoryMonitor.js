const logger = require('pino')();

class MemoryMonitor {
  constructor() {
    this.monitoring = false;
    this.interval = null;
    this.memoryThreshold = parseInt(process.env.MEMORY_THRESHOLD) || 1024; // MB
  }

  startMonitoring(intervalMs = 30000) { // Default 30 seconds
    if (this.monitoring) {
      logger.warn('Memory monitoring already started');
      return;
    }

    this.monitoring = true;
    this.interval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);

    logger.info(`Memory monitoring started (checking every ${intervalMs}ms)`);
  }

  stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.monitoring = false;
    logger.info('Memory monitoring stopped');
  }

  checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const externalMB = Math.round(memUsage.external / 1024 / 1024);

    logger.info(`Memory Usage - RSS: ${rssMB}MB, Heap Used: ${heapUsedMB}MB, Heap Total: ${heapTotalMB}MB, External: ${externalMB}MB`);

    // Trigger garbage collection if memory usage is high
    if (rssMB > this.memoryThreshold && global.gc) {
      logger.warn(`High memory usage detected (${rssMB}MB), triggering garbage collection`);
      global.gc();
      
      // Log memory after GC
      const memAfterGC = process.memoryUsage();
      const rssAfterMB = Math.round(memAfterGC.rss / 1024 / 1024);
      logger.info(`Memory after GC - RSS: ${rssAfterMB}MB`);
    }
  }

  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };
  }
}

module.exports = new MemoryMonitor();

const crypto = require('crypto');
const {Queue, QueueEvents, Worker} = require('bullmq');
const logger = require('../utils/logger');

const QUEUE_NAME = 'turn-off-browser';
const REDIS_CONNECT_TIMEOUT_MS = 1500;

class BrowserJobQueue {
    constructor() {
        this.pending = [];
        this.active = null;
        this.jobs = new Map();
        this.processor = null;
        this.mode = 'memory';
        this.initialization = null;
        this.redisQueue = null;
        this.redisEvents = null;
        this.redisWorker = null;
    }

    setProcessor(processor) {
        if (typeof processor !== 'function') {
            throw new Error('Queue processor harus berupa fungsi');
        }
        this.processor = processor;
        if (!this.initialization) {
            this.initialization = this.initializeRedis();
        }
    }

    async enqueue({key, owner, data, run}) {
        if (!key || typeof run !== 'function') {
            throw new Error('Job queue membutuhkan key dan fungsi proses');
        }
        if (this.initialization) await this.initialization;

        if (this.mode === 'redis') {
            return this.enqueueRedis({key, owner, data});
        }
        return this.enqueueMemory({key, owner, run});
    }

    async initializeRedis() {
        const connection = {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT, 10) || 6379,
            connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
            maxRetriesPerRequest: null,
            enableOfflineQueue: false,
            retryStrategy: () => null
        };

        try {
            this.redisQueue = new Queue(QUEUE_NAME, {
                connection,
                prefix: 'dulido',
                defaultJobOptions: {
                    removeOnComplete: {age: 24 * 60 * 60, count: 1000},
                    removeOnFail: {age: 7 * 24 * 60 * 60, count: 1000}
                }
            });
            this.redisEvents = new QueueEvents(QUEUE_NAME, {connection, prefix: 'dulido'});
            this.redisWorker = new Worker(
                QUEUE_NAME,
                async job => this.processor(job.data),
                {connection, prefix: 'dulido', concurrency: 1}
            );
            this.redisQueue.on('error', error => logger.error('Redis queue error:', error.message));
            this.redisEvents.on('error', error => logger.error('Redis queue events error:', error.message));
            this.redisWorker.on('error', error => logger.error('Redis queue worker error:', error.message));

            await this.withTimeout(Promise.all([
                this.redisQueue.waitUntilReady(),
                this.redisEvents.waitUntilReady(),
                this.redisWorker.waitUntilReady()
            ]), REDIS_CONNECT_TIMEOUT_MS);
            this.mode = 'redis';
            logger.info(`Browser job queue memakai Redis di ${connection.host}:${connection.port}`);
        } catch (error) {
            logger.warn(`Redis tidak tersedia, memakai queue memori: ${error.message}`);
            await this.closeRedis();
            this.mode = 'memory';
        }
    }

    async enqueueRedis({key, owner, data}) {
        const jobId = crypto.createHash('sha256').update(key).digest('hex');
        if (await this.redisQueue.getJob(jobId)) {
            const error = new Error('Permintaan ini sudah ada di antrean');
            error.code = 'DUPLICATE_JOB_KEY';
            throw error;
        }

        const job = await this.redisQueue.add('turn-off', {key, owner, ...data}, {jobId});
        const counts = await this.redisQueue.getJobCounts('waiting', 'active', 'prioritized', 'delayed');
        const position = Math.max(1, Object.values(counts).reduce((total, count) => total + count, 0));
        return {position, promise: job.waitUntilFinished(this.redisEvents)};
    }

    enqueueMemory({key, owner, run}) {
        if (this.jobs.has(key)) {
            const error = new Error('Permintaan ini sudah ada di antrean');
            error.code = 'DUPLICATE_JOB_KEY';
            throw error;
        }

        let resolveJob;
        let rejectJob;
        const promise = new Promise((resolve, reject) => {
            resolveJob = resolve;
            rejectJob = reject;
        });
        const job = {key, owner, run, resolve: resolveJob, reject: rejectJob};
        const position = this.pending.length + (this.active ? 2 : 1);

        this.jobs.set(key, job);
        this.pending.push(job);
        queueMicrotask(() => void this.runNext());
        return {position, promise};
    }

    async runNext() {
        if (this.active || this.pending.length === 0) return;

        const job = this.pending.shift();
        this.active = job;
        try {
            job.resolve(await job.run());
        } catch (error) {
            job.reject(error);
        } finally {
            this.jobs.delete(job.key);
            this.active = null;
            queueMicrotask(() => void this.runNext());
        }
    }

    async closeRedis() {
        for (const resource of [this.redisWorker, this.redisEvents, this.redisQueue]) {
            if (!resource) continue;
            try {
                await resource.close();
            } catch (error) {
                logger.warn('Gagal menutup koneksi Redis queue:', error.message);
            }
        }
        this.redisWorker = null;
        this.redisEvents = null;
        this.redisQueue = null;
    }

    async close() {
        await this.closeRedis();
    }

    withTimeout(promise, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Redis connection timeout')), timeoutMs);
            promise.then(
                value => {
                    clearTimeout(timer);
                    resolve(value);
                },
                error => {
                    clearTimeout(timer);
                    reject(error);
                }
            );
        });
    }
}

module.exports = new BrowserJobQueue();

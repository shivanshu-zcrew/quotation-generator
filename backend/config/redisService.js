const redis = require('redis');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.DEFAULT_TTL = 600; // 10 minutes in seconds
    this.connectionPromise = null;
    this.retryCount = 0;
    this.maxRetries = 5;
  }

  async connect() {
    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting) {
      return this.connectionPromise;
    }

    if (this.isConnected && this.client?.isOpen) {
      return Promise.resolve();
    }

    this.isConnecting = true;

    this.connectionPromise = (async () => {
      try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        
        // Validate Redis URL
        if (!redisUrl || redisUrl === 'redis://localhost:6379' && process.env.NODE_ENV === 'production') {
          // console.warn('⚠️ Warning: Using default Redis URL in production');
        }

        this.client = redis.createClient({
          url: redisUrl,
          socket: {
            reconnectStrategy: (retries) => {
              // Exponential backoff with max delay
              const delay = Math.min(Math.pow(2, retries) * 100, 10000);
              // console.log(`Redis reconnect attempt ${retries}, waiting ${delay}ms...`);
              
              if (retries > this.maxRetries) {
                // console.error('❌ Redis max retries reached, stopping reconnection');
                return new Error('Max retries reached');
              }
              return delay;
            },
            connectTimeout: 10000, // 10 seconds
            keepAlive: 5000, // 5 seconds
          }
        });

        // Set up event handlers BEFORE connecting
        this.client.on('error', (err) => {
          // console.error('❌ Redis Client Error:', err.message);
          this.isConnected = false;
        });

        this.client.on('connect', () => {
          // console.log('✅ Redis Client Connected');
          this.isConnected = true;
          this.retryCount = 0;
        });

        this.client.on('ready', () => {
          // console.log('✅ Redis Client Ready');
          this.isConnected = true;
        });

        this.client.on('reconnecting', () => {
          console.log('🔄 Redis Client Reconnecting...');
          this.isConnected = false;
        });

        this.client.on('end', () => {
          // console.log('📴 Redis Client Disconnected');
          this.isConnected = false;
        });

        // Attempt connection with timeout
        await Promise.race([
          this.client.connect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Redis connection timeout')), 15000)
          )
        ]);
        
        this.isConnected = true;
        // console.log('✅ Redis connection established successfully');
      } catch (error) {
        // console.error('❌ Redis Connection Failed:', error.message);
        this.isConnected = false;
        this.client = null;
        throw error;
      } finally {
        this.isConnecting = false;
      }
    })();

    return this.connectionPromise;
  }

  async get(key) {
    if (!this.isConnected || !this.client?.isOpen) {
      // console.warn(`⚠️ Redis not connected, cannot get key: ${key}`);
      return null;
    }
    
    try {
      const data = await this.client.get(key);
      if (data) {
        console.log(`📦 Cache HIT: ${key}`);
        return JSON.parse(data);
      }
      console.log(`🔍 Cache MISS: ${key}`);
      return null;
    } catch (error) {
      // console.error(`❌ Redis GET error for ${key}:`, error.message);
      return null; // Fallback to API on cache error
    }
  }

  async set(key, value, ttl = this.DEFAULT_TTL) {
    if (!this.isConnected || !this.client?.isOpen) {
      // console.warn(`⚠️ Redis not connected, cannot set key: ${key}`);
      return false;
    }
    
    try {
      // ✅ Validate TTL
      const validTtl = Math.max(1, parseInt(ttl, 10));
      
      await this.client.setEx(key, validTtl, JSON.stringify(value));
      // console.log(`💾 Cache SET: ${key} (TTL: ${validTtl}s)`);
      return true;
    } catch (error) {
      // console.error(`❌ Redis SET error for ${key}:`, error.message);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected || !this.client?.isOpen) {
      // console.warn(`⚠️ Redis not connected, cannot delete key: ${key}`);
      return false;
    }
    
    try {
      const deleted = await this.client.del(key);
      if (deleted > 0) {
        // console.log(`🗑️ Cache DELETED: ${key}`);
      }
      return true;
    } catch (error) {
      // console.error(`❌ Redis DEL error for ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Delete keys matching a pattern using SCAN (safe for production)
   * SCAN is non-blocking and safe even with large key counts
   */
  async delPattern(pattern) {
    if (!this.isConnected || !this.client?.isOpen) {
      // console.warn(`⚠️ Redis not connected, cannot delete pattern: ${pattern}`);
      return false;
    }
    
    try {
      const keys = [];
      let cursor = '0';
      
      // Use SCAN instead of KEYS for non-blocking iteration
      do {
        const result = await this.client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100 // Scan 100 keys at a time
        });
        
        cursor = result.cursor;
        if (result.keys && result.keys.length > 0) {
          keys.push(...result.keys);
        }
      } while (cursor !== '0');
      
      // Delete all collected keys in batches
      if (keys.length > 0) {
        // Delete in batches of 100 to avoid overwhelming the delete operation
        const batchSize = 100;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          await this.client.del(batch);
        }
        // console.log(`🗑️ Cache DELETED ${keys.length} keys matching pattern: ${pattern}`);
      } else {
        // console.log(`🔍 No keys found matching pattern: ${pattern}`);
      }
      
      return true;
    } catch (error) {
      // console.error(`❌ Redis DEL pattern error for ${pattern}:`, error.message);
      return false;
    }
  }

  /**
   * Check if Redis is connected and healthy
   */
  async ping() {
    if (!this.isConnected || !this.client?.isOpen) return false;
    
    try {
      const response = await this.client.ping();
      return response === 'PONG';
    } catch (error) {
      // console.error('❌ Redis PING failed:', error.message);
      return false;
    }
  }

  /**
   * Get memory info from Redis
   */
  async getMemoryInfo() {
    if (!this.isConnected || !this.client?.isOpen) return null;
    
    try {
      const info = await this.client.info('memory');
      return info;
    } catch (error) {
      // console.error('❌ Redis INFO error:', error.message);
      return null;
    }
  }

  /**
   * Safely flush the cache (use with caution!)
   */
  async flushAll() {
    if (!this.isConnected || !this.client?.isOpen) {
      // console.warn('⚠️ Redis not connected, cannot flush');
      return false;
    }
    
    try {
      await this.client.flushAll();
      // console.log('🧹 Redis cache flushed completely');
      return true;
    } catch (error) {
      // console.error('❌ Redis FLUSHALL error:', error.message);
      return false;
    }
  }

  async disconnect() {
    if (this.client && this.client.isOpen) {
      try {
        await this.client.quit();
        this.isConnected = false;
        // console.log('📴 Redis disconnected gracefully');
      } catch (error) {
        // console.error('❌ Error disconnecting from Redis:', error.message);
      }
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isOpen: this.client?.isOpen || false,
      isReady: this.client?.isReady || false,
      retryCount: this.retryCount
    };
  }
}

// Singleton instance
const redisService = new RedisService();

// Export service and connection promise
module.exports = redisService;
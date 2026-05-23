// utils/syncProgress.js
const activeSyncs = new Map();

class SyncProgressManager {
  
  static startSync(syncJobId, total = 0) {
    activeSyncs.set(syncJobId, {
      status: 'running',
      progress: 0,
      current: 0,
      total,
      message: 'Starting sync...',
      startedAt: new Date(),
      errors: 0
    });
    return syncJobId;
  }

  static updateProgress(syncJobId, progress, message, current = null) {
    const job = activeSyncs.get(syncJobId);
    if (!job) return;

    job.progress = Math.min(Math.max(progress, 0), 100);
    job.message = message;
    if (current !== null) job.current = current;

    // Auto cleanup after 30 minutes
    if (job.progress >= 100) {
      setTimeout(() => this.clearSync(syncJobId), 30 * 60 * 1000);
    }
  }

  static completeSync(syncJobId, result) {
    const job = activeSyncs.get(syncJobId);
    if (job) {
      job.status = 'completed';
      job.progress = 100;
      job.message = 'Sync completed successfully';
      job.completedAt = new Date();
      job.result = result;
    }
  }

  static failSync(syncJobId, error) {
    const job = activeSyncs.get(syncJobId);
    if (job) {
      job.status = 'failed';
      job.message = error.message || 'Sync failed';
      job.error = error.message;
      job.completedAt = new Date();
    }
  }

  static getProgress(syncJobId) {
    return activeSyncs.get(syncJobId);
  }

  static clearSync(syncJobId) {
    activeSyncs.delete(syncJobId);
  }
}

module.exports = SyncProgressManager;
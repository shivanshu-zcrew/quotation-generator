const notification = require("../models/notification");

 
class NotificationService {

  /**
   * Create a generic notification
   */
  static async create(userId, companyId, {
    type,
    title,
    message,
    quotationId = null,
    customerId = null,
    quotationNumber = null,
    customerName = null,
    actionUrl = null,
    priority = 'medium',
    metadata = {}
  }) {
    try {
      const notificationCreate = await notification.create({
        userId,
        companyId,
        type,
        title,
        message,
        quotationId,
        customerId,
        quotationNumber,
        customerName,
        actionUrl,
        priority,
        metadata
      });

      return notificationCreate;
    } catch (error) {
      console.error('❌ Failed to create notification:', error);
      return null;
    }
  }

  // ===================== SPECIFIC NOTIFICATIONS =====================

  /**
   * Sync Completed Notification
   */
  static async syncCompleted(userId, companyId, stats = {}) {
    return this.create(userId, companyId, {
      type: 'sync_completed',
      title: '✅ Sync Completed Successfully',
      message: `Customer sync finished. ${stats.created || 0} created, ${stats.updated || 0} updated.`,
      actionUrl: '/customers',
      priority: 'medium',
      metadata: {
        created: stats.created || 0,
        updated: stats.updated || 0,
        totalFromZoho: stats.totalFromZoho || 0,
        syncType: stats.syncType || 'full',
        duration: stats.duration
      }
    });
  }

  /**
   * New Customer Added
   */
  static async newCustomer(userId, companyId, customer) {
    return this.create(userId, companyId, {
      type: 'new_customer',
      title: '👤 New Customer Added',
      message: `${customer.name} has been successfully added to the system.`,
      actionUrl: `/customers/${customer._id}`,
      customerId: customer._id,
      customerName: customer.name,
      priority: 'medium',
      metadata: {
        taxTreatment: customer.taxTreatment,
        placeOfSupply: customer.placeOfSupply
      }
    });
  }

  /**
   * Quotation Approved
   */
  static async quotationApproved(userId, companyId, quotation) {
    return this.create(userId, companyId, {
      type: 'quotation_approved',
      title: '✅ Quotation Approved',
      message: `Quotation ${quotation.quotationNumber} has been approved.`,
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      actionUrl: `/quotations/${quotation._id}`,
      priority: 'high',
      metadata: {
        approvedBy: quotation.approvedBySnapshot?.name || 'Admin'
      }
    });
  }

  /**
   * Quotation Rejected
   */
  static async quotationRejected(userId, companyId, quotation, reason = '') {
    return this.create(userId, companyId, {
      type: 'quotation_rejected',
      title: '❌ Quotation Rejected',
      message: `Quotation ${quotation.quotationNumber} was rejected.${reason ? ` Reason: ${reason}` : ''}`,
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      actionUrl: `/quotations/${quotation._id}`,
      priority: 'high',
      metadata: {
        reason: reason,
        rejectedBy: quotation.rejectionReason ? 'Admin' : 'Ops'
      }
    });
  }

  /**
   * Quotation Awarded
   */
  static async quotationAwarded(userId, companyId, quotation) {
    return this.create(userId, companyId, {
      type: 'quotation_awarded',
      title: '🏆 Quotation Awarded!',
      message: `Congratulations! Quotation ${quotation.quotationNumber} has been marked as Awarded.`,
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      actionUrl: `/quotations/${quotation._id}`,
      priority: 'high',
      metadata: {
        awardedBy: quotation.awardedBySnapshot?.name || 'User',
        awardNote: quotation.awardNote || ''
      }
    });
  }

  /**
   * Approval Needed (for Ops/Admin)
   */
  static async approvalNeeded(userId, companyId, quotation) {
    return this.create(userId, companyId, {
      type: 'approval_needed',
      title: '📋 Approval Required',
      message: `Quotation ${quotation.quotationNumber} needs your review.`,
      quotationId: quotation._id,
      quotationNumber: quotation.quotationNumber,
      actionUrl: `/quotations/${quotation._id}`,
      priority: 'high'
    });
  }

  // Utility methods
  static async markAsRead(notificationId) {
    return Notification.findByIdAndUpdate(notificationId, { 
      isRead: true, 
      readAt: new Date() 
    });
  }

  static async markAllAsRead(userId, companyId) {
    return Notification.updateMany(
      { userId, companyId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
  }
}

module.exports = NotificationService;